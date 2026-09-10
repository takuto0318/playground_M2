# TreeMatchLib Playground

TreeMatchLib Playground は、TreeMatchLib の木構造パターンをブラウザ上で対話的に試行するためのプロトタイプです。

対象となる木構造やソースコードを入力し、TreeMatch / TreeMatchFind の結果を確認できます。マッチしたノードの色分け表示、キャプチャ名の表示、Tree View とソースコードの対応ハイライト、ノードやパスのパターン挿入補助などにより、TreeMatch パターンの作成を支援します。

## 使い方

`index.html` をブラウザで開くと使用できます。

ローカルサーバや Node.js は必須ではありません。HTML を直接ブラウザで開いて、Pattern 欄と Target 欄に入力してください。

## 主な機能

- TreeConstruct 形式の木を入力して TreeMatch / TreeMatchFind を実行する
- JavaScript コードを入力し、構文木へ変換して TreeMatch の対象にする
- JSON 形式の構文木を読み込み、TreeMatchLib 用の木へ変換する
- 簡易 C パーサを使い、C コードから構文木を生成して TreeMatch の対象にする
- Tree View 上でマッチ箇所とキャプチャ箇所を表示する
- Tree View のノードクリックで、対応するソースコード範囲をハイライトする
- ソースコード範囲の選択から、対応する Tree View ノードをハイライトする
- Tree View の右クリックメニューから、ノード単体やパスパターンを Pattern 欄へ挿入する

## 入力形式

### TreeConstruct

TreeMatchLib の TreeConstruct 形式で木を直接入力します。

```text
A > (B > C) (D > (B > E))
```

### Code

JavaScript または C のソースコードを入力します。

JavaScript は Acorn を使って構文木へ変換します。C は簡易 C パーサを使って構文木へ変換します。

### JSON

`type` キーを持つ JSON 形式の構文木を入力します。


## 未対応・注意点

- マニュアルは未整備です。現時点では研究・デモ用のプロトタイプです。
- JSON インポートの設定は十分に整理されていません。入力 JSON の形式によっては、意図した木構造にならない可能性があります。
- C パーサは簡易版です。プリプロセッサ指令、typedef、複数行コメント、一部のリテラルや C 構文には未対応または不完全な部分があります。
- C の構文木は中間ノードが多いため、Tree View が大きく縦長になる場合があります。
- C コードのソース対応は、終端記号の位置情報から上位ノードの範囲を復元する試作実装です。すべての構文で正確な範囲になるとは限りません。
- Python の Code 入力は未対応です。
- 大きな木や広すぎるパターンでは、描画やマッチングが重くなる場合があります。
- 右クリックで生成されるパスパターンは、正解パターンを保証するものではありません。編集の出発点として使う補助機能です。

## 構成

```text
index.html
  Playground の画面本体

app.js
  UI 制御、入力変換、Tree View 描画、マッチ結果表示

style.css
  Playground のスタイル

lib/TreeMatchLib.js
  TreeMatchLib 本体

lib/output_js_simplified_c_parser.js
  簡易 C パーサ
```

## 補足

TreeMatchLib 本体については、以下のリポジトリを参照してください。

https://github.com/oguranobuhiko/TreeMatchLib
