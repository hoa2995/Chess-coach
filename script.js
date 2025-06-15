// Chess game and board setup
let game;
let board = null;
let conversationHistory = [];
let currentMode = 'openings';
let capturedPieces = { white: [], black: [] };
let pieceValues = { 'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9, 'k': 0 };

// Board configuration
const boardConfig = {
    draggable: true,
    position: 'start',
    onDragStart: onDragStart,
    onDrop: onDrop,
    onSnapEnd: onSnapEnd,
    pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
};

// Initialize the application
$(document).ready(function() {
    game = new Chess();
    board = Chessboard('chessboard', boardConfig);
    setupEventListeners();
    initializeCoach();
});

function setupEventListeners() {
    // Board controls
    $('#newGame').click(startNewGame);
    $('#flipBoard').click(() => board.flip());
    $('#undoMove').click(undoLastMove);
    
    // ELO input change
    $('#eloInput').change(function() {
        initializeCoach();
        addCoachMessage(`ELO đã cập nhật thành ${$(this).val()}. Tôi sẽ điều chỉnh phong cách huấn luyện và chơi cờ cho phù hợp.`);
    });
    
    // Mode selection
    $('.mode-btn').click(function() {
        $('.mode-btn').removeClass('active');
        $(this).addClass('active');
        currentMode = this.id.replace('Mode', '');
        updateCoachMode();
    });
    
    // Chat functionality
    $('#sendMessage').click(sendChatMessage);
    $('#chatInput').keypress(function(e) {
        if (e.which === 13) sendChatMessage();
    });
    
    // Quick actions
    $('#analyzePosition').click(() => analyzeCurrentPosition());
    $('#suggestMove').click(() => suggestBestMove());
    $('#explainLastMove').click(() => explainLastMove());
    
    // Scenario loading
    $('#loadScenario').click(loadTrainingScenario);
}

function onDragStart(source, piece, position, orientation) {
    // Only allow moves when it's the player's turn
    if (game.game_over()) return false;
    
    // Only allow player to move their pieces
    if ((game.turn() === 'w' && piece.search(/^b/) !== -1) ||
        (game.turn() === 'b' && piece.search(/^w/) !== -1)) {
        return false;
    }
    
    highlightPossibleMoves(source);
}

function onDrop(source, target) {
    removeHighlights();
    
    // Check if the move is legal
    const move = game.move({
        from: source,
        to: target,
        promotion: 'q' // Always promote to queen for simplicity
    });
    
    // If illegal move, return 'snapback'
    if (move === null) return 'snapback';
    
    // Track captured pieces
    if (move.captured) {
        const capturedPiece = move.captured.toLowerCase();
        const capturedBy = move.color;
        capturedPieces[capturedBy === 'w' ? 'white' : 'black'].push(capturedPiece);
        updateCapturedPieces();
    }
    
    updateMoveHistory();
    
    // Get AI analysis of the user's move, then have AI make opponent move
    setTimeout(() => {
        analyzeUserMove(move);
    }, 500);
}

function onSnapEnd() {
    board.position(game.fen());
}

function highlightPossibleMoves(square) {
    const moves = game.moves({ square: square, verbose: true });
    
    // Highlight the selected square
    $(`#chessboard .square-${square}`).addClass('highlight-square');
    
    // Highlight possible moves
    moves.forEach(move => {
        $(`#chessboard .square-${move.to}`).addClass('possible-move');
    });
}

function removeHighlights() {
    $('#chessboard .square-55d63').removeClass('highlight-square possible-move');
}

function startNewGame() {
    game = new Chess();
    board.position('start');
    $('#moveHistory').empty();
    capturedPieces = { white: [], black: [] };
    updateCapturedPieces();
    conversationHistory = [];
    initializeCoach();
    addCoachMessage("Ván cờ mới đã bắt đầu! Bạn chơi quân Trắng. Tôi sẽ là đối thủ và huấn luyện viên của bạn. Hãy thực hiện nước đi khai cuộc và tôi sẽ giúp bạn hiểu về thế cờ!");
}

function undoLastMove() {
    if (game.history().length > 0) {
        game.undo();
        board.position(game.fen());
        updateMoveHistory();
        addCoachMessage("Đã hoàn tác nước đi. Hãy phân tích thế cờ này và tìm một cách tiếp tục tốt hơn.");
    }
}

function updateMoveHistory() {
    const history = game.history({ verbose: true });
    let html = '';
    
    for (let i = 0; i < history.length; i += 2) {
        const moveNumber = Math.floor(i / 2) + 1;
        const whiteMove = history[i] ? history[i].san : '';
        const blackMove = history[i + 1] ? history[i + 1].san : '';
        
        html += `<div class="move-pair">
            <span class="move-number">${moveNumber}.</span>
            <span class="white-move">${whiteMove}</span>
            <span class="black-move">${blackMove}</span>
        </div>`;
    }
    
    $('#moveHistory').html(html);
    $('#moveHistory').scrollTop($('#moveHistory')[0].scrollHeight);
}

async function initializeCoach() {
    const playerElo = $('#eloInput').val() || 1200;
    const targetElo = Math.min(parseInt(playerElo) + 200, 3000);
    
    const systemMessage = {
        role: "system",
        content: `Bạn là một huấn luyện viên cờ vua chuyên nghiệp với kiến thức ở trình độ đại kiện tướng. Vai trò của bạn là:
        1. Phân tích các thế cờ và nước đi với hiểu biết sâu sắc
        2. Cung cấp phản hồi giáo dục phù hợp với người chơi có ELO ${playerElo}
        3. Chơi ở mức độ cao hơn học viên một chút (khoảng ${targetElo} ELO) để tạo thử thách phù hợp
        4. Đề xuất cải tiến và giải thích các khái niệm cờ vua một cách rõ ràng
        5. Điều chỉnh phong cách huấn luyện theo chế độ hiện tại: ${currentMode}
        6. Thực hiện các nước đi mang tính giáo dục và thử thách nhưng không quá khó
        
        ELO hiện tại của học viên là ${playerElo}. Hãy điều chỉnh lời giải thích và lựa chọn nước đi cho phù hợp.
        Giữ phản hồi ngắn gọn nhưng đầy thông tin. Tập trung vào việc dạy các nguyên lý cờ vua và giúp người chơi cải thiện.`
    };
    
    conversationHistory = [systemMessage];
}

async function updateCoachMode() {
    const modeDescriptions = {
        'opening': 'khai cuộc cờ vua, nguyên lý khai cuộc, phát triển quân và chiến lược đầu ván',
        'middlegame': 'chiến thuật giữa ván, lập kế hoạch chiến lược, phối hợp quân cờ và lối chơi vị trí',
        'endgame': 'kỹ thuật tàn cuộc, các mẫu chiếu hết cơ bản và lý thuyết tàn cuộc',
        'tactics': 'các motif chiến thuật như ghim, dĩa, xiên và lối chơi kết hợp'
    };
    
    const message = `Tôi hiện đang tập trung vào ${modeDescriptions[currentMode]}. Tôi có thể giúp bạn cải thiện trong lĩnh vực này như thế nào?`;
    addCoachMessage(message);
}

async function analyzeUserMove(move) {
    const position = game.fen();
    const moveHistory = game.history().join(' ');
    const playerElo = $('#eloInput').val() || 1200;
    
    const prompt = `Phân tích nước đi cờ vua này của học viên (ELO ${playerElo}): ${move.san}
    
Thế cờ hiện tại (FEN): ${position}
Lịch sử nước đi: ${moveHistory}
Chế độ huấn luyện hiện tại: ${currentMode}
Trình độ ELO của học viên: ${playerElo}

Hãy cung cấp một phân tích ngắn gọn phù hợp với người chơi có ELO ${playerElo}. Nước đi này tốt, xấu hay trung bình? Tại sao? Những ý tưởng chính hoặc sai lầm là gì? Hãy giữ tính giáo dục và khuyến khích, tập trung vào các khái niệm mà người chơi ELO ${playerElo} nên hiểu.`;

    try {
        const completion = await websim.chat.completions.create({
            messages: [
                ...conversationHistory.slice(-5),
                {
                    role: "user",
                    content: prompt
                }
            ]
        });
        
        addCoachMessage(completion.content);
        conversationHistory.push({ role: "user", content: prompt });
        conversationHistory.push(completion);
        
        setTimeout(() => {
            makeAIMove();
        }, 1500);
        
    } catch (error) {
        addCoachMessage("Tôi đang gặp khó khăn trong việc phân tích nước đi đó. Vui lòng thử lại.");
        setTimeout(() => {
            makeAIMove();
        }, 1000);
    }
}

async function makeAIMove() {
    if (game.game_over()) {
        if (game.in_checkmate()) {
            addCoachMessage("Ván cờ kết thúc! " + (game.turn() === 'w' ? "Đen" : "Trắng") + " thắng bằng chiếu hết.");
        } else if (game.in_draw()) {
            addCoachMessage("Ván cờ kết thúc! Hoà cờ.");
        }
        return;
    }
    
    const position = game.fen();
    const legalMoves = game.moves({ verbose: true });
    const playerElo = $('#eloInput').val() || 1200;
    const targetElo = Math.min(parseInt(playerElo) + 200, 3000);
    
    const prompt = `Bạn đang chơi với tư cách ${game.turn() === 'w' ? 'Trắng' : 'Đen'} ở mức độ khoảng ${targetElo} ELO đối đầu với người chơi ${playerElo} ELO. Hãy chọn nước đi tốt nhất để tạo thử thách phù hợp không quá khó.
    
Thế cờ (FEN): ${position}
Các nước đi hợp lệ: ${legalMoves.map(m => m.san).join(', ')}

Chỉ trả lời với nước đi theo ký hiệu đại số (như "Nf3" hoặc "e4"). Không bao gồm bất kỳ giải thích hoặc phân tích nào.`;

    try {
        const completion = await websim.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `Bạn là một engine cờ vua chuyên nghiệp chơi ở mức độ ${targetElo} ELO. Chỉ trả lời với nước đi theo ký hiệu đại số.`
                },
                {
                    role: "user",
                    content: prompt
                }
            ]
        });
        
        const aiMoveNotation = completion.content.trim();
        const aiMove = game.move(aiMoveNotation);
        
        if (aiMove) {
            if (aiMove.captured) {
                const capturedPiece = aiMove.captured.toLowerCase();
                const capturedBy = aiMove.color;
                capturedPieces[capturedBy === 'w' ? 'white' : 'black'].push(capturedPiece);
                updateCapturedPieces();
            }
            
            board.position(game.fen());
            updateMoveHistory();
            
            setTimeout(() => {
                addCoachMessage(`Tôi đã đi ${aiMove.san}. Bạn phản ứng thế nào? Hãy suy nghĩ về kế hoạch trước khi di chuyển.`);
            }, 800);
        } else {
            const randomMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
            const fallbackMove = game.move(randomMove.san);
            if (fallbackMove) {
                if (fallbackMove.captured) {
                    const capturedPiece = fallbackMove.captured.toLowerCase();
                    const capturedBy = fallbackMove.color;
                    capturedPieces[capturedBy === 'w' ? 'white' : 'black'].push(capturedPiece);
                    updateCapturedPieces();
                }
                board.position(game.fen());
                updateMoveHistory();
                addCoachMessage(`Tôi đã đi ${fallbackMove.san}. Đến lượt bạn! Kế hoạch của bạn là gì?`);
            }
        }
        
    } catch (error) {
        const randomMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
        const fallbackMove = game.move(randomMove.san);
        if (fallbackMove) {
            if (fallbackMove.captured) {
                const capturedPiece = fallbackMove.captured.toLowerCase();
                const capturedBy = fallbackMove.color;
                capturedPieces[capturedBy === 'w' ? 'white' : 'black'].push(capturedPiece);
                updateCapturedPieces();
            }
            board.position(game.fen());
            updateMoveHistory();
            addCoachMessage(`Tôi đã đi ${fallbackMove.san}. Đến lượt bạn!`);
        }
    }
}

