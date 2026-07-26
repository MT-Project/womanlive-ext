/* =============================================================
   WomanLive 拡張 - スクリーンショット表示サイズ変更
   動画ページのスクリーンショット欄にスライダーを追加し、表示サイズ
   (CSS上の見た目)だけを変更する。画像の実データ・解像度は変えない。
   ============================================================= */
(function () {
    'use strict';
    const WL = window.WLExt; const h = WL.h;

    const MIN_W = 80, MAX_W = 640, DEFAULT_W = 160;   // 160px(既定表示サイズ)の50%〜横640px
    const KEY = 'wlext_ss_size';

    function currentWidth() {
        const v = parseInt(localStorage.getItem(KEY), 10);
        return (v >= MIN_W && v <= MAX_W) ? v : DEFAULT_W;
    }

    function applySize(section, w) {
        section.style.setProperty('--wlext-ss-w', w + 'px');
        section.style.setProperty('--wlext-ss-h', Math.round(w * 9 / 16) + 'px'); // 16:9 を維持
    }

    function ensure() {
        if (!WL.matchWatch()) return;
        const root = document.getElementById('root'); if (!root) return;
        const section = root.querySelector('[class*="screenshotsSection_"]'); // 本家クラス(プロパティ名ベース)
        if (!section || !section.querySelector('[class*="screenshotImage_"]')) return; // スクショ0枚なら不要
        if (section.querySelector('.wlext-ss-resize')) return;

        const w = currentWidth();
        section.style.position = 'relative';
        applySize(section, w);

        const label = h('span', { class: 'wlext-ss-resize-val' }, w + 'px');
        const slider = h('input', {
            type: 'range', min: String(MIN_W), max: String(MAX_W), step: '10', value: String(w),
            class: 'wlext-ss-resize-input',
            onInput: (e) => {
                const nw = parseInt(e.target.value, 10);
                applySize(section, nw);
                label.textContent = nw + 'px';
                try { localStorage.setItem(KEY, String(nw)); } catch (err) { /* 保存できなくても表示は機能する */ }
            }
        });
        section.appendChild(h('div', { class: 'wlext-ss-resize', title: 'スクリーンショットの表示サイズ' }, [
            WL.icon('image', 14), slider, label
        ]));
    }

    WL.onEnsure(ensure);
})();
