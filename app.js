// TreeMatchLib は TreeMatchLib.js からグローバル読み込みされている
// ここでは useNewTreeClass / TreeConstruct / TreeMatch / TreeMatchFind をそのまま使う

console.log('🔍 app.js loaded - Version: 2025-12-30 FIX2 (correct parent index pathLen-2)');

// Tree クラスを初期化する
const Tree1 = useNewTreeClass('Tree1', '__A', '__B');

// 画面で使う DOM 要素を先に取得しておく
const patternInput = document.getElementById('pattern-input'); // ユーザーがパターンを入力する欄
const targetInput = document.getElementById('target-input'); // ユーザーがマッチさせたい対象ツリーを入力する欄
const resultArea = document.getElementById('result-area'); // マッチ結果やツリー可視化を表示するエリア
const sampleBtn = document.getElementById('sample-btn'); // ランダムサンプルを読み込むボタン
const matchModeRadios = document.getElementsByName('match-mode');// マッチモードを選ぶラジオボタン（TreeMatch と TreeMatchFind）
const historyBtn = document.getElementById('history-btn');// パターン履歴を開くボタン
const historyDropdown = document.getElementById('history-dropdown');// パターン履歴のドロップダウンメニュー
const historyList = document.getElementById('history-list');// 履歴アイテムを表示するリスト
const clearHistoryBtn = document.getElementById('clear-history-btn');// 履歴を全て消すボタン
const copyPatternBtn = document.getElementById('copy-pattern-btn');// 現在のパターンをクリップボードにコピーするボタン
const copyResultBtn = document.getElementById('copy-result-btn');// 最後のマッチ結果をクリップボードにコピーするボタン
const samplesMenuBtn = document.getElementById('samples-menu-btn');// サンプルメニューを開くボタン
const samplesMenu = document.getElementById('samples-menu');// サンプルメニューのドロップダウン
const samplesList = document.getElementById('samples-list');// サンプルアイテムを表示するリスト

// ユーザーが入力を終えるのを待ってからマッチ処理を実行するためのタイマー ID を保存しておく変数
let debounceTimer = null;// タイマー ID を保存しておき、次の入力があったら前のタイマーをクリアする形で実装する

// 最後のマッチ結果を保存しておく
// 「結果をコピー」ボタンで JSON として出力できるようにするため
let lastMatchResult = null;

// 事前に読み込んだターゲットツリーを保持する
// JSON 読み込みや Code Import で作ったツリーを再利用するため
let currentTargetTree = null;

// ツリー可視化タブ用のズーム状態
let currentZoom = 1.0;// ズーム倍率の初期値
const ZOOM_STEP = 0.1;// ズームイン・アウトのステップ量
const MIN_ZOOM = 0.3;// ズームアウトの限界（小さすぎると見づらくなるため）
const MAX_ZOOM = 3.0;
let originalSvgWidth = 800;// SVG の元の幅（ズームリセット時に戻すため）
let originalSvgHeight = 500;// SVG の元の高さ（ズームリセット時に戻すため）

// レイアウト切替フラグ（false = 標準, true = おぐ風コンパクト）
let useCompactLayout = false;

// デバッグツリー側のズーム状態
let debugZoom = 1.0;
let debugOriginalSvgWidth = 800;// デバッグツリーは通常のツリーと同じサイズで作るが、ズームリセットの基準を分けておくと、デバッグ用に大きくしておいてもリセットが効くようになる
let debugOriginalSvgHeight = 500;

// 初期化処理
// アプリ起動時に UI の配線をまとめて行う場所
// イベント登録を各所に散らすと、どの操作がどこにつながるのか追いにくくなるためここへ集約
function init() {
    // 各 UI にイベントリスナーを設定する
    patternInput.addEventListener('input', handleInputChange);// パターン入力が変わるたびにマッチ処理を呼ぶ
    targetInput.addEventListener('input', handleInputChange);// ターゲット入力が変わるたびにマッチ処理を呼ぶ

    // ユーザーがターゲット入力欄を直接編集したら currentTargetTree を破棄する
    // 事前読み込みツリーと入力文字列の不一致を防ぐため
    targetInput.addEventListener('input', () => {// ターゲット入力が変わるたびに、もし currentTargetTree があればそれを null にする
        if (currentTargetTree) {
            console.log('🗑️ Target input manually edited - clearing currentTargetTree');
            currentTargetTree = null;
        }
    });

    sampleBtn.addEventListener('click', loadSample); // ランダムサンプルを読み込むボタン

    matchModeRadios.forEach(radio => {// マッチモードのラジオボタンが変わったらマッチ処理を呼ぶ
        radio.addEventListener('change', handleInputChange);
    });

    // タブ切り替え
    document.querySelectorAll('.tab-btn').forEach(btn => {// タブボタンをクリックしたら handleTabSwitch を呼ぶ
        btn.addEventListener('click', handleTabSwitch);
    });

    // 履歴まわり
    historyBtn.addEventListener('click', toggleHistory);
    clearHistoryBtn.addEventListener('click', clearHistory);
    loadHistoryDisplay();

    // コピーボタン
    copyPatternBtn.addEventListener('click', copyPattern);
    copyResultBtn.addEventListener('click', copyResult);

    // サンプルメニュー
    samplesMenuBtn.addEventListener('click', toggleSamplesMenu);
    buildSamplesMenu();

    // ツリー表示のズーム操作
    document.getElementById('zoom-in-btn').addEventListener('click', zoomIn);
    document.getElementById('zoom-out-btn').addEventListener('click', zoomOut);
    document.getElementById('zoom-reset-btn').addEventListener('click', zoomReset);

    // デバッグ表示のズーム操作
    document.getElementById('debug-zoom-in-btn').addEventListener('click', debugZoomIn);
    document.getElementById('debug-zoom-out-btn').addEventListener('click', debugZoomOut);
    document.getElementById('debug-zoom-reset-btn').addEventListener('click', debugZoomReset);

    // レイアウト切替ボタン
    document.getElementById('layout-toggle-btn').addEventListener('click', toggleLayoutStyle);

    // 外側をクリックしたらドロップダウンを閉じる
    // 開きっぱなしになると操作しづらいため
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.pattern-section')) {
            closeHistory();
        }
        if (!e.target.closest('.target-section')) {
            closeSamplesMenu();
        }
    });
}

// タブ切り替えを処理する
// 表示中のタブを 1 つだけに保ち、UI の状態と見た目がずれないようにする
function handleTabSwitch(e) {
    const targetTab = e.target.dataset.tab;// クリックされたタブボタンから data-tab 属性を読み取る（例:'transform', 'debug'）

    // タブボタンの見た目を更新
    document.querySelectorAll('.tab-btn').forEach(btn => {// 全てのタブボタンから active クラスを外す
        btn.classList.remove('active');// クリックされたタブボタンにだけ active クラスをつける
    });
    e.target.classList.add('active');

    // 対応するタブ本文だけを表示する
    document.querySelectorAll('.tab-content').forEach(content => {// 全てのタブ内容から active クラスを外す
        content.classList.remove('active');// クリックされたタブに対応する内容にだけ active クラスをつける
    });
    document.getElementById(`tab-${targetTab}`).classList.add('active');// 例えば targetTab が 'match' なら id="tab-match" の要素に active クラスをつける
}

// 入力のたびに前のタイマーをクリアして、最後の入力から 300ms 後に executeMatch を呼ぶ
// 入力のたびにすぐ実行すると、タイプ中にも重い処理が連続して走ってしまう
// そのため少し待ってから実行している（デバウンス）。300ms タイムアウトしてから最後の入力に対して 1 回だけ実行されるイメージ
function handleInputChange() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        executeMatch();
    }, 300);
}

// 選択中のマッチモードを取得する
function getMatchMode() {// どのマッチモードのラジオボタンが選択されているかを調べて、その値を返す。選択されていなければデフォルトで 'TreeMatch' を返す
    for (const radio of matchModeRadios) {
        if (radio.checked) {
            return radio.value;// 例えば 'TreeMatch' や 'TreeMatchFind' が返る想定
        }
    }
    return 'TreeMatch';
}

// パターンマッチングを実行する
// この関数は「入力の取得」「ツリー構築」「履歴保存」「実行関数の振り分け」
function executeMatch() {
    const pattern = patternInput.value.trim();// パターン入力から余分な空白を取り除いて読み取る
    const targetStr = targetInput.value.trim();// ターゲット入力から余分な空白を取り除いて読み取る

    if (!targetStr) {// ターゲットが空なら結果表示を初期状態に戻す
        resultArea.innerHTML = '<p class="hint">Enter target to see tree visualization...</p>';
        return;
    }

    if (!pattern) {// パターンが空ならマッチ処理はせず、ツリー表示だけ行う
        resultArea.innerHTML = '<p class="hint">🌳 Tree visualization mode<br>Enter a pattern to perform matching</p>';
        // 実際のツリー描画は executeMatchWithTree 側でまとめて行う
        return;
    }

    // 実行中であることを先に表示する
    resultArea.innerHTML = '<p class="loading">Matching...</p>';

    try {
        // 事前読み込みツリーがあればそれを使い、なければ入力文字列から構築する
        // Code Import などで一度オブジェクト化したツリーを再利用し、文字列との二重管理をなるべく避ける
        let targetTree; // どちらのツリーを使うかを決めるための変数
        if (currentTargetTree) {// 事前読み込みツリーがあればそれを使う
            console.log('🎯 Using pre-loaded currentTargetTree');
            targetTree = currentTargetTree;
        } else {// 事前読み込みツリーがなければ、入力文字列からツリーを構築する
            console.log('📝 Parsing target from string');
            targetTree = TreeConstruct(Tree1, targetStr).Tree();// 入力文字列からツリーを構築する。TreeConstruct は Tree1 クラスとターゲット文字列を受け取り、ツリーオブジェクトを返す想定
        }

        // どのマッチ関数を使うかを取得する
        const mode = getMatchMode();// 例えば 'TreeMatch' や 'TreeMatchFind' が返る想定

        // 実行したパターンを履歴に残す
        if (pattern) {// パターンが空でなければ履歴に保存する。空のパターンはマッチ処理をしないため、履歴にも残さない
            saveToHistory(pattern);
        }

        // 選択中のモードに応じて実際のマッチ処理を呼ぶ
        if (mode === 'TreeMatch') {
            executeTreeMatch(targetTree, pattern);
        } else {
            executeTreeMatchFind(targetTree, pattern);
        }

    } catch (error) {// ツリー構築やマッチ処理でエラーが出た場合は、結果をクリアしてエラー表示をする
        displayError(error);
    }
}

// ===== matched_node_captures ヘルパー =====
// Perl の sample_toTanabe1.pl の calc_matched_node_captures に相当。
// rootCapture から木を DFS し、nextNodeCaptures に含まれるノードに当たった枝は
// 「次のマッチ範囲」としてスキップ、それ以外だけを今回のマッチノード一覧に加える。
// nextNodeCaptures は TreeMatch() 第4引数に渡した配列（マッチ成功時は残り兄弟、
// 失敗時は全直接子が入る）。
function calcMatchedNodeCaptures(rootCapture, nextNodeCaptures) {
    // ノード同一性（オブジェクト参照）で「次探索開始点」を判定する
    const nextNodeSet = new Set(nextNodeCaptures.map(c => c.Node()));

    const matchedNodes = [];
    const iter = new TreeWrapperBaseIterator(rootCapture.Tree());

    while (true) {
        if (iter.IsEnd()) {
            iter.MoveUp();
            if (iter.IsRoot()) break;
            iter.MoveNextSibling();
            continue;
        }
        const curNode = iter.Node();
        if (nextNodeSet.has(curNode)) {
            // この節点は次マッチの起点 → ここで分岐を切る（子孫は含めない）
            iter.MoveNextSibling();
        } else {
            matchedNodes.push(curNode);
            iter.MoveDown();
        }
    }
    return matchedNodes; // Node オブジェクトの配列
}

// Perl の TreeMatchFind_with_matched_node に相当。
// TreeMatchFind と同じ探索をしつつ、各マッチ結果に _matchedNodes を付与して返す。
function treeMatchFindWithMatchedNode(tree, pattern) {// TreeMatchFind と同じ探索をしつつ、各マッチ結果に _matchedNodes を付与して返す関数。
    const results = [];
    let nextCaptureList = [];
    let nextCaptureListAdd = [];
    let baseRootCapture = null;

    while (true) {
        const result = TreeMatch(tree, pattern, baseRootCapture, nextCaptureListAdd);
        if (result) {
            result._matchedNodes = calcMatchedNodeCaptures(
                result.GetRootCapture(), nextCaptureListAdd);
            results.push(result);
        }
        // 次の探索候補を逆順で積む（Perl の実装と同じ順序）
        for (let i = nextCaptureListAdd.length - 1; i >= 0; i--) {
            nextCaptureList.push(nextCaptureListAdd[i]);
        }
        nextCaptureListAdd = [];
        if (nextCaptureList.length === 0) break;
        baseRootCapture = nextCaptureList.pop();
        tree = baseRootCapture.Tree();
    }
    return results;
}

// TreeMatch を実行する
// 結果が単一のマッチオブジェクトになるため、そのまま表示処理に渡している
function executeTreeMatch(targetTree, pattern) {
    try {
        // 第4引数に配列を渡して「次探索候補」を受け取る
        const nextCaptureListAdd = [];
        const result = TreeMatch(targetTree, pattern, null, nextCaptureListAdd);

        if (result) {
            // 今回のマッチに使われたノード一覧を計算して result に付与する
            result._matchedNodes = calcMatchedNodeCaptures(
                result.GetRootCapture(), nextCaptureListAdd);
            console.log('[executeTreeMatch] _matchedNodes:',
                result._matchedNodes.map(n => n.Attr0()));

            lastMatchResult = resultToJSON(result);
            displayMatchSuccess(result);
        } else {
            lastMatchResult = null;
            displayMatchFail();
        }
    } catch (error) {
        lastMatchResult = null;
        displayError(error);
    }
}

// TreeMatchFind を実行する
// 結果が複数のマッチオブジェクトの配列になるため、全件表示と個別選択の UI を組み立てる必要がある
function executeTreeMatchFind(targetTree, pattern) {
    try {
        // treeMatchFindWithMatchedNode で各結果に _matchedNodes を付与する
        const results = treeMatchFindWithMatchedNode(targetTree, pattern);

        if (results.length > 0) {
            console.log('[executeTreeMatchFind] results:', results.length,
                results.map(r => r._matchedNodes.map(n => n.Attr0())));
            lastMatchResult = results.map(r => resultToJSON(r));// 結果を JSON 化して保存する。これも「結果をコピー」ボタンで出力できるようにするため
            displayMatchFindSuccess(results);
        } else {
            lastMatchResult = null;
            displayMatchFail();
        }
    } catch (error) {
        lastMatchResult = null;
        displayError(error);
    }
}

// TreeMatch 単一マッチ成功時の表示を組み立てる
function displayMatchSuccess(result) {
    let html = '<p class="match-success">Match: SUCCESS</p>';// マッチ成功のメッセージを表示する

    // Transform タブへ送るボタンを付ける
    html += '<div class="result-actions">';// Transform タブで再利用できるよう、マッチ結果を送るボタンを表示する
    html += '<button class="action-btn" onclick="sendToTransform()">Transform This Match →</button>';// クリックされたら sendToTransform 関数を呼ぶ
    html += '</div>';// ボタンの HTML を組み立てる

    // キャプチャ内容を表示する
    html += displayCaptures(result);// キャプチャ内容の表示を組み立てる。これには単一キャプチャとマルチキャプチャの両方が含まれる

    // マッチしたツリー全体も見られるようにする
    html += displayTreeVisualization(result);

    resultArea.innerHTML = html;// 組み立てた HTML をresultエリアに表示する

    window.lastMatchedResult = result;// 最後にマッチした結果をグローバル変数に保存しておく。これを Transform タブで使う
    window.lastMatchedPattern = patternInput.value.trim();// 最後にマッチしたパターンもグローバル変数に保存しておく。これも Transform タブで使う
}
// TreeMatchFind 複数マッチ成功時の表示を組み立てる
function displayMatchFindSuccess(results) {
    let html = '<p class="match-success">Match: SUCCESS</p>';// マッチ成功のメッセージを表示する
    html += `<p class="result-count">Found ${results.length} match(es)</p>`;// 見つかったマッチの数を表示する

    results.forEach((result, index) => {// 各マッチ結果を順番に表示するためのループ。index は 0 から始まるマッチの番号
        html += '<div class="result-item">';
        html += `<div class="result-index">Result [${index}]:</div>`;// 各マッチ結果の見出しを表示する。例えば "Result [0]:" のようになる

        // どの結果を Transform するか選べるよう、各結果にボタンを付ける
        html += '<div class="result-actions">';// Transform タブで再利用できるよう、マッチ結果を送るボタンを表示する
        html += `<button class="action-btn" onclick="sendToTransformByIndex(${index})">Transform This Match →</button>`;// クリックされたら sendToTransformByIndex 関数を呼ぶ。引数にはこの結果の index を渡す
        html += '</div>';

        html += displayCaptures(result);// キャプチャ内容の表示を組み立てる。これには単一キャプチャとマルチキャプチャの両方が含まれる
        html += '</div>';
    });

    resultArea.innerHTML = html;// 組み立てた HTML をresultエリアに表示する

    // Transform タブで個別に使えるよう全結果を保持する
    window.lastMatchedResults = results;// 最後にマッチした複数の結果をグローバル変数に保存しておく。これを Transform タブで使う
    window.lastMatchedPattern = patternInput.value.trim();// 最後にマッチしたパターンもグローバル変数に保存しておく。これも Transform タブで使う
}

