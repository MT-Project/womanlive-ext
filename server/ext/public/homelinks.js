/* =============================================================
   WomanLive 拡張 - ホーム画面に新ページへのリンクを追加
   (ブックマーク / 公開カレンダー / シリーズ一覧 / 出演者一覧)
   アイコンは本家ホームと同じ単色(lucide風 16px)で統一。
   ============================================================= */
(function () {
    'use strict';
    const WL = window.WLExt; const h = WL.h;

    function ensure() {
        if (location.pathname !== '/') return;
        const root = document.getElementById('root'); if (!root) return;
        const calLink = root.querySelector('a[href="/calendar"]');
        if (!calLink) return;
        const container = calLink.parentElement; if (!container) return;
        if (container.querySelector('.wlext-home-link')) return;

        const cls = calLink.className; // 既存リンクのスタイル(アイコン+テキスト)を流用
        const mk = (href, icon, text) => h('a', { href, class: cls + ' wlext-home-link' }, [
            WL.icon(icon, 16), text
        ]);
        container.appendChild(mk('/bookmarks', 'bookmark', 'ブックマーク'));
        container.appendChild(mk('/release-calendar', 'calendar-check', '公開カレンダー'));
        container.appendChild(mk('/series', 'library', 'シリーズ一覧'));
        container.appendChild(mk('/performers', 'users', '出演者一覧'));
        container.appendChild(mk('/tags', 'tag', 'タグ一覧'));
    }

    WL.onEnsure(ensure);
})();
