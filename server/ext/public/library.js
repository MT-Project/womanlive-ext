/* =============================================================
   WomanLive 拡張 - ライブラリ (画面側)
   ・ヘッダー: ロゴの右に使用中のライブラリ名。押すと一覧から切り替え (2つ以上あるときだけ出す)
   ・管理画面: 「拡張機能：ライブラリ」セクション (一覧・作成・取り込み・名前変更・切り替え・削除)
   切り替えはサーバーの再起動を伴う。仕組みは server/ext/library.js、
   切り替え前の画面の扱い (読み直し・書き込み拒否) は api.js と routes/library.js。
   ============================================================= */
(function () {
    'use strict';
    const WL = window.WLExt; const h = WL.h;
    const LIB = WL.library;
    if (!LIB) return;

    const MODES = [
        ['empty', '空のライブラリ'],
        ['settings', '今のライブラリの設定を引き継ぐ（動画とメタデータは空）'],
        ['clone', '今のライブラリを丸ごと複製'],
    ];

    function fmtSize(n) {
        if (n == null) return '-';
        if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(1) + ' GB';
        if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
        return Math.max(1, Math.round(n / 1024)) + ' KB';
    }
    function fmtWhen(s) {
        if (!s) return '-';
        const d = new Date(s); if (isNaN(d)) return '-';
        return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
    }
    const note = (text) => h('div', { class: 'wlext-lib-note' }, text);

    /* ---------- 切り替え ---------- */
    function overlay(text) {
        let box = document.querySelector('.wlext-lib-overlay');
        if (!box) { box = h('div', { class: 'wlext-lib-overlay' }); document.body.appendChild(box); }
        box.textContent = text;
        return box;
    }

    // 再起動を待つ。新しいサーバーが応えた時点で api.js がライブラリの違いに気づき、ホームを開き直す。
    function waitRestart(name) {
        const box = overlay('「' + name + '」へ切り替えています…');
        const t0 = Date.now();
        (function tick() {
            if (Date.now() - t0 > 60000) {
                box.textContent = '切り替えに時間がかかっています。サーバーのコンソールを確認してから、ページを読み直してください。';
                return;
            }
            WL._rawFetch('/ext/api/libraries/current').catch(() => { }).finally(() => setTimeout(tick, 800));
        })();
    }

    WL.switchLibrary = function (lib) {
        const body = h('div', { style: { fontSize: '0.9rem', lineHeight: '1.7' } }, [
            h('div', null, '「' + lib.name + '」に切り替えます。'),
            h('div', null, 'サーバーを再起動するため、再生中の動画は止まります。ほかの端末で開いている画面も読み直しになります。'),
        ]);
        WL.dialog('ライブラリを切り替え', body, {
            saveLabel: '切り替える',
            onSave: async (close) => {
                let r;
                try { r = await WL.api.switchLibrary(lib.id); }
                catch (e) { WL.toast(e.message, 'error'); return; }
                close();
                if (r.restarting) waitRestart(lib.name);
                else WL.toast('次にサーバーを起動したときに「' + lib.name + '」が開きます（この起動方法では自動で再起動できません）', 'success');
            }
        });
    };

    /* ---------- ヘッダー: ライブラリ名 + 切り替えメニュー ---------- */
    let menuEl = null, backdrop = null;
    function closeMenu() {
        if (menuEl) { menuEl.remove(); menuEl = null; }
        if (backdrop) { backdrop.remove(); backdrop = null; }
    }
    async function openMenu(anchor) {
        closeMenu();
        backdrop = h('div', { class: 'wlext-navmenu-backdrop', onClick: closeMenu });
        menuEl = h('div', { class: 'wlext-navmenu wlext-lib-menu' }, h('div', { class: 'wlext-navmenu-item wlext-lib-menu-loading' }, '読み込み中…'));
        const rc = anchor.getBoundingClientRect();
        Object.assign(menuEl.style, { top: Math.round(rc.bottom + 6) + 'px', left: Math.round(Math.max(8, rc.left)) + 'px' });
        document.body.appendChild(backdrop);
        document.body.appendChild(menuEl);

        let data;
        try { data = await WL.api.libraries(); }
        catch (e) { closeMenu(); WL.toast('読み込みに失敗: ' + e.message, 'error'); return; }
        if (!menuEl) return;
        const menu = menuEl;
        menu.innerHTML = '';
        data.libraries.forEach(l => {
            const item = h('div', { class: 'wlext-navmenu-item' + (l.active ? ' wlext-lib-current' : '') }, [
                WL.icon(l.active ? 'check' : 'database', 18),
                h('span', { class: 'wlext-lib-menu-name' }, l.name),
                h('span', { class: 'wlext-lib-menu-count' }, l.videos != null ? l.videos + '本' : ''),
            ]);
            item.addEventListener('click', () => {
                if (l.active) { closeMenu(); return; }
                if (!data.local) { WL.toast('切り替えはサーバーを動かしている PC からのみ行えます', 'error'); return; }
                closeMenu();
                WL.switchLibrary(l);
            });
            menu.appendChild(item);
        });
        menu.appendChild(h('div', { class: 'wlext-navmenu-sep' }));
        const manage = h('div', { class: 'wlext-navmenu-item' }, [WL.icon('settings', 18), h('span', null, 'ライブラリの管理')]);
        manage.addEventListener('click', () => {
            closeMenu();
            try { sessionStorage.setItem('wlext_goto_library', '1'); } catch (e) { }
            WL.navigate('/settings');
        });
        menu.appendChild(manage);
        // 画面の右にはみ出したら寄せる
        const mr = menu.getBoundingClientRect();
        if (mr.right > window.innerWidth - 8) menu.style.left = Math.max(8, window.innerWidth - 8 - mr.width) + 'px';
    }

    function ensurePill() {
        if (LIB.count < 2) return;   // ライブラリが1つ(既定のみ)なら出さない
        document.querySelectorAll('nav a[href="/"]').forEach(a => {
            const next = a.nextElementSibling;
            if (next && next.classList.contains('wlext-libpill')) return;
            const pill = h('button', { class: 'wlext-libpill', type: 'button', title: 'ライブラリ: ' + LIB.name + '（クリックで切り替え）' }, [
                WL.icon('database', 14), h('span', { class: 'wlext-libpill-name' }, LIB.name), WL.icon('chevron-down', 14)
            ]);
            pill.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); if (menuEl) closeMenu(); else openMenu(pill); });
            a.insertAdjacentElement('afterend', pill);
        });
    }

    /* ---------- 管理画面: ライブラリ セクション ---------- */
    function findContainer() {
        const root = document.getElementById('root'); if (!root) return null;
        for (const el of root.querySelectorAll('h2')) {
            if (el.textContent && el.textContent.indexOf('スキャン') !== -1) {
                const section = el.parentElement;
                if (section && section.parentElement) return { container: section.parentElement, firstSection: section };
            }
        }
        return null;
    }

    function buildSection() {
        const block = h('div', { class: 'wlext-settings-host wlext-settings-section wlext-lib-section' });
        block.appendChild(h('h3', { class: 'wlext-ext-h3' }, [WL.icon('database', 16), h('span', null, '拡張機能：ライブラリ')]));
        block.appendChild(note('ライブラリごとに、スキャン対象フォルダ・動画・タグ・評価などのメタデータを別々に持ちます。'
            + '出演者・公開設定・プリセットタグ・FANZA API・出演者タグは全ライブラリ共通です。'
            + '切り替えと削除は、サーバーを動かしている PC（localhost）からのみ行えます。'));
        const warn = h('div', { class: 'wlext-lib-warning', style: { display: 'none' } });
        const listEl = h('div', { class: 'wlext-lib-list' });
        block.appendChild(warn);
        block.appendChild(listEl);

        // 作成
        const nameIn = h('input', { class: 'wlext-input', placeholder: '新しいライブラリの名前', maxlength: '40' });
        const modeSel = h('select', { class: 'wlext-input wlext-lib-mode' }, MODES.map(([v, t]) => h('option', { value: v }, t)));
        const createBtn = h('button', { class: 'wlext-btn wlext-btn-primary' }, '作成');
        createBtn.addEventListener('click', async () => {
            createBtn.disabled = true;
            try {
                const r = await WL.api.createLibrary(nameIn.value.trim(), modeSel.value);
                WL.toast('ライブラリ「' + r.name + '」を作成しました', 'success');
                nameIn.value = '';
                await reload();
            } catch (e) { WL.toast(e.message, 'error'); }
            finally { createBtn.disabled = false; }
        });
        block.appendChild(h('h4', { class: 'wlext-lib-h4' }, '新しく作る'));
        block.appendChild(h('div', { class: 'wlext-inline wlext-lib-form' }, [nameIn, modeSel, createBtn]));

        // 取り込み
        const pathIn = h('input', { class: 'wlext-input', placeholder: '(例) D:\\WomanLive\\videos.db （フォルダでも可）' });
        const browse = h('button', { class: 'wlext-btn' }, '参照...');
        browse.addEventListener('click', () => {
            if (WL.openFolderPicker) WL.openFolderPicker((p) => { pathIn.value = p; });
        });
        const impName = h('input', { class: 'wlext-input', placeholder: 'ライブラリの名前', maxlength: '40' });
        const impBtn = h('button', { class: 'wlext-btn wlext-btn-primary' }, '取り込む');
        impBtn.addEventListener('click', async () => {
            impBtn.disabled = true;
            const old = impBtn.textContent; impBtn.textContent = '取り込み中…';
            try {
                const r = await WL.api.importLibrary(pathIn.value.trim(), impName.value.trim());
                const p = r.performers || {};
                WL.toast('「' + r.name + '」として取り込みました' + (p.merged ? '（出演者 ' + p.merged + '名を共通の出演者へまとめ、うち ' + p.added + '名を追加）' : ''), 'success');
                pathIn.value = ''; impName.value = '';
                await reload();
            } catch (e) { WL.toast(e.message, 'error'); }
            finally { impBtn.disabled = false; impBtn.textContent = old; }
        });
        block.appendChild(h('h4', { class: 'wlext-lib-h4' }, 'ほかの videos.db を取り込む'));
        block.appendChild(note('指定した videos.db をコピーして新しいライブラリにします（元のファイルは変更しません）。'
            + 'フォルダを選ぶと、その中の videos.db を取り込みます。出演者は名前で突き合わせて共通の出演者へまとめます。'));
        block.appendChild(h('div', { class: 'wlext-inline wlext-lib-form' }, [pathIn, browse]));
        block.appendChild(h('div', { class: 'wlext-inline wlext-lib-form' }, [impName, impBtn]));

        async function reload() {
            let data;
            try { data = await WL.api.libraries(); }
            catch (e) { listEl.textContent = '読み込みに失敗: ' + e.message; return; }
            const msgs = [];
            if (data.warning) msgs.push(data.warning);
            if (!data.canRestart) msgs.push('この起動方法では自動で再起動できません。切り替えたあとはサーバーを起動し直してください。');
            warn.textContent = msgs.join('\n');
            warn.style.display = msgs.length ? '' : 'none';

            listEl.innerHTML = '';
            data.libraries.forEach(l => listEl.appendChild(row(l, data)));
        }

        function row(l, data) {
            const badges = [];
            if (l.active) badges.push(h('span', { class: 'wlext-lib-badge wlext-lib-badge-active' }, '使用中'));
            if (l.isDefault) badges.push(h('span', { class: 'wlext-lib-badge' }, '既定'));
            if (l.missing) badges.push(h('span', { class: 'wlext-lib-badge wlext-lib-badge-warn' }, 'ファイルなし'));
            const info = [
                l.videos != null ? l.videos + '本' : '-',
                fmtSize(l.size),
                '最終利用 ' + (l.active ? '使用中' : fmtWhen(l.last_used_at)),
            ].join(' / ');

            const btns = [];
            if (!l.active) {
                const sw = h('button', { class: 'wlext-btn', disabled: (!data.local || l.missing) ? 'disabled' : null, title: data.local ? '' : 'この PC からのみ切り替えられます' }, '切り替え');
                sw.addEventListener('click', () => WL.switchLibrary(l));
                btns.push(sw);
            }
            const rn = h('button', { class: 'wlext-btn' }, '名前変更');
            rn.addEventListener('click', () => renameDialog(l));
            btns.push(rn);
            if (!l.isDefault && !l.active) {
                const del = h('button', { class: 'wlext-btn wlext-btn-danger', disabled: data.local ? null : 'disabled', title: data.local ? '' : 'この PC からのみ削除できます' }, '削除');
                del.addEventListener('click', () => deleteDialog(l));
                btns.push(del);
            }
            return h('div', { class: 'wlext-lib-row' + (l.active ? ' wlext-lib-row-active' : '') }, [
                h('div', { class: 'wlext-lib-main' }, [
                    h('div', { class: 'wlext-lib-name' }, [WL.icon('database', 16), h('span', null, l.name), ...badges]),
                    h('div', { class: 'wlext-lib-info' }, info),
                ]),
                h('div', { class: 'wlext-lib-btns' }, btns),
            ]);
        }

        function renameDialog(l) {
            const inp = h('input', { class: 'wlext-input', value: l.name, maxlength: '40' });
            WL.dialog('ライブラリの名前を変更', h('div', null, [inp]), {
                saveLabel: '変更',
                onSave: async (close) => {
                    try {
                        const r = await WL.api.renameLibrary(l.id, inp.value.trim());
                        WL.toast('名前を「' + r.name + '」に変更しました', 'success');
                        close();
                        // ヘッダーの表示は読み直しで変わる (使用中のものを変えたとき)
                        if (l.active) setTimeout(() => location.reload(), 400); else reload();
                    } catch (e) { WL.toast(e.message, 'error'); }
                }
            });
            setTimeout(() => inp.focus(), 50);
        }

        function deleteDialog(l) {
            const inp = h('input', { class: 'wlext-input', placeholder: l.name });
            const body = h('div', { style: { fontSize: '0.9rem', lineHeight: '1.7' } }, [
                h('div', null, 'ライブラリ「' + l.name + '」を削除します。動画ファイルそのものは消えません。'),
                h('div', null, 'データベースのファイルは libraries\\_trash フォルダへ移します（元に戻すときはそこから戻せます）。'),
                h('div', { style: { marginTop: '0.6rem' } }, '確認のため、ライブラリの名前を入力してください。'),
                inp,
            ]);
            WL.dialog('ライブラリを削除', body, {
                saveLabel: '削除する', danger: true,
                onSave: async (close) => {
                    if (inp.value.trim() !== l.name) { WL.toast('名前が一致しません', 'error'); return; }
                    try {
                        await WL.api.deleteLibrary(l.id);
                        WL.toast('「' + l.name + '」を削除しました', 'success');
                        close();
                        reload();
                    } catch (e) { WL.toast(e.message, 'error'); }
                }
            });
        }

        reload();
        return block;
    }

    function ensureSection() {
        if (!WL.matchSettings()) return;
        const found = findContainer();
        if (!found || found.container.querySelector('.wlext-lib-section')) return;
        found.container.insertBefore(buildSection(), found.firstSection);
        // ヘッダーのメニューの「ライブラリの管理」から来たときはこのセクションへ
        let go = null;
        try { go = sessionStorage.getItem('wlext_goto_library'); sessionStorage.removeItem('wlext_goto_library'); } catch (e) { }
        if (go) setTimeout(() => { const s = document.querySelector('.wlext-lib-section'); if (s) s.scrollIntoView(); }, 300);
    }

    WL.onEnsure(() => { ensurePill(); ensureSection(); });
})();