function displayCaptures(result) {// キャプチャされた内容を見やすく表示するための関数。単一キャプチャとマルチキャプチャの両方を処理する
    let html = '<div class="capture-list">';// キャプチャ内容をまとめるコンテナの HTML を組み立てる

    // 単一キャプチャを表示する
    const captureNames = result.GetCaptureNames();// マッチ結果から単一キャプチャの名前のリストを取得する。これをループして各キャプチャの内容を表示する
    if (captureNames.length > 0) {// 単一キャプチャが 1 つ以上あれば、キャプチャセクションの見出しを表示する
        html += '<div><strong>Captures:</strong></div>';// 単一キャプチャの見出しを表示する
        captureNames.forEach(name => {// 各キャプチャ名について、その内容を表示するためのループ。name はキャプチャの名前（例: 'root', 'child' など）
            const capture = result.Capture(name);// キャプチャ名からキャプチャオブジェクトを取得する。これにはノード情報が含まれている想定
            const node = capture.Node();// キャプチャオブジェクトからノードを取得する。ノードには Attr0 や Attr1、子ノードなどの情報がある想定
            const nodeStr = formatNode(node);// ノードを表示用の文字列に整形する。これには Attr0 と Attr1 を組み合わせた文字列が返る想定
            const captureId = 'capture-' + Math.random().toString(36).substr(2, 9);// キャプチャの詳細表示を切り替えるための一意な ID を生成する。ランダムな文字列を使っている

            html += `<div class="capture-item-wrapper">`;// キャプチャ項目全体を包むコンテナの HTML を組み立てる
            html += `<div class="capture-item" onclick="toggleCaptureDetails('${captureId}')">`;// キャプチャの見出し部分の HTML を組み立てる。クリックされたら toggleCaptureDetails 関数を呼ぶ。引数にはこのキャプチャの ID を渡す
            html += `<span class="capture-name">${name}:</span> ${nodeStr}`;// キャプチャの名前とノードの文字列を表示する
            html += `<span class="capture-expand">▼</span>`;// キャプチャの詳細を開くためのアイコンを表示する
            html += `</div>`;
            html += `<div id="${captureId}" class="capture-details" style="display: none;">`;// キャプチャの詳細部分の HTML を組み立てる。初期状態では非表示にしておく
            html += buildCaptureDetails(node);// キャプチャされたノードの詳細表示を組み立てる。これには Attr1 や子ノード構造など、一覧だけでは分からない情報も含まれる
            html += `</div>`;
            html += `</div>`;
        });
    }

    // マルチキャプチャを表示する
    const multiCaptureNames = result.GetMultiCaptureNames();// マッチ結果からマルチキャプチャの名前のリストを取得する。これをループして各マルチキャプチャの内容を表示する
    if (multiCaptureNames.length > 0) {
        html += '<div><strong>Multi Captures:</strong></div>';// マルチキャプチャの見出しを表示する
        multiCaptureNames.forEach(name => {// 各マルチキャプチャ名について、その内容を表示するためのループ。name はマルチキャプチャの名前（例: '@a', '@b' など）
            const captures = result.MultiCapture(name);// マルチキャプチャ名からキャプチャオブジェクトの配列を取得する。これには複数のノード情報が含まれている想定
            const captureId = 'multicapture-' + Math.random().toString(36).substr(2, 9);// マルチキャプチャの詳細表示を切り替えるための一意な ID を生成する。ランダムな文字列を使っている

            html += `<div class="capture-item-wrapper">`;// マルチキャプチャ項目全体を包むコンテナの HTML を組み立てる
            html += `<div class="capture-item" onclick="toggleCaptureDetails('${captureId}')">`;// マルチキャプチャの見出し部分の HTML を組み立てる。クリックされたら toggleCaptureDetails 関数を呼ぶ。引数にはこのマルチキャプチャの ID を渡す
            html += `<span class="capture-name">@${name}:</span> [${captures.length} item(s)]`;// マルチキャプチャの名前と、キャプチャされたアイテムの数を表示する
            html += `<span class="capture-expand">▼</span>`;// マルチキャプチャの詳細を開くためのアイコンを表示する
            html += `</div>`;
            html += `<div id="${captureId}" class="capture-details" style="display: none;">`;

            captures.forEach((capture, index) => {// 各キャプチャオブジェクトについて、その内容を表示するためのループ。index は 0 から始まるキャプチャの番号
                const node = capture.Node();// キャプチャオブジェクトからノードを取得する。ノードには Attr0 や Attr1、子ノードなどの情報がある想定
                html += `<div class="multi-capture-item">`;
                html += `<div class="multi-capture-index">[${index}] ${formatNode(node)}</div>`;
                html += buildCaptureDetails(node);//キャプチャされたノードの詳細表示を組み立てる。これには Attr1 や子ノード構造など、一覧だけでは分からない情報も含まれる
                html += `</div>`;
            });

            html += `</div>`;
            html += `</div>`;
        });
    }

    html += '</div>';
    return html;
}

// キャプチャされたノードの詳細表示を組み立てる
function buildCaptureDetails(node) {// キャプチャされたノードの属性や子ノード構造など、一覧だけでは分からない情報を表示するための関数
    let html = '<div class="capture-detail-content">';// キャプチャされたノードの詳細をまとめるコンテナの HTML を組み立てる

    // ノード属性
    html += '<div class="detail-row">';// ノードの属性を表示する行の HTML を組み立てる
    html += '<span class="detail-label">Attr0:</span> ';// Attr0 のラベルを表示する
    html += `<span class="detail-value">${escapeHtml(node.Attr0() || '(null)')}</span>`;// Attr0 の値を表示する。null や空文字の場合は '(null)' と表示する
    html += '</div>';

    if (node.Attr1() !== undefined && node.Attr1() !== null) {// Attr1 が定義されている場合は、その値も表示する行の HTML を組み立てる
        html += '<div class="detail-row">';
        html += '<span class="detail-label">Attr1:</span> ';
        html += `<span class="detail-value">${escapeHtml(String(node.Attr1()))}</span>`;
        html += '</div>';
    }

    // 子ノード数
    const numChildren = node.NumChildren();// ノードの子ノードの数を取得する
    html += '<div class="detail-row">';
    html += '<span class="detail-label">Children:</span> ';
    html += `<span class="detail-value">${numChildren}</span>`;
    html += '</div>';

    // 子ノード一覧
    if (numChildren > 0) {// 子ノードが 1 つ以上ある場合は、子ノードの一覧を表示するセクションの HTML を組み立てる
        html += '<div class="detail-row">';
        html += '<span class="detail-label">Child nodes:</span>';
        html += '<div class="detail-children">';
        for (let i = 0; i < numChildren; i++) {
            const child = node.NthChildSubtree(i).GetRootNode();// 子ノードを取得する。NthChildSubtree(i) で i 番目の子ノードのサブツリーを取得し、GetRootNode() でそのサブツリーのルートノードを取得する
            html += `<div class="child-item">${i}: ${formatNode(child)}</div>`;// 子ノードの番号と内容を表示する。例えば "0: B##x" のようになる
        }
        html += '</div>';
        html += '</div>';
    }

    html += '</div>';// キャプチャされたノードの詳細をまとめるコンテナの HTML を閉じる
    return html;// 組み立てた HTML を返す
}

// キャプチャ詳細の開閉を切り替える
// キャプチャの見出し部分をクリックしたときに、そのキャプチャの詳細表示を開いたり閉じたりする関数。captureId は開閉する詳細部分の ID で、toggleCaptureDetails を呼ぶときに渡される
window.toggleCaptureDetails = function(captureId) {
    const detailsEl = document.getElementById(captureId);// 開閉する詳細部分の DOM 要素を取得する
    const expandIcon = detailsEl.previousElementSibling.querySelector('.capture-expand');// 詳細部分の見出しにあるアイコン要素を取得する

    if (detailsEl.style.display === 'none') {
        detailsEl.style.display = 'block';
        expandIcon.textContent = '▲';
    } else {
        detailsEl.style.display = 'none';
        expandIcon.textContent = '▼';
    }
};

// ツリー文字列表現を結果欄に表示する displayMatchSuccess 内で呼ばれる関数。TreePrint のようなテキストベースのツリー表示を組み立てるための関数。マッチしたツリー全体を見られるようにする
function displayTreeVisualization(result) {// マッチしたツリー全体を見られるようにするための関数。TreePrint のようなテキストベースのツリー表示を組み立てる
    let html = '<div class="tree-visualization">';
    html += '<div class="tree-header">Tree Visualization:</div>';

    try {
        const tree = result.GetRootCapture().Tree();// マッチ結果のルートキャプチャからツリーオブジェクトを取得する。これがマッチしたツリー全体を表す想定
        const treeStr = getTreeString(tree);// ツリーオブジェクトを文字列に変換する。これが TreePrint のようなテキストベースのツリー表示になる想定
        html += escapeHtml(treeStr);// ツリー文字列を HTML エスケープして表示する。これでツリー構造が見やすくなる
    } catch (error) {
        html += 'Tree visualization unavailable';
    }

    html += '</div>';
    return html;
}

// ツリーを文字列に変換する（TreePrint 相当）
//理解不足なんとなく理解c
// SVG 表示とは別に、テキストとしても構造を追えるようにしておくとデバッグしやすい
function getTreeString(tree) {// ツリーオブジェクトを受け取り、それを文字列に変換する関数。これが TreePrint のようなテキストベースのツリー表示になる想定
    const lines = [];

    function printNode(node, prefix = '', isLast = true) {// ノードを表示用の文字列に整形して lines 配列に追加する再帰関数。prefix は現在のノードの前につけるスペースや枝の文字列、isLast はこのノードが兄弟の中で最後かどうかを示すフラグ
        if (!node) return;

        const connector = isLast ? ' +- ' : ' +- ';
        const nodeStr = formatNode(node);// ノードを表示用の文字列に整形する。これには Attr0 と Attr1 を組み合わせた文字列が返る想定
        lines.push(prefix + connector + nodeStr);// 現在のノードを prefix と connector をつけて lines 配列に追加する。これでツリー構造が見やすくなる

        const children = [];
        for (let i = 0; i < node.NumChildren(); i++) {// 子ノードをループして、子ノードのサブツリーを取得して children 配列に追加する。これで後で子ノードを順番に表示できるようになる
            children.push(node.NthChildSubtree(i));
        }

        const newPrefix = prefix + (isLast ? '    ' : ' |  ');// 子ノードを表示するための新しい prefix を作る。最後のノードならスペースを、そうでなければ縦線を追加する
        children.forEach((child, index) => {// 各子ノードについて、printNode を再帰的に呼ぶ。index を使って、この子ノードが兄弟の中で最後かどうかを判断する
            printNode(child.GetRootNode(), newPrefix, index === children.length - 1);
        });
    }

    const rootNode = tree.GetRootNode();// ツリーのルートノードを取得する
    lines.push(formatNode(rootNode));// ルートノードを最初に lines 配列に追加する。これでツリーのトップが表示される

    for (let i = 0; i < rootNode.NumChildren(); i++) {// ルートノードの子ノードをループして、printNode を呼ぶ。これでルートノードの子供たちが順番に表示される
        const child = rootNode.NthChildSubtree(i);
        printNode(child.GetRootNode(), '', i === rootNode.NumChildren() - 1);// 最後の子ノードには isLast フラグを true にして呼ぶ。これで最後の子ノードがスペースで表示されるようになる
    }

    return lines.join('\n');
}

// ノードを表示用の文字列に整形する
function formatNode(node) {// ノードオブジェクトを受け取り、それを表示用の文字列に整形する関数。これには Attr0 と Attr1 を組み合わせた文字列が返る想定
    if (!node) return '(null)';

    let str = node.Attr0() || '(undef)';

    if (node.Attr1() !== undefined && node.Attr1() !== null) {// Attr1 が定義されている場合は、Attr0 と Attr1 を組み合わせた文字列を作る。例えば "A##x" のようになる
        str += '#' + node.Attr1();// Attr1 の値を文字列にして、Attr0 と組み合わせる。これでノードのタイプと識別子が表示されるようになる
    }

    return str;
}

// マッチ失敗時の表示 executeTreeMatch と executeTreeMatchFind の両方から呼ばれる関数。マッチしなかった場合は、結果エリアに "Match: NO MATCH" と表示する
function displayMatchFail() {
    resultArea.innerHTML = '<p class="match-fail">Match: NO MATCH</p>';
    // 前回成功時の結果を残すと SVG に古い色が出続けるので必ずクリアする
    window.lastMatchedResult  = null;// 単一マッチの結果をクリアする
    window.lastMatchedResults = null;// 複数マッチの結果をクリアする
}

// エラー表示 executeTreeMatch と executeTreeMatchFind の両方から呼ばれる関数。ツリー構築やマッチ処理でエラーが出た場合は、結果エリアにエラーメッセージを表示する
function displayError(error) {
    const errorMsg = error.message || error.toString();
    resultArea.innerHTML = `<div class="match-error"><strong>Error:</strong><br>${escapeHtml(errorMsg)}</div>`;
    // エラー時も前回結果をクリアしておく
    window.lastMatchedResult  = null;
    window.lastMatchedResults = null;
}

// HTML エスケープ
// ユーザー入力やノード文字列をそのまま innerHTML に入れると、意図しないタグ解釈で表示が壊れることがある
function escapeHtml(text) {// 文字列を受け取り、それを HTML エスケープする関数。これでユーザー入力やノード文字列を安全に表示できるようになる
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// サンプルパターン（カテゴリ別）
const SAMPLE_PATTERNS = {// パターンのカテゴリごとに、パターンの例をいくつか用意する。これをサンプルメニューで選べるようにする
    '基本マッチング': [
        {
            name: 'シンプルな親子',
            pattern: 'A > B##x',
            target: 'A > B C D',
            description: 'Aノードの子供にBがあるものをマッチ'
        },
        {
            name: '複数の子供',
            pattern: 'A > B##b C##c',
            target: 'A > B C D',
            description: 'AノードがBとC両方の子供を持つものをマッチ'
        },
        {
            name: 'ワイルドカード',
            pattern: '.##root > A##a',
            target: 'R > A B C',
            description: '. は任意のノードタイプにマッチ'
        }
    ],
    'キャプチャ': [
        {
            name: '単一キャプチャ',
            pattern: 'A##root > B##child',
            target: 'A > B C',
            description: '特定のノードをキャプチャして取得'
        },
        {
            name: '複数キャプチャ（同名）',
            pattern: 'A##x > B##x > C##x',
            target: 'A > B > C',
            description: '同じ名前で複数キャプチャすると配列になる'
        },
        {
            name: 'マルチキャプチャ (@)',
            pattern: 'A##@a > B##@b',
            target: 'R > (A > B) (A > B > (A > B))',
            description: 'マッチする全てのAとBノードを見つける（TreeMatchFind使用）'
        }
    ],
    'ORパターン': [
        {
            name: '基本OR',
            pattern: '.##root > (A##a | B##b)',
            target: 'R > A B C',
            description: 'AまたはBの子供にマッチ'
        },
        {
            name: '複雑なOR（子要素側）',
            pattern: 'A > (C##c | D##d)',
            target: 'R > (A > C) (A > D) (B > C)',
            description: 'CまたはDを子に持つAノードをマッチ'
        },
        {
            name: 'ORで深いパターン優先',
            pattern: 'A > (B##short | (B > (X > P##deep))) W##w',
            target: 'A > (B > (X > P)) W',
            description: 'ORでより深いネスト構造が選ばれることを確認'
        }
    ],
    '量指定子': [
        {
            name: '繰り返しマッチ (+)',
            pattern: 'A > (.##@x)+ B##b',
            target: 'A > X1 X2 X3 B',
            description: '1個以上のノードに繰り返しマッチ'
        },
        {
            name: '最短マッチ (+?)',
            pattern: 'A > (.##@x)+? B##b',
            target: 'A > X1 X2 X3 B',
            description: '1個以上のノードに最短でマッチ（最小限だけ取る）'
        }
    ],
    '高度なパターン': [
        {
            name: 'ネスト構造',
            pattern: 'A > (B > C##c)',
            target: 'A > (B > C) (B > D)',
            description: 'ネストした親子関係にマッチ'
        },
        {
            name: '深い階層探索',
            pattern: 'A##@a',
            target: 'R > (A > (B > A)) (C > A)',
            description: 'ツリー内の全てのAノードを見つける（TreeMatchFind使用）'
        },
        {
            name: '複雑なパターン',
            pattern: 'Func##f > (Param##@p)+ Body##b',
            target: 'Func > Param#x Param#y Param#z Body',
            description: '複数のパラメータを持つ関数にマッチ'
        }
    ],
    '+?の動作確認': [
        {
            name: '+?のバックトラック',
            pattern: 'A > (B##@b)+? (C##@c)+? D##d',
            target: 'A > B#1 B#2 C#1 C#2 D',
            description: '+?は最短だがマッチする候補の中で最短。B+?がB#1だけだと後続がマッチしないのでB#1,B#2になる'
        },
        {
            name: '+? vs + の比較（最短）',
            pattern: 'A > (.##@x)+? B',
            target: 'A > X Y Z B',
            description: '+?は最短の1個だけマッチ（期待: x=[X]）'
        },
    ],
    '深いネストのテスト': [
        {
            name: '20段ネスト',
            pattern: 'A##@all_a',
            target: 'A#1 > A#2 > A#3 > A#4 > A#5 > A#6 > A#7 > A#8 > A#9 > A#10 > A#11 > A#12 > A#13 > A#14 > A#15 > A#16 > A#17 > A#18 > A#19 > A#20',
            description: '深くネストした全てのAノードを取得（TreeMatchFind使用、20個キャプチャ）'
        },
        {
            name: '10段階層パターン',
            pattern: 'A##a1 > A##a2 > A##a3 > A##a4 > A##a5',
            target: 'A#1 > A#2 > A#3 > A#4 > A#5 > A#6',
            description: '深い階層の親子関係を明示的にマッチ'
        }
    ],
    'JavaScript AST': [
        {
            name: 'CallExpression基本',
            pattern: 'CallExpression##call',
            target: 'Program > FunctionDeclaration > (Identifier#test) (BlockStatement > ExpressionStatement > CallExpression > (MemberExpression > (Identifier#console) (Identifier#log)) (Literal#hello))',
            description: 'console.log("hello") の CallExpression をマッチ（TreeMatchFind使用）'
        },
        {
            name: 'MemberExpression',
            pattern: 'MemberExpression##mem > Identifier#console',
            target: 'Program > FunctionDeclaration > (Identifier#test) (BlockStatement > ExpressionStatement > CallExpression > (MemberExpression > (Identifier#console) (Identifier#log)) (Literal#hello))',
            description: 'console.log の MemberExpression をマッチ'
        },
        {
            name: 'ExpressionStatement',
            pattern: 'ExpressionStatement##stmt',
            target: 'Program > FunctionDeclaration > (Identifier#test) (BlockStatement > ExpressionStatement > CallExpression > (MemberExpression > (Identifier#console) (Identifier#log)) (Literal#hello))',
            description: 'console.log文全体をマッチ（Transform機能で使用推奨）'
        },
        {
            name: 'Literal値取得',
            pattern: 'Literal##msg',
            target: 'Program > FunctionDeclaration > (Identifier#test) (BlockStatement > ExpressionStatement > CallExpression > (MemberExpression > (Identifier#console) (Identifier#log)) (Literal#hello))',
            description: '文字列リテラル "hello" をマッチ'
        },
        {
            name: '深いネスト（BlockStatement内）',
            pattern: 'BlockStatement##block > ExpressionStatement##stmt > CallExpression##call',
            target: 'Program > FunctionDeclaration > (Identifier#test) (BlockStatement > ExpressionStatement > CallExpression > (MemberExpression > (Identifier#console) (Identifier#log)) (Literal#hello))',
            description: '関数ブロック内の文と呼び出しを階層的にマッチ'
        }
    ]
};

// ランダムにサンプルを読み込む
function loadSample() { // ランダムサンプルを選ぶために、全てのサンプルを 1 つの配列にまとめる
    // カテゴリ分けされたサンプルを 1 つの配列に平坦化する
    const allSamples = [];
    Object.keys(SAMPLE_PATTERNS).forEach(category => {// カテゴリごとにサンプルを追加
        SAMPLE_PATTERNS[category].forEach(sample => {
            allSamples.push({ ...sample, category });
        });
    });

    const sample = allSamples[Math.floor(Math.random() * allSamples.length)];// ランダムにサンプルを選ぶ
    patternInput.value = sample.pattern;// ターゲットもサンプルのものをセットする
    targetInput.value = sample.target;// 

    // サンプル読込時は事前読み込みツリーをクリアする
    // 入力欄のサンプル文字列を正しく使うため
    currentTargetTree = null;

    executeMatch();// 読み込んだサンプルでマッチを実行する
}

// サンプルメニューを組み立てる
function buildSamplesMenu() {
    samplesList.innerHTML = '';//

    Object.keys(SAMPLE_PATTERNS).forEach(category => {// 各カテゴリごとにサンプルを表示するセクションを作る
        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'sample-category';

        const headerDiv = document.createElement('div');
        headerDiv.className = 'sample-category-header';
        headerDiv.textContent = category;
        categoryDiv.appendChild(headerDiv);// カテゴリの見出しを表示する

        SAMPLE_PATTERNS[category].forEach(sample => {// 各サンプルについて、その表示を組み立てる
            const itemDiv = document.createElement('div');// サンプルの項目全体を包むコンテナの HTML を組み立てる
            itemDiv.className = 'sample-item';

            const nameDiv = document.createElement('div');// サンプルの名前を表示する要素を作る
            nameDiv.className = 'sample-name';
            nameDiv.textContent = sample.name;

            const patternDiv = document.createElement('div');// サンプルのパターンを表示する要素を作る
            patternDiv.className = 'sample-pattern';
            patternDiv.textContent = sample.pattern;

            const descDiv = document.createElement('div');// サンプルの説明を表示する要素を作る
            descDiv.className = 'sample-description';
            descDiv.textContent = sample.description;

            itemDiv.appendChild(nameDiv);// サンプルの名前、パターン、説明をサンプル項目のコンテナに追加する
            itemDiv.appendChild(patternDiv);// サンプルのパターンをサンプル項目のコンテナに追加する
            itemDiv.appendChild(descDiv);// サンプルの説明をサンプル項目のコンテナに追加する

            itemDiv.addEventListener('click', () => {// サンプル項目がクリックされたときに、そのサンプルを読み込むためのイベントリスナーを追加する
                loadSpecificSample(sample);// クリックされたサンプルを読み込むための関数を呼ぶ。引数にはこのサンプルの情報を渡す
            });

            categoryDiv.appendChild(itemDiv);// このサンプル項目をカテゴリのコンテナに追加する
        });

        samplesList.appendChild(categoryDiv);
    });
}

// 指定したサンプルを読み込む
function loadSpecificSample(sample) {// クリックされたサンプルのパターンとターゲットを入力欄にセットする関数。これでユーザーがサンプルを選んだときに、そのサンプルの内容が入力欄に反映されるようになる
    patternInput.value = sample.pattern;// ターゲットもサンプルのものをセットする
    targetInput.value = sample.target;

    // サンプル読込時は事前読み込みツリーをクリアする
    currentTargetTree = null;

    closeSamplesMenu();// サンプルメニューを閉じる。これでサンプルを選んだ後はメニューが閉じて、結果に集中できるようになる
    executeMatch();// 読み込んだサンプルでマッチを実行する。これでサンプルを選んだときに、そのサンプルのパターンとターゲットでマッチがすぐに行われるようになる
}

// サンプルメニューの開閉を切り替える
function toggleSamplesMenu(e) {
    e.stopPropagation();
    const isVisible = samplesMenu.style.display !== 'none';// サンプルメニューが現在表示されているかどうかをチェックする。display プロパティが 'none' でない場合は表示されていると判断する

    if (isVisible) {// サンプルメニューが表示されている場合は、
        closeSamplesMenu();// サンプルメニューを閉じる。これでメニューが開いているときにボタンをクリックすると閉じるようになる
    } else {
        openSamplesMenu();// サンプルメニューが表示されていない場合は、サンプルメニューを開く。これでメニューが閉じているときにボタンをクリックすると開くようになる
    }
}

// サンプルメニューを開く
function openSamplesMenu() {
    samplesMenu.style.display = 'block';// サンプルメニューを表示する。これでサンプルメニューが開くようになる
    samplesMenuBtn.classList.add('active');// サンプルメニューボタンをアクティブ状態にする。これでメニューが開いているときにボタンが見た目でわかるようになる
}

// サンプルメニューを閉じる
function closeSamplesMenu() {
    samplesMenu.style.display = 'none';// サンプルメニューを非表示にする。これでサンプルメニューが閉じるようになる
    samplesMenuBtn.classList.remove('active');// サンプルメニューボタンのアクティブ状態を解除する。これでメニューが閉じているときにボタンが見た目でわかるようになる
}

// ===== パターン履歴管理 =====

const HISTORY_KEY = 'treematch_pattern_history';// 履歴を localStorage に保存するときのキー。これで履歴データが localStorage のどこに保存されているかがわかるようになる
const MAX_HISTORY = 20;// 履歴の最大件数。これを超えると古いものから削除される。これで履歴が増えすぎて管理しづらくなるのを防ぐことができる

// パターンを履歴に保存する
function saveToHistory(pattern) {// パターンを履歴に保存する関数。pattern は保存するパターンの文字列。これでユーザーがマッチしたパターンを後で見返せるようになる
    if (!pattern || pattern.trim() === '') return;// パターンが空文字や空白だけの場合は保存しない。これで無意味な履歴が増えるのを防ぐことができる

    let history = getHistory();// 既存の履歴を localStorage から取得する。これで現在の履歴データを読み込んで、そこに新しいパターンを追加できるようになる

    // 同じパターンがあれば古い方を消して重複を防ぐ
    history = history.filter(item => item.pattern !== pattern);

    // 最新のものを先頭に追加する
    history.unshift({
        pattern: pattern,
        timestamp: Date.now()
    });

    // 履歴が増えすぎないよう件数を制限する
    if (history.length > MAX_HISTORY) {
        history = history.slice(0, MAX_HISTORY);
    }

    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));// 更新した履歴を localStorage に保存する。これで新しいパターンが履歴に追加されて、次回以降も見られるようになる
    loadHistoryDisplay();// 履歴の表示を更新する。これでパターンを保存した後に履歴ドロップダウンを開いたときに、最新の履歴が反映されるようになる
}

