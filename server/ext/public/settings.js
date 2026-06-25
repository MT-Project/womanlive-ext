/* =============================================================
   WomanLive 拡張 - 設定ページへの「拡張機能」セクション注入
   (カバー画像フォルダの指定)
   ============================================================= */
(function () {
    'use strict';
    const WL = window.WLExt; const h = WL.h;

    // 拡張機能セクションの見出し (先頭に 🧩 のモノクロアイコン)
    function extH3(text) {
        return h('h3', { class: 'wlext-ext-h3' }, [WL.icon('puzzle', 16), h('span', null, text)]);
    }

    function findContainer() {
        const root = document.getElementById('root'); if (!root) return null;
        const h2s = root.querySelectorAll('h2');
        for (const el of h2s) {
            if (el.textContent && el.textContent.indexOf('スキャン') !== -1) {
                const section = el.parentElement;            // .section
                if (section && section.parentElement) return { container: section.parentElement, firstSection: section };
            }
        }
        return null;
    }

    function ensure() {
        if (!WL.matchSettings()) return;
        const found = findContainer();
        if (!found) return;
        if (found.container.querySelector('.wlext-settings-host')) return;

        const host = h('div', { class: 'wlext-settings-host wlext-settings-section' });
        host.appendChild(extH3('拡張機能：カバー画像'));

        const input = h('input', { class: 'wlext-input', placeholder: '(例) C:\\covers', value: '' });
        const browseBtn = h('button', { class: 'wlext-btn', onClick: () => openFolderPicker((p) => { input.value = p; }) }, '参照...');
        const saveBtn = h('button', { class: 'wlext-btn wlext-btn-primary', onClick: async () => { try { await WL.api.saveExtSettings({ cover_folder: input.value.trim() }); WL.toast('カバー画像フォルダを保存しました', 'success'); } catch (e) { WL.toast('保存に失敗: ' + e.message, 'error'); } } }, '保存');

        host.appendChild(h('div', { style: { fontSize: '0.8rem', color: 'var(--text-secondary,#777)', marginBottom: '0.5rem' } },
            '動画ファイル名と同じ名前の画像（例: AAA.mp4 → AAA.jpg）をこのフォルダから探し、動画ページのカバー画像として表示します。'));
        host.appendChild(h('div', { class: 'wlext-inline' }, [input, browseBtn, saveBtn]));

        found.container.insertBefore(host, found.firstSection);

        // ---- DMM(FANZA) 商品検索API 設定 ----
        const dmmSection = h('div', { class: 'wlext-settings-host wlext-settings-section' });
        dmmSection.appendChild(extH3('拡張機能：DMM(FANZA) 商品検索API'));
        dmmSection.appendChild(h('div', { style: { fontSize: '0.8rem', color: 'var(--text-secondary,#777)', marginBottom: '0.6rem' } },
            '各動画ページの🔍ボタンで品番からFANZA商品情報を検索し、メタデータへ自動設定します。利用にはご自身のDMMアカウントで取得したAPI IDとアフィリエイトIDが必要です。'));
        const apiIn = h('input', { class: 'wlext-input', placeholder: 'API ID', value: '' });
        const affIn = h('input', { class: 'wlext-input', placeholder: 'アフィリエイトID (例: xxxxx-999)', value: '' });
        const dmmSave = h('button', {
            class: 'wlext-btn wlext-btn-primary', onClick: async () => {
                try { await WL.api.saveExtSettings({ dmm_api_id: apiIn.value.trim(), dmm_affiliate_id: affIn.value.trim() }); WL.toast('DMM API設定を保存しました', 'success'); }
                catch (e) { WL.toast('保存に失敗: ' + e.message, 'error'); }
            }
        }, '保存');
        dmmSection.appendChild(h('div', { class: 'wlext-field' }, [h('label', null, 'API ID'), apiIn]));
        dmmSection.appendChild(h('div', { class: 'wlext-field' }, [h('label', null, 'アフィリエイトID'), affIn]));
        dmmSection.appendChild(h('div', { class: 'wlext-inline' }, [dmmSave]));
        found.container.insertBefore(dmmSection, found.firstSection);

        // 現在値を読み込み
        WL.api.getExtSettings().then(s => {
            input.value = s.cover_folder || '';
            apiIn.value = s.dmm_api_id || '';
            affIn.value = s.dmm_affiliate_id || '';
        }).catch(() => { });

        // 注: JSON 一括取込 (動画/出演者) は個人用(private)へ移設しました。
        //     設定ページへのUI注入は server/private/public/importui.js が行います。
        found.container.insertBefore(buildTagRuleSection(), found.firstSection);
        found.container.insertBefore(buildRelatedSection(), found.firstSection);
        found.container.insertBefore(buildBackupSection(), found.firstSection);
    }

    // 関連動画の重み付け セクション
    function buildRelatedSection() {
        const FIELDS = [
            ['series', 'シリーズ一致'], ['performer', '出演者一致(1名ごと)'],
            ['maker', 'メーカー一致'], ['label', 'レーベル一致'], ['director', '監督一致'],
            ['genre', 'ジャンル一致(1つ)'], ['genreCap', 'ジャンル加点の上限(個数)'],
            ['tag', 'タグ一致(1つ)'], ['tagCap', 'タグ加点の上限(個数)'],
            ['releaseYear', '公開年が同じ'], ['releaseMonth', '公開月も同じ(加算)'],
            ['rating', '評価の近さ(最大)']
        ];

        const block = h('div', { class: 'wlext-settings-host wlext-settings-section' });
        block.appendChild(extH3('拡張機能：関連動画（重み付け）'));
        block.appendChild(h('div', { style: { fontSize: '0.8rem', color: 'var(--text-secondary,#777)', marginBottom: '0.6rem' } },
            '動画ページの「関連動画」を、拡張メタデータ（シリーズ・出演者・メーカー等）の一致度で選びます。各項目の点数（重み）を調整できます（0 でその項目は無視）。シリーズ最重視が既定です。保存すると以後の表示に反映され（必要時に再計算）、「全再計算」で全動画を今すぐ計算し直します（横断的な変更も反映）。'));

        const inputs = {};
        const grid = h('div', { class: 'wlext-related-grid' });
        FIELDS.forEach(([key, label]) => {
            const inp = h('input', { class: 'wlext-input', type: 'number', step: '1' });
            inputs[key] = inp;
            grid.appendChild(h('label', { class: 'wlext-related-field' }, [h('span', null, label), inp]));
        });
        block.appendChild(grid);

        const result = h('div', { style: { fontSize: '0.82rem', marginTop: '0.6rem', whiteSpace: 'pre-wrap' } });

        function collect() {
            const w = {};
            Object.keys(inputs).forEach(k => { const v = parseFloat(inputs[k].value); w[k] = isNaN(v) ? 0 : v; });
            return w;
        }
        async function save() {
            try { await WL.api.saveRelatedWeights(collect()); WL.toast('重み付けを保存しました（関連動画は順次再計算されます）', 'success'); }
            catch (e) { WL.toast('保存に失敗: ' + e.message, 'error'); }
        }
        async function rebuild() {
            result.textContent = '全再計算中... しばらくお待ちください';
            try {
                await WL.api.saveRelatedWeights(collect());
                const r = await WL.api.rebuildRelated();
                result.textContent = '全再計算が完了しました（対象 ' + r.count + ' 件）';
                WL.toast('関連動画を再計算しました', 'success');
            } catch (e) { result.textContent = 'エラー: ' + e.message; WL.toast('再計算に失敗: ' + e.message, 'error'); }
        }

        block.appendChild(h('div', { class: 'wlext-inline', style: { marginTop: '0.6rem' } }, [
            h('button', { class: 'wlext-btn wlext-btn-primary', onClick: save }, '保存'),
            h('button', { class: 'wlext-btn', onClick: rebuild }, '全再計算')
        ]));
        block.appendChild(result);

        WL.api.getRelatedWeights().then(d => {
            const w = (d && d.weights) || {};
            Object.keys(inputs).forEach(k => { inputs[k].value = (w[k] != null ? w[k] : ''); });
        }).catch(() => { });

        return block;
    }

    // バックアップ (エクスポート / インポート) セクション
    function buildBackupSection() {
        const block = h('div', { class: 'wlext-settings-host wlext-settings-section' });
        block.appendChild(extH3('拡張機能：バックアップ（追加機能データ）'));
        block.appendChild(h('div', { style: { fontSize: '0.8rem', color: 'var(--text-secondary,#777)', marginBottom: '0.6rem' } },
            '拡張機能のデータ（動画の追加メタデータ・出演者情報と画像・出演者タグのプリセット・タグ付与ルール・ブックマーク・各種設定）を JSON で書き出し／復元します。動画ファイル自体やWomanLive標準のデータは含みません。'));

        const result = h('div', { style: { fontSize: '0.82rem', marginTop: '0.6rem', whiteSpace: 'pre-wrap' } });

        async function doExport() {
            result.textContent = 'エクスポート中...';
            try {
                const data = await WL.api.backupExport();
                const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const now = new Date();
                const stamp = now.getFullYear() + ('0' + (now.getMonth() + 1)).slice(-2) + ('0' + now.getDate()).slice(-2) + '-' + ('0' + now.getHours()).slice(-2) + ('0' + now.getMinutes()).slice(-2);
                const a = h('a', { href: url, download: 'womanlive-ext-backup-' + stamp + '.json' });
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                result.textContent = 'エクスポートしました。';
                WL.toast('バックアップを書き出しました', 'success');
            } catch (e) { result.textContent = 'エクスポート失敗: ' + e.message; WL.toast('エクスポート失敗', 'error'); }
        }

        let importData = null;
        const fileInput = h('input', { type: 'file', accept: '.json,application/json' });
        const status = h('div', { style: { fontSize: '0.82rem', margin: '0.5rem 0', color: 'var(--text-secondary,#777)' } }, '※ 復元するJSONを選択');
        fileInput.addEventListener('change', () => {
            const f = fileInput.files && fileInput.files[0]; if (!f) return;
            status.textContent = '読み込み中...';
            const rd = new FileReader();
            rd.onload = () => {
                try { importData = JSON.parse(rd.result); status.textContent = f.name + ' を読み込みました'; }
                catch (e) { importData = null; status.textContent = 'JSON解析エラー: ' + e.message; }
            };
            rd.readAsText(f);
        });

        function doImport() {
            if (!importData) { WL.toast('先にJSONファイルを選択してください', 'error'); return; }
            WL.dialog('バックアップを復元', h('div', { style: { fontSize: '0.9rem', lineHeight: '1.6' } },
                '現在の拡張機能データ（追加メタ・出演者・ブックマーク等）は、バックアップの内容で置き換えられます。よろしいですか？'), {
                saveLabel: '復元する',
                onSave: async (close) => {
                    result.textContent = 'インポート中...';
                    try {
                        const r = await WL.api.backupImport(importData);
                        result.textContent = '【復元完了】\n動画メタ: ' + (r.video_meta || 0) + ' / 出演者: ' + (r.performers || 0) +
                            ' / カバー: ' + (r.video_cover || 0) + ' / ブックマーク: ' + (r.bookmarks || 0) + '件 / フォルダ: ' + (r.bookmark_folders || 0);
                        WL.toast('復元しました', 'success');
                        close();
                    } catch (e) { result.textContent = 'インポート失敗: ' + e.message; WL.toast('インポート失敗: ' + e.message, 'error'); }
                }
            });
        }

        block.appendChild(h('div', { class: 'wlext-inline', style: { marginBottom: '0.6rem' } }, [
            h('button', { class: 'wlext-btn wlext-btn-primary', onClick: doExport }, 'エクスポート')
        ]));
        block.appendChild(fileInput);
        block.appendChild(status);
        block.appendChild(h('div', { class: 'wlext-inline' }, [h('button', { class: 'wlext-btn', onClick: doImport }, 'インポート（復元）')]));
        block.appendChild(result);
        return block;
    }

    // 出演者タグ 自動付与ルール セクション
    function buildTagRuleSection() {
        const FIELDS = [['height', '身長'], ['weight', '体重'], ['bust', 'バスト'], ['waist', 'ウェスト'], ['hip', 'ヒップ'], ['cup', 'カップ数'], ['rating', '評価'], ['age', '年齢'], ['blood_type', '血液型']];
        const OPS = [['>=', '≧'], ['<=', '≦'], ['>', '>'], ['<', '<'], ['=', '='], ['≠', '≠'], ['含む', '含む']];

        const block = h('div', { class: 'wlext-settings-host wlext-settings-section' });
        block.appendChild(extH3('拡張機能：出演者タグ 自動付与ルール'));
        block.appendChild(h('div', { style: { fontSize: '0.8rem', color: 'var(--text-secondary,#777)', marginBottom: '0.6rem' } },
            '条件に合う出演者へ自動でタグを付けます（例: 身長 ≧ 170 → 高身長）。「適用」で全出演者に一括付与します（出演者情報の取込時にも自動で付与されます）。'));

        const rulesHost = h('div', { class: 'wlext-rules' });
        block.appendChild(rulesHost);

        function mkSelect(options, value, cls) {
            const sel = h('select', { class: cls || 'wlext-rule-select' });
            options.forEach(([v, l]) => sel.appendChild(h('option', { value: v }, l)));
            sel.value = value;
            return sel;
        }
        function addRow(rule) {
            rule = rule || {};
            const row = h('div', { class: 'wlext-rule-row' }, [
                mkSelect(FIELDS, rule.field || 'height'),
                mkSelect(OPS, rule.op || '>='),
                h('input', { class: 'wlext-input wlext-rule-val', value: rule.value != null ? rule.value : '' }),
                h('span', { style: { color: 'var(--text-secondary,#888)' } }, '→'),
                h('input', { class: 'wlext-input wlext-rule-tag', value: rule.tag || '', placeholder: '付与するタグ' }),
                h('button', { class: 'wlext-btn', title: '削除', onClick: (e) => e.currentTarget.parentElement.remove() }, '×')
            ]);
            rulesHost.appendChild(row);
        }
        function collect() {
            return [...rulesHost.querySelectorAll('.wlext-rule-row')].map(row => {
                const sels = row.querySelectorAll('select');
                const ins = row.querySelectorAll('input');
                return { field: sels[0].value, op: sels[1].value, value: ins[0].value.trim(), tag: ins[1].value.trim() };
            }).filter(r => r.field && r.op && r.tag && r.value !== '');
        }

        const syncChk = h('input', { type: 'checkbox' });
        const result = h('div', { style: { fontSize: '0.82rem', marginTop: '0.6rem', whiteSpace: 'pre-wrap' } });

        async function save() {
            try { await WL.api.saveTagRules(collect()); WL.toast('ルールを保存しました', 'success'); }
            catch (e) { WL.toast('保存に失敗: ' + e.message, 'error'); }
        }
        async function apply() {
            try {
                await WL.api.saveTagRules(collect());                 // 念のため保存してから適用
                const r = await WL.api.applyTagRules(syncChk.checked);
                result.textContent = `ルール適用完了\n付与: ${r.tagsAdded} 件 / 解除: ${r.tagsRemoved} 件 / 変更出演者: ${r.performersChanged} 名（ルール ${r.rules} 件）`;
                WL.toast('タグを付与しました', 'success');
            } catch (e) { result.textContent = 'エラー: ' + e.message; WL.toast('適用に失敗: ' + e.message, 'error'); }
        }

        block.appendChild(h('div', { style: { margin: '0.5rem 0' } },
            h('button', { class: 'wlext-btn', onClick: () => addRow({}) }, '＋ ルールを追加')));
        block.appendChild(h('label', { style: { fontSize: '0.82rem', cursor: 'pointer', display: 'block', margin: '0.3rem 0' } },
            [syncChk, ' 条件に合わない出演者から、ルールのタグを外す（同期）']));
        block.appendChild(h('div', { class: 'wlext-inline' }, [
            h('button', { class: 'wlext-btn', onClick: save }, 'ルールを保存'),
            h('button', { class: 'wlext-btn wlext-btn-primary', onClick: apply }, '適用')
        ]));
        block.appendChild(result);

        WL.api.getTagRules().then(rules => {
            if (Array.isArray(rules) && rules.length) rules.forEach(addRow);
            else addRow({ field: 'height', op: '>=', value: '170', tag: '高身長' });
        }).catch(() => addRow({}));

        return block;
    }

    /* ---------- 簡易フォルダピッカ ---------- */
    function openFolderPicker(onSelect) {
        let cur = '/';
        const listEl = h('div', { style: { maxHeight: '320px', overflowY: 'auto', border: '1px solid var(--border-primary,#ccc)', borderRadius: '4px' } });
        const pathEl = h('div', { style: { fontSize: '0.8rem', wordBreak: 'break-all', marginBottom: '0.5rem', color: 'var(--text-secondary,#777)' } });

        function item(label, onClick, bold) {
            return h('div', {
                style: { padding: '0.45rem 0.6rem', cursor: 'pointer', borderBottom: '1px solid var(--border-primary,#eee)', fontWeight: bold ? 'bold' : 'normal' },
                onMouseenter: (e) => e.currentTarget.style.background = 'var(--bg-hover,#eee)',
                onMouseleave: (e) => e.currentTarget.style.background = '',
                onClick
            }, label);
        }

        async function load(path) {
            cur = path; pathEl.textContent = '現在地: ' + (path === '/' ? 'コンピューター (ドライブ選択)' : path);
            listEl.innerHTML = '';
            if (path !== '/') {
                listEl.appendChild(item('📁 .. (上へ)', async () => { try { const r = await WL.api.fsResolve(path, '..'); load(r.path); } catch (e) { WL.toast(e.message, 'error'); } }));
            }
            try {
                const items = await WL.api.fsList(path);
                if (!items.length) listEl.appendChild(h('div', { style: { padding: '0.6rem', color: 'var(--text-secondary,#999)' } }, '(サブフォルダなし)'));
                items.forEach(it => listEl.appendChild(item('📁 ' + it.name, async () => {
                    try { const r = await WL.api.fsResolve(path, it.path || it.name); load(r.path); }
                    catch (e) { load(it.path); }
                })));
            } catch (e) { listEl.appendChild(h('div', { style: { padding: '0.6rem', color: 'var(--status-error,#e51400)' } }, '読み込み失敗: ' + e.message)); }
        }

        const body = h('div', null, [pathEl, listEl]);
        const close = WL.dialog('フォルダを選択', body, {
            saveLabel: 'このフォルダを選択',
            onSave: (close) => { if (cur && cur !== '/') { onSelect(cur); close(); } else { WL.toast('フォルダを開いてください', 'error'); } }
        });
        load('/');
    }

    WL.onEnsure(ensure);
})();
