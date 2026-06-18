/* =============================================================
   WomanLive 拡張 - 出演者ページ (React 未定義ルート /performer/:id を描画)
   ============================================================= */
(function () {
    'use strict';
    const WL = window.WLExt; const h = WL.h;

    let currentId = null;

    function ensure() {
        const id = WL.matchPerformer();
        const existing = document.querySelector('.wlext-performer-page');
        if (!id) {
            if (existing) { existing.remove(); currentId = null; }
            return;
        }
        if (existing && currentId === id) return;
        if (existing) existing.remove();
        currentId = id;
        renderPage(id);
    }

    async function renderPage(id) {
        const page = h('div', { class: 'wlext-performer-page' });
        page.appendChild(WL.pageHeader());
        const container = h('div', { class: 'wlext-pp-container' }, h('div', null, '読み込み中...'));
        page.appendChild(container);
        document.body.appendChild(page);

        let perf;
        try { perf = await WL.api.getPerformer(id); }
        catch (e) {
            container.innerHTML = '';
            container.appendChild(h('div', null, '出演者が見つかりません。'));
            return;
        }

        container.innerHTML = '';

        // ---- ヘッダ (画像 + 基本情報) ----
        const imgHost = h('div', { class: 'wlext-pp-image', title: '画像をクリックで拡大' });
        function paintImage() {
            imgHost.innerHTML = '';
            if (perf.has_image) {
                const im = h('img', { alt: perf.name });
                im.onerror = () => { imgHost.textContent = '👤'; };
                im.src = WL.api.performerImageUrl(id, Date.now());
                imgHost.appendChild(im);
            } else { imgHost.textContent = '👤'; }
        }
        paintImage();
        imgHost.addEventListener('click', () => {
            const src = perf.has_image ? WL.api.performerImageUrl(id, Date.now()) : null;
            if (src) WL.lightbox(src, { onEdit: () => pickAndCrop() });
            else pickAndCrop();
        });

        function pickAndCrop() {
            const input = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
            input.addEventListener('change', () => {
                const file = input.files && input.files[0]; if (!file) return;
                const reader = new FileReader();
                reader.onload = () => cropDialog(reader.result, async (dataUrl) => {
                    try { await WL.api.setPerformerImage(id, dataUrl); perf.has_image = true; paintImage(); WL.toast('画像を登録しました', 'success'); }
                    catch (e) { WL.toast('画像の登録に失敗: ' + e.message, 'error'); }
                });
                reader.readAsDataURL(file);
            });
            document.body.appendChild(input); input.click(); setTimeout(() => input.remove(), 1000);
        }

        const nameEl = h('h1', { class: 'wlext-pp-name' }, perf.name || '(名称未設定)');
        const furiEl = h('div', { class: 'wlext-pp-furigana' }, perf.furigana || 'ふりがな未設定');
        makeHeaderEditable(nameEl, 'name', '(名称未設定)');
        makeHeaderEditable(furiEl, 'furigana', 'ふりがな未設定');
        const nameCol = h('div', { class: 'wlext-pp-namecol' }, [nameEl, furiEl]);

        const ratingHost = h('div', { class: 'wlext-pp-rating' });
        ratingHost.appendChild(WL.starsEl(perf.rating || 0, async (n) => { perf.rating = n; await savePerf(); }));

        const infoGrid = h('div', { class: 'wlext-pp-grid' });
        const aliasHost = h('div');
        const tagHost = h('div');

        const info = h('div', { class: 'wlext-pp-info' }, [
            h('div', { class: 'wlext-pp-namerow' }, [nameCol, ratingHost]),
            infoGrid, aliasHost, tagHost
        ]);
        container.appendChild(h('div', { class: 'wlext-pp-header' }, [imgHost, info]));

        async function savePerf() {
            try { await WL.api.updatePerformer(id, perf); }
            catch (e) { WL.toast('保存に失敗: ' + e.message, 'error'); }
        }

        // 見出しの氏名/ふりがなをクリックで編集
        function makeHeaderEditable(el, key, emptyText) {
            el.style.cursor = 'pointer';
            el.title = 'クリックで編集';
            el.addEventListener('click', () => {
                const input = h('input', { class: 'wlext-input', value: perf[key] || '' });
                if (key === 'name') { input.style.fontSize = '1.3rem'; input.style.fontWeight = 'bold'; }
                el.replaceWith(input); input.focus();
                let done = false;
                const finish = (save) => {
                    if (done) return; done = true;
                    if (save) perf[key] = input.value.trim();
                    el.textContent = perf[key] || emptyText;
                    input.replaceWith(el);
                    if (save) savePerf();
                };
                input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); });
                input.addEventListener('blur', () => finish(true));
            });
        }

        // ---- 各フィールド描画 (クリックで編集) ----
        function row(label, valNode) {
            return h('div', { class: 'wlext-pp-row' }, [h('span', { class: 'k' }, label), valNode]);
        }

        function renderInfo() {
            infoGrid.innerHTML = '';

            // 身長・体重 (氏名/ふりがなは見出し側で表示・編集するためグリッドには出さない)
            [['身長', 'height'], ['体重', 'weight']]
                .forEach(([label, key]) => infoGrid.appendChild(row(label, valueSpan(key, perf[key], 'text'))));

            // スリーサイズ (バスト(カップ)/ウェスト/ヒップ をまとめて表示)
            {
                const b = perf.bust, c = perf.cup, w = perf.waist, hp = perf.hip;
                const has = b || c || w || hp;
                const disp = has ? ((b || '?') + (c ? ' (' + c + ')' : '') + '/' + (w || '?') + '/' + (hp || '?')) : '未設定';
                const span = h('div', { class: 'v editable' + (has ? '' : ' empty'), title: 'クリックで編集' }, disp);
                span.addEventListener('click', () => editThreeSize());
                infoGrid.appendChild(row('スリーサイズ', span));
            }

            // 血液型
            infoGrid.appendChild(row('血液型', valueSpan('blood_type', perf.blood_type, 'text')));

            // 誕生日 (現在の年齢を併記。1行に収まるよう全幅表示)
            {
                const val = perf.birthday;
                const age = val ? WL.ageYM(val, new Date()) : '';
                const disp = val ? (WL.fmtDate(val) + (age ? ' (' + age + ')' : '')) : '未設定';
                const span = h('div', { class: 'v editable' + (val ? '' : ' empty'), title: 'クリックで編集' }, disp);
                span.addEventListener('click', () => inlineEdit(span, 'birthday', 'date'));
                const r = row('誕生日', span);
                r.style.gridColumn = '1 / -1';   // 全幅 (誕生日が折り返さないように)
                infoGrid.appendChild(r);
            }

            renderAliases(); renderTags();
            nameEl.textContent = perf.name || '(名称未設定)';
            furiEl.textContent = perf.furigana || 'ふりがな未設定';
        }

        function editThreeSize() {
            const fld = (label, inp) => h('div', { class: 'wlext-field' }, [h('label', null, label), inp]);
            const ib = h('input', { class: 'wlext-input', value: perf.bust || '' });
            const ic = h('input', { class: 'wlext-input', value: perf.cup || '' });
            const iw = h('input', { class: 'wlext-input', value: perf.waist || '' });
            const ih = h('input', { class: 'wlext-input', value: perf.hip || '' });
            const body = h('div', { class: 'wlext-row2' }, [fld('バスト', ib), fld('カップ数', ic), fld('ウェスト', iw), fld('ヒップ', ih)]);
            WL.dialog('スリーサイズを編集', body, {
                onSave: async (close) => {
                    perf.bust = ib.value.trim(); perf.cup = ic.value.trim();
                    perf.waist = iw.value.trim(); perf.hip = ih.value.trim();
                    await savePerf(); renderInfo(); close();
                }
            });
        }

        function valueSpan(key, val, type) {
            const txt = (val === null || val === undefined || val === '') ? '未設定'
                : (type === 'date' ? WL.fmtDate(val) : val);
            const span = h('div', { class: 'v editable' + ((val === null || val === undefined || val === '') ? ' empty' : ''), title: 'クリックで編集' }, txt);
            span.addEventListener('click', () => inlineEdit(span, key, type));
            return span;
        }

        function inlineEdit(span, key, type) {
            const old = perf[key] || '';
            const input = h('input', { class: 'wlext-input', type: type === 'date' ? 'date' : 'text', value: type === 'date' ? toDateInput(old) : old, style: { padding: '2px 6px' } });
            span.replaceWith(input); input.focus();
            let done = false;
            const commit = async () => { if (done) return; done = true; perf[key] = input.value.trim(); await savePerf(); renderInfo(); };
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); else if (e.key === 'Escape') { done = true; renderInfo(); } });
            input.addEventListener('blur', commit);
        }

        function renderAliases() {
            aliasHost.innerHTML = '';
            const wrap = h('div', { class: 'wlext-pp-row' }, [
                h('span', { class: 'k' }, '別名'),
                h('div', { class: 'v' }, [
                    h('span', { class: 'wlext-pp-tags' }, (perf.aliases || []).map(a => h('span', { class: 'wlext-pp-tag' }, a))),
                    h('span', { class: 'wlext-link', style: { marginLeft: '0.5rem', fontSize: '0.8rem' }, onClick: () => editMulti('別名', perf.aliases || [], (arr) => { perf.aliases = arr; }) }, '✎編集')
                ])
            ]);
            aliasHost.appendChild(wrap);
        }
        function renderTags() {
            tagHost.innerHTML = '';
            const wrap = h('div', { class: 'wlext-pp-row' }, [
                h('span', { class: 'k' }, '出演者タグ'),
                h('div', { class: 'v' }, [
                    h('span', { class: 'wlext-pp-tags' }, (perf.tags || []).map(t => h('span', { class: 'wlext-pp-tag' }, t))),
                    h('span', {
                        class: 'wlext-link', style: { marginLeft: '0.5rem', fontSize: '0.8rem' },
                        onClick: () => WL.presetTagDialog({
                            title: '出演者タグを設定',
                            current: perf.tags || [],
                            loadPresets: () => WL.api.getPerformerTags(),
                            savePresets: (arr) => WL.api.savePerformerTags(arr),
                            onSave: async (selected) => { perf.tags = selected; await savePerf(); renderInfo(); }
                        })
                    }, '✎編集')
                ])
            ]);
            tagHost.appendChild(wrap);
        }
        function editMulti(label, arr, apply) {
            const chips = WL.chipInput(arr, label + 'を入力してEnter');
            WL.dialog(label + 'を編集', h('div', { class: 'wlext-field' }, chips.el), {
                onSave: async (close) => { apply(chips.getValues()); await savePerf(); renderInfo(); close(); }
            });
        }

        renderInfo();

        // ---- 関連動画 ----
        container.appendChild(h('div', { class: 'wlext-pp-section-title' }, '関連動画'));
        const vidGrid = h('div', { class: 'wlext-video-grid' }, h('div', { style: { color: 'var(--text-secondary,#888)' } }, '読み込み中...'));
        container.appendChild(vidGrid);
        WL.api.performerVideos(id).then(videos => {
            vidGrid.innerHTML = '';
            if (!videos.length) { vidGrid.appendChild(h('div', { style: { color: 'var(--text-secondary,#888)' } }, '関連動画はありません')); return; }
            videos.forEach(v => vidGrid.appendChild(videoCard(v)));
        }).catch(() => { vidGrid.innerHTML = ''; });

        // ---- 関連スクリーンショット ----
        container.appendChild(h('div', { class: 'wlext-pp-section-title' }, '関連スクリーンショット'));
        const ssGrid = h('div', { class: 'wlext-ss-grid' }, h('div', { style: { color: 'var(--text-secondary,#888)' } }, '読み込み中...'));
        container.appendChild(ssGrid);
        WL.api.performerScreenshots(id).then(shots => {
            ssGrid.innerHTML = '';
            if (!shots.length) { ssGrid.appendChild(h('div', { style: { color: 'var(--text-secondary,#888)' } }, '関連スクリーンショットはありません')); return; }
            shots.forEach(s => {
                const card = h('a', { class: 'wlext-ss-card', href: '/watch/' + s.video_id + '?t=' + Math.floor(s.timestamp || 0) },
                    h('img', { src: '/api/screenshot/' + s.id + '/image', loading: 'lazy' }));
                ssGrid.appendChild(card);
            });
        }).catch(() => { ssGrid.innerHTML = ''; });

        window.scrollTo(0, 0);
    }

    function videoCard(v) {
        const title = v.ext_display_name || v.filename || '';
        const thumb = h('div', { class: 'wlext-video-thumb' });
        if (v.has_thumbnail) {
            thumb.appendChild(h('img', { src: '/api/video/' + v.id + '/thumbnail?s=' + (v.thumbnail_size || 0), loading: 'lazy', alt: title }));
        } else {
            thumb.appendChild(h('div', { class: 'noimg' }, 'NO IMAGE'));
        }
        thumb.appendChild(h('div', { class: 'wlext-video-dur' }, WL.formatDuration(v.duration)));
        return h('a', { class: 'wlext-video-card', href: '/watch/' + v.id }, [
            thumb, h('div', { class: 'wlext-video-title', title }, title)
        ]);
    }

    /* ---------- 日付ヘルパ ---------- */
    function toDateInput(s) { const d = WL.parseDate(s); if (!d) return ''; return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

    /* ---------- 画像クロッパ (正方形) ---------- */
    function cropDialog(dataUrl, onDone) {
        const OUT = 600;
        const stage = h('div', { class: 'wlext-cropper-stage' });
        const img = new Image();
        let scale = 1, minScale = 1, ox = 0, oy = 0, nw = 0, nh = 0;
        const STAGE = 320;

        function clamp() {
            if (scale < minScale) scale = minScale;
            const w = nw * scale, hh = nh * scale;
            if (ox > 0) ox = 0; if (oy > 0) oy = 0;
            if (ox < STAGE - w) ox = STAGE - w;
            if (oy < STAGE - hh) oy = STAGE - hh;
        }
        function paint() {
            clamp();
            img.style.width = (nw * scale) + 'px';
            img.style.height = (nh * scale) + 'px';
            img.style.left = ox + 'px';
            img.style.top = oy + 'px';
        }
        img.onload = () => {
            nw = img.naturalWidth; nh = img.naturalHeight;
            minScale = Math.max(STAGE / nw, STAGE / nh);
            scale = minScale;
            ox = (STAGE - nw * scale) / 2; oy = (STAGE - nh * scale) / 2;
            img.style.position = 'absolute';
            stage.appendChild(img);
            paint();
        };
        img.src = dataUrl;

        // ドラッグ
        let dragging = false, sx = 0, sy = 0;
        function down(e) { dragging = true; const p = pt(e); sx = p.x - ox; sy = p.y - oy; stage.style.cursor = 'grabbing'; e.preventDefault(); }
        function move(e) { if (!dragging) return; const p = pt(e); ox = p.x - sx; oy = p.y - sy; paint(); }
        function up() { dragging = false; stage.style.cursor = 'grab'; }
        function pt(e) { const t = e.touches ? e.touches[0] : e; return { x: t.clientX, y: t.clientY }; }
        stage.addEventListener('mousedown', down); window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
        stage.addEventListener('touchstart', down, { passive: false }); stage.addEventListener('touchmove', (e) => { move(e); e.preventDefault(); }, { passive: false }); stage.addEventListener('touchend', up);

        const zoom = h('input', { type: 'range', min: '1', max: '4', step: '0.01', value: '1', style: { flex: '1' } });
        zoom.addEventListener('input', () => { scale = minScale * parseFloat(zoom.value); paint(); });

        const body = h('div', null, [
            stage,
            h('div', { class: 'wlext-cropper-controls' }, [h('span', null, '拡大'), zoom]),
            h('div', { style: { fontSize: '0.78rem', color: 'var(--text-secondary,#888)', marginTop: '0.4rem' } }, 'ドラッグで位置調整・スライダーで拡大し、正方形に切り取ります。')
        ]);

        function cleanup() { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); }

        WL.dialog('画像を切り取り', body, {
            saveLabel: '登録',
            onSave: async (close) => {
                const canvas = document.createElement('canvas'); canvas.width = OUT; canvas.height = OUT;
                const ctx = canvas.getContext('2d');
                const sSize = STAGE / scale;
                const sxSrc = -ox / scale, sySrc = -oy / scale;
                ctx.drawImage(img, sxSrc, sySrc, sSize, sSize, 0, 0, OUT, OUT);
                const out = canvas.toDataURL('image/png');
                cleanup();
                await onDone(out);
                close();
            }
        });
    }

    WL.onEnsure(ensure);
})();