// localStorage から履歴を取得する
// ここで例外を握っているのは、保存データが壊れていてもアプリ全体を止めないため
function getHistory() {
    try {
        const data = localStorage.getItem(HISTORY_KEY);// localStorage から履歴データを取得する。これで保存されている履歴データを読み込むことができる
        return data ? JSON.parse(data) : [];// データがあれば JSON をパースして配列として返す。データがない場合は空配列を返す。これで履歴データが正しく読み込まれない場合でも、空の履歴として扱うことができる
    } catch (error) {
        console.error('Error loading history:', error);
        return [];
    }
}

// 履歴ドロップダウンの開閉を切り替える
function toggleHistory(e) {// 履歴ドロップダウンの開閉を切り替える関数。履歴ボタンがクリックされたときに呼ばれる。e はクリックイベントオブジェクト。これでユーザーが履歴ボタンをクリックしたときに、履歴ドロップダウンが開いたり閉じたりするようになる
    e.stopPropagation();
    const isVisible = historyDropdown.style.display !== 'none';

    if (isVisible) {
        closeHistory();
    } else {
        openHistory();
    }
}

// 履歴ドロップダウンを開く
function openHistory() {
    historyDropdown.style.display = 'block';
    historyBtn.classList.add('active');
    loadHistoryDisplay();
}

// 履歴ドロップダウンを閉じる
function closeHistory() {
    historyDropdown.style.display = 'none';
    historyBtn.classList.remove('active');
}

// 履歴を読み込んで画面に表示する
// 保存形式と表示形式を分けておくと、あとで UI だけ変えたい場合に影響範囲を小さくできる
function loadHistoryDisplay() {// 履歴を読み込んで画面に表示する関数。これで履歴ドロップダウンを開いたときに、保存されているパターンの履歴が表示されるようになる
    const history = getHistory();

    if (history.length === 0) {// 履歴が空の場合は、その旨を表示する。これで履歴がないときにユーザーにわかりやすく伝えることができる
        historyList.innerHTML = '<p class="history-empty">No pattern history yet</p>';
        return;
    }

    historyList.innerHTML = '';// 履歴の表示エリアをクリアする。これで履歴を再読み込みするときに、古い表示が残らないようになる

    history.forEach((item, index) => {// 各履歴アイテムの表示を組み立てる
        const div = document.createElement('div');// 履歴アイテム全体を包むコンテナの HTML を組み立てる
        div.className = 'history-item';

        const patternSpan = document.createElement('span');// パターンのテキストを表示する要素を作る
        patternSpan.className = 'history-pattern';
        patternSpan.textContent = item.pattern;
        patternSpan.title = item.pattern;

        const timeSpan = document.createElement('span');
        timeSpan.className = 'history-time';
        timeSpan.textContent = formatTime(item.timestamp);// タイムスタンプを相対表示用の文字列に変換して表示する。これで履歴アイテムがいつ保存されたものかがわかりやすくなる

        const deleteBtn = document.createElement('button');// 履歴アイテムを削除するボタンを作る
        deleteBtn.className = 'history-delete';
        deleteBtn.innerHTML = '×';
        deleteBtn.title = 'Delete';
        deleteBtn.addEventListener('click', (e) => {// 削除ボタンがクリックされたときに、その履歴アイテムを削除するためのイベントリスナーを追加する。e はクリックイベントオブジェクト。これでユーザーが削除ボタンをクリックしたときに、その履歴アイテムが削除されるようになる
            e.stopPropagation();
            deleteHistoryItem(index);
        });

        div.appendChild(patternSpan);// パターンのテキストを履歴アイテムのコンテナに追加する
        div.appendChild(timeSpan);// タイムスタンプを履歴アイテムのコンテナに追加する
        div.appendChild(deleteBtn); // アイテム全体をクリックするとそのパターンで復元する

        div.addEventListener('click', () => {// 履歴アイテムがクリックされたときに、そのパターンを復元するためのイベントリスナーを追加する。これでユーザーが履歴アイテムをクリックしたときに、そのパターンが入力欄にセットされてマッチが実行されるようになる
            restorePattern(item.pattern);
        });

        historyList.appendChild(div);// この履歴アイテムを履歴リストのコンテナに追加する
    });
}

// 履歴からパターンを復元する
function restorePattern(pattern) {// 履歴からパターンを復元する関数。pattern は復元するパターンの文字列。これでユーザーが履歴アイテムをクリックしたときに、そのパターンが入力欄にセットされてマッチが実行されるようになる
    patternInput.value = pattern;
    closeHistory();// 履歴ドロップダウンを閉じる。これでパターンを復元した後は履歴が閉じて、結果に集中できるようになる
    executeMatch();// 復元したパターンでマッチを実行する。これでユーザーが履歴アイテムをクリックしたときに、そのパターンでマッチがすぐに行われるようになる
}

// 履歴を 1 件だけ削除する
function deleteHistoryItem(index) {// 履歴を 1 件だけ削除する関数。index は削除する履歴アイテムのインデックス。これでユーザーが履歴アイテムの削除ボタンをクリックしたときに、そのアイテムだけが履歴から削除されるようになる
    let history = getHistory();
    history.splice(index, 1);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    loadHistoryDisplay();
}

// 履歴をすべて削除する
function clearHistory() {
    if (confirm('Clear all pattern history?')) {
        localStorage.removeItem(HISTORY_KEY);
        loadHistoryDisplay();
    }
}

// タイムスタンプを相対表示用の文字列に変換する
function formatTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
}

// ===== コピー機能 =====

// パターンをクリップボードへコピーする
async function copyPattern() {
    const pattern = patternInput.value.trim();

    if (!pattern) {
        showCopyFeedback(copyPatternBtn, false);
        return;
    }

    try {
        await navigator.clipboard.writeText(pattern);
        showCopyFeedback(copyPatternBtn, true);
    } catch (error) {
        console.error('Copy failed:', error);
        showCopyFeedback(copyPatternBtn, false);
    }
}

// 結果を JSON 形式でクリップボードへコピーする
async function copyResult() {// 結果を JSON 形式でコピーする関数。これでユーザーがマッチ結果を JSON としてコピーできるようになる
    if (!lastMatchResult) {
        showCopyFeedback(copyResultBtn, false);
        return;
    }

    try {
        const json = JSON.stringify(lastMatchResult, null, 2);
        await navigator.clipboard.writeText(json);
        showCopyFeedback(copyResultBtn, true);
    } catch (error) {
        console.error('Copy failed:', error);
        showCopyFeedback(copyResultBtn, false);
    }
}

// コピー成功・失敗の見た目を一時的に表示する
function showCopyFeedback(button, success) {// 成功と失敗で見た目を変える
    if (success) {// 成功したら緑の背景を一瞬つける
        button.classList.add('copied');// 1.5秒後にクラスを外して元の見た目に戻す
        setTimeout(() => {
            button.classList.remove('copied');
        }, 1500);
    } else {
        button.style.opacity = '0.5';
        setTimeout(() => {
            button.style.opacity = '1';
        }, 300);
    }
}

// マッチ結果を JSON 化できる形へ変換する
// TreeMatchLib の戻り値はメソッドを持つオブジェクトなので、そのままではコピーや保存に向かない
function resultToJSON(result) {
    if (!result) return null;

    const captures = {};
    const multiCaptures = {};

    // 単一キャプチャ
    const captureNames = result.GetCaptureNames();// キャプチャされている名前のリストを取得する。これでどの名前のキャプチャがあるかがわかるようになる
    captureNames.forEach(name => {
        const capture = result.Capture(name);
        captures[name] = nodeToJSON(capture.Node());
    });

    // マルチキャプチャ
    const multiCaptureNames = result.GetMultiCaptureNames();// マルチキャプチャされている名前のリストを取得する。これでどの名前のマルチキャプチャがあるかがわかるようになる
    multiCaptureNames.forEach(name => {
        const captureList = result.MultiCapture(name);
        multiCaptures[name] = captureList.map(c => nodeToJSON(c.Node()));
    });

    return {
        captures: captures,
        multiCaptures: multiCaptures
    };
}

// ノードを JSON 化できる形へ変換する
// 画面表示用オブジェクトと、後で再利用しやすい素朴なデータ構造を分けるための変換
function nodeToJSON(node) {// ノードを JSON 化できる形へ変換する関数。node は変換するノードオブジェクト。これでノードの情報を JSON として表現できるようになる
    if (!node) return null;

    const obj = {
        attr0: node.Attr0(),
        attr1: node.Attr1()
    };

    const children = [];
    for (let i = 0; i < node.NumChildren(); i++) {// 子ノードを再帰的に JSON 化して配列に追加する。これでノードの階層構造も JSON として表現できるようになる
        children.push(nodeToJSON(node.NthChildSubtree(i).GetRootNode()));
    }

    if (children.length > 0) {
        obj.children = children;
    }

    return obj;
}

// 補助関数: ノード文字数に応じて表示幅を計算する
function calculateNodeWidth(text, baseWidth = 120, minWidth = 80, maxWidth = 300) {
    // ノードの文字列と基本幅を受け取り、文字数に応じて表示幅を計算する関数。
    // text はノードのテキスト、baseWidth は基本の幅、minWidth と maxWidth は幅の最小値と最大値。
    // これでノードのテキストが長い場合に、表示幅を自動的に調整できるようになる
    const charWidth = 8; // 等幅フォントでの 1 文字あたりのおおよそのピクセル幅
    const padding = 20; // ボックス左右の余白

    const requiredWidth = text.length * charWidth + padding;// テキストの長さに基づいて必要な幅を計算する。これでノードのテキストが長いほど、必要な幅も大きくなるようになる

    // 収まるなら既定幅を使い、長ければ広げる
    // ただし極端に大きくなりすぎないよう上限も設ける
    return Math.min(Math.max(requiredWidth, minWidth, baseWidth), maxWidth);// 計算した幅を最小値、基本幅、最大値の範囲内に収める。これでノードのテキストが短い場合は基本幅が使われ、長い場合は必要な幅まで広がるが、極端に大きくなるのは防げるようになる
}

// ===== SVG カラーリング用 中間データ構造 =====
// drawSVGTree() のたびにリセットされる。色付け・ホバー処理がここを参照する

// ノードオブジェクト → nodeId（"0", "0.1", "0.1.2" 形式のパス文字列）
// 【前提】GetRootCapture().Node() / Capture(name).Node() が drawNode() 登録時と
//        同一のオブジェクト参照を返すことを前提とする。参照が崩れた場合は
//        キャプチャ色付けがスキップされるが、それ以外の処理は正常に動く
let nodeObjectToNodeId = new Map();

// nodeId → renderMeta（SVG 要素と match/capture 情報を持つ）
// { nodeId, nodeObject, rectEl, textEl, nodeX, nodeY, nodeWidth, nodeHeight,
//   matchIndexes: [], captureNames: [], isMatchRoot: false }
let nodeIdToRenderMeta = new Map();

// 現在アクティブなホバー種別（match と capture は同時に有効にしない）
// 'match' | 'capture' | null
let currentSVGHoverType = null;

// ホバー解除のデバウンスタイマー
// rect → badge など短い移動でチラつかないよう 60ms 待ってから消す
let svgHoverClearTimer = null;

// ノードごとのバッジ累積幅（右端から積む際に使う・可変幅対応）
let nodeBadgeOffsets = new Map(); // nodeId → 右端からの現在オフセット

