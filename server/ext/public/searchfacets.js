/* =============================================================
   WomanLive 拡張 - 検索結果のサイドメニュー (絞り込み)
   検索結果に対して 評価(範囲スライダー)と ジャンル / タグ / メーカー / 出演者 / シリーズ を出し、
   クリックで今の検索条件に足す(もう一度押すと外す)。上位5件を出し、残りは折りたたむ。

   画面左上の「絞り込み」ボタンで開閉する(位置は固定でスクロールしない)。
   既定は PC=開く / モバイル=閉じる。切り替えた状態はその端末に覚えさせる。

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

    /* ---------- 評価の範囲 (rating トークン ⇔ 0〜5 の範囲) ---------- */
    const MAX_RATING = 5;
    // 検索は rating トークンを AND でつなぐので、範囲は ">=下限" と "<=上限" の2つで表せる。
    // 未評価は本家の検索条件が 0 として扱うため、下限0はそのまま「未評価も含む」になる。
    function ratingRange(tokens) {
        let min = 0, max = MAX_RATING;
        tokens.filter(t => t.field === 'rating').forEach(t => {
            const m = /^(>=|<=|>|<|=)?\s*(\d)/.exec(String(t.value).trim());
            if (!m) return;
            const op = m[1] || '=', n = parseInt(m[2], 10);
            if (op === '>=') min = Math.max(min, n);
            else if (op === '>') min = Math.max(min, n + 1);
            else if (op === '<=') max = Math.min(max, n);
            else if (op === '<') max = Math.min(max, n - 1);
            else { min = Math.max(min, n); max = Math.min(max, n); }
        });
        min = Math.max(0, Math.min(MAX_RATING, min));
        max = Math.max(min, Math.min(MAX_RATING, max));
        return { min, max };
    }
    function withRating(tokens, min, max) {
        const rest = tokens.filter(t => t.field !== 'rating');
        const add = [];
        if (min > 0) add.push({ field: 'rating', value: '>=' + min });
        if (max < MAX_RATING) add.push({ field: 'rating', value: '<=' + max });
        return rest.concat(add);
    }

    function currentQuery() {
        return (new URLSearchParams(location.search).get('q') || '').trim();
    }
    function go(tokens) {
        const p = new URLSearchParams(location.search);
        p.set('q', buildQuery(tokens));
        p.set('page', '1');
        WL.navigate('/search?' + p.toString());
    }

    /* ---------- 開閉 ---------- */
    // 既定は PC=開く / モバイル=閉じる。一度切り替えたらその端末の選択を覚える。
    const OPEN_KEY = 'wlext_facets_open';
    const isNarrow = () => window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;
    function openState() {
        try {
            const v = localStorage.getItem(OPEN_KEY);
            if (v === '1') return true;
            if (v === '0') return false;
        } catch (e) { }
        return !isNarrow();
    }
    function setOpen(on, remember) {
        if (remember) { try { localStorage.setItem(OPEN_KEY, on ? '1' : '0'); } catch (e) { } }
        document.body.classList.toggle('wlext-facets-open', on);
        if (btn) btn.classList.toggle('on', on);
        if (on && (!panel || lastQuery !== currentQuery())) render();
    }

    /* ---------- パネル ---------- */
    let panel = null, btn = null, backdrop = null, lastQuery = null;

    function ensure() {
        const on = location.pathname === '/search' && facetable(currentQuery());
        if (!on) { remove(); return; }
        if (!btn) {
            // 絞り込みボタン: 画面左上に固定 (スクロールしても動かない)
            btn = h('div', { class: 'wlext-facets-btn', title: '絞り込みメニューの開閉', onClick: () => setOpen(!document.body.classList.contains('wlext-facets-open'), true) },
                [WL.icon('filter', 15), h('span', null, '絞り込み')]);
            backdrop = h('div', { class: 'wlext-facets-backdrop', onClick: () => setOpen(false, true) });
            document.body.appendChild(backdrop);
            document.body.appendChild(btn);
            document.body.classList.add('wlext-facets-on');
            window.addEventListener('resize', position);
            setOpen(openState(), false);
        }
        position();
        if (document.body.classList.contains('wlext-facets-open') && lastQuery !== currentQuery()) render();
    }

    function remove() {
        if (panel) { panel.remove(); panel = null; }
        if (btn) { btn.remove(); btn = null; }
        if (backdrop) { backdrop.remove(); backdrop = null; }
        lastQuery = null;
        document.body.classList.remove('wlext-facets-on', 'wlext-facets-open');
    }

    // ボタンは本家ヘッダーのすぐ下、パネルはそのさらに下から画面下端まで。
    // ヘッダーの高さは実測する(本家の作りが変わっても追従するため)。
    function position() {
        const nav = document.querySelector('#root [class*="nav_"]');
        const top = nav ? Math.max(0, Math.round(nav.getBoundingClientRect().bottom)) : 56;
        if (btn) btn.style.top = (top + 8) + 'px';
        if (panel) panel.style.top = (top + 46) + 'px';
        if (backdrop) backdrop.style.top = top + 'px';

        // 一覧を右へ寄せる量。本家の結果一覧は左端が画面外(負の座標)から始まることがあるので、
        // 固定値ではなく「パネルの右端 + 余白」に届くよう実測して決める。
        const content = document.querySelector('#root [class*="content_"]');
        if (!content) return;
        const panelRight = panel ? panel.getBoundingClientRect().right : 241;
        const need = Math.max(0, Math.round(panelRight + 16 - content.getBoundingClientRect().left));
        document.documentElement.style.setProperty('--wlext-facet-pad', need + 'px');
    }

    async function render() {
        const q = currentQuery();
        lastQuery = q;
        if (!panel) {
            panel = h('aside', { class: 'wlext-facets' });
            document.body.appendChild(panel);
        }
        position();
        panel.innerHTML = '';
        const body = h('div', { class: 'wlext-facets-body' }, h('div', { class: 'wlext-facets-msg' }, '読み込み中...'));
        panel.appendChild(body);

        let data;
        try { data = await WL.api.searchFacets(q); }
        catch (e) { body.innerHTML = ''; body.appendChild(h('div', { class: 'wlext-facets-msg' }, '読み込みに失敗しました: ' + e.message)); return; }
        if (lastQuery !== currentQuery()) return;   // 待っている間に検索が変わった

        const tokens = parseTokens(q);
        body.innerHTML = '';
        // 評価はジャンルの上。候補が無くても(結果0件でも)出して、範囲を広げ直せるようにする。
        body.appendChild(ratingSection(tokens));
        let any = false;
        SECTIONS.forEach(sec => {
            const items = data[sec.key] || [];
            if (!items.length) return;
            any = true;
            body.appendChild(section(sec, items, tokens));
        });
        if (!any) body.appendChild(h('div', { class: 'wlext-facets-msg' }, '絞り込める項目がありません'));
    }

    /* ---------- 評価スライダー (ジャンルの上) ---------- */
    // 0〜5 の点を並べ、両端のつまみをドラッグ(またはクリック)して範囲を決める。
    // 動かしている間は表示だけ更新し、指を離した時点で検索し直す。
    function ratingSection(tokens) {
        const cur = ratingRange(tokens);
        let min = cur.min, max = cur.max;

        const valueEl = h('div', { class: 'wlext-facet-range-value' });
        const fill = h('div', { class: 'wlext-facet-track-fill' });
        const track = h('div', { class: 'wlext-facet-track', title: 'ドラッグで範囲を変更' }, fill);
        const dots = [];
        for (let i = 0; i <= MAX_RATING; i++) {
            const d = h('div', { class: 'wlext-facet-dot' });
            d.style.left = (i / MAX_RATING * 100) + '%';
            track.appendChild(d);
            dots.push(d);
        }

        function paint() {
            valueEl.textContent = (min === 0 && max === MAX_RATING) ? 'すべて'
                : (min === max ? String(min) : min + '〜' + max);
            fill.style.left = (min / MAX_RATING * 100) + '%';
            fill.style.width = ((max - min) / MAX_RATING * 100) + '%';
            dots.forEach((d, i) => {
                d.classList.toggle('on', i >= min && i <= max);
                d.classList.toggle('handle', i === min || i === max);
            });
        }

        const indexAt = (e) => {
            const r = track.getBoundingClientRect();
            const ratio = r.width ? (e.clientX - r.left) / r.width : 0;
            return Math.round(Math.min(1, Math.max(0, ratio)) * MAX_RATING);
        };
        let dragging = null;   // 'min' | 'max'
        function grab(i) {
            // 範囲の外を押したらその側、内側なら近いほうのつまみを動かす
            if (i < min) return 'min';
            if (i > max) return 'max';
            return (i - min) <= (max - i) ? 'min' : 'max';
        }
        function move(i) {
            if (dragging === 'min') min = Math.min(i, max); else max = Math.max(i, min);
            paint();
        }
        track.addEventListener('pointerdown', (e) => {
            const i = indexAt(e);
            dragging = grab(i);
            move(i);
            try { track.setPointerCapture(e.pointerId); } catch (err) { }
        });
        track.addEventListener('pointermove', (e) => { if (dragging) move(indexAt(e)); });
        const release = () => {
            if (!dragging) return;
            dragging = null;
            if (min !== cur.min || max !== cur.max) go(withRating(tokens, min, max));
        };
        track.addEventListener('pointerup', release);
        track.addEventListener('pointercancel', release);

        paint();
        return h('div', { class: 'wlext-facet-section wlext-facet-range' }, [
            h('div', { class: 'wlext-facet-title' }, [h('span', null, '★'), h('span', null, '評価')]),
            valueEl, track,
            h('div', { class: 'wlext-facet-scale' }, [h('span', null, '0'), h('span', null, String(MAX_RATING))])
        ]);
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