async function analyzeMove(move) {
    // This function is now replaced by analyzeUserMove
    // Keep for backward compatibility but redirect
    await analyzeUserMove(move);
}

async function sendChatMessage() {
    const message = $('#chatInput').val().trim();
    if (!message) return;
    
    $('#chatInput').val('');
    addUserMessage(message);
    
    const position = game.fen();
    const moveHistory = game.history().join(' ');
    const playerElo = $('#eloInput').val() || 1200;
    
    const contextualMessage = `Câu hỏi của người chơi: "${message}"
    
Thế cờ hiện tại (FEN): ${position}
Lịch sử nước đi: ${moveHistory}
Chế độ huấn luyện hiện tại: ${currentMode}
Trình độ ELO của học viên: ${playerElo}

Vui lòng trả lời như một huấn luyện viên cờ vua chuyên nghiệp, tính đến tình trạng trò chơi hiện tại và trình độ kỹ năng của học viên.`;

    try {
        conversationHistory.push({ role: "user", content: contextualMessage });
        
        const completion = await websim.chat.completions.create({
            messages: conversationHistory.slice(-10)
        });
        
        addCoachMessage(completion.content);
        conversationHistory.push(completion);
    } catch (error) {
        addCoachMessage("Tôi đang gặp khó khăn trong việc trả lời ngay bây giờ. Vui lòng thử lại.");
    }
}