// SVG でツリーを描画する
// matchResults, matchMode, patternStr はオプション。省略すると色付けなしで描画する
// - matchResults: TreeMatch なら単一結果、TreeMatchFind なら結果配列
// - matchMode: 'TreeMatch' | 'TreeMatchFind'
// - patternStr: パターン文字列（capture 名の出現順で色を割り当てるために使う）
function drawSVGTree(tree, matchResults, matchMode, patternStr) {
    const svgGroup = document.getElementById('tree-group');
    const treeSvg = document.getElementById('tree-svg');
    const emptyState = document.querySelector('#tab-tree-viz .empty-state');

    // 前回の描画をリセット（中間データも一緒にリセット）
    svgGroup.innerHTML = '';
    nodeObjectToNodeId = new Map();
    nodeIdToRenderMeta = new Map();
    nodeBadgeOffsets   = new Map();
    currentSVGHoverType = null;

    // 凡例エリアも空にする
    const legendEl = document.getElementById('svg-match-legend');
    if (legendEl) legendEl.innerHTML = '';

    if (!tree) {
        treeSvg.classList.remove('active');
        emptyState.style.display = 'flex';
        return;
    }

    emptyState.style.display = 'none';
    treeSvg.classList.add('active');

    // バッジが上にはみ出るぶん padding.top を大きめにとる
    const padding = { top: 40, left: 20, right: 20, bottom: 20 };
    const baseNodeWidth = 120;
    const nodeHeight = 40;
    const levelHeight = 80;

    let maxWidth  = 0;
    let maxHeight = 0;

    // ノードを再帰的に描く内部関数
    // nodeId は "0"（ルート）, "0.0"（ルートの1番目の子）のように深さ優先パスで振る
    function drawNode(node, x, y, level, nodeId) {
        if (!node) return { width: 0, center: x };

        const nodeText  = formatNode(node);
        const nodeWidth = calculateNodeWidth(nodeText, baseNodeWidth);
        const children  = [];

        for (let i = 0; i < node.NumChildren(); i++) {
            children.push(node.NthChildSubtree(i));
        }

        maxWidth  = Math.max(maxWidth,  x + nodeWidth);
        maxHeight = Math.max(maxHeight, y + nodeHeight);

        // ノード要素を生成してグループに追加するヘルパー（葉・親共通）
        function makeNodeElements(nx, ny, nw) {
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', nx);
            rect.setAttribute('y', ny);
            rect.setAttribute('width', nw);
            rect.setAttribute('height', nodeHeight);
            rect.setAttribute('rx', 6);
            svgGroup.appendChild(rect);

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', nx + nw / 2);
            text.setAttribute('y', ny + nodeHeight / 2 + 5);
            text.setAttribute('text-anchor', 'middle');
            // pointer-events: none にすることで、文字上にカーソルが乗っても
            // 下の rect がマウスイベントを受け取れるようにする
            text.setAttribute('pointer-events', 'none');
            text.textContent = nodeText;
            svgGroup.appendChild(text);

            return { rect, text };
        }

        if (children.length === 0) {
            // 葉ノード
            const { rect, text } = makeNodeElements(x, y, nodeWidth);
            nodeObjectToNodeId.set(node, nodeId);
            nodeIdToRenderMeta.set(nodeId, {
                nodeId, nodeObject: node, rectEl: rect, textEl: text,
                nodeX: x, nodeY: y, nodeWidth, nodeHeight,
                matchIndexes: [], captureNames: [], isMatchRoot: false
            });
            return { width: nodeWidth, center: x + nodeWidth / 2 };
        }

        // 先に子を描いてから親の中心位置を決める
        // 親を先に描くと子の幅によって位置がずれるため、木構造では下から計算するのが自然
        let childX = x;
        const childCenters = [];
        let totalWidth = 0;

        children.forEach((child, idx) => {
            // 子の nodeId は「親のパス + "." + 子インデックス」
            const childNodeId = nodeId + '.' + idx;
            const result = drawNode(child.GetRootNode(), childX, y + levelHeight, level + 1, childNodeId);
            childCenters.push(result.center);
            childX += result.width + 20;
            totalWidth += result.width + (idx < children.length - 1 ? 20 : 0);
        });

        const parentCenter = (childCenters[0] + childCenters[childCenters.length - 1]) / 2;
        const parentX      = parentCenter - nodeWidth / 2;
        maxWidth = Math.max(maxWidth, parentX + nodeWidth);

        const { rect, text } = makeNodeElements(parentX, y, nodeWidth);
        text.setAttribute('x', parentCenter); // 中央揃えのため x を上書き

        nodeObjectToNodeId.set(node, nodeId);
        nodeIdToRenderMeta.set(nodeId, {
            nodeId, nodeObject: node, rectEl: rect, textEl: text,
            nodeX: parentX, nodeY: y, nodeWidth, nodeHeight,
            matchIndexes: [], captureNames: [], isMatchRoot: false
        });

        // 親子を結ぶ線（背面に回るよう先頭へ挿入する）
        childCenters.forEach(childCenter => {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', parentCenter);
            line.setAttribute('y1', y + nodeHeight);
            line.setAttribute('x2', childCenter);
            line.setAttribute('y2', y + levelHeight);
            svgGroup.insertBefore(line, svgGroup.firstChild);
        });

        return { width: Math.max(totalWidth, nodeWidth), center: parentCenter };
    }

    try {
        const rootNode = tree.GetRootNode();
        drawNode(rootNode, padding.left, padding.top, 0, '0'); // ルートの nodeId は "0"

        const svgWidth  = maxWidth  + padding.right;
        const svgHeight = maxHeight + padding.bottom;

        originalSvgWidth  = svgWidth;
        originalSvgHeight = svgHeight;

        treeSvg.setAttribute('width',  svgWidth);
        treeSvg.setAttribute('height', svgHeight);
        treeSvg.removeAttribute('viewBox');

        // マッチ結果があれば色付けを実行する
        if (matchResults) {
            const colorResult = applyMatchColors(matchResults, matchMode, patternStr || '');
            if (colorResult) {
                buildSVGLegend(colorResult.matchMeta, colorResult.captureMeta);
            }
        }
    } catch (error) {
        console.error('Error drawing tree:', error);
    }
}

// ===== おぐ風コンパクトレイアウト =====
//
// 参考: おぐ作成Javascript/ext_svg_tree_gen_js.js の draw_tree_prep / connect_line_v
//
// draw_tree_prep の思想:
//   各サブツリーの「深さごとの x 範囲プロファイル」を bottom-up に計算し、
//   兄弟サブツリーを詰め込む際に「すべての深さで重ならない最小シフト」を
//   一度で求めることでコンパクトな配置を実現する（Reingold-Tilford 系）。
//
// connect_line_v の思想:
//   親下端中央→子上端中央を直線ではなく水平中間点でのエルボーカーブで結ぶ。
//   Q コマンドによる二次ベジェ曲線で角を丸め、折れ曲がりを滑らかに見せる。

// node._cX, node._cW を設定する bottom-up レイアウト計算
// 返り値: profile = [{lo, hi}, ...] (深さ 0 = 自ノード, 1 = 子レベル, ...)
function computeCompactLayout(node, hSep, widthFn) {
    const w = widthFn(node);
    node._cW = w;

    const numChildren = node.NumChildren();
    if (numChildren === 0) {
        node._cX = 0;
        return [{ lo: 0, hi: w }];
    }

    // 子を再帰的にレイアウト（それぞれ x=0 起点）
    const children = [];
    const childProfiles = [];
    for (let i = 0; i < numChildren; i++) {
        const child = node.NthChildSubtree(i).GetRootNode();
        children.push(child);
        childProfiles.push(computeCompactLayout(child, hSep, widthFn));
    }

    // 兄弟を左→右に詰め込む。
    // mergedProfile: これまでに配置した兄弟群の「右端プロファイル」
    let mergedProfile = childProfiles[0].map(e => ({ lo: e.lo, hi: e.hi }));

    for (let i = 1; i < numChildren; i++) {
        const next = childProfiles[i];

        // 全深さで重ならない最小シフト量を求める
        let maxShift = mergedProfile[0].hi - next[0].lo + hSep;
        const depth = Math.min(mergedProfile.length, next.length);
        for (let d = 1; d < depth; d++) {
            const s = mergedProfile[d].hi - next[d].lo + hSep;
            if (s > maxShift) maxShift = s;
        }
        if (maxShift < hSep) maxShift = hSep;

        // 子ノードをシフト（再帰）
        applyXOffsetRecursive(children[i], maxShift);
        for (const e of next) { e.lo += maxShift; e.hi += maxShift; }

        // プロファイルをマージ
        for (let d = 0; d < next.length; d++) {
            if (d < mergedProfile.length) {
                if (next[d].lo < mergedProfile[d].lo) mergedProfile[d].lo = next[d].lo;
                if (next[d].hi > mergedProfile[d].hi) mergedProfile[d].hi = next[d].hi;
            } else {
                mergedProfile.push({ lo: next[d].lo, hi: next[d].hi });
            }
        }
    }

    // 親を子群の重心に揃える（子群スパンの中心に親中心を合わせる）
    const childCenter = (mergedProfile[0].lo + mergedProfile[0].hi) / 2;
    node._cX = childCenter - w / 2;

    // 親レベルを先頭に加えたプロファイルを構築
    const full = [{ lo: node._cX, hi: node._cX + w }, ...mergedProfile];

    // 負座標があれば全体を右シフトして正規化
    const minLo = full.reduce((m, e) => (e.lo < m ? e.lo : m), 0);
    if (minLo < 0) {
        const adj = -minLo;
        for (const e of full) { e.lo += adj; e.hi += adj; }
        applyXOffsetRecursive(node, adj);
    }

    return full;
}

// node._cX とすべての子孫 _cX に dx を加算する
function applyXOffsetRecursive(node, dx) {
    node._cX = (node._cX || 0) + dx;
    for (let i = 0; i < node.NumChildren(); i++) {
        applyXOffsetRecursive(node.NthChildSubtree(i).GetRootNode(), dx);
    }
}

// おぐ風エルボーカーブで親子を繋ぐ SVG path を生成する（connect_line_v 相当）
// x1,y1 = 親下端中央 / x2,y2 = 子上端中央
function createConnectorPath(x1, y1, x2, y2) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'tree-connector');

    const midY = Math.round((y1 + y2) / 2);
    const dx = x2 - x1;
    const r  = 4; // 丸め半径の上限
    const hR = Math.min(r, Math.abs(dx) / 2);
    const vR = Math.min(r, Math.abs(y2 - y1) / 2);
    const sx = dx >= 0 ? 1 : -1; // 水平方向の符号

    let d;
    if (Math.abs(dx) < 0.5) {
        // 垂直一直線
        d = `M ${x1} ${y1} L ${x2} ${y2}`;
    } else {
        // 垂直→水平→垂直のエルボーカーブ（角を Q で丸める）
        d = [
            `M ${x1} ${y1}`,
            `L ${x1} ${midY - vR}`,
            `Q ${x1} ${midY} ${x1 + sx * hR} ${midY}`,
            `L ${x2 - sx * hR} ${midY}`,
            `Q ${x2} ${midY} ${x2} ${midY + vR}`,
            `L ${x2} ${y2}`,
        ].join(' ');
    }

    path.setAttribute('d', d);
    return path;
}

// おぐ風コンパクトレイアウトでツリーを描画する
// インタフェースは drawSVGTree と同じ。既存の applyMatchColors/buildSVGLegend をそのまま流用する
function drawSVGTreeCompact(tree, matchResults, matchMode, patternStr) {
    const svgGroup  = document.getElementById('tree-group');
    const treeSvg   = document.getElementById('tree-svg');
    const emptyState = document.querySelector('#tab-tree-viz .empty-state');

    // 共有状態をリセット（applyMatchColors が参照する Map も初期化）
    svgGroup.innerHTML  = '';
    nodeObjectToNodeId  = new Map();
    nodeIdToRenderMeta  = new Map();
    nodeBadgeOffsets    = new Map();
    currentSVGHoverType = null;

    const legendEl = document.getElementById('svg-match-legend');
    if (legendEl) legendEl.innerHTML = '';

    if (!tree) {
        treeSvg.classList.remove('active');
        emptyState.style.display = 'flex';
        return;
    }

    emptyState.style.display = 'none';
    treeSvg.classList.add('active');

    const PADDING   = { top: 42, left: 20, right: 20, bottom: 20 };
    const NODE_H    = 36;
    const LEVEL_H   = 68;  // 親上端→子上端の縦距離
    const H_SEP     = 10;  // 兄弟間の最小水平間隔
    const BASE_W    = 90;  // 幅計算の基準値（calculateNodeWidth に渡す）

    const widthFn = (node) => calculateNodeWidth(formatNode(node), BASE_W);

    // Phase 1: コンパクトレイアウト計算（node._cX, node._cW を設定）
    const rootNode = tree.GetRootNode();
    computeCompactLayout(rootNode, H_SEP, widthFn);

    // Phase 2: ノードを描画し、コネクタ座標を収集する
    let maxX = 0;
    let maxY = 0;
    const connectorQueue = []; // { x1,y1,x2,y2 } を後でまとめて挿入

    function drawNodeCompact(node, y, nodeId) {
        const x = PADDING.left + (node._cX || 0);
        const w = node._cW || BASE_W;

        maxX = Math.max(maxX, x + w);
        maxY = Math.max(maxY, y + NODE_H);

        const nodeText = formatNode(node);
        const myCenter = x + w / 2;

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', w);
        rect.setAttribute('height', NODE_H);
        rect.setAttribute('rx', 6);
        svgGroup.appendChild(rect);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', myCenter);
        text.setAttribute('y', y + NODE_H / 2 + 5);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('pointer-events', 'none');
        text.textContent = nodeText;
        svgGroup.appendChild(text);

        // 既存 Map に登録（applyMatchColors がこれを参照する）
        nodeObjectToNodeId.set(node, nodeId);
        nodeIdToRenderMeta.set(nodeId, {
            nodeId, nodeObject: node, rectEl: rect, textEl: text,
            nodeX: x, nodeY: y, nodeWidth: w, nodeHeight: NODE_H,
            matchIndexes: [], captureNames: [], isMatchRoot: false,
        });

        // 子ノードを再帰的に描画し、コネクタ情報を積む
        for (let i = 0; i < node.NumChildren(); i++) {
            const child    = node.NthChildSubtree(i).GetRootNode();
            const childY   = y + LEVEL_H;
            const childCx  = PADDING.left + (child._cX || 0) + (child._cW || BASE_W) / 2;
            connectorQueue.push({ x1: myCenter, y1: y + NODE_H, x2: childCx, y2: childY });
            drawNodeCompact(child, childY, nodeId + '.' + i);
        }
    }

    try {
        drawNodeCompact(rootNode, PADDING.top, '0');

        // Phase 3: コネクタをノードの背面に挿入
        for (const c of connectorQueue) {
            const pathEl = createConnectorPath(c.x1, c.y1, c.x2, c.y2);
            svgGroup.insertBefore(pathEl, svgGroup.firstChild);
        }

        const svgWidth  = maxX + PADDING.right;
        const svgHeight = maxY + PADDING.bottom;
        originalSvgWidth  = svgWidth;
        originalSvgHeight = svgHeight;
        treeSvg.setAttribute('width',  svgWidth);
        treeSvg.setAttribute('height', svgHeight);
        treeSvg.removeAttribute('viewBox');

        // 既存の色付け・凡例をそのまま流用
        if (matchResults) {
            const colorResult = applyMatchColors(matchResults, matchMode, patternStr || '');
            if (colorResult) buildSVGLegend(colorResult.matchMeta, colorResult.captureMeta);
        }
    } catch (err) {
        console.error('Error in drawSVGTreeCompact:', err);
    }
}

// レイアウト切替トグル関数
function toggleLayoutStyle() {
    useCompactLayout = !useCompactLayout;
    const btn = document.getElementById('layout-toggle-btn');
    btn.textContent  = useCompactLayout ? 'Compact ✓' : 'Standard';
    btn.classList.toggle('active', useCompactLayout);

    // 現在のツリーを即座に再描画
    if (currentTargetTree) {
        const pattern        = patternInput.value.trim();
        const svgMode        = getMatchMode();
        const svgMatchResults = svgMode === 'TreeMatch'
            ? (window.lastMatchedResult  || null)
            : (window.lastMatchedResults || null);
        (useCompactLayout ? drawSVGTreeCompact : drawSVGTree)(
            currentTargetTree, svgMatchResults, svgMode, pattern);
        currentZoom = 1.0;
        applyZoom();
    }
}

// ===== SVG カラーリング処理 =====

// match 色パレット（4色で循環する）
const MATCH_PALETTE = ['match-1', 'match-2', 'match-3', 'match-4'];

// match 色に対応する実カラー値（凡例の丸に使う）
const MATCH_STROKE_COLORS = { 1: '#2f9e44', 2: '#e67700', 3: '#9c36b5', 4: '#1971c2' };

// capture バッジ色パレット（実行時の出現順に割り当てる）
const CAPTURE_COLOR_PALETTE = [
    '#d9485f', '#2b8a3e', '#1971c2', '#e67700', '#8e44ad',
    '#c2255c', '#0b7285', '#5f3dc4', '#f08c00', '#2f9e44',
    '#1c7ed6', '#a61e4d', '#495057', '#7b2cbf', '#087f5b'
];

// パターン文字列から ##name / ##@name の出現順で capture 名を抽出する
// GetCaptureNames() は内部でソートされて返るため、ここで順序を先に確定させる
function extractCaptureNamesInOrder(patternStr) {
    const names = [];
    const seen  = new Set();
    const re    = /##(@?[A-Za-z_][A-Za-z0-9_]*)/g;
    let m;
    while ((m = re.exec(patternStr)) !== null) {
        const name = m[1];
        if (!seen.has(name)) { seen.add(name); names.push(name); }
    }
    return names;
}

