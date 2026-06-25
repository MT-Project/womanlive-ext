/* =============================================================
   WomanLive 拡張 - ブックマーク (追加ボタン + フォルダ選択ダイアログ)
   ・検索一覧: フォルダ名の右側に追加ボタン
   ・動画ページ: 表示動画名の後に追加ボタン
   ============================================================= */
(function () {
    'use strict';
    const WL = window.WLExt; const h = WL.h;

    WL._bmIds = WL._bmIds || null; // Set<videoId> | null(未読込)
    let loading = false;

    function ensureIds() {
        if (WL._bmIds || loading) return;
        loading = true;
        WL.api.bmIds().then(ids => { WL._bmIds = new Set(ids.map(Number)); loading = false; repaintAll(); })
            .catch(() => { loading = false; });
    }

    function svgPlus() {
        return '<svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v3"></path><line x1="16" y1="5" x2="22" y2="5"></line><line x1="19" y1="2" x2="19" y2="8"></line></svg>';
    }
    function svgOn() {
        return '<svg width="100%" height="100%" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>';
    }

    function paintBtn(btn) {
        const vid = Number(btn.getAttribute('data-vid'));
        const on = !!(WL._bmIds && WL._bmIds.has(vid));
        btn.classList.toggle('on', on);
        btn.innerHTML = on ? svgOn() : svgPlus();
        btn.title = on ? 'ブックマーク済み（クリックで編集）' : 'ブックマークに追加';
    }
    function repaintAll() { document.querySelectorAll('.wlext-bm-btn').forEach(paintBtn); }
    WL.repaintBookmarks = repaintAll;

    function makeBtn(vid) {
        const btn = h('button', {
            class: 'wlext-bm-btn', attrs: { 'data-vid': vid },
            onClick: (e) => { e.preventDefault(); e.stopPropagation(); openDialog(vid); }
        });
        paintBtn(btn);
        return btn;
    }

    function setBookmarkedFromFolders(vid, folders) {
        if (!WL._bmIds) WL._bmIds = new Set();
        if (folders.some(f => f.in)) WL._bmIds.add(Number(vid));
        else WL._bmIds.delete(Number(vid));
        repaintAll();
    }

    /* ---------- フォルダ選択ダイアログ ---------- */
    async function openDialog(vid) {
        let data;
        try { data = await WL.api.bmVideoFolders(vid); }
        catch (e) { WL.toast('読み込みに失敗: ' + e.message, 'error'); return; }
        const folders = data.folders || [];

        const listHost = h('div', { class: 'wlext-bm-dlg-list' });
        function renderList() {
            listHost.innerHTML = '';
            if (!folders.length) {
                listHost.appendChild(h('div', { style: { color: 'var(--text-secondary,#888)', fontSize: '0.85rem', padding: '0.5rem' } }, 'フォルダがありません。下の欄から追加してください。'));
                return;
            }
            folders.forEach(f => {
                const item = h('div', {
                    class: 'wlext-bm-dlg-item' + (f.in ? ' on' : ''),
                    onClick: async () => {
                        try {
                            if (f.in) { await WL.api.bmRemove(vid, f.id); f.in = false; }
                            else { await WL.api.bmAdd(vid, f.id); f.in = true; }
                            item.classList.toggle('on', f.in);
                            item.querySelector('.chk').textContent = f.in ? '✓' : '';
                            setBookmarkedFromFolders(vid, folders);
                        } catch (e) { WL.toast('更新に失敗: ' + e.message, 'error'); }
                    }
                }, [h('span', { class: 'name' }, f.name), h('span', { class: 'chk' }, f.in ? '✓' : '')]);
                listHost.appendChild(item);
            });
        }
        renderList();

        const input = h('input', { class: 'wlext-input', placeholder: '新しいフォルダ名' });
        const addBtn = h('button', {
            class: 'wlext-btn', onClick: async () => {
                const name = input.value.trim(); if (!name) return;
                try {
                    const nf = await WL.api.bmCreateFolder(name);
                    await WL.api.bmAdd(vid, nf.id);
                    folders.push({ id: nf.id, name: nf.name, in: true });
                    input.value = '';
                    renderList();
                    setBookmarkedFromFolders(vid, folders);
                } catch (e) { WL.toast('フォルダ追加に失敗: ' + e.message, 'error'); }
            }
        }, '＋追加');
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); } });

        const body = h('div', null, [
            h('div', { style: { fontSize: '0.8rem', color: 'var(--text-secondary,#888)', marginBottom: '0.5rem' } }, 'フォルダをタップで追加/解除します。'),
            listHost,
            h('div', { class: 'wlext-inline', style: { marginTop: '0.8rem' } }, [input, addBtn])
        ]);
        WL.dialog('ブックマーク', body, {});  // 変更は即時反映のため保存ボタンなし
    }

    /* ---------- ボタン注入 ---------- */
    // 動画ページ: 「動画情報取得」「タグ編集」と同じ FAB として配置
    // (上から ブックマーク → 動画情報取得 → タグ編集 の順になるよう最上段に置く)
    function ensureWatch() {
        const vid = WL.matchWatch(); if (!vid) return;
        if (document.querySelector('.wlext-bm-fab')) return;
        const btn = makeBtn(vid);
        btn.classList.add('wlext-bm-watch', 'wlext-bm-fab');
        document.body.appendChild(btn);
    }

    // 一覧カード: フォルダ名の右
    function findFolderName(card) {
        const divs = card.querySelectorAll('div');
        for (const d of divs) {
            const s = getComputedStyle(d);
            if (s.whiteSpace === 'nowrap' && s.textOverflow === 'ellipsis' && d.textContent.trim()) return d;
        }
        return null;
    }
    function ensureList() {
        const root = document.getElementById('root'); if (!root) return;
        root.querySelectorAll('a[href^="/watch/"]').forEach(card => {
            if (card.querySelector('.wlext-bm-btn')) return;
            const m = (card.getAttribute('href') || '').match(/\/watch\/(\d+)/); if (!m) return;
            const folderEl = findFolderName(card); if (!folderEl) return;
            folderEl.style.display = 'inline-block';
            folderEl.style.maxWidth = 'calc(100% - 2rem)';
            folderEl.style.verticalAlign = 'middle';
            const btn = makeBtn(m[1]);
            btn.classList.add('wlext-bm-inline');
            folderEl.insertAdjacentElement('afterend', btn);
        });
    }

    function ensure() {
        ensureIds();
        ensureWatch();
        ensureList();
    }
    WL.onEnsure(ensure);
    WL.onRoute(() => { if (!WL.matchWatch()) document.querySelectorAll('.wlext-bm-watch').forEach(e => e.remove()); });
})();
