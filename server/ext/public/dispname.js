/* =============================================================
   WomanLive 拡張 - 「動画表示名で表示する」トグル
   検索画面右上の「表示設定」ダイアログに、本家の項目と同じ体裁で1行足す。
   ONで拡張の表示動画名、OFFで本家どおりのファイル名表示になる (既定はON)。
   ・本家の行(settingsRow_*)を複製して使うので、見た目とスイッチの動きは本家に追従する
   ・切り替えたら library-updated を投げて一覧を取り直す (置換は core.js の fetch フック)
   ============================================================= */
(function () {
    'use strict';
    const WL = window.WLExt;

    const LABEL = '動画表示名で表示する';

    function findDialog() {
        // 「表示設定」の見出しを持つダイアログ内の、本家の行が並ぶ入れ物を探す
        const rows = document.querySelectorAll('[class*="settingsRow_"]');
        for (const row of rows) {
            if (row.classList.contains('wlext-dispname-row')) continue;
            const body = row.parentElement;
            if (body && !body.querySelector('.wlext-dispname-row')) return { body, sample: row };
            if (body) return null;   // 既に入っている
        }
        return null;
    }

    function paint(row, on) {
        const track = row.querySelector('[class*="switchTrack_"]');
        const thumb = row.querySelector('[class*="switchThumb_"]');
        // active は本家がハッシュ無しで付ける状態クラス
        if (track) track.classList.toggle('active', on);
        if (thumb) thumb.classList.toggle('active', on);
    }

    function ensure() {
        const found = findDialog();
        if (!found) return;

        const row = found.sample.cloneNode(true);
        row.classList.add('wlext-dispname-row');

        const label = row.querySelector('[class*="settingsLabel_"]') || row.firstElementChild;
        if (label) label.textContent = LABEL;

        paint(row, WL.useDisplayName());

        const track = row.querySelector('[class*="switchTrack_"]');
        if (track) {
            // 複製元のハンドラは付いてこないので、ここで付け直す
            track.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                const next = !WL.useDisplayName();
                WL.setUseDisplayName(next);
                paint(row, next);
                // 一覧を取り直す (SearchPage が library-updated を購読している)
                window.dispatchEvent(new Event('library-updated'));
            });
        }

        found.body.appendChild(row);
    }

    WL.onEnsure(ensure);
})();
