/* =============================================================
   WomanLive 拡張 - コア
   ・fetch フック (表示動画名の置換 / 拡張検索の振り分け)
   ・SPA ルート検知
   ・DOM 監視 (React 再描画後の再注入)
   ・共通 UI (ライトボックス / トースト / チップ入力 など)
   ============================================================= */
(function () {
    'use strict';
    const WL = window.WLExt;
    const origFetch = WL._rawFetch || window.fetch.bind(window);

    /* ---------- 小道具 ---------- */
    function h(tag, props, children) {
        const e = document.createElement(tag);
        if (props) {
            for (const k in props) {
                if (k === 'class') e.className = props[k];
                else if (k === 'style' && typeof props[k] === 'object') Object.assign(e.style, props[k]);
                else if (k === 'html') e.innerHTML = props[k];
                else if (k.startsWith('on') && typeof props[k] === 'function') e.addEventListener(k.slice(2).toLowerCase(), props[k]);
                else if (k === 'attrs') { for (const a in props.attrs) e.setAttribute(a, props.attrs[a]); }
                else if (props[k] !== null && props[k] !== undefined) e.setAttribute(k, props[k]);
            }
        }
        appendChildren(e, children);
        return e;
    }
    function appendChildren(e, children) {
        if (children === null || children === undefined) return;
        if (Array.isArray(children)) children.forEach(c => appendChildren(e, c));
        else if (children instanceof Node) e.appendChild(children);
        else e.appendChild(document.createTextNode(String(children)));
    }
    function debounce(fn, ms) { let t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }
    function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

    WL.h = h;
    WL.debounce = debounce;
    WL.escapeHtml = escapeHtml;

    /* ---------- 名前ソート (サーバーの ext_namekey と同一ロジック) ---------- */
    // namekey.js (UMD) を core より前に読み込み、ここで WL に公開する。
    const NK = window.WLNameKey || { nameKey: (s) => String(s == null ? '' : s), nameCompare: (a, b) => String(a).localeCompare(String(b), 'ja') };
    WL.nameKey = NK.nameKey;
    WL.nameCompare = NK.nameCompare;

    /* ---------- 日付 / 時間 ---------- */
    function parseDate(s) {
        if (!s) return null;
        const str = String(s).trim().replace(/[./]/g, '-');
        const m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (!m) return null;
        const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
        return isNaN(d.getTime()) ? null : d;
    }
    function ageYM(birthday, ref) {
        const b = parseDate(birthday); if (!b) return '';
        let r = (ref instanceof Date) ? ref : parseDate(ref);
        if (!r) r = new Date();
        let years = r.getFullYear() - b.getFullYear();
        let months = r.getMonth() - b.getMonth();
        if (r.getDate() < b.getDate()) months--;
        if (months < 0) { years--; months += 12; }
        if (years < 0) return '';
        return years + '歳' + months + 'ヶ月';
    }
    function ymAgo(s) {
        const d = parseDate(s); if (!d) return '';
        const now = new Date();
        let y = now.getFullYear() - d.getFullYear();
        let m = now.getMonth() - d.getMonth();
        if (now.getDate() < d.getDate()) m--;
        if (m < 0) { y--; m += 12; }
        if (y < 0) return '';
        if (y === 0) return (m <= 0 ? '今月' : m + 'ヶ月前');
        return y + '年' + (m > 0 ? m + 'ヶ月' : '') + '前';
    }
    function fmtDate(s) { const d = parseDate(s); if (!d) return s || ''; return d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0'); }
    function formatDuration(sec) {
        if (!sec) return '---';
        const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = Math.floor(sec % 60);
        return hh > 0 ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
    }
    WL.parseDate = parseDate; WL.ageYM = ageYM; WL.ymAgo = ymAgo; WL.fmtDate = fmtDate; WL.formatDuration = formatDuration;

    /* ---------- ナビゲーション ---------- */
    // 拡張からの遷移はフルリロードで行い、確実に React 側 (検索) や拡張側 (出演者) に届ける
    WL.navigate = (url) => { window.location.assign(url); };
    WL.searchBy = (token) => { WL.navigate('/search?q=' + encodeURIComponent(token)); };
    WL.openPerformer = (id) => { WL.navigate('/performer/' + id); };

    // 拡張ページ共通ヘッダー (本家ヘッダーと統一: ロゴ/検索/操作) は nav.js が定義。

    /* ---------- fetch フック ---------- */
    function jsonResponse(data) {
        return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    function applyDisplayName(list) {
        if (!Array.isArray(list)) return;
        list.forEach(v => { if (v && v.ext_display_name) { v._orig_filename = v.filename; v.filename = v.ext_display_name; } });
    }
    WL.applyDisplayName = applyDisplayName;

    // 検索結果の全タグ(m.tags)を id でキャッシュ (リスト表示のタグ幅フィットで参照)
    WL._videoTags = WL._videoTags || {};
    function cacheVideoTags(list) {
        if (!Array.isArray(list)) return;
        list.forEach(v => { if (v && v.id != null && v.tags != null) WL._videoTags[v.id] = v.tags; });
    }
    WL.cacheVideoTags = cacheVideoTags;

    async function handleVideosFetch(url, input, init) {
        const u = new URL(url, location.origin);
        const q = (u.searchParams.get('q') || '').trim();
        // '@' で始まるフィールド検索 → search.js、それ以外の通常キーワード → fullsearch.js。
        // 拡張ソート(ext_rating / ext_screenshots 等)は両経路の sortMap で適用されるため、
        // 振り分けは検索語の種類だけで決める(キーワード+拡張ソートの併用を壊さない)。
        const isFieldQuery = q.startsWith('@');
        const endpoint = isFieldQuery ? '/ext/api/search' : '/ext/api/fullsearch';

        try {
            const r = await origFetch(endpoint + '?' + u.searchParams.toString());
            if (r.ok) {
                const data = await r.json();
                applyDisplayName(data.videos);
                cacheVideoTags(data.videos);
                return jsonResponse(data);
            }
        } catch (e) { /* フォールバックへ */ }

        // フォールバック: 元の検索 + 表示名デコレート
        const r = await origFetch(input, init);
        const clone = r.clone();
        try {
            const data = await r.json();
            if (data && Array.isArray(data.videos) && data.videos.length) {
                try {
                    const ids = data.videos.map(v => v.id);
                    const map = await WL.api.bulkMeta(ids);
                    data.videos.forEach(v => { const m = map[v.id]; if (m) { if (m.display_name) v.ext_display_name = m.display_name; v.ext_rating = m.rating; } });
                } catch (e) { }
                applyDisplayName(data.videos);
                cacheVideoTags(data.videos);
            }
            return jsonResponse(data);
        } catch (e) { return clone; }
    }

    async function handleSingleVideoFetch(id, input, init) {
        const r = await origFetch(input, init);
        const clone = r.clone();
        try {
            const data = await r.json();
            if (data && data.video) {
                try {
                    const meta = await WL.api.getMeta(id);
                    if (meta && meta.display_name) { data.video.ext_display_name = meta.display_name; data.video._orig_filename = data.video.filename; data.video.filename = meta.display_name; }
                } catch (e) { }
            }
            // 拡張: 関連動画をメタデータ類似度で差し替え (空なら本体のパス近傍を維持)
            try {
                const rel = await WL.api.relatedVideos(id);
                if (rel && Array.isArray(rel.videos) && rel.videos.length) data.relatedVideos = rel.videos;
            } catch (e) { }
            if (data && Array.isArray(data.relatedVideos) && data.relatedVideos.length) {
                try {
                    const ids = data.relatedVideos.map(v => v.id);
                    const map = await WL.api.bulkMeta(ids);
                    data.relatedVideos.forEach(v => { const m = map[v.id]; if (m && m.display_name) { v.ext_display_name = m.display_name; v.filename = m.display_name; } });
                } catch (e) { }
            }
            return jsonResponse(data);
        } catch (e) { return clone; }
    }

    window.fetch = function (input, init) {
        try {
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            if (typeof input === 'string') {
                if (/\/api\/videos(\?|$)/.test(url)) return handleVideosFetch(url, input, init);
                const mv = url.match(/\/api\/video\/(\d+)(\?|$)/);
                if (mv) return handleSingleVideoFetch(mv[1], input, init);
            }
        } catch (e) { /* fall through */ }
        return origFetch(input, init);
    };

    /* ---------- ルート検知 ---------- */
    WL._routeCbs = [];
    WL.onRoute = (cb) => WL._routeCbs.push(cb);
    function emitRoute() { const p = location.pathname; WL._routeCbs.forEach(cb => { try { cb(p); } catch (e) { console.error(e); } }); }
    ['pushState', 'replaceState'].forEach(m => {
        const o = history[m];
        history[m] = function () { const ret = o.apply(this, arguments); setTimeout(emitRoute, 0); return ret; };
    });
    window.addEventListener('popstate', () => setTimeout(emitRoute, 0));

    WL.matchWatch = () => { const m = location.pathname.match(/^\/watch\/(\d+)/); return m ? m[1] : null; };
    WL.matchPerformer = () => { const m = location.pathname.match(/^\/performer\/(\d+)/); return m ? m[1] : null; };
    WL.matchSettings = () => location.pathname === '/settings';

    /* ---------- DOM 監視 (再注入) ---------- */
    WL._ensureCbs = [];
    WL.onEnsure = (cb) => WL._ensureCbs.push(cb);
    function runEnsure() { WL._ensureCbs.forEach(cb => { try { cb(); } catch (e) { console.error('[wlext ensure]', e); } }); }
    const debouncedEnsure = debounce(runEnsure, 80);
    WL.requestEnsure = () => { setTimeout(runEnsure, 0); setTimeout(runEnsure, 200); setTimeout(runEnsure, 500); };

    function startObserver() {
        const root = document.getElementById('root') || document.body;
        new MutationObserver(debouncedEnsure).observe(root, { childList: true, subtree: true });
        WL.onRoute(() => WL.requestEnsure());
        WL.requestEnsure();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObserver);
    else startObserver();

    /* ---------- ライトボックス ---------- */
    WL.lightbox = function (src, opts) {
        opts = opts || {};
        const img = h('img', { src });
        const actions = h('div', { class: 'wlext-lightbox-actions' });
        if (opts.onEdit) {
            actions.appendChild(h('button', { class: 'wlext-btn wlext-btn-primary', onClick: (e) => { e.stopPropagation(); close(); opts.onEdit(); } }, '画像を変更'));
        }
        if (opts.onReset) {
            actions.appendChild(h('button', { class: 'wlext-btn', onClick: (e) => { e.stopPropagation(); close(); opts.onReset(); } }, 'デフォルトに戻す'));
        }
        actions.appendChild(h('button', { class: 'wlext-btn', onClick: (e) => { e.stopPropagation(); close(); } }, '閉じる'));
        const box = h('div', { class: 'wlext-lightbox', onClick: () => close() }, [img, actions]);
        function close() { box.remove(); document.removeEventListener('keydown', onKey); }
        function onKey(e) { if (e.key === 'Escape') close(); }
        document.addEventListener('keydown', onKey);
        document.body.appendChild(box);
        return close;
    };

    /* ---------- 画像クロッパ (任意アスペクト比) ---------- */
    // WL.cropDialog(dataUrl, onDone, { aspect:[w,h], outW, hint })
    // 出演者画像(正方形)と同じ操作感で、指定比率に切り取って dataURL(PNG) を返す。
    WL.cropDialog = function (dataUrl, onDone, opts) {
        opts = opts || {};
        const aspect = opts.aspect || [1, 1];
        const STAGE_W = 320;
        const STAGE_H = Math.max(80, Math.round(STAGE_W * aspect[1] / aspect[0]));
        const OUT_W = opts.outW || 600;
        const OUT_H = Math.round(OUT_W * aspect[1] / aspect[0]);

        const stage = h('div', { class: 'wlext-cropper-stage', style: { width: STAGE_W + 'px', height: STAGE_H + 'px' } });
        const img = new Image();
        let scale = 1, minScale = 1, ox = 0, oy = 0, nw = 0, nh = 0;

        function clamp() {
            if (scale < minScale) scale = minScale;
            const w = nw * scale, hh = nh * scale;
            if (ox > 0) ox = 0; if (oy > 0) oy = 0;
            if (ox < STAGE_W - w) ox = STAGE_W - w;
            if (oy < STAGE_H - hh) oy = STAGE_H - hh;
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
            minScale = Math.max(STAGE_W / nw, STAGE_H / nh);
            scale = minScale;
            ox = (STAGE_W - nw * scale) / 2; oy = (STAGE_H - nh * scale) / 2;
            img.style.position = 'absolute';
            stage.appendChild(img);
            paint();
        };
        img.src = dataUrl;

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
            h('div', { style: { fontSize: '0.78rem', color: 'var(--text-secondary,#888)', marginTop: '0.4rem' } },
                opts.hint || 'ドラッグで位置調整・スライダーで拡大して切り取ります。')
        ]);

        function cleanup() { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); }

        WL.dialog(opts.title || '画像を切り取り', body, {
            saveLabel: '登録',
            onSave: async (close) => {
                const canvas = document.createElement('canvas'); canvas.width = OUT_W; canvas.height = OUT_H;
                const ctx = canvas.getContext('2d');
                const sSizeW = STAGE_W / scale, sSizeH = STAGE_H / scale;
                const sxSrc = -ox / scale, sySrc = -oy / scale;
                ctx.drawImage(img, sxSrc, sySrc, sSizeW, sSizeH, 0, 0, OUT_W, OUT_H);
                const out = canvas.toDataURL('image/png');
                cleanup();
                await onDone(out);
                close();
            }
        });
    };

    /* ---------- トースト ---------- */
    function toastWrap() {
        let w = document.querySelector('.wlext-toast-wrap');
        if (!w) { w = h('div', { class: 'wlext-toast-wrap' }); document.body.appendChild(w); }
        return w;
    }
    WL.toast = function (msg, type) {
        const t = h('div', { class: 'wlext-toast ' + (type || '') }, msg);
        toastWrap().appendChild(t);
        setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2600);
    };

    /* ---------- 評価(★) 部品 ---------- */
    // onChange(value) を渡すと編集可能。省略で読み取り専用。
    WL.starsEl = function (value, onChange) {
        const wrap = h('div', { class: 'wlext-rating' + (onChange ? '' : ' readonly') });
        let cur = value || 0;
        const stars = [];
        function paint(n) { stars.forEach((s, i) => s.classList.toggle('on', i < n)); }
        for (let i = 1; i <= 5; i++) {
            const star = h('span', { class: 'wlext-star' }, '★');
            if (onChange) {
                star.addEventListener('mouseenter', () => paint(i));
                star.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); cur = i; onChange(i); });
            }
            stars.push(star); wrap.appendChild(star);
        }
        if (onChange) {
            wrap.addEventListener('mouseleave', () => paint(cur));
            const clr = h('span', { class: 'wlext-rating-clear', onClick: (e) => { e.stopPropagation(); e.preventDefault(); cur = 0; onChange(0); } }, 'クリア');
            wrap.appendChild(clr);
        }
        paint(cur);
        wrap.setValue = (n) => { cur = n; paint(n); };
        return wrap;
    };

    /* ---------- 単純チップ入力 (文字列の複数値) ---------- */
    WL.chipInput = function (initial, placeholder) {
        let values = (initial || []).slice();
        const box = h('div', { class: 'wlext-chips' });
        const input = h('input', { class: 'wlext-chip-input', placeholder: placeholder || '入力してEnter' });
        function render() {
            box.querySelectorAll('.wlext-chip').forEach(c => c.remove());
            values.forEach((v, idx) => {
                const chip = h('span', { class: 'wlext-chip' }, [v, h('span', { class: 'x', onClick: () => { values.splice(idx, 1); render(); } }, '×')]);
                box.insertBefore(chip, input);
            });
        }
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); const t = input.value.trim(); if (t && !values.includes(t)) { values.push(t); render(); } input.value = ''; }
            else if (e.key === 'Backspace' && !input.value && values.length) { values.pop(); render(); }
        });
        box.appendChild(input); render();
        box.addEventListener('click', () => input.focus());
        return { el: box, getValues: () => { const t = input.value.trim(); if (t && !values.includes(t)) values.push(t); return values.slice(); } };
    };

    /* ---------- 出演者入力 (サジェスト + 新規作成) ---------- */
    WL.performerInput = function (initial) {
        let values = (initial || []).map(p => ({ id: p.id, name: p.name })); // {id,name}
        const box = h('div', { class: 'wlext-chips', style: { position: 'relative' } });
        const input = h('input', { class: 'wlext-chip-input', placeholder: '出演者名を入力' });
        let suggestEl = null;
        function render() {
            box.querySelectorAll('.wlext-chip').forEach(c => c.remove());
            values.forEach((v, idx) => {
                const chip = h('span', { class: 'wlext-chip' }, [v.name, h('span', { class: 'x', onClick: () => { values.splice(idx, 1); render(); } }, '×')]);
                box.insertBefore(chip, input);
            });
        }
        function closeSuggest() { if (suggestEl) { suggestEl.remove(); suggestEl = null; } }
        async function add(name) {
            name = name.trim(); if (!name) return;
            if (values.some(v => v.name === name)) { input.value = ''; closeSuggest(); return; }
            try { const p = await WL.api.createPerformer(name); values.push({ id: p.id, name: p.name }); render(); }
            catch (e) { WL.toast('出演者の追加に失敗: ' + e.message, 'error'); }
            input.value = ''; closeSuggest();
        }
        const doSuggest = debounce(async () => {
            const q = input.value.trim();
            closeSuggest();
            if (!q) return;
            let list = [];
            try { list = await WL.api.searchPerformers(q); } catch (e) { }
            suggestEl = h('div', { class: 'wlext-suggest' });
            list.filter(p => !values.some(v => v.id === p.id)).forEach(p => {
                suggestEl.appendChild(h('div', { onMousedown: (e) => { e.preventDefault(); values.push({ id: p.id, name: p.name }); render(); input.value = ''; closeSuggest(); } }, p.name + (p.furigana ? '（' + p.furigana + '）' : '')));
            });
            suggestEl.appendChild(h('div', { style: { borderTop: '1px solid var(--border-primary,#ccc)', color: 'var(--accent,#007acc)' }, onMousedown: (e) => { e.preventDefault(); add(q); } }, '＋「' + q + '」を新規追加'));
            const r = input.getBoundingClientRect();
            suggestEl.style.position = 'fixed';
            suggestEl.style.left = r.left + 'px';
            suggestEl.style.top = (r.bottom + 2) + 'px';
            document.body.appendChild(suggestEl);
        }, 200);
        input.addEventListener('input', doSuggest);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(input.value); } });
        input.addEventListener('blur', () => setTimeout(closeSuggest, 200));
        box.appendChild(input); render();
        box.addEventListener('click', () => input.focus());
        return { el: box, getValues: () => values.slice() };
    };

    /* ---------- 汎用ダイアログ ---------- */
    WL.dialog = function (title, bodyEl, { onSave, saveLabel, danger } = {}) {
        const overlay = h('div', { class: 'wlext-overlay', onClick: (e) => { if (e.target === overlay) close(); } });
        const footer = h('div', { class: 'wlext-dialog-footer' });
        footer.appendChild(h('button', { class: 'wlext-btn', onClick: () => close() }, 'キャンセル'));
        if (onSave) footer.appendChild(h('button', { class: 'wlext-btn ' + (danger ? 'wlext-btn-danger' : 'wlext-btn-primary'), onClick: async (e) => { e.target.disabled = true; try { await onSave(close); } finally { if (e.target) e.target.disabled = false; } } }, saveLabel || '保存'));
        const dlg = h('div', { class: 'wlext-dialog' }, [
            h('div', { class: 'wlext-dialog-header' }, [h('span', null, title), h('span', { class: 'wlext-close-x', onClick: () => close() }, '✕')]),
            h('div', { class: 'wlext-dialog-body' }, bodyEl),
            footer
        ]);
        overlay.appendChild(dlg);
        function close() { overlay.remove(); document.removeEventListener('keydown', onKey); }
        function onKey(e) { if (e.key === 'Escape') close(); }
        document.addEventListener('keydown', onKey);
        document.body.appendChild(overlay);
        return close;
    };

    /* ---------- タグのグループ化 (プリセット一覧の # 見出し) ---------- */
    // "# 名前" でグループ、"## 名前" でその下位(ネスト)。見出しの間のタグがそのグループに属する。
    function parseTagGroups(list) {
        const root = { name: null, level: 0, path: '', tags: [], children: [] };
        const stack = [root];
        (list || []).forEach(raw => {
            const line = String(raw == null ? '' : raw).trim();
            if (!line) return;
            const m = /^([#＃]+)\s*(.*)$/.exec(line);   // 半角# / 全角＃ どちらも見出しとして扱う
            if (m && m[2]) {
                const level = m[1].length;
                while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop();
                const parent = stack[stack.length - 1];
                const node = { name: m[2].trim(), level, path: parent.path + '' + m[2].trim(), tags: [], children: [] };
                parent.children.push(node);
                stack.push(node);
            } else {
                stack[stack.length - 1].tags.push(line);
            }
        });
        return root;
    }
    WL.parseTagGroups = parseTagGroups;

    // 本家プリセット(実タグ)と ext のグループレイアウト(# 入り)を突き合わせる。
    // 本家で増えたタグはデフォルトグループ(先頭の # より前)へ、消えたタグはレイアウトから除外。
    WL.reconcileTagLayout = function (layout, nativeTags) {
        const isHdr = s => /^[#＃]/.test(String(s == null ? '' : s).trim());
        layout = Array.isArray(layout) ? layout.slice() : [];
        // 本家プリセットに紛れ込んだ見出し(#)は無視する(グループは ext レイアウト側で定義)
        nativeTags = Array.isArray(nativeTags) ? nativeTags.map(s => String(s).trim()).filter(Boolean).filter(t => !isHdr(t)) : [];
        const nativeSet = new Set(nativeTags);
        const realSet = new Set(layout.filter(l => !isHdr(l)).map(s => String(s).trim()));
        const kept = layout.filter(l => isHdr(l) || nativeSet.has(String(l).trim()));
        const missing = nativeTags.filter(t => !realSet.has(t));
        if (!missing.length) return kept;
        const firstHdr = kept.findIndex(isHdr);
        if (firstHdr === -1) return [...kept, ...missing];
        return [...kept.slice(0, firstHdr), ...missing, ...kept.slice(firstHdr)];
    };

    // 動画タグ プリセット(グループ対応) の読み書き。動画単体ページ・一括追加で共用。
    // グループ定義(# 入り)は ext に保持し、本家プリセットには実タグのみを同期する。
    WL.loadVideoTagPresets = async function () {
        const [native, layout] = await Promise.all([
            WL.api.getVideoPresetTags(),
            WL.api.getVideoTagLayout().catch(() => [])
        ]);
        return WL.reconcileTagLayout(layout, native);
    };
    WL.saveVideoTagPresets = async function (arr) {
        await WL.api.saveVideoTagLayout(arr);
        await WL.api.saveVideoPresetTags(arr.filter(t => !/^[#＃]/.test(String(t).trim())));
    };

    /* ---------- プリセットタグ選択ダイアログ (動画タグと同じ操作感) ---------- */
    // opts: { title, current[], loadPresets()->Promise<string[]>, savePresets(arr)->Promise, onSave(selected[])->Promise }
    WL.presetTagDialog = function (opts) {
        let selected = (opts.current || []).slice();
        let presets = [];
        let editMode = false;
        const collapsed = {}; // path -> true(折りたたみ中)

        const chipsHost = h('div', { class: 'wlext-tagselect' });
        const textarea = h('textarea', {
            class: 'wlext-textarea', style: { minHeight: '220px', display: 'none' },
            placeholder: 'タグを1行に1つずつ入力...\n「# 名前」でグループ、「## 名前」で下位グループ(ネスト)。\n例:\n# 干支\n犬\n猿\n# 魚\nマグロ'
        });

        function tagChip(name) {
            const el = h('div', { class: 'wlext-tagselect-item' + (selected.includes(name) ? ' on' : '') }, name);
            el.addEventListener('click', () => {
                if (selected.includes(name)) { selected = selected.filter(t => t !== name); el.classList.remove('on'); }
                else { selected.push(name); el.classList.add('on'); }
            });
            return el;
        }
        function chipRow(tags) {
            const row = h('div', { class: 'wlext-tagselect-row' });
            tags.forEach(t => row.appendChild(tagChip(t)));
            return row;
        }
        function renderGroup(node) {
            const isCol = !!collapsed[node.path];
            const header = h('div', { class: 'wlext-taggroup-header' }, [
                h('span', { class: 'wlext-taggroup-name' }, node.name),
                h('span', { class: 'wlext-taggroup-tri' }, isCol ? '▶' : '▼')
            ]);
            header.addEventListener('click', () => { collapsed[node.path] = !isCol; renderChips(); });
            const wrap = h('div', { class: 'wlext-taggroup' }, header);
            if (!isCol) {
                const inner = h('div', { class: 'wlext-taggroup-body' });
                if (node.tags.length) inner.appendChild(chipRow(node.tags));
                node.children.forEach(c => inner.appendChild(renderGroup(c)));
                wrap.appendChild(inner);
            }
            return wrap;
        }
        function renderChips() {
            chipsHost.innerHTML = '';
            const tree = parseTagGroups(presets);
            // プリセットに無い選択中タグはデフォルトグループへ
            const presetSet = new Set();
            (function walk(n) { n.tags.forEach(t => presetSet.add(t)); n.children.forEach(walk); })(tree);
            selected.forEach(t => { if (!presetSet.has(t)) { tree.tags.push(t); presetSet.add(t); } });
            tree.tags = [...new Set(tree.tags)];
            if (!presetSet.size) {
                chipsHost.appendChild(h('div', { style: { color: 'var(--text-secondary,#888)', fontSize: '0.85rem' } }, 'プリセットタグがありません。「タグ編集...」で追加してください。'));
                return;
            }
            if (tree.tags.length) chipsHost.appendChild(chipRow(tree.tags));
            tree.children.forEach(g => chipsHost.appendChild(renderGroup(g)));
        }

        Promise.resolve(opts.loadPresets()).then(p => { presets = Array.isArray(p) ? p : []; renderChips(); }).catch(() => renderChips());

        const editBtn = h('button', { class: 'wlext-btn' }, 'タグ編集...');
        editBtn.addEventListener('click', async () => {
            if (!editMode) {
                editMode = true;
                textarea.value = presets.join('\n');
                textarea.style.display = 'block';
                chipsHost.style.display = 'none';
                editBtn.textContent = 'プリセットを保存';
            } else {
                const arr = textarea.value.split('\n').map(s => s.trim()).filter(Boolean);
                try { await opts.savePresets(arr); presets = [...new Set(arr)]; }
                catch (e) { WL.toast('プリセットの保存に失敗: ' + e.message, 'error'); return; }
                editMode = false;
                textarea.style.display = 'none';
                chipsHost.style.display = 'flex';
                editBtn.textContent = 'タグ編集...';
                renderChips();
                WL.toast('プリセットタグを保存しました', 'success');
            }
        });

        const body = h('div', null, [
            h('div', { style: { display: 'flex', justifyContent: 'flex-end', marginBottom: '0.6rem' } }, editBtn),
            chipsHost,
            textarea
        ]);

        WL.dialog(opts.title || 'タグを設定', body, {
            saveLabel: 'OK',
            onSave: async (close) => {
                if (editMode) { WL.toast('先に「プリセットを保存」を押してください', 'error'); return; }
                await opts.onSave(selected);
                close();
            }
        });
    };

    console.log('[WomanLive拡張] core 初期化完了');
})();