async function analyzeCurrentPosition() {
    const position = game.fen();
    const moveHistory = game.history().join(' ');
    
    const prompt = `Phân tích chi tiết thế cờ này:
    
Thế cờ (FEN): ${position}
Lịch sử nước đi: ${moveHistory}
Chế độ huấn luyện hiện tại: ${currentMode}

Cung cấp phân tích toàn diện bao gồm:
- Cân bằng vật chất
- Các yếu tố chiến lược chính
- Cơ hội chiến thuật
- Đề xuất kế hoạch cho cả hai bên
- Hiểu biết giáo dục liên quan đến chế độ huấn luyện hiện tại`;

    try {
        const completion = await websim.chat.completions.create({
            messages: [
                ...conversationHistory.slice(-3),
                { role: "user", content: prompt }
            ]
        });
        
        addCoachMessage(completion.content);
    } catch (error) {
        addCoachMessage("Tôi đang gặp khó khăn trong việc phân tích thế cờ ngay bây giờ. Vui lòng thử lại.");
    }
}

async function suggestBestMove() {
    const position = game.fen();
    const legalMoves = game.moves({ verbose: true });
    
    const prompt = `Đề xuất nước đi tốt nhất trong thế cờ này:
    
Thế cờ (FEN): ${position}
Các nước đi hợp lệ: ${legalMoves.map(m => m.san).join(', ')}

Chọn nước đi tốt nhất và giải thích tại sao nó mạnh. Bao gồm các nước đi thay thế và nhược điểm của chúng. Hãy làm cho nó mang tính giáo dục.`;

    try {
        const completion = await websim.chat.completions.create({
            messages: [
                ...conversationHistory.slice(-3),
                { role: "user", content: prompt }
            ]
        });
        
        addCoachMessage(completion.content);
    } catch (error) {
        addCoachMessage("Tôi đang gặp khó khăn trong việc đề xuất nước đi ngay bây giờ. Vui lòng thử lại.");
    }
}