// マッチ結果を中間データに反映し、SVG に色クラスとバッジを付与する
// 返り値: { matchMeta, captureMeta }（凡例構築に使う）
function applyMatchColors(matchResults, matchMode, patternStr) {
    const matchMeta   = new Map(); // matchIndex → { matchClass, nodeIds: [] }
    const captureMeta = new Map(); // captureName → { color, nodeIds: [] }  ※実際に取れた名前のみ入る
    let captureColorIndex = 0;

    // パターン出現順で capture 名の色インデックスを先に確定しておく。
    // captureMeta 自体にはまだ入れない。実際に capture が取れたとき registerCapture() で追加する。
    // これにより「出現順の色」と「実際に取れた名前だけ凡例に出る」を両立する。
    const captureColorOrder = new Map(); // captureName → color（パターン出現順に割り当て済み）
    extractCaptureNamesInOrder(patternStr).forEach(name => {
        if (!captureColorOrder.has(name)) {
            captureColorOrder.set(name, CAPTURE_COLOR_PALETTE[captureColorIndex++ % CAPTURE_COLOR_PALETTE.length]);
        }
    });

    // nodeId を指定して match クラスを付与するヘルパー
    function applyMatchToId(nodeId, matchIndex, matchClass) {
        const meta = nodeIdToRenderMeta.get(nodeId);
        if (!meta) return;
        if (!meta.matchIndexes.includes(matchIndex)) {
            meta.matchIndexes.push(matchIndex);
            meta.rectEl.classList.add(matchClass);
        }
        const mMeta = matchMeta.get(matchIndex);
        if (mMeta && !mMeta.nodeIds.includes(nodeId)) mMeta.nodeIds.push(nodeId);
    }

    // capture 名をノードに紐付けるヘルパー（バッジ表示・capture hover に使う）
    // captureMeta は「実際に取れた capture 名だけ」ここで追加される
    function registerCapture(nodeId, captureName) {
        const meta = nodeIdToRenderMeta.get(nodeId);
        if (!meta) return;
        if (!meta.captureNames.includes(captureName)) meta.captureNames.push(captureName);
        if (!captureMeta.has(captureName)) {
            // 色はパターン出現順の事前割り当てを優先、予期せぬ名前には新規割り当て
            const color = captureColorOrder.get(captureName)
                ?? CAPTURE_COLOR_PALETTE[captureColorIndex++ % CAPTURE_COLOR_PALETTE.length];
            captureMeta.set(captureName, { color, nodeIds: [] });
        }
        const cMeta = captureMeta.get(captureName);
        if (!cMeta.nodeIds.includes(nodeId)) cMeta.nodeIds.push(nodeId);
    }

    // TreeMatch は単一結果なので配列に統一して扱う
    const results = matchMode === 'TreeMatch'
        ? [matchResults]
        : (Array.isArray(matchResults) ? matchResults : []);

    results.forEach((result, matchIndex) => {
        if (!result) return;
        const matchClass = MATCH_PALETTE[matchIndex % MATCH_PALETTE.length];
        matchMeta.set(matchIndex, { matchClass, nodeIds: [] });

        // ① ルートノードの nodeId を取得する
        // 【前提】GetRootCapture().Node() が描画時に登録したのと同一オブジェクト参照を返すこと
        let rootNodeId = null;
        try {
            const rootCapture = result.GetRootCapture && result.GetRootCapture();
            if (rootCapture) {
                const rId = nodeObjectToNodeId.get(rootCapture.Node());
                if (rId !== undefined) {
                    rootNodeId = rId;
                    const rootMeta = nodeIdToRenderMeta.get(rootNodeId);
                    if (rootMeta && !rootMeta.isMatchRoot) {
                        rootMeta.isMatchRoot = true;
                        rootMeta.rectEl.classList.add('match-root');
                    }
                }
            }
        } catch (e) { /* GetRootCapture 未対応の場合はスキップ */ }

        // ② 各 capture のノード nodeId を収集し、capture 名を登録する
        const capturedNodeIds = [];

        try {
            (result.GetCaptureNames ? result.GetCaptureNames() : []).forEach(name => {
                try {
                    const cap = result.Capture(name);
                    if (!cap) return;
                    const nId = nodeObjectToNodeId.get(cap.Node());
                    if (nId !== undefined) { capturedNodeIds.push(nId); registerCapture(nId, name); }
                } catch (e) {}
            });
        } catch (e) {}

        try {
            (result.GetMultiCaptureNames ? result.GetMultiCaptureNames() : []).forEach(name => {
                try {
                    const caps = result.MultiCapture(name);
                    if (!caps) return;
                    caps.forEach(cap => {
                        try {
                            const nId = nodeObjectToNodeId.get(cap.Node());
                            if (nId !== undefined) { capturedNodeIds.push(nId); registerCapture(nId, name); }
                        } catch (e) {}
                    });
                } catch (e) {}
            });
        } catch (e) {}

        // ③ 今回のマッチに使われたノードだけを塗る
        // result._matchedNodes は calcMatchedNodeCaptures() で計算した
        // 「今回のマッチに含まれるノードのみ」のリスト。
        // _matchedNodes がない古い結果はフォールバックとして root だけ塗る。
        if (result._matchedNodes && result._matchedNodes.length > 0) {
            result._matchedNodes.forEach(node => {
                const nId = nodeObjectToNodeId.get(node);
                if (nId !== undefined) {
                    applyMatchToId(nId, matchIndex, matchClass);
                }
            });
        } else if (rootNodeId !== null) {
            // フォールバック: _matchedNodes がない場合は root とキャプチャノードだけ
            applyMatchToId(rootNodeId, matchIndex, matchClass);
            capturedNodeIds.forEach(id => applyMatchToId(id, matchIndex, matchClass));
        } else {
            capturedNodeIds.forEach(id => applyMatchToId(id, matchIndex, matchClass));
        }
    });

    // ④ 各ノードに capture バッジを付ける
    nodeIdToRenderMeta.forEach(meta => {
        if (meta.captureNames.length === 0) return;
        [...new Set(meta.captureNames)].forEach(name => {
            const cMeta = captureMeta.get(name);
            if (cMeta) addSVGBadge(meta, name, cMeta.color);
        });
    });

    // ⑤ ホバーイベントを設定する
    setupMatchHoverEvents(matchMeta);
    setupCaptureHoverEvents(captureMeta);

    return { matchMeta, captureMeta };
}

// SVG ノードの右上に capture 名バッジを追加する（SVG g 要素で構成）
// 複数バッジは右端から左方向へ累積幅分ずらして並べる（可変幅対応）
function addSVGBadge(meta, captureName, color) {
    const svgGroup   = document.getElementById('tree-group');
    const badgeH     = 15;
    const fontSize   = 9;
    const charW      = 5.5;
    const padX       = 5;
    const gap        = 3;
    const badgeW     = Math.max(Math.ceil(captureName.length * charW) + padX * 2, 22);

    // 前のバッジの累積幅から右端オフセットを計算する（可変幅に対応）
    const offset = nodeBadgeOffsets.get(meta.nodeId) || 0;
    nodeBadgeOffsets.set(meta.nodeId, offset + badgeW + gap);

    const bx = meta.nodeX + meta.nodeWidth - badgeW - offset;
    const by = meta.nodeY - badgeH + 4; // ノード上端から少しかかる位置に配置

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'cap-badge-group');
    g.setAttribute('data-capture', captureName);

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', bx);
    rect.setAttribute('y', by);
    rect.setAttribute('width',  badgeW);
    rect.setAttribute('height', badgeH);
    rect.setAttribute('rx', 7);
    // presentation attribute は CSS に負けるので inline style で上書きする
    rect.style.fill        = color;
    rect.style.stroke      = 'rgba(255,255,255,0.8)';
    rect.style.strokeWidth = '1';
    g.appendChild(rect);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x',              bx + badgeW / 2);
    text.setAttribute('y',              by + badgeH / 2 + 3);
    text.setAttribute('text-anchor',   'middle');
    text.setAttribute('fill',          'white');
    text.setAttribute('font-size',     fontSize);
    text.setAttribute('font-weight',   '700');
    text.setAttribute('font-family',   "'SF Mono', Consolas, monospace");
    text.setAttribute('pointer-events', 'none');
    text.textContent = captureName;
    g.appendChild(text);

    svgGroup.appendChild(g);
}

// ===== SVG ホバー処理 =====

// 全ノード・バッジ・凡例のホバー状態をリセットする
// 競合回避のため applyMatchHover / applyCaptureHover は必ずこれを先に呼ぶ
function clearSVGHoverState() {
    currentSVGHoverType = null;
    nodeIdToRenderMeta.forEach(meta => {
        meta.rectEl.classList.remove('is-active', 'is-dimmed', 'capture-active');
        meta.textEl.classList.remove('is-dimmed');
    });
    document.querySelectorAll('#tree-group .cap-badge-group rect').forEach(r => {
        r.classList.remove('is-active', 'is-dimmed');
    });
    document.querySelectorAll(
        '#svg-match-legend .svg-legend-capture-item, #svg-match-legend .svg-legend-match-item'
    ).forEach(el => el.classList.remove('active', 'dim'));
}

// 60ms デバウンスでホバー解除をスケジュールする
// rect → badge の短い移動でチラつかないようにする
function scheduleSVGHoverClear() {
    svgHoverClearTimer = setTimeout(clearSVGHoverState, 60);
}
function cancelSVGHoverClear() {
    if (svgHoverClearTimer !== null) { clearTimeout(svgHoverClearTimer); svgHoverClearTimer = null; }
}

// match ホバー：ノード本体にホバーしたとき、同じ match 群を強調する
// clear → set のシーケンスで「最後に入った hover を優先」を実現する
function applyMatchHover(meta, matchMeta) {
    clearSVGHoverState(); // 前の hover 状態（match/capture どちらでも）を完全に消す
    currentSVGHoverType = 'match';

    const activeIds = new Set();
    meta.matchIndexes.forEach(idx => {
        const mMeta = matchMeta.get(idx);
        if (mMeta) mMeta.nodeIds.forEach(id => activeIds.add(id));
    });

    nodeIdToRenderMeta.forEach((m, id) => {
        if (activeIds.has(id)) {
            m.rectEl.classList.add('is-active');
        } else {
            m.rectEl.classList.add('is-dimmed');
            m.textEl.classList.add('is-dimmed');
        }
    });

    // 凡例の match 項目も強調する
    const activeMatchNos = new Set(meta.matchIndexes.map(i => i + 1));
    document.querySelectorAll('#svg-match-legend .svg-legend-match-item').forEach(el => {
        const n = parseInt(el.dataset.match, 10);
        el.classList.toggle('active', activeMatchNos.has(n));
        el.classList.toggle('dim',   !activeMatchNos.has(n));
    });
}

function setupMatchHoverEvents(matchMeta) {
    nodeIdToRenderMeta.forEach(meta => {
        if (meta.matchIndexes.length === 0) return;
        meta.rectEl.addEventListener('mouseenter', () => {
            cancelSVGHoverClear();
            applyMatchHover(meta, matchMeta);
        });
        meta.rectEl.addEventListener('mouseleave', scheduleSVGHoverClear);
    });
}

// capture ホバー：バッジまたは凡例にホバーしたとき、同名 capture を持つノードを強調する
// clear → set で「最後に入った hover を優先」を実現する
function applyCaptureHover(captureName, captureMeta) {
    clearSVGHoverState(); // 前の hover 状態を完全に消してから capture hover を適用する
    currentSVGHoverType = 'capture';

    const cMeta = captureMeta.get(captureName);
    if (!cMeta) return;
    const activeIds = new Set(cMeta.nodeIds);

    nodeIdToRenderMeta.forEach((meta, id) => {
        if (activeIds.has(id)) {
            meta.rectEl.classList.add('capture-active');
        } else {
            meta.rectEl.classList.add('is-dimmed');
            meta.textEl.classList.add('is-dimmed');
        }
    });

    document.querySelectorAll('#tree-group .cap-badge-group').forEach(g => {
        const r = g.querySelector('rect');
        if (!r) return;
        if (g.getAttribute('data-capture') === captureName) r.classList.add('is-active');
        else r.classList.add('is-dimmed');
    });

    document.querySelectorAll('#svg-match-legend .svg-legend-capture-item').forEach(el => {
        el.classList.toggle('active', el.dataset.capture === captureName);
        el.classList.toggle('dim',   el.dataset.capture !== captureName);
    });
}

function setupCaptureHoverEvents(captureMeta) {
    document.querySelectorAll('#tree-group .cap-badge-group').forEach(g => {
        const name = g.getAttribute('data-capture');
        g.addEventListener('mouseenter', () => {
            cancelSVGHoverClear();
            applyCaptureHover(name, captureMeta);
        });
        g.addEventListener('mouseleave', scheduleSVGHoverClear);
    });
}

// ===== SVG 凡例 =====

// SVG の上に「match 色一覧」「Capture 色順一覧」を動的に表示する
// 各項目にホバーすると対応する match/capture のノードが強調される
function buildSVGLegend(matchMeta, captureMeta) {
    let legendEl = document.getElementById('svg-match-legend');
    if (!legendEl) {
        legendEl = document.createElement('div');
        legendEl.id = 'svg-match-legend';
        const treeVizArea = document.querySelector('.tree-viz-area');
        treeVizArea.insertBefore(legendEl, document.getElementById('tree-svg'));
    }
    legendEl.innerHTML = '';

    // match 色一覧
    if (matchMeta.size > 0) {
        const box = document.createElement('div');
        box.className = 'svg-legend-box';
        box.innerHTML = '<div class="svg-legend-title">match 色一覧</div>';
        const list = document.createElement('div');
        list.className = 'svg-legend-list';

        matchMeta.forEach(({ nodeIds }, matchIndex) => {
            const pNo  = (matchIndex % 4) + 1;
            const chip = document.createElement('span');
            chip.className    = 'svg-legend-match-item';
            chip.dataset.match = String(matchIndex + 1);
            chip.innerHTML =
                `<span class="svg-legend-swatch" style="background:${MATCH_STROKE_COLORS[pNo]};"></span>` +
                `match #${matchIndex + 1}`;

            chip.addEventListener('mouseenter', () => {
                cancelSVGHoverClear();
                clearSVGHoverState();
                currentSVGHoverType = 'match';
                const activeIds = new Set(nodeIds);
                nodeIdToRenderMeta.forEach((m, id) => {
                    if (activeIds.has(id)) m.rectEl.classList.add('is-active');
                    else { m.rectEl.classList.add('is-dimmed'); m.textEl.classList.add('is-dimmed'); }
                });
                chip.classList.add('active');
                list.querySelectorAll('.svg-legend-match-item').forEach(el => {
                    if (el !== chip) el.classList.add('dim');
                });
            });
            chip.addEventListener('mouseleave', scheduleSVGHoverClear);
            list.appendChild(chip);
        });

        box.appendChild(list);
        legendEl.appendChild(box);
    }

    // Capture 色順一覧
    if (captureMeta.size > 0) {
        const box = document.createElement('div');
        box.className = 'svg-legend-box';
        box.innerHTML = '<div class="svg-legend-title">Capture 色順一覧</div>';
        const list = document.createElement('div');
        list.className = 'svg-legend-list';

        captureMeta.forEach(({ color }, captureName) => {
            const chip = document.createElement('span');
            chip.className       = 'svg-legend-capture-item';
            chip.dataset.capture = captureName;
            chip.innerHTML =
                `<span class="svg-legend-swatch" style="background:${color};"></span>` +
                captureName;
            chip.addEventListener('mouseenter', () => {
                cancelSVGHoverClear();
                applyCaptureHover(captureName, captureMeta);
            });
            chip.addEventListener('mouseleave', scheduleSVGHoverClear);
            list.appendChild(chip);
        });

        box.appendChild(list);
        legendEl.appendChild(box);
    }
}

// ===== ズーム機能 =====

function applyZoom() {// ズームを適用する関数。これで現在のズームレベルに基づいて、ツリーの表示を拡大・縮小できるようになる
    const treeGroup = document.getElementById('tree-group');
    const treeSvg = document.getElementById('tree-svg');
    const treeVizArea = document.querySelector('.tree-viz-area');
    const zoomLevel = document.getElementById('zoom-level');

    // グループ全体に拡大率を適用する
    treeGroup.setAttribute('transform', `scale(${currentZoom})`);

    // 拡大後も内容が切れないよう SVG サイズも更新する
    const newWidth = originalSvgWidth * currentZoom;
    const newHeight = originalSvgHeight * currentZoom;
    treeSvg.setAttribute('width', newWidth);
    treeSvg.setAttribute('height', newHeight);

    zoomLevel.textContent = Math.round(currentZoom * 100) + '%';
}

function zoomIn() {
    if (currentZoom < MAX_ZOOM) {
        const oldZoom = currentZoom;
        currentZoom = Math.min(currentZoom + ZOOM_STEP, MAX_ZOOM);
        applyZoom();
    }
}

function zoomOut() {
    if (currentZoom > MIN_ZOOM) {
        const oldZoom = currentZoom;
        currentZoom = Math.max(currentZoom - ZOOM_STEP, MIN_ZOOM);
        applyZoom();
    }
}

function zoomReset() {
    currentZoom = 1.0;
    applyZoom();
}

// ===== デバッグツリー用ズーム機能 =====

function applyDebugZoom() {// デバッグツリーにズームを適用する関数。これでデバッグツリーの表示を拡大・縮小できるようになる
    const debugTreeGroup = document.getElementById('debug-tree-group');
    const debugTreeSvg = document.getElementById('debug-tree-svg');
    const debugZoomLevel = document.getElementById('debug-zoom-level');

    // グループ全体に拡大率を適用する
    debugTreeGroup.setAttribute('transform', `scale(${debugZoom})`);

    // 拡大後も内容が切れないよう SVG サイズも更新する
    const newWidth = debugOriginalSvgWidth * debugZoom;
    const newHeight = debugOriginalSvgHeight * debugZoom;
    debugTreeSvg.setAttribute('width', newWidth);
    debugTreeSvg.setAttribute('height', newHeight);

    debugZoomLevel.textContent = Math.round(debugZoom * 100) + '%';
}

function debugZoomIn() {
    if (debugZoom < MAX_ZOOM) {
        debugZoom = Math.min(debugZoom + ZOOM_STEP, MAX_ZOOM);
        applyDebugZoom();
    }
}

function debugZoomOut() {
    if (debugZoom > MIN_ZOOM) {
        debugZoom = Math.max(debugZoom - ZOOM_STEP, MIN_ZOOM);
        applyDebugZoom();
    }
}

function debugZoomReset() {
    debugZoom = 1.0;
    applyDebugZoom();
}

// executeMatch を拡張し、ツリー描画とデバッグ準備も同時に行う
// 「マッチ結果」「可視化」「デバッグ」が別々に更新されると画面の整合が崩れやすいので、ここでまとめて同期
const originalExecuteMatch = executeMatch;// 元の executeMatch を保存しておく
function executeMatchWithTree() {
    console.log('🎯 executeMatchWithTree called');

    const pattern   = patternInput.value.trim();
    const targetStr = targetInput.value.trim();

    console.log('  Pattern:', pattern);
    console.log('  Target:', targetStr);

    // 【重要】マッチと SVG 描画が同一ツリーオブジェクトを参照するよう、
    // currentTargetTree が未設定のときはここで一度だけ構築して格納する。
    // こうすることで originalExecuteMatch() 内の TreeMatch/TreeMatchFind と
    // drawSVGTree() 内の nodeObjectToNodeId が同じノード参照を持つことが保証される。
    // （別々に TreeConstruct() すると異なるオブジェクトになり、
    //   Capture(name).Node() の参照が nodeObjectToNodeId に見つからなくなる）
    if (targetStr && !currentTargetTree) {
        try {
            currentTargetTree = TreeConstruct(Tree1, targetStr).Tree();
            console.log('🌳 Pre-built currentTargetTree for reference consistency');
        } catch (_) {
            // 構築失敗は originalExecuteMatch() のエラーハンドリングに委ねる
        }
    }

    originalExecuteMatch();

    // 結果表示に加えて SVG ツリー描画とデバッグ準備も行う
    if (targetStr) {
        try {
            // currentTargetTree は上で確保済み（またはインポート済み）
            const targetTree = currentTargetTree;
            if (!targetTree) throw new Error('ツリーを構築できませんでした');

            const svgMode        = getMatchMode();
            const svgMatchResults = svgMode === 'TreeMatch'
                ? (window.lastMatchedResult  || null)
                : (window.lastMatchedResults || null);
            const _drawFn = useCompactLayout ? drawSVGTreeCompact : drawSVGTree;
            _drawFn(targetTree, svgMatchResults, svgMode, pattern);

            // 新しいツリーを描いたらズームを初期値へ戻す
            currentZoom = 1.0;
            applyZoom();

            // ツリーがあるときだけズーム操作を見せる
            document.getElementById('zoom-controls').style.display = 'flex';

            // デバッグ再生に必要な情報を準備する
            // ここで TreeMatch/Find を再実行するが、targetTree は同一オブジェクトなので
            // window.lastMatchedResult と同じノード参照を持つ
            if (pattern) {
                const mode = getMatchMode();
                let result = null;
                try {
                    if (mode === 'TreeMatch') {
                        result = TreeMatch(targetTree, pattern);
                    } else {
                        const results = TreeMatchFind(targetTree, pattern);
                        result = results.length > 0 ? results : null;
                    }
                } catch (_) { result = null; }

                console.log('  About to call setupDebugMode with:', { result, pattern });
                setupDebugMode(result, pattern, targetTree);
            }
        } catch (error) {
            (useCompactLayout ? drawSVGTreeCompact : drawSVGTree)(null);
            document.getElementById('zoom-controls').style.display = 'none';
        }
    } else {
        (useCompactLayout ? drawSVGTreeCompact : drawSVGTree)(null);
        document.getElementById('zoom-controls').style.display = 'none';
    }
}

