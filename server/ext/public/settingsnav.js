/* =============================================================
   WomanLive 拡張 - 設定画面のサイドメニュー
   設定ページの各セクションを一覧にし、クリックでその位置へスクロールする。
   検索結果の絞り込み(searchfacets.js)と同じ体裁・同じ開閉の作法で、CSS も共用する。

   セクションは DOM から拾うので、個人用モジュールが足したものも自動で並ぶ
   (ORDER に無いものは末尾)。拡張側のセクション(見出しが「拡張機能：」)には
   一覧で末尾に Ex を付ける。
   ============================================================= */
(function () {
    'use strict';
    const WL = window.WLExt; const h = WL.h;

    // 画面とサイドメニューの並び順。ここに無いセクション(個人用モジュール)は末尾に残す。
    const ORDER = [
        'スキャン',
        'カバー画像',
        '関連動画（重み付け）',
        '出演者タグ 自動付与ルール',
        'メタデータ置換',
        'メンテナンス',
        'メンテナンス（参照されていないデータ）',
        'ネットワーク',
        'DMM(FANZA) 商品検索API',
        'バックアップ（追加機能データ）',
    ];
    const EXT_PREFIX = '拡張機能：';

    /* ---------- セクションの収集 ---------- */
    // 本家セクションと拡張セクションは同じ親に並ぶ (settings.js が本家の .section と同列に差し込む)。
    // 起点は本家の「スキャン」見出し。クラス名(CSS Modules のハッシュ)には依存しない。
    function findContainer() {
        const root = document.getElementById('root'); if (!root) return null;
        for (const el of root.querySelectorAll('h2')) {
            if (el.textContent && el.textContent.indexOf('スキャン') !== -1) {
                const section = el.parentElement;
                if (section && section.parentElement) return section.parentElement;
            }
        }
        return null;
    }

    // 画面に出ている順でセクションを返す [{el, name, ext}]
    // 拡張のセクションかどうかは見出しではなくクラスで見る。「メタデータ置換」は本家の
    // 体裁を借りていて見出しに「拡張機能：」が付かないため、見出しだけでは判別できない。
    function sections() {
        const container = findContainer();
        if (!container) return [];
        const out = [];
        Array.from(container.children).forEach(el => {
            if (el.style.display === 'none') return;   // 本家「タグ置換」は隠して差し替えている
            const head = el.querySelector('h2, h3');
            if (!head) return;
            let name = (head.textContent || '').trim();
            if (name.startsWith(EXT_PREFIX)) name = name.slice(EXT_PREFIX.length).trim();
            const cls = String(el.className || '');
            const ext = cls.indexOf('wlext-') >= 0 || cls.indexOf('private-') >= 0;
            if (name) out.push({ el, name, ext });
        });
        return out;
    }

    // ORDER の順に並べ替える。既にその順なら DOM は触らない
    // (React が再描画で戻したときだけ動く。ORDER に無いものは元の並びのまま末尾)。
    function reorder(list) {
        if (!list.length) return list;
        const rank = (s) => { const i = ORDER.indexOf(s.name); return i < 0 ? ORDER.length : i; };
        const sorted = list.slice().sort((a, b) => rank(a) - rank(b));
        if (sorted.every((s, i) => s.el === list[i].el)) return list;
        const parent = sorted[0].el.parentElement;
        sorted.forEach(s => parent.appendChild(s.el));
        return sorted;
    }

    /* ---------- 開閉 (絞り込みメニューと同じ: 既定は PC=開く / モバイル=閉じる) ---------- */
    const OPEN_KEY = 'wlext_setnav_open';
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
        document.body.classList.toggle('wlext-setnav-open', on);
        if (btn) btn.classList.toggle('on', on);
        if (on) render();
    }

    /* ---------- パネル ---------- */
    let panel = null, btn = null, backdrop = null;

    function ensure() {
        if (!WL.matchSettings()) { remove(); return; }
        if (!findContainer()) return;              // 設定ページの描画待ち
        if (!btn) {
            btn = h('div', { class: 'wlext-facets-btn', title: '設定項目メニューの開閉', onClick: () => setOpen(!document.body.classList.contains('wlext-setnav-open'), true) },
                [WL.icon('menu', 15), h('span', null, '設定項目')]);
            backdrop = h('div', { class: 'wlext-facets-backdrop', onClick: () => setOpen(false, true) });
            document.body.appendChild(backdrop);
            document.body.appendChild(btn);
            document.body.classList.add('wlext-setnav-on');
            window.addEventListener('resize', position);
            setOpen(openState(), false);
        }
        position();
        if (document.body.classList.contains('wlext-setnav-open')) render();
    }

    function remove() {
        if (panel) { panel.remove(); panel = null; }
        if (btn) { btn.remove(); btn = null; }
        if (backdrop) { backdrop.remove(); backdrop = null; }
        document.body.classList.remove('wlext-setnav-on', 'wlext-setnav-open');
    }

    // 設定ページのヘッダー(position:fixed)の下にボタン、その下にパネルを置く。
    // 高さは実測する(本家の作りが変わっても追従するため)。
    function headerBottom() {
        const bar = document.querySelector('#root [class*="navBar_"]');
        return bar ? Math.max(0, Math.round(bar.getBoundingClientRect().bottom)) : 48;
    }
    function position() {
        const top = headerBottom();
        if (btn) btn.style.top = (top + 8) + 'px';
        if (panel) panel.style.top = (top + 46) + 'px';
        if (backdrop) backdrop.style.top = top + 'px';
    }

    function render() {
        const list = reorder(sections());
        if (!panel) {
            panel = h('aside', { class: 'wlext-facets wlext-setnav' });
            document.body.appendChild(panel);
        }
        position();

        // 中身が同じなら作り直さない (ensure は React の再描画のたびに呼ばれる)
        const key = list.map(s => s.name).join('\n');
        if (panel.dataset.key === key) return;
        panel.dataset.key = key;

        panel.innerHTML = '';
        const body = h('div', { class: 'wlext-facets-body' });
        if (!list.length) {
            body.appendChild(h('div', { class: 'wlext-facets-msg' }, '設定項目が見つかりません'));
        }
        list.forEach(s => {
            body.appendChild(h('div', {
                class: 'wlext-facet-item',
                title: s.name + ' へ移動',
                onClick: () => jumpTo(s.el)
            }, [
                h('span', { class: 'wlext-facet-name' }, s.name),
                s.ext ? h('span', { class: 'wlext-facet-count' }, 'Ex') : null
            ]));
        });
        panel.appendChild(body);
    }

    // 固定ヘッダーに隠れないよう、その高さぶん手前で止める。
    // スムーススクロールは環境によって無視される(動かない)ので、確実に飛ぶ即時移動にする。
    function jumpTo(el) {
        const top = el.getBoundingClientRect().top + window.scrollY - headerBottom() - 12;
        window.scrollTo(0, Math.max(0, top));
        if (isNarrow()) setOpen(false, false);   // 狭い画面は本文に重ねているので閉じる
    }

    WL.onEnsure(ensure);
})();