async function explainLastMove() {
    const history = game.history({ verbose: true });
    if (history.length === 0) {
        addCoachMessage("Chưa có nước đi nào được thực hiện!");
        return;
    }
    
    const lastMove = history[history.length - 1];
    const position = game.fen();
    
    const prompt = `Giải thích chi tiết nước đi cờ vua này: ${lastMove.san}
    
Từ: ${lastMove.from} Đến: ${lastMove.to}
Thế cờ hiện tại (FEN): ${position}
Chế độ huấn luyện hiện tại: ${currentMode}

Giải thích mục đích và hậu quả của nước đi này. Người chơi đang cố gắng đạt được điều gì? Có thành công không? Họ nên suy nghĩ gì cho nước đi tiếp theo?`;

    try {
        const completion = await websim.chat.completions.create({
            messages: [
                ...conversationHistory.slice(-3),
                { role: "user", content: prompt }
            ]
        });
        
        addCoachMessage(completion.content);
    } catch (error) {
        addCoachMessage("Tôi đang gặp khó khăn trong việc giải thích nước đi đó ngay bây giờ. Vui lòng thử lại.");
    }
}

async function loadTrainingScenario() {
    const scenario = $('#scenarioSelect').val();
    if (!scenario) return;
    
    const scenarios = {
        'italian-game': {
            fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
            description: 'Khai cuộc Ý: Học các nguyên lý khai cuộc cổ điển và mẫu phát triển.'
        },
        'queens-gambit': {
            fen: 'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq c3 0 2',
            description: 'Gambit Hậu: Thành thạo khai cuộc phổ biến này và các chủ đề chiến lược của nó.'
        },
        'sicilian-defense': {
            fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2',
            description: 'Phòng thủ Sicily: Học cách xử lý phòng thủ tích cực này với quân Trắng.'
        },
        'rook-endgame': {
            fen: '8/8/8/8/8/3K4/8/r6k w - - 0 1',
            description: 'Tàn cuộc Xe cơ bản: Học các thế cờ cơ bản xe và vua đối xe và vua.'
        },
        'king-pawn-endgame': {
            fen: '8/8/8/4k3/4P3/4K3/8/8 w - - 0 1',
            description: 'Tàn cuộc Vua và Tốt: Thành thạo các khái niệm đối lập và ô chủ chốt.'
        },
        'fork-tactics': {
            fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 4',
            description: 'Chiến thuật Dĩa: Học cách phát hiện và thực hiện cơ hội dĩa mã.'
        },
        'pin-tactics': {
            fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
            description: 'Chiến thuật Ghim: Hiểu cách sử dụng ghim hiệu quả trong ván cờ của bạn.'
        },
        'discovered-attack': {
            fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq d3 0 3',
            description: 'Tấn công Phát hiện: Học motif chiến thuật mạnh mẽ này.'
        }
    };
    
    const selectedScenario = scenarios[scenario];
    if (!selectedScenario) return;
    
    // Load the position
    game = new Chess(selectedScenario.fen);
    board.position(selectedScenario.fen);
    updateMoveHistory();
    
    // Clear chat and add scenario description
    conversationHistory = conversationHistory.slice(0, 1); // Keep system message
    addCoachMessage(`Kịch bản Huấn luyện: ${selectedScenario.description}`);
    
    // Get AI analysis of the scenario
    setTimeout(async () => {
        const prompt = `Chúng ta đã tải một kịch bản huấn luyện: ${selectedScenario.description}
        
Thế cờ (FEN): ${selectedScenario.fen}
Chế độ huấn luyện hiện tại: ${currentMode}

Giới thiệu thế cờ này và giải thích những gì người chơi nên tập trung học. Cung cấp hướng dẫn về các khái niệm chính và những điều cần tìm kiếm.`;

        try {
            const completion = await websim.chat.completions.create({
                messages: [
                    ...conversationHistory,
                    { role: "user", content: prompt }
                ]
            });
            
            addCoachMessage(completion.content);
            conversationHistory.push({ role: "user", content: prompt });
            conversationHistory.push(completion);
        } catch (error) {
            addCoachMessage("Hãy cùng khám phá thế cờ này! Bạn nhận thấy điều gì về nó?");
        }
    }, 1000);
    
    // Reset scenario selection
    $('#scenarioSelect').val('');
}