// 以降は拡張版 executeMatch を使う
executeMatch = executeMatchWithTree;

// ===== デバッグアニメーション機能 =====

let debugSteps = [];
let currentDebugStep = 0;
let debugAnimationTimer = null;
let debugSpeed = 1.0;
let isDebugPlaying = false;
let debugTreeNodeMap = new Map(); // ノード ID と SVG 要素の対応を持つ
let currentCaptureState = {}; // 現在のキャプチャ状態を保持する: { name: [nodes], @name: [nodes] }

// マッチ結果からデバッグ再生用ステップを生成する
// 単一結果と複数結果の両方に対応する
// ここはライブラリの内部実行をそのまま取っているわけではなく、学習しやすい順に見せるための説明用ステップを組み立てている
function generateDebugSteps(result, pattern, targetTree, isMultipleResults = false) {
    const steps = [];

    if (!result || (Array.isArray(result) && result.length === 0)) {
        // マッチしなかった場合でも、開始と失敗の流れを表示できるようステップを作る
        steps.push({
            type: 'start',
            message: 'パターンマッチングを開始します...',
            pattern: pattern
        });
        steps.push({
            type: 'failed',
            message: 'パターンがマッチしませんでした',
            pattern: pattern
        });
        return steps;
    }

    // 開始ステップ
    steps.push({
        type: 'start',
        message: 'パターンマッチングを開始します...',
        pattern: pattern
    });

    // TreeMatchFind の結果配列なら、各マッチ結果を順番に処理する
    if (Array.isArray(result)) {
        result.forEach((singleResult, resultIndex) => {
            steps.push({
                type: 'info',
                message: `--- マッチ結果 [${resultIndex}] ---`,
                pattern: pattern
            });

            // この結果に対応するステップ群を追加する
            addStepsForSingleResult(singleResult, steps, pattern);
        });

        // すべての結果を処理し終えた後の完了ステップ
        steps.push({
            type: 'success',
            message: `🎉 パターンマッチング完了！(${result.length}件のマッチ)`,
            pattern: pattern
        });

        return steps;
    }

    // 単一結果のとき
    addStepsForSingleResult(result, steps, pattern);

    // 完了ステップ
    steps.push({
        type: 'success',
        message: '🎉 パターンマッチング完了！',
        pattern: pattern
    });

    return steps;
}

// 補助関数: 親ノードの中で何番目の子かを取得する
// デバッグ表示で兄弟ノードを自然な順序で並べるため、木の中の位置情報を求めている
function getChildIndex(capture) {
    try {
        const pathLen = capture.PathLength();
        if (pathLen === 0) {
            console.log(`  getChildIndex: Root node, returning 0`);
            return 0; // ルートノードには兄弟がないので 0 とする
        }

        const node = capture.Node();
        const nodeName = node.Attr0();
        const nodeValue = node.Attr1();

        // 正しいパス位置から親ノードを取得する
        // PathLength() は root から現在ノードまでの経路長を返す
        // PathNthUpNode(n) は root 側から n 番目のノードを返す
        // そのため親は (pathLen - 2) 番目にいる
        const parentIndex = pathLen - 2;
        const parent = capture.PathNthUpNode(parentIndex);

        console.log(`  Getting parent for ${nodeName}${nodeValue ? '#'+nodeValue : ''} at PathNthUpNode(${parentIndex})`);

        if (!parent) {
            console.log(`  getChildIndex: No parent for ${nodeName}, returning 0`);
            return 0;
        }

        const parentName = parent.Attr0();

        // 親の子一覧の中で、このノードが何番目かを調べる
        // 参照そのものは一致しないことがあるため属性で比較する
        const numChildren = parent.NumChildren();

        // デバッグ用に親の全子ノードを表示する
        console.log(`  Parent ${parentName} has ${numChildren} children:`);
        for (let i = 0; i < numChildren; i++) {
            const child = parent.NthChildSubtree(i).GetRootNode();
            const childName = child.Attr0();
            const childValue = child.Attr1();
            console.log(`    [${i}] ${childName}${childValue ? '#'+childValue : ''}`);
        }
        console.log(`  Looking for: ${nodeName}${nodeValue ? '#'+nodeValue : ''}`);

        for (let i = 0; i < numChildren; i++) {
            const child = parent.NthChildSubtree(i).GetRootNode();
            const childName = child.Attr0();
            const childValue = child.Attr1();

            // 型と値が一致すれば同じノードとみなす
            if (childName === nodeName && childValue === nodeValue) {
                console.log(`  ✓ FOUND at index ${i}`);
                return i;
            }
        }
        console.log(`  ✗ NOT FOUND, returning 0`);
        return 0;
    } catch (e) {
        console.warn('Could not determine child index:', e);
        return 0;
    }
}

// 単一結果に対するデバッグステップ追加用の補助関数
// パターン内で上書きされるキャプチャを検出する（例: A##x > B##x > C##x）
function detectOverwrittenCaptures(pattern, result) {
    if (!pattern) return {};

    // パターンからキャプチャ名をすべて抜き出す（##name または ##@name）
    const captureRegex = /##(@?)(\w+)/g;
    const captures = {};
    let match;

    while ((match = captureRegex.exec(pattern)) !== null) {
        const isMulti = match[1] === '@';
        const name = match[2];

        if (!isMulti) {
            // 単一キャプチャだけ回数を数える
            if (!captures[name]) {
                captures[name] = 0;
            }
            captures[name]++;
        }
    }

    // 複数回出てくるキャプチャを探す（上書き対象）
    const overwritten = {};
    for (const [name, count] of Object.entries(captures)) {
        if (count > 1) {
            // このキャプチャは上書きされるので、途中経過のノード列も復元する
            const chain = reconstructCaptureChain(pattern, name, result);
            if (chain && chain.length > 0) {
                overwritten[name] = chain;
            }
        }
    }

    return overwritten;
}

// 上書きキャプチャについて、途中で入っていたノード列を復元する
// 同名キャプチャは最終結果だけ見ると「途中で何が起きたか」が消えるため、学習用に経路を作り直している
function reconstructCaptureChain(pattern, captureName, result) {
    try {
        // 最終的に残ったキャプチャノードを取得する
        const finalCapture = result.Capture(captureName);
        if (!finalCapture) return null;

        const finalNode = finalCapture.Node();
        const chain = [];

        // ツリーを親方向へたどり、同じ名前で順に上書きされた候補を集める
        // 例: "A##x > B##x > C##x" なら A, B, C を追いたい
        let current = finalCapture;
        const pathLength = current.PathLength();

        console.log(`🔍 Reconstructing chain for "${captureName}", pathLength=${pathLength}`);

        // root から現在ノードまでの経路上にあるノードを順に集める
        // PathNthUpNode(0) = root, PathNthUpNode(pathLength) = 現在ノード
        for (let i = 0; i <= pathLength; i++) {
            const node = current.PathNthUpNode(i);
            if (node) {
                const nodeStr = node.Attr0() + (node.Attr1() ? '#' + node.Attr1() : '');
                console.log(`  [${i}] PathNthUpNode(${i}) = ${nodeStr}`);
                chain.push(node);
            }
        }

        // PathNthUpNode は最初から root → leaf 順なので reverse は不要
        console.log(`  ✓ Chain reconstructed: ${chain.length} nodes`);

        return chain.length > 1 ? chain : null;
    } catch (error) {
        console.error('Error reconstructing capture chain:', error);
        return null;
    }
}

function addStepsForSingleResult(result, steps, pattern) {
    console.log('🔧 addStepsForSingleResult called', { result, pattern });

    // greedy / lazy 量指定子があるか確認し、必要ならバックトラック演出を入れる
    const hasQuantifiers = pattern && (pattern.includes('+') || pattern.includes('*') || pattern.includes('?'));

    // 並び順を決めるため、すべてのキャプチャに深さ情報を付けて集める
    const allCaptures = [];

    // 単一キャプチャを集める
    const captureNames = result.GetCaptureNames();
    console.log('📝 captureNames:', captureNames);
    captureNames.forEach(name => {
        const capture = result.Capture(name);
        allCaptures.push({
            type: 'single',
            name: name,
            capture: capture,
            depth: capture.PathLength(),
            childIndex: getChildIndex(capture)
        });
    });

    // マルチキャプチャを集める
    const multiCaptureNames = result.GetMultiCaptureNames();
    multiCaptureNames.forEach(name => {
        const captures = result.MultiCapture(name);
        captures.forEach((capture, index) => {
            allCaptures.push({
                type: 'multi',
                name: name,
                capture: capture,
                index: index,
                depth: capture.PathLength(),
                childIndex: getChildIndex(capture),
                totalCount: captures.length,
                allCaptures: captures
            });
        });
    });

    // デバッグ用: ソート前のキャプチャ情報を表示する
    console.log('=== Captures BEFORE sorting ===');
    allCaptures.forEach((item, idx) => {
        console.log(`[${idx}] name="${item.name}", depth=${item.depth}, childIndex=${item.childIndex}, type=${item.type}`);
    });

    // 深さ順でソートする（浅いもの = root に近いものを先）
    // PathLength() は root からの距離を返すので、昇順に並べれば root 側から処理できる
    allCaptures.sort((a, b) => {
        // 第1条件: 深さ順（浅い / root 側を先）
        if (a.depth !== b.depth) {
            return a.depth - b.depth;
        }
        // 第2条件: 子インデックス順（兄弟を左から右へ）
        // 同じ深さの兄弟を自然な走査順で見せるため
        if (a.childIndex !== b.childIndex) {
            return a.childIndex - b.childIndex;
        }
        // 第3条件: 同位置ならマルチキャプチャを先にする
        if (a.type !== b.type) {
            return a.type === 'multi' ? -1 : 1;
        }
        // 第4条件: 同種なら元の順序を保つ
        return 0;
    });

    // デバッグ用: ソート後のキャプチャ情報を表示する
    console.log('=== Captures AFTER sorting ===');
    allCaptures.forEach((item, idx) => {
        console.log(`[${idx}] name="${item.name}", depth=${item.depth}, childIndex=${item.childIndex}, type=${item.type}`);
    });

    // ツリー走査順にキャプチャを処理する
    const processedMulti = new Set();

    // 同名キャプチャの上書きを検出する（@ なしで同名が複数回出る場合）
    // 例: A##x > B##x > C##x
    const overwrittenCaptures = detectOverwrittenCaptures(pattern, result);

    allCaptures.forEach(item => {
        if (item.type === 'single') {
            // このキャプチャに上書き履歴があるか確認する
            if (overwrittenCaptures[item.name]) {
                // 上書きの流れが見えるよう、経路上の各ノードに対してステップを作る
                const chain = overwrittenCaptures[item.name];
                chain.forEach((node, idx) => {
                    const nodeValue = formatNode(node);
                    const isLast = idx === chain.length - 1;

                    steps.push({
                        type: 'checking',
                        message: `キャプチャ "${item.name}" のパターンをチェック中...`,
                        pattern: `##${item.name}`,
                        node: node,
                        nodeValue: nodeValue
                    });

                    if (isLast) {
                        // 最後に残る確定マッチ
                        steps.push({
                            type: 'matched',
                            message: `✓ マッチ成功！"${item.name}" としてキャプチャ: ${nodeValue}`,
                            pattern: `##${item.name}`,
                            node: node,
                            captureName: item.name,
                            nodeValue: nodeValue
                        });
                    } else {
                        // 後で上書きされる途中マッチ
                        steps.push({
                            type: 'overwritten',
                            message: `⚠️ "${item.name}" として一時マッチ（後で上書きされる）: ${nodeValue}`,
                            pattern: `##${item.name}`,
                            node: node,
                            captureName: item.name,
                            nodeValue: nodeValue
                        });
                    }
                });
            } else {
                // 通常の単一キャプチャは「確認 → 成功」の 2 ステップを追加する
                const node = item.capture.Node();
                const nodeValue = formatNode(node);

                steps.push({
                    type: 'checking',
                    message: `キャプチャ "${item.name}" のパターンをチェック中...`,
                    pattern: `##${item.name}`,
                    node: node,
                    nodeValue: nodeValue
                });

                steps.push({
                    type: 'matched',
                    message: `✓ マッチ成功！"${item.name}" としてキャプチャ: ${nodeValue}`,
                    pattern: `##${item.name}`,
                    node: node,
                    captureName: item.name,
                    nodeValue: nodeValue
                });
            }
        } else if (item.type === 'multi') {
            // マルチキャプチャは同名をまとめて 1 回だけ処理する
            if (!processedMulti.has(item.name)) {
                processedMulti.add(item.name);
                const captures = item.allCaptures;

                // greedy / lazy パターンではバックトラックの流れも疑似的に見せる
                if (hasQuantifiers && captures.length > 0) {
                    // greedy か lazy かを判定する
                    const isGreedy = pattern.includes(`@${item.name})+`) && !pattern.includes(`@${item.name})+?`);
                    const isLazy = pattern.includes(`@${item.name})+?`);

                    if (isGreedy && captures.length > 1) {
                        // greedy: いったん全部取ってから戻る流れを再現する
                        addGreedyBacktrackSteps(item.name, captures, steps);
                    } else if (isLazy) {
                        // lazy: 最小限から始め、必要なら広げる流れを再現する
                        addLazyExpandSteps(item.name, captures, steps);
                    } else {
                        // 通常のマルチキャプチャ
                        addNormalMultiCaptureSteps(item.name, captures, steps);
                    }
                } else {
                    // 量指定子がない通常のマルチキャプチャ
                    addNormalMultiCaptureSteps(item.name, captures, steps);
                }
            }
        }
    });
}

// greedy バックトラック用のステップを追加する
// まず全部取って、後から 1 つ戻す流れを見せる
function addGreedyBacktrackSteps(name, captures, steps) {
    // 最初に greedy が全候補を取りにいく様子を表示する
    captures.forEach((capture, index) => {
        const node = capture.Node();
        const nodeValue = formatNode(node);

        steps.push({
            type: 'attempt',
            message: `⚡ greedy: "@${name}" [${index}] を試行中...`,
            pattern: `##@${name}`,
            node: node,
            nodeValue: nodeValue
        });

        steps.push({
            type: 'tentative',
            message: `📌 greedy: "@${name}" [${index}] を仮マッチ: ${nodeValue}`,
            pattern: `##@${name}`,
            node: node,
            captureName: name,
            nodeValue: nodeValue,
            isTentative: true
        });
    });

    // バックトラックを表示する
    // ここでは簡易表現として最後の 1 件を戻したものとして扱う
    if (captures.length > 1) {
        const lastIndex = captures.length - 1;
        const backtrackNode = captures[lastIndex].Node();

        steps.push({
            type: 'backtrack',
            message: `↩️ バックトラック: "@${name}" [${lastIndex}] を手放す (次のパターンがマッチしなかった)`,
            pattern: `##@${name}`,
            node: backtrackNode,
            nodeValue: formatNode(backtrackNode)
        });
    }

    // 最後に確定したマッチを表示する
    captures.forEach((capture, index) => {
        const node = capture.Node();
        const nodeValue = formatNode(node);

        steps.push({
            type: 'matched',
            message: `✓ 確定！"@${name}" [${index}] に追加: ${nodeValue}`,
            pattern: `##@${name}`,
            node: node,
            captureName: name,
            nodeValue: nodeValue
        });
    });
}

// lazy 展開用のステップを追加する
// 最小限から始め、必要に応じて広げる流れを見せる
function addLazyExpandSteps(name, captures, steps) {
    captures.forEach((capture, index) => {
        const node = capture.Node();
        const nodeValue = formatNode(node);

        steps.push({
            type: 'attempt',
            message: `💤 lazy: "@${name}" [${index}] を最小限マッチ試行...`,
            pattern: `##@${name}`,
            node: node,
            nodeValue: nodeValue
        });

        steps.push({
            type: 'matched',
            message: `✓ lazy: "@${name}" [${index}] に追加: ${nodeValue}`,
            pattern: `##@${name}`,
            node: node,
            captureName: name,
            nodeValue: nodeValue
        });
    });
}

// 通常のマルチキャプチャ用ステップを追加する
function addNormalMultiCaptureSteps(name, captures, steps) {
    captures.forEach((capture, index) => {
        const node = capture.Node();
        const nodeValue = formatNode(node);

        steps.push({
            type: 'checking',
            message: `マルチキャプチャ "@${name}" [${index}] のパターンをチェック中...`,
            pattern: `##@${name}`,
            node: node,
            nodeValue: nodeValue
        });

        steps.push({
            type: 'matched',
            message: `✓ マッチ成功！"@${name}" [${index}] に追加: ${nodeValue}`,
            pattern: `##@${name}`,
            node: node,
            captureName: name,
            nodeValue: nodeValue
        });
    });
}

// ノード用の一意 ID を取得する（属性と位置情報ベース）
function getNodeId(node) {
    if (!node) return null;
    return `${node.Attr0()}_${node.Attr1() || 'null'}_${Math.random().toString(36).substr(2, 9)}`;
}

