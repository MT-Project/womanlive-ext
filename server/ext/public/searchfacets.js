/* =============================================================
   WomanLive 拡張 - 検索結果のサイドメニュー (絞り込み)
   検索結果に対して ジャンル / タグ / メーカー / 出演者 / シリーズ を件数の多い順に出し、
   クリックで今の検索条件に足す(もう一度押すと外す)。上位5件を出し、残りは折りたたむ。

   対象は拡張の項目検索(q が空、または '@' で始まる)のとき。本家のキーワード検索は
   別経路(fullsearch)で条件の作りが違うため、サイドメニューは出さない。
   ============================================================= */
(function () {
    'use strict';
    const WL = window.WLExt; const h = WL.h;

    // 表示順は上から ジャンル → タグ → メーカー → 出演者 → シリーズ
    const SECTIONS = [
        { key: 'genre', field: 'genre', label: 'ジャンル', icon: 'layers' },
        { key: 'tag', field: 'tag', label: 'タグ', icon: 'tag' },
        { key: 'maker', field: 'maker', label: 'メーカー', icon: 'factory' },
        { key: 'performer', field: 'performer', label: '出演者', icon: 'users' },
        { key: 'series', field: 'series', label: 'シリーズ', icon: 'library' },
    ];
    const TOP_N = 5;

    /* ---------- 検索クエリ (トークン列) の読み書き ---------- */
    // サーバー側 search.js の tokenize と同じ分解をする
    const TOKEN_RE = /(\w+)\s*:\s*("([^"]*)"|[^\s]+)/g;
    function parseTokens(q) {
        const s = String(q || '').trim().replace(/^@/, '');
        const out = [];
        let m;
        TOKEN_RE.lastIndex = 0;
        while ((m = TOKEN_RE.exec(s)) !== null) out.push({ field: m[1].toLowerCase(), value: m[3] !== undefined ? m[3] : m[2] });
        return out;
    }
    function buildQuery(tokens) {
        if (!tokens.length) return '';
        return '@' + tokens.map(t => t.field + ':"' + t.value + '"').join(' ');
    }
    // サイドメニューを出せるのは、項目検索(空 or '@'始まり)のときだけ
    function facetable(q) { return !q || q.trim().startsWith('@'); }

    function currentQuery() {
        return (new URLSearchParams(location.search).get('q') || '').trim();
    }
    function go(tokens) {
        const p = new URLSearchParams(location.search);
        p.set('q', buildQuery(tokens));
        p.set('page', '1');
        WL.navigate('/search?' + p.toString());
    }

    /* ---------- パネル ---------- */
    let panel = null, lastQuery = null;

    function ensure() {
        const on = location.pathname === '/search' && facetable(currentQuery());
        if (!on) { remove(); return; }
        if (panel && lastQuery === currentQuery()) { position(); return; }
        render();
    }

    function remove() {
        if (panel) { panel.remove(); panel = null; }
        lastQuery = null;
        document.body.classList.remove('wlext-facets-on');
    }

    // 本家ヘッダーの下から画面下端までを占める。ヘッダーの高さは実測する。
    function position() {
        if (!panel) return;
        const nav = document.querySelector('#root [class*="nav_"]');
        const top = nav ? Math.max(0, Math.round(nav.getBoundingClientRect().bottom)) : 56;
        panel.style.top = top + 'px';
    }

    async function render() {
        const q = currentQuery();
        lastQuery = q;
        if (!panel) {
            panel = h('aside', { class: 'wlext-facets' });
            document.body.appendChild(panel);
            document.body.classList.add('wlext-facets-on');
            window.addEventListener('resize', position);
        }
        position();
        panel.innerHTML = '';
        panel.appendChild(h('div', { class: 'wlext-facets-head' }, [WL.icon('filter', 16), h('span', null, '絞り込み')]));
        const body = h('div', { class: 'wlext-facets-body' }, h('div', { class: 'wlext-facets-msg' }, '読み込み中...'));
        panel.appendChild(body);

        let data;
        try { data = await WL.api.searchFacets(q); }
        catch (e) { body.innerHTML = ''; body.appendChild(h('div', { class: 'wlext-facets-msg' }, '読み込みに失敗しました: ' + e.message)); return; }
        if (lastQuery !== currentQuery()) return;   // 待っている間に検索が変わった

        const tokens = parseTokens(q);
        body.innerHTML = '';
        let any = false;
        SECTIONS.forEach(sec => {
            const items = data[sec.key] || [];
            if (!items.length) return;
            any = true;
            body.appendChild(section(sec, items, tokens));
        });
        if (!any) body.appendChild(h('div', { class: 'wlext-facets-msg' }, '絞り込める項目がありません'));
    }

    function section(sec, items, tokens) {
        const listEl = h('div', { class: 'wlext-facet-list' });
        const isActive = (v) => tokens.some(t => t.field === sec.field && t.value === v);

        function row(it) {
            const active = isActive(it.value);
            return h('div', {
                class: 'wlext-facet-item' + (active ? ' active' : ''),
                title: active ? 'この絞り込みを外す' : (it.label + ' で絞り込む'),
                onClick: () => {
                    // 同じ項目をもう一度押したら外す。押すたびにページは1へ戻す。
                    const next = active
                        ? tokens.filter(t => !(t.field === sec.field && t.value === it.value))
                        : tokens.concat([{ field: sec.field, value: it.value }]);
                    go(next);
                }
            }, [
                h('span', { class: 'wlext-facet-name' }, it.label),
                h('span', { class: 'wlext-facet-count' }, String(it.count))
            ]);
        }

        items.slice(0, TOP_N).forEach(it => listEl.appendChild(row(it)));

        // TOP5 以降は折りたたみ。開いたときに初めて作る(出演者は数百件になるため)。
        let more = null;
        if (items.length > TOP_N) {
            const rest = h('div', { class: 'wlext-facet-rest' });
            const toggle = h('div', { class: 'wlext-facet-more' }, 'すべて表示（他 ' + (items.length - TOP_N) + ' 件）');
            toggle.addEventListener('click', () => {
                const open = rest.classList.toggle('open');
                if (open && !rest.childElementCount) items.slice(TOP_N).forEach(it => rest.appendChild(row(it)));
                toggle.textContent = open ? '閉じる' : 'すべて表示（他 ' + (items.length - TOP_N) + ' 件）';
            });
            more = [rest, toggle];
        }

        return h('div', { class: 'wlext-facet-section' }, [
            h('div', { class: 'wlext-facet-title' }, [WL.icon(sec.icon, 15), h('span', null, sec.label)]),
            listEl, more
        ]);
    }

    WL.onEnsure(ensure);
})();
