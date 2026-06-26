/* =============================================================
   WomanLive 拡張 - 動画ページの拡張メタデータ表示/編集
   (評価 / 出演者 / 型番・シリーズ・メーカー・レーベル・監督 / 公開日 / ジャンル)
   ============================================================= */
(function () {
    'use strict';
    const WL = window.WLExt; const h = WL.h;

    WL._meta = WL._meta || {};
    const loading = {};

    function getMeta(vid) {
        if (WL._meta[vid]) return WL._meta[vid];
        if (!loading[vid]) {
            loading[vid] = true;
            WL.api.getMeta(vid).then(m => { WL._meta[vid] = m; loading[vid] = false; WL.requestEnsure(); })
                .catch(() => { loading[vid] = false; });
        }
        return null;
    }

    function metaToPayload(meta) {
        return {
            rating: meta.rating || 0,
            display_name: meta.display_name || '',
            model_no: meta.model_no || '',
            release_date: meta.release_date || '',
            series: meta.series || '',
            maker: meta.maker || '',
            label: meta.label || '',
            directors: meta.directors || [],
            genres: meta.genres || [],
            performers: (meta.performers || []).map(p => p.id),
        };
    }

    async function saveMeta(vid, payload) {
        await WL.api.saveMeta(vid, payload);
        // 出演者展開や file_name を含む最新版を取り直す
        const fresh = await WL.api.getMeta(vid);
        WL._meta[vid] = fresh;
        rerender(vid);
        return fresh;
    }

    function rerender(vid) {
        const root = document.getElementById('root');
        if (root) root.querySelectorAll('.wlext-rating-host, .wlext-meta-block').forEach(e => e.remove());
        // タイトル(h1)を表示動画名で更新
        const meta = WL._meta[vid];
        if (meta) {
            const h1 = findTitle();
            if (h1) h1.textContent = meta.display_name || meta.file_name || h1.textContent;
        }
        WL.requestEnsure();
    }

    /* ---------- アンカー探索 ---------- */
    function findTitle() {
        const root = document.getElementById('root'); if (!root) return null;
        return root.querySelector('h1');
    }
    function findInfoBox() {
        const root = document.getElementById('root'); if (!root) return null;
        const divs = root.querySelectorAll('div');
        for (const d of divs) {
            if (d.childElementCount === 0 && d.textContent.trim() === '長さ:') {
                const grid = d.parentElement;
                if (grid && grid.parentElement) return grid.parentElement;
            }
        }
        return null;
    }

    /* ---------- 各セクション描画 ---------- */
    function buildRating(vid, meta) {
        const host = h('div', { class: 'wlext-rating-host' });
        const stars = WL.starsEl(meta.rating || 0, async (n) => {
            try { const p = metaToPayload(meta); p.rating = n; meta.rating = n; await saveMeta(vid, p); WL.toast('評価を保存しました', 'success'); }
            catch (e) { WL.toast('評価の保存に失敗: ' + e.message, 'error'); }
        });
        host.appendChild(stars);
        return host;
    }

    function buildMetaBlock(vid, meta) {
        const block = h('div', { class: 'wlext-meta-block' });

        // --- ジャンル (タグの下) ---
        if (meta.genres && meta.genres.length) {
            const g = h('div', { class: 'wlext-genres' });
            meta.genres.forEach(name => {
                g.appendChild(h('span', { class: 'wlext-genre-chip', title: '「' + name + '」で検索', onClick: () => WL.searchBy('@genre:"' + name + '"') }, [
                    h('span', null, name),
                    excludeIcon('@notgenre:"' + name + '"', name)
                ]));
            });
            block.appendChild(g);
        }

        // --- 出演者 (型番等の上) ---
        if (meta.performers && meta.performers.length) {
            const ref = meta.release_date || meta.video_date;
            const row = h('div', { class: 'wlext-performers' });
            meta.performers.forEach(p => {
                const imgHost = h('div', { class: 'wlext-performer-img', title: '出演者ページを開く', onClick: () => WL.openPerformer(p.id) });
                if (p.has_image) {
                    const im = h('img', { alt: p.name });
                    im.onerror = () => { imgHost.textContent = '👤'; };
                    im.src = WL.api.performerImageUrl(p.id);
                    imgHost.appendChild(im);
                } else { imgHost.textContent = '👤'; }

                const age = WL.ageYM(p.birthday, ref);
                const nameRow = h('div', { class: 'wlext-performer-name-row' }, [
                    h('span', { class: 'wlext-performer-name', title: '「' + p.name + '」で検索', onClick: () => WL.searchBy('@performer:' + p.id) }, p.name),
                    excludeIcon('@notperformer:' + p.id, p.name)
                ]);
                const card = h('div', { class: 'wlext-performer-card' }, [
                    imgHost, nameRow,
                    age ? h('div', { class: 'wlext-performer-age' }, age) : null
                ]);
                row.appendChild(card);
            });
            block.appendChild(row);
        }

        // --- 拡張情報 (型番/シリーズ/メーカー/レーベル/監督/公開日) ---
        const info = h('div', { class: 'wlext-infobox' });
        info.appendChild(h('button', { class: 'wlext-edit-btn', onClick: () => openEditDialog(vid, meta) }, '✎ 詳細情報を編集'));
        const grid = h('div', { class: 'wlext-detail-grid' });

        function addRow(key, valNode) {
            grid.appendChild(h('div', { class: 'wlext-key' }, key + ':'));
            grid.appendChild(h('div', { class: 'wlext-val' }, valNode));
        }
        function linkVal(text, token) { return h('span', { class: 'wlext-link', title: '「' + text + '」で検索', onClick: () => WL.searchBy(token) }, text); }
        // 包含リンク + 除外ボタン(虫メガネ+マイナス) を並べる
        function valEx(text, incToken, excToken) { return h('span', { class: 'wlext-val-pair' }, [linkVal(text, incToken), excludeIcon(excToken, text)]); }

        if (meta.release_date) {
            addRow('公開日', [WL.fmtDate(meta.release_date), h('span', { class: 'wlext-release-ago' }, WL.ymAgo(meta.release_date))]);
        }
        if (meta.file_name) addRow('動画ファイル名', meta.file_name);
        if (meta.model_no) addRow('品番', linkVal(meta.model_no, '@model:"' + meta.model_no + '"'));
        if (meta.series) addRow('シリーズ名', valEx(meta.series, '@series:"' + meta.series + '"', '@notseries:"' + meta.series + '"'));
        if (meta.maker) addRow('メーカー', valEx(meta.maker, '@maker:"' + meta.maker + '"', '@notmaker:"' + meta.maker + '"'));
        if (meta.label) addRow('レーベル', valEx(meta.label, '@label:"' + meta.label + '"', '@notlabel:"' + meta.label + '"'));
        if (meta.directors && meta.directors.length) {
            const multi = h('span', { class: 'wlext-multi' });
            meta.directors.forEach(d => multi.appendChild(valEx(d, '@director:"' + d + '"', '@notdirector:"' + d + '"')));
            addRow('作品監督', multi);
        }

        if (grid.childElementCount === 0) {
            info.appendChild(h('div', { style: { color: 'var(--text-secondary,#888)' } }, '詳細情報は未設定です。右上の「詳細情報を編集」から登録できます。'));
        } else {
            info.appendChild(grid);
        }
        block.appendChild(info);
        return block;
    }

    function searchIcon() {
        return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';
    }
    // 除外検索ボタン: 虫メガネ＋マイナス(zoom-out)。包含検索(accent色)と区別するため赤系で表示。
    function excludeIcon(token, label) {
        return h('span', {
            class: 'wlext-exclude-btn', title: '「' + label + '」を除外して検索',
            html: WL.iconSvg('zoom-out', 14),
            onClick: (e) => { e.stopPropagation(); WL.searchBy(token); }
        });
    }

    /* ---------- 編集ダイアログ ---------- */
    function openEditDialog(vid, meta) {
        const temp = JSON.parse(JSON.stringify(metaToPayload(meta)));

        const ratingHost = h('div');
        const ratingEl = WL.starsEl(temp.rating, (n) => { temp.rating = n; });
        ratingHost.appendChild(ratingEl);

        const inDisplay = h('input', { class: 'wlext-input', value: temp.display_name });
        const inModel = h('input', { class: 'wlext-input', value: temp.model_no });
        const inRelease = h('input', { class: 'wlext-input', type: 'date', value: normalizeDateInput(temp.release_date) });
        const inSeries = h('input', { class: 'wlext-input', value: temp.series });
        const inMaker = h('input', { class: 'wlext-input', value: temp.maker });
        const inLabel = h('input', { class: 'wlext-input', value: temp.label });
        const directorsInput = WL.chipInput(temp.directors, '監督名を入力してEnter');
        const performersInput = WL.performerInput(meta.performers || []);
        const genresInput = WL.chipInput(temp.genres, 'ジャンルを入力してEnter');

        const field = (label, node) => h('div', { class: 'wlext-field' }, [h('label', null, label), node]);

        const body = h('div', null, [
            field('評価', ratingHost),
            field('表示動画名 (タイトルを置き換えます)', inDisplay),
            field('出演者', performersInput.el),
            field('ジャンル', genresInput.el),
            h('div', { class: 'wlext-row2' }, [field('公開日', inRelease), field('品番', inModel)]),
            h('div', { class: 'wlext-row2' }, [field('シリーズ名', inSeries), field('作品監督', directorsInput.el)]),
            h('div', { class: 'wlext-row2' }, [field('メーカー', inMaker), field('レーベル', inLabel)]),
        ]);

        WL.dialog('詳細情報を編集', body, {
            onSave: async (close) => {
                const payload = {
                    rating: temp.rating,
                    display_name: inDisplay.value.trim(),
                    model_no: inModel.value.trim(),
                    release_date: inRelease.value.trim(),
                    series: inSeries.value.trim(),
                    maker: inMaker.value.trim(),
                    label: inLabel.value.trim(),
                    directors: directorsInput.getValues(),
                    genres: genresInput.getValues(),
                    performers: performersInput.getValues().map(p => p.id),
                };
                try { await saveMeta(vid, payload); WL.toast('保存しました', 'success'); close(); }
                catch (e) { WL.toast('保存に失敗: ' + e.message, 'error'); }
            }
        });
    }

    function normalizeDateInput(s) {
        if (!s) return '';
        const d = WL.parseDate(s); if (!d) return '';
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    /* ---------- DMM(FANZA) 商品検索フロー ---------- */
    function searchFabSvg() {
        return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';
    }
    function ensureSearchFab(vid) {
        if (document.querySelector('.wlext-search-fab')) return;
        const btn = h('button', {
            class: 'wlext-search-fab',
            title: '動画情報を検索（品番でFANZA商品検索し、メタデータを自動設定）',
            html: searchFabSvg(),
            onClick: () => runDmmSearch(vid)
        });
        document.body.appendChild(btn);
    }

    /* ---------- タグ編集 (本家のタグ編集を ext のグループ対応ダイアログで統一) ---------- */
    // 本家のタグ編集FAB(右下 bottom:2rem の単色ボタン)を隠し、ext のFABに置き換える。
    function hideNativeTagFab() {
        document.querySelectorAll('button').forEach(b => {
            if (b.className && String(b.className).indexOf('wlext') >= 0) return;
            const cs = getComputedStyle(b);
            if (cs.position !== 'fixed') return;
            const right = parseFloat(cs.right), bottom = parseFloat(cs.bottom);
            if (Math.abs(right - 32) <= 8 && Math.abs(bottom - 32) <= 8) {
                b.style.display = 'none';
                b.setAttribute('data-wlext-tagfab-hidden', '1');
            }
        });
    }
    function ensureTagFab(vid) {
        hideNativeTagFab();
        if (document.querySelector('.wlext-tag-fab')) return;
        const btn = h('button', {
            class: 'wlext-tag-fab',
            title: 'タグを編集',
            html: WL.iconSvg('tag', 22),
            onClick: () => openTagEditor(vid)
        });
        document.body.appendChild(btn);
    }
    async function openTagEditor(vid) {
        let current = [];
        try { const r = await WL.api.getVideoTags(vid); current = r.tags || []; } catch (e) { }
        WL.presetTagDialog({
            title: 'タグを編集',
            current,
            loadPresets: () => WL.loadVideoTagPresets(),
            savePresets: (arr) => WL.saveVideoTagPresets(arr),
            onSave: async (selected) => {
                try {
                    await WL.api.setVideoTags(vid, selected);
                    WL.toast('タグを保存しました', 'success');
                    setTimeout(() => location.reload(), 350);
                } catch (e) { WL.toast('タグの保存に失敗: ' + e.message, 'error'); }
            }
        });
    }

    async function runDmmSearch(vid) {
        const meta = WL._meta[vid];
        if (meta && !meta.model_no) { WL.toast('品番が設定されていません。先に品番を登録してください。', 'error'); return; }
        WL.toast('FANZAで検索中...');
        let data;
        try { data = await WL.api.dmmSearch(vid); }
        catch (e) { WL.toast(e.message || '検索に失敗しました', 'error'); return; }
        if (!data.items || !data.items.length) { WL.toast('商品情報が見つかりませんでした（品番: ' + (data.keyword || '') + '）', 'error'); return; }
        if (data.items.length === 1) showDmmPreview(vid, data.items[0]);
        else showDmmSelect(vid, data.items);
    }

    function itemThumb(item) {
        return item.imageLarge
            ? h('img', { src: item.imageLarge, class: 'wlext-dmm-thumb', loading: 'lazy', referrerpolicy: 'no-referrer' })
            : h('div', { class: 'wlext-dmm-thumb', style: { display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: '0.7rem' } }, 'no image');
    }

    function showDmmSelect(vid, items) {
        const list = h('div', { class: 'wlext-dmm-select' });
        items.forEach(item => {
            list.appendChild(h('div', { class: 'wlext-dmm-select-item', onClick: () => { close(); showDmmPreview(vid, item); } }, [
                itemThumb(item),
                h('div', { class: 'wlext-dmm-select-info' }, [
                    h('div', { class: 'wlext-dmm-select-title' }, item.title || '(無題)'),
                    h('div', { class: 'wlext-dmm-select-sub' }, [item.date, item.maker, (item.actresses || []).join(', ')].filter(Boolean).join(' / '))
                ])
            ]));
        });
        const close = WL.dialog('検索結果が複数あります（選択してください）', list, {});
    }

    function showDmmPreview(vid, item) {
        const grid = h('div', { class: 'wlext-detail-grid', style: { fontSize: '0.85rem' } });
        const addRow = (k, v) => { if (v && (!Array.isArray(v) || v.length)) { grid.appendChild(h('div', { class: 'wlext-key' }, k)); grid.appendChild(h('div', { class: 'wlext-val' }, Array.isArray(v) ? v.join('、') : v)); } };
        addRow('表示動画名', item.title);
        addRow('公開日', item.date ? WL.fmtDate(item.date) : '');
        addRow('出演者', item.actresses);
        addRow('ジャンル', item.genres);
        addRow('シリーズ名', item.series);
        addRow('メーカー', item.maker);
        addRow('レーベル', item.label);
        addRow('作品監督', item.directors);

        const body = h('div', null, [
            h('div', { style: { display: 'flex', gap: '1rem', marginBottom: '0.8rem' } }, [
                itemThumb(item),
                h('div', { style: { fontSize: '0.78rem', color: 'var(--text-secondary,#888)' } },
                    '以下の内容でメタデータを設定します。よろしければ「設定する」を押してください。カバー画像が未設定の場合は右の画像を取得して設定します。')
            ]),
            grid
        ]);

        WL.dialog('この内容で設定しますか？', body, {
            saveLabel: '設定する',
            onSave: async (close) => { await applyDmm(vid, item); close(); }
        });
    }

    async function applyDmm(vid, item) {
        try {
            const r = await WL.api.dmmApply(vid, item);
            delete WL._meta[vid];
            try { WL._meta[vid] = await WL.api.getMeta(vid); } catch (e) { }
            rerender(vid);
            if (WL.refreshCover) WL.refreshCover(vid);
            WL.toast('メタデータを設定しました' + (r.coverSet ? '（カバー画像も取得）' : ''), 'success');
        } catch (e) { WL.toast('設定に失敗: ' + e.message, 'error'); }
    }

    /* ---------- ensure ---------- */
    function ensure() {
        const vid = WL.matchWatch();
        if (!vid) return;
        ensureSearchFab(vid);
        ensureTagFab(vid);
        const meta = getMeta(vid);
        if (!meta) return;

        // 評価 (タイトル直下)
        const root = document.getElementById('root');
        if (root && !root.querySelector('.wlext-rating-host')) {
            const title = findTitle();
            if (title && title.parentElement) {
                title.parentElement.insertBefore(buildRating(vid, meta), title.nextSibling);
            }
        }
        // メタブロック (既存情報の上)
        if (root && !root.querySelector('.wlext-meta-block')) {
            const infoBox = findInfoBox();
            if (infoBox && infoBox.parentElement) {
                infoBox.parentElement.insertBefore(buildMetaBlock(vid, meta), infoBox);
            }
        }
    }

    WL.onEnsure(ensure);

    // 動画が切り替わったら、古い注入ノードを除去し最新を取り直す
    WL.onRoute(() => {
        const root = document.getElementById('root');
        if (root) root.querySelectorAll('.wlext-rating-host, .wlext-meta-block').forEach(e => e.remove());
        // 視聴ページ以外では追加FAB(検索/タグ編集)を除去
        if (!WL.matchWatch()) document.querySelectorAll('.wlext-search-fab, .wlext-tag-fab').forEach(e => e.remove());
        const vid = WL.matchWatch();
        if (vid) { delete WL._meta[vid]; }
    });
})();
