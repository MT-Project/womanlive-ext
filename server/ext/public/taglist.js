/* =============================================================
   WomanLive 拡張 - タグ一覧 (/tags)
   登録動画のタグをサムネイル付きで一覧表示 (UI はシリーズ一覧を踏襲)。
   既定サムネイルは無地背景にタグ名。右下の画像ボタンからカスタム
   サムネイル(推奨 16:9)を登録できる(出演者画像と同様の操作感)。
   サムネ/タグ名クリックでそのタグを検索。ソート: タグ名 / 動画本数。
   ============================================================= */
(function () {
    'use strict';
    const WL = window.WLExt; const h = WL.h;

    function ensure() {
        const on = location.pathname === '/tags';
        const existing = document.querySelector('.wlext-tags-page');
        if (!on) { if (existing) existing.remove(); return; }
        if (existing) return;
        render();
    }

    // タグ名から安定した背景色を生成 (無地背景)
    function colorFor(s) {
        let n = 0;
        s = String(s || '');
        for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0;
        return 'hsl(' + (n % 360) + ', 42%, 40%)';
    }

    async function render() {
        const page = h('div', { class: 'wlext-tags-page wlext-ext-page' });
        page.appendChild(WL.pageHeader());
        const container = h('div', { class: 'wlext-pp-container' }, h('div', { style: { color: 'var(--text-secondary,#888)' } }, '読み込み中...'));
        page.appendChild(container);
        document.body.appendChild(page);
        window.scrollTo(0, 0);

        let list;
        try { list = await WL.api.tagsList(); }
        catch (e) { container.innerHTML = ''; container.appendChild(h('div', null, '読み込みに失敗しました: ' + e.message)); return; }

        const state = { sort: 'name', dir: 'asc' };

        container.innerHTML = '';
        container.appendChild(WL.pageTitle('tag', 'タグ一覧（' + list.length + '件）'));

        // ---- 並び替え ----
        const controls = h('div', { class: 'wlext-plist-controls' });
        const sorter = WL.sortRow([['name', 'タグ名', 'asc'], ['count', '動画本数', 'desc']], state, renderGrid);
        controls.appendChild(sorter.el);
        controls.appendChild(h('div', { class: 'wlext-plist-ctl-label' },
            'サムネイルの推奨比率は 16:9（例: 640×360）です。各タグ右下の画像ボタンから変更できます。'));
        container.appendChild(controls);

        const grid = h('div', { class: 'wlext-series-grid' });
        container.appendChild(grid);

        function cmp(a, b) {
            const dir = state.dir === 'asc' ? 1 : -1;
            const byName = WL.nameCompare(a.name, b.name);
            if (state.sort === 'name') return byName * dir;
            return ((a.count || 0) - (b.count || 0)) * dir || byName;
        }

        function renderGrid() {
            const sorted = list.slice().sort(cmp);
            grid.innerHTML = '';
            if (!sorted.length) { grid.appendChild(h('div', { style: { color: 'var(--text-secondary,#888)' } }, 'タグが設定された動画がありません')); return; }
            sorted.forEach(t => grid.appendChild(card(t)));
        }

        function card(tag) {
            const thumb = h('div', { class: 'wlext-video-thumb wlext-tag-thumb' });

            function paintThumb() {
                thumb.innerHTML = '';
                if (tag.hasThumb) {
                    thumb.style.background = '';
                    const im = h('img', { loading: 'lazy', alt: tag.name });
                    im.onerror = () => { tag.hasThumb = false; paintThumb(); };
                    im.src = WL.api.tagThumbUrl(tag.name, Date.now());
                    thumb.appendChild(im);
                } else {
                    thumb.style.background = colorFor(tag.name);
                    thumb.appendChild(h('div', { class: 'wlext-tag-thumb-label' }, tag.name));
                }
                // 動画本数: サムネイル右上の角丸バッジ (シリーズ一覧と共通)
                thumb.appendChild(h('div', { class: 'wlext-series-count', title: tag.count + '本' }, String(tag.count)));
                // 編集ボタン: サムネイル右下 (クリックでサムネイル編集)
                const edit = h('div', { class: 'wlext-tag-edit', title: 'サムネイルを編集' }, WL.icon('image', 15));
                edit.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); startEdit(); });
                thumb.appendChild(edit);
            }

            function pickAndCrop() {
                const input = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
                input.addEventListener('change', () => {
                    const file = input.files && input.files[0]; if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => WL.cropDialog(reader.result, async (dataUrl) => {
                        try { await WL.api.setTagThumb(tag.name, dataUrl); tag.hasThumb = true; paintThumb(); WL.toast('サムネイルを登録しました', 'success'); }
                        catch (e) { WL.toast('登録に失敗: ' + e.message, 'error'); }
                    }, { aspect: [16, 9], outW: 640, title: 'タグサムネイルを切り取り', hint: 'ドラッグで位置調整・スライダーで拡大。推奨比率 16:9（640×360）で切り取ります。' });
                    reader.readAsDataURL(file);
                });
                document.body.appendChild(input); input.click(); setTimeout(() => input.remove(), 1000);
            }

            async function resetToDefault() {
                try { await WL.api.deleteTagThumb(tag.name); tag.hasThumb = false; paintThumb(); WL.toast('既定のサムネイルに戻しました', 'success'); }
                catch (e) { WL.toast('リセットに失敗: ' + e.message, 'error'); }
            }

            // スクリーンショットから選ぶピッカー (下部に 決定 / 他の画像へ更新 / ローカルから選択)
            function startEdit() {
                let selectedId = null;
                const overlay = h('div', { class: 'wlext-overlay', onClick: (e) => { if (e.target === overlay) close(); } });
                function close() { overlay.remove(); document.removeEventListener('keydown', onKey); }
                function onKey(e) { if (e.key === 'Escape') close(); }

                const grid = h('div', { class: 'wlext-ss-grid wlext-ss-pick-grid' });
                const decideBtn = h('button', { class: 'wlext-btn wlext-btn-primary', onClick: onDecide }, '決定');
                decideBtn.disabled = true;
                const shuffleBtn = h('button', { class: 'wlext-btn', onClick: () => loadShots() }, '他の画像へ更新');
                const localBtn = h('button', { class: 'wlext-btn', onClick: () => { close(); pickAndCrop(); } }, 'ローカルから選択');

                const right = h('div', { class: 'wlext-inline' }, [decideBtn, shuffleBtn, localBtn]);
                const footer = h('div', { class: 'wlext-dialog-footer' });
                if (tag.hasThumb) {
                    footer.appendChild(h('button', {
                        class: 'wlext-btn', style: { marginRight: 'auto' },
                        onClick: () => { close(); resetToDefault(); }
                    }, '既定に戻す'));
                }
                footer.appendChild(right);

                const dlg = h('div', { class: 'wlext-dialog' }, [
                    h('div', { class: 'wlext-dialog-header' }, [h('span', null, 'サムネイルを編集 — ' + tag.name), h('span', { class: 'wlext-close-x', onClick: close }, '✕')]),
                    h('div', { class: 'wlext-dialog-body' }, grid),
                    footer
                ]);
                overlay.appendChild(dlg);
                document.addEventListener('keydown', onKey);
                document.body.appendChild(overlay);

                function setSelected(card, id) {
                    grid.querySelectorAll('.wlext-ss-pick-card').forEach(c => c.classList.remove('wlext-ss-sel'));
                    card.classList.add('wlext-ss-sel');
                    selectedId = id; decideBtn.disabled = false;
                }

                async function loadShots() {
                    selectedId = null; decideBtn.disabled = true;
                    grid.innerHTML = '';
                    grid.appendChild(h('div', { class: 'wlext-ss-pick-msg' }, '読み込み中...'));
                    let shots;
                    try { shots = await WL.api.tagScreenshots(tag.name, 9); }
                    catch (e) { grid.innerHTML = ''; grid.appendChild(h('div', { class: 'wlext-ss-pick-msg' }, '読み込みに失敗しました: ' + e.message)); return; }
                    grid.innerHTML = '';
                    if (!shots.length) {
                        grid.appendChild(h('div', { class: 'wlext-ss-pick-msg' }, 'このタグの動画にスクリーンショットがありません。「ローカルから選択」で画像を登録できます。'));
                        shuffleBtn.disabled = true;
                        return;
                    }
                    shuffleBtn.disabled = false;
                    shots.forEach(s => {
                        const card = h('div', { class: 'wlext-ss-card wlext-ss-pick-card' },
                            h('img', { src: '/api/screenshot/' + s.id + '/image', loading: 'lazy' }));
                        card.addEventListener('click', () => setSelected(card, s.id));
                        grid.appendChild(card);
                    });
                }

                async function onDecide() {
                    if (selectedId == null) return;
                    decideBtn.disabled = true;
                    try {
                        await WL.api.setTagThumbFromScreenshot(tag.name, selectedId);
                        tag.hasThumb = true; paintThumb();
                        WL.toast('サムネイルを登録しました', 'success');
                        close();
                    } catch (e) { WL.toast('登録に失敗: ' + e.message, 'error'); decideBtn.disabled = false; }
                }

                loadShots();
            }

            paintThumb();
            const nameEl = h('div', { class: 'wlext-series-name' }, tag.name);
            const url = '/search?q=' + encodeURIComponent('@tag:"' + tag.name + '"');
            return WL.navA(url, { class: 'wlext-series-card wlext-tag-card', title: '「' + tag.name + '」で検索' }, [thumb, nameEl]);
        }

        sorter.paint();
        renderGrid();
    }

    WL.onEnsure(ensure);
})();