function addCoachMessage(message) {
    const messageHtml = `
        <div class="message coach-message">
            <div class="message-content">${message}</div>
        </div>
    `;
    $('#chatMessages').append(messageHtml);
    $('#chatMessages').scrollTop($('#chatMessages')[0].scrollHeight);
}

function addUserMessage(message) {
    const messageHtml = `
        <div class="message user-message">
            <div class="message-content">${message}</div>
        </div>
    `;
    $('#chatMessages').append(messageHtml);
    $('#chatMessages').scrollTop($('#chatMessages')[0].scrollHeight);
}

function updateCapturedPieces() {
    const whiteValue = capturedPieces.white.reduce((sum, piece) => sum + pieceValues[piece], 0);
    const blackValue = capturedPieces.black.reduce((sum, piece) => sum + pieceValues[piece], 0);
    
    $('#whiteValue').text(whiteValue);
    $('#blackValue').text(blackValue);
    
    const pieceSymbols = {
        'p': '♟', 'n': '♞', 'b': '♝', 'r': '♜', 'q': '♛', 'k': '♚'
    };
    
    $('#whiteCaptured').html(capturedPieces.white.map(piece => `<span class="captured-piece">${pieceSymbols[piece]}</span>`).join(''));
    $('#blackCaptured').html(capturedPieces.black.map(piece => `<span class="captured-piece">${pieceSymbols[piece]}</span>`).join(''));
}

// Utility function to update board size on window resize
$(window).resize(function() {
    board.resize();
});