// デバッグ用ツリーを描画する
// 通常のツリー描画に近いが、アニメーション用にノード対応表も作る
function drawDebugTree(tree) {// デバッグツリーを描画する関数。これでデバッグ再生用のツリー表示を更新できるようになる
    const debugTreeGroup = document.getElementById('debug-tree-group');
    const debugTreeSvg = document.getElementById('debug-tree-svg');

    console.log('drawDebugTree called', { tree, debugTreeGroup, debugTreeSvg });

    debugTreeGroup.innerHTML = '';
    debugTreeNodeMap.clear();

    if (!tree) {
        console.log('No tree to draw');
        return;
    }

    const padding = { top: 30, left: 20, right: 20, bottom: 20 };
    const baseNodeWidth = 120; // 基本幅。文字列が長いノードは後で広げる
    const nodeHeight = 40;
    const levelHeight = 80;

    let maxWidth = 0;
    let maxHeight = 0;
    let nodeCounter = 0;

    function drawNode(node, x, y, level) {
        if (!node) return { width: 0, center: x };

        const nodeText = formatNode(node);
        const nodeWidth = calculateNodeWidth(nodeText, baseNodeWidth); // 文字数に応じて幅を可変にする
        const nodeId = `debug-node-${nodeCounter++}`;
        const children = [];

        for (let i = 0; i < node.NumChildren(); i++) {
            children.push(node.NthChildSubtree(i));
        }

        maxWidth = Math.max(maxWidth, x + nodeWidth);
        maxHeight = Math.max(maxHeight, y + nodeHeight);

        if (children.length === 0) {
            // 葉ノードならその場で箱と文字を描く
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('id', nodeId);
            rect.setAttribute('x', x);
            rect.setAttribute('y', y);
            rect.setAttribute('width', nodeWidth);
            rect.setAttribute('height', nodeHeight);
            rect.setAttribute('class', 'inactive');
            debugTreeGroup.appendChild(rect);

            // 後でハイライトできるようノードと SVG 要素の対応を保存する
            debugTreeNodeMap.set(node, rect);

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', x + nodeWidth / 2);
            text.setAttribute('y', y + nodeHeight / 2 + 5);
            text.setAttribute('text-anchor', 'middle');
            text.textContent = nodeText;
            debugTreeGroup.appendChild(text);

            return { width: nodeWidth, center: x + nodeWidth / 2 };
        }

        // 先に子ノードを描いてから親の位置を決める
        let childX = x;
        const childCenters = [];
        let totalWidth = 0;

        children.forEach((child, idx) => {
            const result = drawNode(child.GetRootNode(), childX, y + levelHeight, level + 1);
            childCenters.push(result.center);
            childX += result.width + 20;
            totalWidth += result.width + (idx < children.length - 1 ? 20 : 0);
        });

        // 親ノードを描く
        const parentCenter = (childCenters[0] + childCenters[childCenters.length - 1]) / 2;
        const parentX = parentCenter - nodeWidth / 2;

        maxWidth = Math.max(maxWidth, parentX + nodeWidth);

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('id', nodeId);
        rect.setAttribute('x', parentX);
        rect.setAttribute('y', y);
        rect.setAttribute('width', nodeWidth);
        rect.setAttribute('height', nodeHeight);
        rect.setAttribute('class', 'inactive');
        debugTreeGroup.appendChild(rect);

        // 後でハイライトできるようノードと SVG 要素の対応を保存する
        debugTreeNodeMap.set(node, rect);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', parentCenter);
        text.setAttribute('y', y + nodeHeight / 2 + 5);
        text.setAttribute('text-anchor', 'middle');
        text.textContent = nodeText;
        debugTreeGroup.appendChild(text);

        // 親子を結ぶ線を描く
        childCenters.forEach(childCenter => {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', parentCenter);
            line.setAttribute('y1', y + nodeHeight);
            line.setAttribute('x2', childCenter);
            line.setAttribute('y2', y + levelHeight);
            debugTreeGroup.insertBefore(line, debugTreeGroup.firstChild);
        });

        return { width: Math.max(totalWidth, nodeWidth), center: parentCenter };
    }

    const rootNode = tree.GetRootNode();
    drawNode(rootNode, padding.left, padding.top, 0);

    const svgWidth = maxWidth + padding.right;
    const svgHeight = maxHeight + padding.bottom;

    // ズーム計算用に元サイズを保存する
    debugOriginalSvgWidth = svgWidth;
    debugOriginalSvgHeight = svgHeight;

    debugTreeSvg.setAttribute('width', svgWidth);
    debugTreeSvg.setAttribute('height', svgHeight);

    console.log('Debug tree drawn', {
        nodeCount: nodeCounter,
        mapSize: debugTreeNodeMap.size,
        svgWidth,
        svgHeight
    });
}

// 現在のキャプチャ状態表示を更新する
function updateCaptureStateDisplay() {// 現在のキャプチャ状態表示を更新する関数。これで Debug タブのキャプチャ状態表示を最新に保つことができるようになる
    const captureStateContent = document.getElementById('capture-state-content');

    if (Object.keys(currentCaptureState).length === 0) {
        captureStateContent.innerHTML = '<div class="capture-state-empty">まだキャプチャがありません</div>';
        return;
    }

    let html = '';

    for (const [name, nodes] of Object.entries(currentCaptureState)) {// currentCaptureState は { name: [nodes], @name: [nodes] } の形でキャプチャ状態を保持している。これをもとに表示を更新する
        const isTentative = name.endsWith('_tentative');
        const isMulti = name.startsWith('@');
        const displayName = isTentative ? name.replace('_tentative', '') + ' (仮)' : name;

        html += '<div class="capture-item-state">';
        html += `<span class="capture-name-state">${displayName}:</span>`;

        if (Array.isArray(nodes) && nodes.length > 1) {
            html += '<div class="capture-array-state">';
            nodes.forEach((node, index) => {
                const marker = isTentative ? '📌 ' : '';
                html += `<div class="capture-array-item">${marker}[${index}] ${formatNode(node)}</div>`;
            });
            html += '</div>';
        } else if (Array.isArray(nodes) && nodes.length === 1) {
            const marker = isTentative ? '📌 ' : '';
            html += `<span class="capture-value-state">${marker}${formatNode(nodes[0])}</span>`;
        } else if (nodes) {
            const marker = isTentative ? '📌 ' : '';
            html += `<span class="capture-value-state">${marker}${formatNode(nodes)}</span>`;
        }

        html += '</div>';
    }

    captureStateContent.innerHTML = html;
}

// 現在ステップの表示を更新する
// Debug タブは「再生位置に応じて文章・キャプチャ状態・進捗・ハイライト」が一緒に変わるので、その同期点になっている
function updateDebugStepDisplay() {
    if (debugSteps.length === 0) return;

    const step = debugSteps[currentDebugStep];
    const stepContent = document.getElementById('step-content');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');

    // ステップ本文を更新する
    const stepNumber = document.querySelector('.step-number');
    const stepAction = document.querySelector('.step-action');
    const stepStatus = document.querySelector('.step-status');

    stepNumber.textContent = `Step ${currentDebugStep + 1}/${debugSteps.length}`;
    stepAction.textContent = step.message;

    // 確定マッチしたときだけキャプチャ状態を更新する
    // tentative はまだ仮状態なので別扱いにする
    if (step.type === 'matched' && step.node && step.captureName && !step.isTentative) {
        const isMulti = step.pattern.includes('@');
        const key = isMulti ? '@' + step.captureName : step.captureName;

        if (isMulti) {
            if (!currentCaptureState[key]) {
                currentCaptureState[key] = [];
            }
            currentCaptureState[key].push(step.node);
        } else {
            currentCaptureState[key] = step.node;
        }
    }

    // 仮マッチは別キーで管理し、表示上も区別できるようにする
    if (step.type === 'tentative' && step.node && step.captureName) {
        const isMulti = step.pattern.includes('@');
        const key = isMulti ? '@' + step.captureName : step.captureName;
        const tentativeKey = key + '_tentative';

        if (isMulti) {
            if (!currentCaptureState[tentativeKey]) {
                currentCaptureState[tentativeKey] = [];
            }
            currentCaptureState[tentativeKey].push(step.node);
        } else {
            currentCaptureState[tentativeKey] = step.node;
        }
    }

    // バックトラック時は仮マッチを消す
    if (step.type === 'backtrack') {
        // 仮マッチ用キーをすべて削除する
        Object.keys(currentCaptureState).forEach(key => {
            if (key.endsWith('_tentative')) {
                delete currentCaptureState[key];
            }
        });
    }

    // 画面上のキャプチャ状態表示を更新する
    updateCaptureStateDisplay();

    let statusText = '';
    let statusClass = '';

    if (step.type === 'checking') {
        statusText = 'ステータス: チェック中...';
        statusClass = '';
    } else if (step.type === 'matched') {
        statusText = 'ステータス: ✓ マッチ成功！';
        statusClass = 'success';
    } else if (step.type === 'failed') {
        statusText = 'ステータス: ✗ 失敗';
        statusClass = 'error';
    } else if (step.type === 'success') {
        statusText = 'ステータス: ✓ 完了';
        statusClass = 'success';
    } else if (step.type === 'info') {
        statusText = 'ステータス: 次のマッチを処理中';
        statusClass = 'info';
    } else if (step.type === 'attempt') {
        statusText = 'ステータス: 🔍 試行中...';
        statusClass = 'warning';
    } else if (step.type === 'tentative') {
        statusText = 'ステータス: 📌 仮マッチ（確定待ち）';
        statusClass = 'warning';
    } else if (step.type === 'backtrack') {
        statusText = 'ステータス: ↩️ バックトラック';
        statusClass = 'error';
    } else if (step.type === 'overwritten') {
        statusText = 'ステータス: ⚠️ 一時マッチ（後で上書き）';
        statusClass = 'warning';
    } else {
        statusText = 'ステータス: 実行中';
        statusClass = '';
    }

    stepStatus.textContent = statusText;
    stepStatus.className = `step-status ${statusClass}`;

    // 進捗バーを更新する
    const progress = ((currentDebugStep + 1) / debugSteps.length) * 100;
    progressFill.style.width = `${progress}%`;
    progressText.textContent = `${currentDebugStep + 1}/${debugSteps.length}`;

    // デバッグツリー上のハイライトも更新する
    highlightDebugNodes(step);
}

// 現在ステップに応じてノードをハイライトする
// 文章だけでなく木のどこを見ればよいか分かるようにし、抽象的なマッチ過程を視覚化する
function highlightDebugNodes(step) {
    // まず全ノードを非アクティブ状態へ戻す
    document.querySelectorAll('#debug-tree-svg rect').forEach(rect => {
        rect.setAttribute('class', 'inactive');
    });

    // 現在対象のノードを強調表示する
    if (step.node) {
        // 対応する SVG 要素を対応表から探す
        const rectElement = debugTreeNodeMap.get(step.node);

        console.log('Highlighting node:', {
            stepType: step.type,
            hasNode: !!step.node,
            foundRect: !!rectElement,
            mapSize: debugTreeNodeMap.size,
            nodeValue: step.nodeValue
        });

        if (rectElement) {
            let newClassName = '';
            if (step.type === 'checking') {
                newClassName = 'checking';
            } else if (step.type === 'matched') {
                newClassName = 'matched';
            } else if (step.type === 'failed') {
                newClassName = 'failed';
            } else if (step.type === 'attempt') {
                newClassName = 'attempt';
            } else if (step.type === 'tentative') {
                newClassName = 'tentative';
            } else if (step.type === 'backtrack') {
                newClassName = 'backtrack';
            } else if (step.type === 'overwritten') {
                newClassName = 'overwritten';
            }

            rectElement.setAttribute('class', newClassName);
            console.log('Set className to:', newClassName, 'on element:', rectElement);
        }
    }

    // 完了ステップでは、それまでに確定した全ノードもまとめて光らせる
    if (step.type === 'success') {
        console.log('Success step - highlighting all matched nodes');
        // それ以前のステップをたどり、確定済みノードを再度ハイライトする
        let matchedCount = 0;
        for (let i = 0; i < currentDebugStep; i++) {
            const prevStep = debugSteps[i];
            if (prevStep.type === 'matched' && prevStep.node) {
                const rectElement = debugTreeNodeMap.get(prevStep.node);
                if (rectElement) {
                    rectElement.setAttribute('class', 'matched');
                    matchedCount++;
                }
            }
        }
        console.log('Highlighted', matchedCount, 'matched nodes in success step');
    }
}

// アニメーション再生を開始する
function playDebugAnimation() {
    console.log('playDebugAnimation called', { isDebugPlaying, stepsLength: debugSteps.length });

    if (isDebugPlaying) return;

    isDebugPlaying = true;
    document.getElementById('play-btn').style.display = 'none';
    document.getElementById('pause-btn').style.display = 'flex';

    const baseDelay = 800; // 1 ステップあたりの基準待ち時間（ミリ秒）
    const delay = baseDelay / debugSpeed;

    console.log('Starting animation interval with delay:', delay);

    debugAnimationTimer = setInterval(() => {
        console.log('Animation step:', currentDebugStep, '/', debugSteps.length - 1);

        if (currentDebugStep >= debugSteps.length - 1) {
            pauseDebugAnimation();
            return;
        }

        currentDebugStep++;
        updateDebugStepDisplay();
    }, delay);
}

// アニメーションを一時停止する
function pauseDebugAnimation() {
    isDebugPlaying = false;
    clearInterval(debugAnimationTimer);
    document.getElementById('play-btn').style.display = 'flex';
    document.getElementById('pause-btn').style.display = 'none';
}

// アニメーションを先頭に戻す
function resetDebugAnimation() {
    pauseDebugAnimation();
    currentDebugStep = 0;
    currentCaptureState = {}; // キャプチャ状態も初期化する
    updateDebugStepDisplay();
}

// デバッグ再生速度を変更する
function setDebugSpeed(speed) {
    debugSpeed = speed;

    // 選択中の速度ボタン表示を更新する
    document.querySelectorAll('.speed-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    // 再生中なら新しい速度で再スタートする
    if (isDebugPlaying) {
        pauseDebugAnimation();
        playDebugAnimation();
    }
}

// マッチ結果を元にデバッグモードを準備する
// Debug タブは通常表示の副産物ではなく、再生用データを改めて組み立てる必要があるため専用の初期化を行う
function setupDebugMode(result, pattern, targetTree) {
    console.log('setupDebugMode called', { result, pattern, targetTree });

    // 前回の状態を初期化する
    currentCaptureState = {};
    debugZoom = 1.0;

    // 再生用ステップ列を作る
    debugSteps = generateDebugSteps(result, pattern, targetTree);
    currentDebugStep = 0;

    console.log('Generated debug steps:', debugSteps.length, debugSteps);

    // デバッグ用ツリーを描画する
    drawDebugTree(targetTree);

    // ズームを初期化して適用する
    applyDebugZoom();

    // デバッグ UI を表示する
    document.querySelector('#tab-debug .empty-state').style.display = 'none';
    document.getElementById('debug-controls').style.display = 'block';
    document.getElementById('step-display').style.display = 'block';
    document.getElementById('debug-tree-container').style.display = 'block';

    // 最初のステップ表示を反映する
    updateDebugStepDisplay();

    // イベントリスナーは初回だけ設定する
    if (!window.debugListenersInitialized) {
        document.getElementById('play-btn').addEventListener('click', playDebugAnimation);
        document.getElementById('pause-btn').addEventListener('click', pauseDebugAnimation);
        document.getElementById('reset-btn').addEventListener('click', resetDebugAnimation);

        document.querySelectorAll('.speed-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const speed = parseFloat(e.target.getAttribute('data-speed'));
                setDebugSpeed(speed);
            });
        });

        window.debugListenersInitialized = true;
    }
}

// ============================================
// Code Import 機能
// JavaScript の AST や JSON を TreeMatch 用のターゲットへ橋渡しするためのまとまり
// ============================================

let parsedAST = null;
let convertedTree = null;

/**
 * Programmatically switch to a tab
 */
function switchTab(tabName) {
    // タブボタンの見た目を更新する
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        }
    });

    // 対応するタブ本文だけを表示する
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    const targetTab = document.getElementById(`tab-${tabName}`);
    if (targetTab) {
        targetTab.classList.add('active');
    }
}


function convertASTToTreeMatchLib(astNode) {// acorn で得られた AST ノードを TreeMatchLib が扱える形式に変換する関数。これで JavaScript の AST を TreeMatchLib のターゲットツリーとして利用できるようになる
    if (!astNode || typeof astNode !== 'object') {// null や undefined、プリミティブ値はノードにできないので、特別な扱いをする
        // プリミティブ値は子を持たない単純な Literal ノードとして扱う
        const attr = { __A: 'Literal', __B: String(astNode) };
        return new Tree1.NodeClass(attr, []);// これで null や undefined、数値や文字列などもツリー上のノードとして表現できるようになる
    }

    const nodeType = astNode.type;// ノードの種類を取得する（例: 'Identifier', 'Literal', 'BinaryExpression' など）

    // ノード種別によって表示したい値を取り出す
    let nodeValue = null;
    if (astNode.name) {// Identifier ノードは name フィールドに識別子の名前が入っているので、これを表示値とする
        nodeValue = astNode.name; // Identifier の名前
    } else if (astNode.value !== undefined && astNode.value !== null) {//   Literal ノードは value フィールドにリテラルの値が入っているので、これを表示値とする。ただし null も value に入ることがあるので、null の場合は表示値を空にする
        nodeValue = String(astNode.value); // Literal の値
    } else if (astNode.operator) {
        nodeValue = astNode.operator; // 二項・単項演算子
    } else if (astNode.kind) {
        nodeValue = astNode.kind; // 変数宣言種別（const / let / var）
    }

    // 子ノードも再帰的に変換する
    // AST は入れ子構造なので、ここを再帰にしないと深い階層を取りこぼしてしまう
    const children = [];

    for (const [key, value] of Object.entries(astNode)) {// AST ノードの各フィールドを走査する。type や name、value などの基本的なフィールドはすでに処理しているので、ここでは構造本体となる子ノードだけを処理する
        // 構造本体ではないメタ情報フィールドはスキップする
        if (key === 'type' || key === 'start' || key === 'end' ||
            key === 'loc' || key === 'range' || key === 'name' ||
            key === 'value' || key === 'operator' || key === 'kind' ||
            key === 'raw' || key === 'regex') {
            continue;
        }

        if (Array.isArray(value)) {// 配列フィールドを処理する。AST では body や arguments、params などのフィールドが配列になっていることが多いので、これらをまとめて処理する
            // ノード配列を処理する
            value.forEach(item => {// 配列の各要素がノードであれば再帰的に変換して子ノードリストに追加する。ただし、null や undefined、プリミティブ値はノードにできないので、これらはスキップする
                if (item && typeof item === 'object' && item.type) {// ノードらしいオブジェクトなら変換して子ノードに追加する
                    children.push(convertASTToTreeMatchLib(item));
                }
            });
        } else if (value && typeof value === 'object' && value.type) {
            // 単一ノードを処理する
            children.push(convertASTToTreeMatchLib(value));
        }
    }

    // TreeMatchLib 用の属性形式でノードを作る
    // Tree1 では __A が Attr0（型）、__B が Attr1（値）に対応する
    const attr = { __A: nodeType, __B: nodeValue };// これでノードの種類と表示値を属性として持たせることができるようになる。例えば、Identifier ノードなら __A: 'Identifier', __B: 'x' のようになる
    return new Tree1.NodeClass(attr, children);// これで AST ノードを TreeMatchLib のノードに変換して返すことができるようになる
}

