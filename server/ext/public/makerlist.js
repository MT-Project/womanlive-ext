/* =============================================================
   WomanLive 拡張 - メーカー一覧 (/makers)
   メーカーごとに 画像(1:1)・名前(ふりがな)・キャッチコピー・TOP10タグ・
   レーベル一覧・平均評価・FANZAリンクを、横長のリストで表示する。
   ・画像/名前クリック  … そのメーカーで検索
   ・TOP10タグクリック  … メーカー×タグの AND 検索
   ・レーベルクリック   … そのレーベルで検索
   ・⋮メニュー          … メーカー情報の編集 / FANZAからの取得
   ============================================================= */
(function () {
    'use strict';
    const WL = window.WLExt; const h = WL.h;

    const makerHref = (name) => WL.searchHref('@maker:"' + name + '"');
    const makerTagHref = (name, tag) => WL.searchHref('@maker:"' + name + '" tag:"' + tag + '"');
    const labelHref = (label) => WL.searchHref('@label:"' + label + '"');
    // 「レーベルなし」だけは、そのメーカーのレーベル未設定作品を引く
    const noLabelHref = (maker) => WL.searchHref('@maker:"' + maker + '" label:none');

    function ensure() {
        const on = location.pathname === '/makers';
        const existing = document.querySelector('.wlext-maker-page');
        if (!on) { if (existing) existing.remove(); return; }
        if (existing) return;
        render();
    }

    /* ---------- ⋮ メニュー (リスト表示の動画メニューと同じ見た目・配置) ---------- */
    let menuEl = null, backdrop = null;
    function closeMenu() { if (menuEl) menuEl.remove(); if (backdrop) backdrop.remove(); menuEl = backdrop = null; }
    function openMenu(anchor, items) {
        closeMenu();
        backdrop = h('div', { class: 'wlext-sel-menu-backdrop', onClick: closeMenu });
        menuEl = h('div', { class: 'wlext-sel-menu wlext-sel-menu-anchored' }, items.map(it =>
            h('div', { class: 'wlext-sel-menu-item', onClick: () => { closeMenu(); it.onClick(); } },
                [WL.icon(it.icon, 15), h('span', null, it.label)])));
        document.body.appendChild(backdrop);
        document.body.appendChild(menuEl);
        // アンカー(⋮ボタン)直下に配置。画面外なら上側へ反転。
        const r = anchor.getBoundingClientRect();
        let left = r.right - menuEl.offsetWidth; if (left < 8) left = 8;
        let top = r.bottom + 6;
        if (top + menuEl.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - menuEl.offsetHeight - 6);
        menuEl.style.left = left + 'px';
        menuEl.style.top = top + 'px';
    }

    async function render() {
        const page = h('div', { class: 'wlext-maker-page wlext-ext-page' });
        page.appendChild(WL.pageHeader());
        const container = h('div', { class: 'wlext-pp-container' }, h('div', { style: { color: 'var(--text-secondary,#888)' } }, '読み込み中...'));
        page.appendChild(container);
        document.body.appendChild(page);
        window.scrollTo(0, 0);
        WL.setDocTitle('メーカー一覧');

        let list;
        try { list = await WL.api.makersList(); }
        catch (e) { container.innerHTML = ''; container.appendChild(h('div', null, '読み込みに失敗しました: ' + e.message)); return; }

        const state = { sort: 'count', dir: 'desc' };

        container.innerHTML = '';
        container.appendChild(WL.pageTitle('factory', 'メーカー一覧（' + list.length + '件）'));

        const controls = h('div', { class: 'wlext-plist-controls' });
        const sorter = WL.sortRow(
            [['name', 'メーカー名', 'asc'], ['count', '動画本数', 'desc'], ['rating', '評価', 'desc']],
            state, renderList, 'wlext_sort_makers');
        controls.appendChild(sorter.el);
        container.appendChild(controls);

        const listEl = h('div', { class: 'wlext-maker-list' });
        container.appendChild(listEl);

        function cmp(a, b) {
            const dir = state.dir === 'asc' ? 1 : -1;
            const byName = WL.nameCompare(a.furigana || a.name, b.furigana || b.name);
            if (state.sort === 'name') return byName * dir;
            if (state.sort === 'count') return ((a.count || 0) - (b.count || 0)) * dir || byName;
            // rating: 未評価(null)は常に末尾
            const ra = a.avgRating, rb = b.avgRating;
            if (ra == null && rb == null) return byName;
            if (ra == null) return 1; if (rb == null) return -1;
            return (ra - rb) * dir || byName;
        }

        function renderList() {
            const sorted = list.slice().sort(cmp);
            listEl.innerHTML = '';
            if (!sorted.length) { listEl.appendChild(h('div', { style: { color: 'var(--text-secondary,#888)' } }, 'メーカーが設定された動画がありません')); return; }
            sorted.forEach(m => listEl.appendChild(row(m)));
        }

        /* ---------- 1行 ---------- */
        function row(m) {
            /* -- 画像 (1:1・既定は色背景+メーカー名。クリックで検索、右下から画像設定) -- */
            const img = WL.navA(makerHref(m.name), { class: 'wlext-maker-img', title: '「' + m.name + '」で検索' });
            function paintImg() {
                img.innerHTML = '';
                if (m.hasImage) {
                    img.style.background = '';
                    const im = h('img', { loading: 'lazy', alt: m.name });
                    im.onerror = () => { m.hasImage = false; paintImg(); };
                    im.src = WL.api.makerImageUrl(m.name, Date.now());
                    img.appendChild(im);
                } else {
                    img.style.background = WL.colorFor(m.name);
                    img.appendChild(h('div', { class: 'wlext-tag-thumb-label' }, m.name));
                }
                img.appendChild(h('div', { class: 'wlext-series-count', title: m.count + '本' }, String(m.count)));
                const edit = h('div', { class: 'wlext-tag-edit', title: 'メーカー画像を設定' }, WL.icon('image', 15));
                edit.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); pickImage(); });
                img.appendChild(edit);
            }
            function pickImage() {
                const input = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
                input.addEventListener('change', () => {
                    const file = input.files && input.files[0]; if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => WL.cropDialog(reader.result, async (dataUrl) => {
                        try { await WL.api.setMakerImage(m.name, dataUrl); m.hasImage = true; paintImg(); WL.toast('メーカー画像を登録しました', 'success'); }
                        catch (e) { WL.toast('登録に失敗: ' + e.message, 'error'); }
                    }, { aspect: [1, 1], outW: 600, title: 'メーカー画像を切り取り', hint: 'ドラッグで位置調整・スライダーで拡大し、正方形に切り取ります。' });
                    reader.readAsDataURL(file);
                });
                document.body.appendChild(input); input.click(); setTimeout(() => input.remove(), 1000);
            }
            paintImg();

            /* -- 名前 + ふりがな -- */
            const furiEl = h('span', { class: 'wlext-maker-furi' });
            const nameEl = WL.navA(makerHref(m.name), { class: 'wlext-maker-name', title: '「' + m.name + '」で検索' },
                [h('span', null, m.name), furiEl]);
            const paintName = () => { furiEl.textContent = m.furigana || ''; };
            paintName();

            /* -- キャッチコピー (クリックで編集) -- */
            const catchEl = h('div', { class: 'wlext-maker-catch', title: 'クリックして編集' });
            function paintCatch() {
                catchEl.textContent = m.catchCopy || 'キャッチコピーを追加';
                catchEl.classList.toggle('empty', !m.catchCopy);
            }
            catchEl.addEventListener('click', () => {
                const input = h('input', { class: 'wlext-input wlext-maker-catch-input', value: m.catchCopy || '', placeholder: 'キャッチコピー' });
                catchEl.replaceWith(input);
                input.focus(); input.select();
                let done = false;
                const finish = async (save) => {
                    if (done) return; done = true;
                    const v = input.value.trim();
                    input.replaceWith(catchEl);
                    if (!save || v === (m.catchCopy || '')) return;
                    try { await WL.api.saveMaker({ name: m.name, catch_copy: v }); m.catchCopy = v; paintCatch(); }
                    catch (e) { WL.toast('保存に失敗: ' + e.message, 'error'); }
                };
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') finish(true);
                    else if (e.key === 'Escape') finish(false);
                });
                input.addEventListener('blur', () => finish(true));
            });
            paintCatch();

            /* -- TOP10タグ (メーカー×タグの AND 検索) -- */
            const tagsEl = h('div', { class: 'wlext-maker-tags' },
                (m.topTags || []).map(t => WL.navA(makerTagHref(m.name, t.name),
                    { class: 'wlext-maker-tag', title: '「' + m.name + '」×「' + t.name + '」で検索' },
                    t.name + '(' + t.count + ')')));

            /* -- レーベル一覧 (開閉。本数の多い順) -- */
            const labels = m.labels || [];
            const labelsEl = labels.length
                ? h('details', { class: 'wlext-maker-labels' }, [
                    h('summary', null, 'レーベル一覧（' + labels.length + '）'),
                    h('div', { class: 'wlext-maker-label-list' },
                        labels.map(l => WL.navA(l.none ? noLabelHref(m.name) : labelHref(l.name),
                            {
                                class: 'wlext-maker-label' + (l.none ? ' none' : ''),
                                title: l.none ? '「' + m.name + '」のレーベル未設定の作品を検索' : '「' + l.name + '」で検索'
                            },
                            l.name + '(' + l.count + ')')))
                ])
                : null;

            /* -- 右側: 評価 / ⋮ / FANZA -- */
            const ratingEl = h('div', { class: 'wlext-series-rating' });
            if (m.avgRating != null) {
                ratingEl.appendChild(WL.starsEl(Math.round(m.avgRating)));
                ratingEl.appendChild(h('span', { class: 'wlext-series-ratingnum' }, m.avgRating.toFixed(1)));
            } else {
                ratingEl.appendChild(h('span', { style: { color: 'var(--text-secondary,#888)', fontSize: '0.75rem' } }, '評価なし'));
            }

            const menuBtn = h('div', { class: 'wlext-maker-menu-btn', title: 'メーカーの操作' }, '⋮');
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openMenu(menuBtn, [
                    { icon: 'pencil', label: 'メーカー情報編集', onClick: () => editDialog(m, repaint) },
                    { icon: 'search', label: 'メーカー情報取得', onClick: () => fetchInfo(m, repaint) }
                ]);
            });

            const fanzaEl = h('a', {
                class: 'wlext-maker-fanza', href: m.listUrl || '#', target: '_blank', rel: 'noopener noreferrer',
                title: 'FANZAのリストページを開く'
            }, 'FANZA');
            const paintFanza = () => {
                fanzaEl.href = m.listUrl || '#';
                fanzaEl.style.display = m.listUrl ? '' : 'none';
            };
            paintFanza();

            function repaint() { paintName(); paintCatch(); paintFanza(); }

            return h('div', { class: 'wlext-maker-row' }, [
                img,
                h('div', { class: 'wlext-maker-body' }, [nameEl, catchEl, tagsEl, labelsEl]),
                h('div', { class: 'wlext-maker-side' }, [
                    h('div', { class: 'wlext-maker-side-top' }, [ratingEl, menuBtn]),
                    fanzaEl
                ])
            ]);
        }

        sorter.paint();
        renderList();
    }

    /* ---------- メーカー情報の編集 ---------- */
    function editDialog(m, onDone) {
        const inFuri = h('input', { class: 'wlext-input', value: m.furigana || '', placeholder: 'めーかーめい' });
        const inCatch = h('input', { class: 'wlext-input', value: m.catchCopy || '' });
        const inUrl = h('input', { class: 'wlext-input', value: m.listUrl || '', placeholder: 'https://...' });
        const field = (label, node) => h('div', { class: 'wlext-field' }, [h('label', null, label), node]);

        const body = h('div', null, [
            h('div', { style: { fontSize: '0.8rem', color: 'var(--text-secondary,#888)', marginBottom: '0.6rem' } },
                'メーカー名は動画のメタデータそのものです。名前を変えるときは設定画面の「メタデータの置換」を使ってください。'),
            field('メーカー名', h('div', { class: 'wlext-maker-readonly' }, m.name)),
            field('ふりがな', inFuri),
            field('キャッチコピー', inCatch),
            field('リストページURL (FANZA)', inUrl)
        ]);

        WL.dialog('メーカー情報を編集 — ' + m.name, body, {
            onSave: async (close) => {
                try {
                    await WL.api.saveMaker({
                        name: m.name, furigana: inFuri.value, catch_copy: inCatch.value, list_url: inUrl.value
                    });
                    m.furigana = inFuri.value.trim();
                    m.catchCopy = inCatch.value.trim();
                    m.listUrl = inUrl.value.trim();
                    onDone();
                    WL.toast('メーカー情報を保存しました', 'success');
                    close();
                } catch (e) { WL.toast('保存に失敗: ' + e.message, 'error'); }
            }
        });
    }

    /* ---------- FANZA からのメーカー情報取得 ---------- */
    async function fetchInfo(m, onDone) {
        WL.toast('FANZAでメーカーを検索中...');
        let data;
        try { data = await WL.api.dmmMakerSearch(m.name); }
        catch (e) { WL.toast(e.message || '検索に失敗しました', 'error'); return; }
        if (data.exact && data.exact.length === 1) showFetchPreview(m, data.exact[0], onDone);
        else showFetchSelect(m, data, onDone);
    }

    // 完全一致しなかったとき: 候補から選ばせる (名前を変えて再検索もできる)
    function showFetchSelect(m, data, onDone) {
        const input = h('input', { class: 'wlext-input', value: m.name, placeholder: 'メーカー名' });
        const listEl = h('div', { class: 'wlext-dmm-select' });
        const msg = (t) => h('div', { style: { fontSize: '0.8rem', color: 'var(--text-secondary,#888)' } }, t);

        function paint(d) {
            listEl.innerHTML = '';
            const items = (d.exact && d.exact.length ? d.exact : d.candidates) || [];
            if (!items.length) { listEl.appendChild(msg('候補が見つかりませんでした。名前を変えて検索してください。')); return; }
            items.forEach(it => listEl.appendChild(
                h('div', { class: 'wlext-dmm-select-item', onClick: () => { close(); showFetchPreview(m, it, onDone); } },
                    h('div', { class: 'wlext-dmm-select-info' }, [
                        h('div', { class: 'wlext-dmm-select-title' }, it.name),
                        h('div', { class: 'wlext-dmm-select-sub' }, it.ruby || '(読み仮名なし)')
                    ]))));
            if (d.limited) listEl.appendChild(msg('候補が多いため上位' + items.length + '件のみ表示しています。'));
        }

        async function research() {
            const q = input.value.trim(); if (!q) return;
            listEl.innerHTML = ''; listEl.appendChild(msg('検索中...'));
            try { paint(await WL.api.dmmMakerSearch(q)); }
            catch (e) { listEl.innerHTML = ''; listEl.appendChild(msg('検索に失敗しました: ' + e.message)); }
        }
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') research(); });

        const body = h('div', null, [
            h('div', { class: 'wlext-field' }, [
                h('label', null, 'メーカー名で検索（Enterで再検索）'),
                h('div', { class: 'wlext-inline' }, [input, h('button', { class: 'wlext-btn', onClick: research }, '検索')])
            ]),
            listEl
        ]);
        const close = WL.dialog('メーカーを選択してください', body, {});
        paint(data);
    }

    // 反映前の確認 (動画情報・出演者情報の取得と同じ流れ)
    function showFetchPreview(m, item, onDone) {
        const grid = h('div', { class: 'wlext-detail-grid', style: { fontSize: '0.85rem' } });
        const addRow = (k, v) => { grid.appendChild(h('div', { class: 'wlext-key' }, k)); grid.appendChild(h('div', { class: 'wlext-val' }, v || '(なし)')); };
        addRow('メーカー名 (FANZA)', item.name);
        addRow('読み仮名', item.ruby);
        addRow('リストページURL', item.listUrl);

        const body = h('div', null, [
            h('div', { style: { fontSize: '0.8rem', color: 'var(--text-secondary,#888)', marginBottom: '0.7rem' } },
                '「' + m.name + '」に、読み仮名(ふりがな)とリストページURLを設定します。メーカー名そのものは変更しません。'),
            grid
        ]);

        WL.dialog('この内容で設定しますか？', body, {
            saveLabel: '設定する',
            onSave: async (close) => {
                try {
                    await WL.api.saveMaker({ name: m.name, furigana: item.ruby || '', list_url: item.listUrl || '' });
                    m.furigana = item.ruby || '';
                    m.listUrl = item.listUrl || '';
                    onDone();
                    WL.toast('メーカー情報を設定しました', 'success');
                    close();
                } catch (e) { WL.toast('設定に失敗: ' + e.message, 'error'); }
            }
        });
    }

    WL.onEnsure(ensure);
})();
