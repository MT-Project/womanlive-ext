/* =============================================================
   WomanLive 拡張 - 名前ソート用 共通ソートキー
   サーバー(better-sqlite3 のカスタム関数)とクライアント(各一覧ページ)の
   双方で同じ並び順になるよう、1ファイルで定義して共用する (UMD)。

   方針:
     1. NFKC 正規化 (全角英数→半角・半角カナ→全角カナ など)
     2. カタカナ→ひらがな (かな種別を無視して五十音順に揃える)
     3. 小文字化 (英字の大小を無視)
     4. 頭の記号/空白を無視 (英数字・かな・漢字が現れるまで除去)
     5. 数字の並びを固定幅ゼロ埋め (桁数の大小=自然順で比較)
   生成したキーをコード順 (BINARY) で比較すると、
   数字 → 英字 → ひらがな → 漢字 の順に、かなは五十音順で並ぶ。
   ============================================================= */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.WLNameKey = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // カタカナ(U+30A1..U+30F6)を 0x60 引いてひらがな(U+3041..U+3096)へ
    function kataToHira(s) {
        return s.replace(/[ァ-ヶ]/g, function (ch) {
            return String.fromCharCode(ch.charCodeAt(0) - 0x60);
        });
    }

    // 数字の連続を固定幅ゼロ埋めにして桁数を揃える (例: "10"→"...0010", "2"→"...0002")
    var NUM_WIDTH = 12;
    function padNumbers(s) {
        return s.replace(/[0-9]+/g, function (run) {
            var n = run.replace(/^0+(?=[0-9])/, ''); // 先頭の余分なゼロを除去 (007 == 7)
            return n.length >= NUM_WIDTH ? n : (new Array(NUM_WIDTH - n.length + 1).join('0') + n);
        });
    }

    // 頭の記号/空白を除去 (文字=Letter または 数字=Number が来るまで)
    // \p{L} はかな・漢字・ラテン文字を含む。未対応環境向けにフォールバックも用意。
    var LEAD_RE;
    try { LEAD_RE = new RegExp('^[^\\p{L}\\p{N}]+', 'u'); }
    catch (e) { LEAD_RE = /^[^0-9A-Za-zぁ-ヿ㐀-鿿豈-﫿０-９Ａ-Ｚａ-ｚｦ-ﾟ]+/; }

    function nameKey(input) {
        var s = (input == null) ? '' : String(input);
        try { s = s.normalize('NFKC'); } catch (e) { /* 古い環境は素通し */ }
        s = kataToHira(s);
        s = s.toLowerCase();
        var stripped = s.replace(LEAD_RE, '');
        if (stripped) s = stripped;        // 全て記号なら元のキーを使う
        s = padNumbers(s);
        return s;
    }

    // ソート比較関数 (キー一致時は元文字列で安定化)
    function nameCompare(a, b) {
        var ka = nameKey(a), kb = nameKey(b);
        if (ka < kb) return -1;
        if (ka > kb) return 1;
        var sa = (a == null) ? '' : String(a), sb = (b == null) ? '' : String(b);
        return sa < sb ? -1 : (sa > sb ? 1 : 0);
    }

    return { nameKey: nameKey, nameCompare: nameCompare };
});
