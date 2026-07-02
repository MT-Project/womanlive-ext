/* =============================================================
   WomanLive 拡張 - 公開カレンダー (/release-calendar)
   公開日(メタデータ)で年月別にグループ化。未設定は「未分類」。
   ============================================================= */
(function () {
    'use strict';
    const WL = window.WLExt; const h = WL.h;

    function ensure() {
        const on = location.pathname === '/release-calendar';
        const existing = document.querySelector('.wlext-relcal-page');
        if (!on) { if (existing) existing.remove(); return; }
        if (existing) return;
        render();
    }

    async function render() {
        const page = h('div', { class: 'wlext-relcal-page wlext-ext-page' });
        page.appendChild(WL.pageHeader());
        const container = h('div', { class: 'wlext-pp-container' }, h('div', { style: { color: 'var(--text-secondary,#888)' } }, '読み込み中...'));
        page.appendChild(container);
        document.body.appendChild(page);
        window.scrollTo(0, 0);

        let data;
        try { data = await WL.api.releaseCalendar(); }
        catch (e) { container.innerHTML = ''; container.appendChild(h('div', null, '読み込みに失敗しました: ' + e.message)); return; }

        container.innerHTML = '';
        container.appendChild(WL.pageTitle('calendar-check', '公開カレンダー（公開日でグループ化）'));

        const byYear = {};
        (data.months || []).forEach(m => { (byYear[m.year] = byYear[m.year] || []).push(m); });
        const years = Object.keys(byYear).sort((a, b) => b - a);

        if (!years.length && !data.uncategorized) {
            container.appendChild(h('div', { style: { color: 'var(--text-secondary,#888)' } }, '公開日が設定された動画がありません。動画の詳細情報で公開日を設定してください。'));
            return;
        }

        years.forEach(year => {
            const total = byYear[year].reduce((s, m) => s + m.count, 0);
            const sec = h('div', { class: 'wlext-relcal-year' });
            const yearUrl = '/search?q=' + encodeURIComponent('@releaseyear:"' + year + '"');
            sec.appendChild(WL.navA(yearUrl, { class: 'wlext-relcal-year-link' },
                h('h3', { class: 'wlext-relcal-year-title', title: year + '年の動画を検索' }, year + '年 (' + total + ')')));
            const grid = h('div', { class: 'wlext-relcal-months' });
            byYear[year].sort((a, b) => parseInt(a.month, 10) - parseInt(b.month, 10)).forEach(m => {
                const monthUrl = '/search?q=' + encodeURIComponent('@releasemonth:"' + m.year + '-' + m.month + '"');
                grid.appendChild(WL.navA(monthUrl, { class: 'wlext-relcal-month' }, [
                    h('span', { class: 'wlext-relcal-month-name' }, parseInt(m.month, 10) + '月'),
                    h('span', { class: 'wlext-relcal-month-count' }, '(' + m.count + ')')
                ]));
            });
            sec.appendChild(grid);
            container.appendChild(sec);
        });

        if (data.uncategorized) {
            const sec = h('div', { class: 'wlext-relcal-year' });
            sec.appendChild(h('h3', { class: 'wlext-relcal-year-title' }, '未分類 (' + data.uncategorized + ')'));
            const grid = h('div', { class: 'wlext-relcal-months' });
            const noneUrl = '/search?q=' + encodeURIComponent('@release:none');
            grid.appendChild(WL.navA(noneUrl, { class: 'wlext-relcal-month', title: '公開日が未設定の動画' }, [
                h('span', { class: 'wlext-relcal-month-name' }, '公開日なし'),
                h('span', { class: 'wlext-relcal-month-count' }, '(' + data.uncategorized + ')')
            ]));
            sec.appendChild(grid);
            container.appendChild(sec);
        }
    }

    WL.onEnsure(ensure);
})();