// TreeMatchLib のツリーをパターン文字列に変換する関数。これで変換したツリーを人間が読める形で表示できるようになる
function treeToPatternString(tree) {
    function nodeToString(node, depth = 0) {
        if (!node) return '';

        const attr0 = node.Attr0();// Attr0 をノードの種類として表示する。これでツリーの構造が分かりやすくなる
        const attr1 = node.Attr1();

        let result = attr0;
        if (attr1 !== null && attr1 !== undefined && attr1 !== '') {
            result += `#${attr1}`;
        }

        const childCount = node.NumChildren();
        if (childCount > 0) {
            const children = [];
            for (let i = 0; i < childCount; i++) {
                const child = node.NthChildSubtree(i).GetRootNode();
                children.push(nodeToString(child, depth + 1));
            }

            const indent = '  '.repeat(depth + 1);
            if (children.length === 1) {
                result += ' > ' + children[0];
            } else {
                result += ' >\n' + indent + '(' + children.join(')\n' + indent + '(') + ')';
            }
        }

        return result;
    }

    return nodeToString(tree.GetRootNode());
}

function setupCodeImport() {// コードインポート機能の初期化。これでコード入力から AST 変換、ツリー表示までの一連の流れをセットアップできるようになる
    const parseBtn = document.getElementById('parse-code-btn');
    const clearBtn = document.getElementById('clear-code-btn');
    const codeInput = document.getElementById('code-input');
    const useAsTargetBtn = document.getElementById('use-as-target-btn');
    const viewASTBtn = document.getElementById('view-ast-btn');
    const closeASTBtn = document.getElementById('close-ast-btn');
    const copyTreePatternBtn = document.getElementById('copy-tree-pattern-btn');

    // JSON アップロード関連の要素
    const uploadJsonBtn = document.getElementById('upload-json-btn');
    const jsonFileInput = document.getElementById('json-file-input');
    const jsonFileName = document.getElementById('json-file-name');

    // 「コードを解析」ボタン
    if (parseBtn) {
        parseBtn.addEventListener('click', () => {
            const code = codeInput.value.trim();
            if (!code) {
                alert('Please enter some code to parse.');
                return;
            }

            try {
                // acorn で JavaScript コードを AST に変換する
                parsedAST = acorn.parse(code, {
                    ecmaVersion: 2020,
                    sourceType: 'module',
                    locations: true
                });

                console.log('Parsed AST:', parsedAST);

                // TreeMatchLib が扱えるツリー形式へ変換する
                const rootNode = convertASTToTreeMatchLib(parsedAST);
                convertedTree = new Tree1(new Tree1.BoxClass(rootNode));
                console.log('Converted Tree:', convertedTree);

                // 変換後ツリーを文字列表現で表示する
                const patternString = treeToPatternString(convertedTree);
                document.getElementById('tree-pattern-display').textContent = patternString;

                // 結果表示エリアを見せる
                document.getElementById('parse-result-section').style.display = 'block';
                document.getElementById('ast-view-section').style.display = 'none';

                // そのままターゲットツリーとして使えるよう自動設定する
                currentTargetTree = convertedTree;
                document.getElementById('target-input').value = patternString;

                // Result タブへ移動し、ツリー可視化も更新する
                switchTab('result');
                executeMatchWithTree();

                // 完了メッセージを表示する
                alert('✅ パース成功！\n\n構文木がターゲットに自動設定されました。\nパターンを入力してマッチングを試してください。');

            } catch (error) {
                console.error('Parse error:', error);
                alert(`❌ Parse Error: ${error.message}\n\nJavaScript構文をチェックしてください。`);
            }
        });
    }

    // 「クリア」ボタン
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            codeInput.value = '';
            document.getElementById('parse-result-section').style.display = 'none';
            document.getElementById('ast-view-section').style.display = 'none';
            parsedAST = null;
            convertedTree = null;
            currentTargetTree = null;
        });
    }

    // 「ターゲットとして使う」ボタン
    if (useAsTargetBtn) {
        useAsTargetBtn.addEventListener('click', () => {
            if (!convertedTree) {
                alert('Please parse code first.');
                return;
            }

            // 現在のターゲットツリーとしてセットする
            currentTargetTree = convertedTree;

            // ターゲット入力欄にもツリー文字列を反映する
            const patternString = treeToPatternString(convertedTree);
            document.getElementById('target-input').value = patternString;

            // Result タブへ切り替える
            switchTab('result');

            alert('Tree set as target! You can now enter a pattern to match against it.');
        });
    }

    // 「AST を表示」ボタン
    if (viewASTBtn) {
        viewASTBtn.addEventListener('click', () => {
            if (!parsedAST) {
                alert('Please parse code first.');
                return;
            }

            document.getElementById('ast-display').textContent =
                JSON.stringify(parsedAST, null, 2);
            document.getElementById('ast-view-section').style.display = 'block';
        });
    }

    // 「AST を閉じる」ボタン
    if (closeASTBtn) {
        closeASTBtn.addEventListener('click', () => {
            document.getElementById('ast-view-section').style.display = 'none';
        });
    }

    // 「ツリー文字列をコピー」ボタン
    if (copyTreePatternBtn) {
        copyTreePatternBtn.addEventListener('click', () => {
            const patternText = document.getElementById('tree-pattern-display').textContent;
            navigator.clipboard.writeText(patternText).then(() => {
                // コピー成功のフィードバック表示
                const originalHTML = copyTreePatternBtn.innerHTML;
                copyTreePatternBtn.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path d="M3 8l3 3 7-7" stroke="currentColor" stroke-width="2"/>
                    </svg>
                `;
                setTimeout(() => {
                    copyTreePatternBtn.innerHTML = originalHTML;
                }, 1000);
            });
        });
    }

    // 「JSON を読み込む」ボタンで file input を開く
    if (uploadJsonBtn) {
        uploadJsonBtn.addEventListener('click', () => {
            jsonFileInput.click();
        });
    }

    // JSON ファイル選択後の処理
    if (jsonFileInput) {
        jsonFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // 選択したファイル名を表示する
            if (jsonFileName) {
                jsonFileName.textContent = file.name;
            }

            // JSON ファイルを読み込み、解析する
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const jsonContent = event.target.result;
                    const jsonData = JSON.parse(jsonContent);

                    console.log('Loaded JSON:', jsonData);

                    // 最低限 ESTree 形式かを確認する
                    if (!jsonData.type) {
                        throw new Error('Invalid AST: Missing "type" property. Expected ESTree format.');
                    }

                    // parsedAST として保持する
                    parsedAST = jsonData;

                    // TreeMatchLib 用の形式へ変換する
                    const rootNode = convertASTToTreeMatchLib(parsedAST);
                    convertedTree = new Tree1(new Tree1.BoxClass(rootNode));
                    console.log('Converted Tree:', convertedTree);

                    // 変換後ツリーを文字列で表示する
                    const patternString = treeToPatternString(convertedTree);
                    document.getElementById('tree-pattern-display').textContent = patternString;

                    // 結果表示エリアを見せる
                    document.getElementById('parse-result-section').style.display = 'block';
                    document.getElementById('ast-view-section').style.display = 'none';

                    // そのままターゲットツリーとして自動設定する
                    currentTargetTree = convertedTree;
                    document.getElementById('target-input').value = patternString;

                    // Result タブへ移動し、ツリー可視化も更新する
                    switchTab('result');
                    executeMatchWithTree();

                    // 完了メッセージを表示する
                    alert(`✅ JSON読み込み成功！\n\nファイル: ${file.name}\n構文木がターゲットに自動設定されました。`);

                } catch (error) {
                    console.error('JSON parse error:', error);
                    alert(`❌ JSON読み込みエラー: ${error.message}\n\nESTree形式のJSONファイルを選択してください。`);
                    if (jsonFileName) {
                        jsonFileName.textContent = '';
                    }
                }
            };

            reader.onerror = () => {
                alert('❌ ファイル読み込みエラー');
                if (jsonFileName) {
                    jsonFileName.textContent = '';
                }
            };

            reader.readAsText(file);
        });
    }
}

// ============================================
// Transform 機能 v2 - カード型ドラッグ＆ドロップ
// ============================================

let currentTransformData = null; // マッチ結果と対象ノード情報を保持する
let selectedOperation = null; // 現在選択中のテンプレート操作

function setupTransform() {
    const sourceNodeBox = document.getElementById('source-node-box');
    const templateCards = document.querySelectorAll('.template-card');
    const applyBtn = document.getElementById('apply-transform-btn');
    const resetBtn = document.getElementById('reset-transform-btn');
    const copyCodeBtn = document.getElementById('copy-transform-code-btn');
    const useAsTargetBtn = document.getElementById('use-transform-as-target-btn');

    // === ドラッグ＆ドロップ設定 ===

    // 元ノードのドラッグ開始
    sourceNodeBox.addEventListener('dragstart', (e) => {
        sourceNodeBox.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', 'source-node');
    });

    sourceNodeBox.addEventListener('dragend', (e) => {
        sourceNodeBox.classList.remove('dragging');
    });

    // テンプレートカード側のドラッグ＆ドロップ処理
    templateCards.forEach(card => {
        // クリックで選択とプレビューを行う
        card.addEventListener('click', () => {
            const operation = card.dataset.operation;
            selectOperation(operation);
        });

        // ドラッグ中に上へ重なったとき
        card.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            card.classList.add('drag-over');
        });

        // ドラッグが外れたとき
        card.addEventListener('dragleave', (e) => {
            card.classList.remove('drag-over');
        });

        // ドロップされたとき
        card.addEventListener('drop', (e) => {
            e.preventDefault();
            card.classList.remove('drag-over');

            const operation = card.dataset.operation;
            selectOperation(operation);
        });
    });

    // === ボタン処理 ===

    // Transform を適用し、実際のツリーを書き換える
    applyBtn.addEventListener('click', () => {
        if (!currentTransformData || !selectedOperation) return;
        applyTransformToTree();
    });

    // リセット
    resetBtn.addEventListener('click', () => {
        resetTransform();
    });

    // コードをコピー
    copyCodeBtn.addEventListener('click', () => {
        const code = document.getElementById('transform-code-display').textContent;
        navigator.clipboard.writeText(code).then(() => {
            const originalHTML = copyCodeBtn.innerHTML;
            copyCodeBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8l3 3 7-7" stroke="currentColor" stroke-width="2"/>
                </svg>
            `;
            setTimeout(() => {
                copyCodeBtn.innerHTML = originalHTML;
            }, 1000);
        });
    });

    // 生成結果をターゲットとして使う
    useAsTargetBtn.addEventListener('click', () => {
        const code = document.getElementById('transform-code-display').textContent;
        if (code && code.trim()) {
            document.getElementById('target-input').value = code;
            document.querySelector('[data-tab="result"]').click();
            alert('✅ Generated code set as TARGET!');
        }
    });
}

// 操作を選択し、プレビューを表示する
// いきなり本番のツリーを書き換えず、先に結果イメージを見せて誤操作を減らす
function selectOperation(operation) {
    if (!currentTransformData) return;

    selectedOperation = operation;

    // カードの選択状態を更新する
    document.querySelectorAll('.template-card').forEach(card => {
        if (card.dataset.operation === operation) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    });

    // プレビューを生成して表示する
    try {
        const preview = generateTransformPreview(operation);
        showPreviewPanel(preview);
    } catch (error) {
        console.error('Preview generation failed:', error);
        alert(`❌ Preview failed: ${error.message}`);
    }
}

// 変換後プレビューを生成する
function generateTransformPreview(operation) {
    const { node } = currentTransformData;
    const nodeStr = nodeToString(node);

    switch (operation) {
        case 'wrap-if':
            return {
                result: `if > cond (\n  ${nodeStr}\n)`,
                code: `if > cond (\n  ${nodeStr}\n)`
            };

        case 'wrap-try':
            return {
                result: `try >\n  (${nodeStr})\n  (catch > error (...))`,
                code: `try >\n  (${nodeStr})\n  (catch > error (...))`
            };

        case 'wrap-for':
            return {
                result: `for > init cond update (\n  ${nodeStr}\n)`,
                code: `for > init cond update (\n  ${nodeStr}\n)`
            };

        case 'delete':
            return {
                result: `[Node will be removed from parent]`,
                code: `// Node removed`
            };

        default:
            throw new Error('Unknown operation: ' + operation);
    }
}

// プレビューパネルを表示する
function showPreviewPanel(preview) {
    const afterPanel = document.querySelector('.after-panel');
    const resultPreview = document.getElementById('result-node-preview');
    const codeDisplay = document.getElementById('transform-code-display');
    const codeSection = document.getElementById('generated-code-section');

    // 変換後パネルを表示する
    afterPanel.style.display = 'flex';

    // プレビュー内容を反映する
    resultPreview.textContent = preview.result;
    codeDisplay.textContent = preview.code;

    // コード表示欄も見せる
    codeSection.style.display = 'block';
}

// 変換を適用する
// SetNode() などを使って実際のツリー構造を書き換える
// ここは見た目の置換ではなく元データ自体を変えるため、プレビュー段階と分けて慎重にしている
function applyTransformToTree() {
    if (!currentTransformData || !selectedOperation) return;

    const { result, node } = currentTransformData;

    try {
        // 元のツリー内で書き換える位置として root capture を取得する
        const rootCapture = result.GetRootCapture();
        if (!rootCapture) {
            throw new Error('Cannot get root capture');
        }

        let transformedTree;

        switch (selectedOperation) {
            case 'wrap-if':
                transformedTree = wrapWithTemplate(rootCapture, 'if > cond _##body');
                break;

            case 'wrap-try':
                transformedTree = wrapWithTemplate(rootCapture, 'try > _##body (catch > error (...))');
                break;

            case 'wrap-for':
                transformedTree = wrapWithTemplate(rootCapture, 'for > init cond update _##body');
                break;

            case 'delete':
                deleteNode(rootCapture);
                transformedTree = currentTargetTree;
                break;

            default:
                throw new Error('Unknown operation');
        }

        // 変換後ツリーをターゲット入力欄へ反映する
        const treeStr = nodeToString(transformedTree.GetRootNode());
        document.getElementById('target-input').value = treeStr;

        // 現在のツリー参照も更新する
        currentTargetTree = transformedTree;

        // 成功メッセージを表示する
        alert('✅ Transformation applied!\n\nThe TARGET tree has been updated.\nYou can now match new patterns against it.');

        // Transform の状態を初期化する
        resetTransform();

        // Result タブへ戻る
        document.querySelector('[data-tab="result"]').click();

    } catch (error) {
        console.error('Transform failed:', error);
        alert(`❌ Transformation failed:\n\n${error.message}\n\nCheck console for details.`);
    }
}

// ノードをテンプレートで包む（IF / TRY / FOR など）
// 元ノードを別の木の一部として差し込み直す発想が、Transform の基本になっている
function wrapWithTemplate(matchCapture, templatePattern) {
    // プレースホルダ入りテンプレートツリーを作る
    const template = TreeConstruct(currentTreeClass, templatePattern);

    // 差し込み先になる body キャプチャを取得する
    const bodyCapture = template.Capture('body');
    if (!bodyCapture) {
        throw new Error('Template does not have _##body placeholder');
    }

    // 元のノードを取り出す
    const originalNode = matchCapture.Node();

    // プレースホルダを元ノードで置き換える
    bodyCapture.SetNode(originalNode);

    // 元の位置にテンプレートの根ノードを差し込む
    matchCapture.SetNode(template.Tree().GetRootNode());

    // 書き換え後のツリーを返す
    return currentTargetTree;
}

// ツリーからノードを削除する
function deleteNode(matchCapture) {
    // 親との接続を外して削除する
    matchCapture.DetachNode();
}

// Transform の状態を初期化する
function resetTransform() {
    selectedOperation = null;

    // カードの選択状態を消す
    document.querySelectorAll('.template-card').forEach(card => {
        card.classList.remove('selected');
    });

    // 変換後パネルを隠す
    document.querySelector('.after-panel').style.display = 'none';

    // コード表示欄を隠す
    document.getElementById('generated-code-section').style.display = 'none';
}

// ノードを TreeConstruct 用の文字列表現へ変換する
function nodeToString(node) {
    if (!node) return '';

    const type = node.Attr0();
    const value = node.Attr1();
    let result = type;

    if (value !== null && value !== undefined && value !== '') {
        result += '#' + value;
    }

    const numChildren = node.NumChildren();
    if (numChildren > 0) {
        const children = [];
        for (let i = 0; i < numChildren; i++) {
            const child = node.NthChildSubtree(i).GetRootNode();
            children.push(nodeToString(child));
        }

        if (children.length === 1) {
            result += ' > ' + children[0];
        } else {
            result += ' >\n  ' + children.map(c => `(${c})`).join('\n  ');
        }
    }

    return result;
}

// マッチしたノードを Transform タブへ読み込む
// Result タブと Transform タブの間で「どのノードを対象にするか」を受け渡す橋渡し役
function loadNodeForTransform(node, pattern, result) {
    // 実際のツリー書き換えで使うのでノードと結果を両方保持する
    currentTransformData = {
        node,
        pattern,
        result: result || window.lastMatchedResult
    };

    // Transform 操作 UI を表示する
    document.querySelector('#tab-transform .empty-state').style.display = 'none';
    document.getElementById('transform-controls').style.display = 'flex';

    // 対象パターン表示を更新する
    document.getElementById('transform-pattern-display').textContent = pattern;

    // 元ノードのプレビューを更新する
    document.getElementById('source-node-preview').textContent = nodeToString(node);

    // 前回の選択状態をリセットする
    resetTransform();
}

// TreeMatch の単一結果を Transform タブへ送る
function sendToTransform() {
    if (!window.lastMatchedResult || !window.lastMatchedPattern) {
        alert('No match result available. Please run a pattern match first.');
        return;
    }

    const result = window.lastMatchedResult;
    const pattern = window.lastMatchedPattern;

    // 変換対象の基準となる root capture を取得する
    const rootCapture = result.GetRootCapture();
    if (!rootCapture) {
        alert('Cannot get root capture from match result.');
        return;
    }

    const node = rootCapture.Node();

    // Transform タブへ読み込む
    loadNodeForTransform(node, pattern, result);

    // Transform タブへ切り替える
    document.querySelector('[data-tab="transform"]').click();
}

// TreeMatchFind の特定結果を Transform タブへ送る
function sendToTransformByIndex(index) {
    if (!window.lastMatchedResults || !window.lastMatchedPattern) {
        alert('No match results available. Please run a pattern match first.');
        return;
    }

    if (index < 0 || index >= window.lastMatchedResults.length) {
        alert(`Invalid index: ${index}`);
        return;
    }

    const result = window.lastMatchedResults[index];
    const pattern = window.lastMatchedPattern;

    // 変換対象の基準となる root capture を取得する
    const rootCapture = result.GetRootCapture();
    if (!rootCapture) {
        alert('Cannot get root capture from match result.');
        return;
    }

    const node = rootCapture.Node();

    // Transform タブへ読み込む
    loadNodeForTransform(node, pattern, result);

    // Transform タブへ切り替える
    document.querySelector('[data-tab="transform"]').click();
}

// 読み込み完了時に初期化する
init();
setupCodeImport();
setupTransform();
