// =============================================================
// WomanLive 拡張機能 - データベーススキーマ
// 既存の videos.db に「新しいテーブルだけ」を追加します。
// 既存テーブル(metadata/files/settings/screenshots)は一切変更しません。
// 不要になった場合はこれらのテーブルを DROP すれば元に戻ります。
// =============================================================
const db = require('../db');
const { nameKey } = require('./public/namekey');

let initialized = false;

function initSchema() {
    if (initialized) return;

    // 名前ソート用のカスタム関数 (クライアント各一覧と同じ並び順にする)
    // ORDER BY ext_namekey(列) で「かな種別を無視・数字は桁順・頭記号は無視」のソートになる。
    db.function('ext_namekey', { deterministic: true }, (v) => nameKey(v));

    db.exec(`
        -- 動画ごとの拡張メタデータ (hash をキーに既存 metadata と対応)
        CREATE TABLE IF NOT EXISTS ext_video_meta (
            hash         TEXT PRIMARY KEY,
            rating       INTEGER DEFAULT 0,   -- 0〜5 (★の数)
            display_name TEXT,                -- 表示動画名 (タイトル置換用)
            model_no     TEXT,                -- 品番
            release_date TEXT,                -- 公開日 (YYYY-MM-DD)
            series       TEXT,                -- シリーズ名
            maker        TEXT,                -- メーカー
            label        TEXT,                -- レーベル
            directors    TEXT,                -- 作品監督 (改行区切りで複数)
            genres       TEXT,                -- ジャンル   (改行区切りで複数)
            performers   TEXT,                -- 出演者     (改行区切りの performer id)
            updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- ダウンロードしたカバー画像 (フォルダ未設定でも保持できる保存先)
        CREATE TABLE IF NOT EXISTS ext_video_cover (
            hash       TEXT PRIMARY KEY,
            image      BLOB,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- タグ一覧ページ用のカスタムサムネイル (タグ名をキーに保存)
        CREATE TABLE IF NOT EXISTS ext_tag_thumb (
            name       TEXT PRIMARY KEY COLLATE NOCASE,
            image      BLOB,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- ブックマーク フォルダ
        CREATE TABLE IF NOT EXISTS ext_bookmark_folders (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        -- ブックマーク (フォルダ×動画hash)
        CREATE TABLE IF NOT EXISTS ext_bookmarks (
            folder_id  INTEGER,
            hash       TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (folder_id, hash)
        );

        -- 出演者マスタ
        CREATE TABLE IF NOT EXISTS ext_performers (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT UNIQUE COLLATE NOCASE,
            furigana   TEXT,
            birthday   TEXT,                  -- YYYY-MM-DD
            height     TEXT,
            weight     TEXT,
            bust       TEXT,
            cup        TEXT,
            waist      TEXT,
            hip        TEXT,
            blood_type TEXT,
            aliases    TEXT,                  -- 別名 (改行区切り)
            rating     INTEGER DEFAULT 0,
            tags       TEXT,                  -- 出演者タグ (改行区切り)
            image      BLOB,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- 関連動画の事前計算キャッシュ (src_hash ごとに上位 N 件の rel_hash を保持)
        -- rel_hash が NULL の行は「計算済みだが該当なし」のマーカー。
        CREATE TABLE IF NOT EXISTS ext_related (
            src_hash    TEXT,
            rank        INTEGER,
            rel_hash    TEXT,
            score       REAL,
            computed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (src_hash, rank)
        );
        CREATE INDEX IF NOT EXISTS idx_ext_related_rel ON ext_related(rel_hash);
    `);

    initialized = true;
    console.log('[WomanLive拡張] スキーマを初期化しました');
}

// --- 汎用ヘルパ ---
function splitList(text) {
    return text ? String(text).split('\n').map(s => s.trim()).filter(s => s.length > 0) : [];
}
function joinList(arr) {
    if (!Array.isArray(arr)) return null;
    const cleaned = arr.map(s => String(s).trim()).filter(s => s.length > 0);
    return cleaned.length > 0 ? cleaned.join('\n') : null;
}
function getSetting(key, def = null) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    if (!row) return def;
    try { return JSON.parse(row.value); } catch (e) { return def; }
}
function setSetting(key, value) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
}
function hashOfVideo(id) {
    const row = db.prepare('SELECT hash FROM files WHERE id = ?').get(id);
    return row ? row.hash : null;
}

// 画像バッファ先頭のマジックバイトから Content-Type を判定 (PNG/JPEG 以外は webp とみなす)
function imageContentType(buf) {
    if (buf[0] === 0x89) return 'image/png';
    if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg';
    return 'image/webp';
}

// カバー/サムネとして扱う画像拡張子 (フォルダ内の同名画像探索・削除で共用)
const IMG_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif'];

// 検索ソートキー -> SQL ORDER BY 句 (拡張検索 search.js / 全文検索 fullsearch.js で共用)
const SORT_MAP = {
    'updated_desc': 'f.updated_at DESC',
    'updated_asc': 'f.updated_at ASC',
    'name_asc': 'ext_namekey(f.filename) ASC',
    'duration_desc': 'm.duration DESC',
    'created_desc': 'm.created_at DESC',
    'history_desc': 'm.last_played_at DESC',
    'play_count_desc': 'm.play_count DESC',
    'ext_rating_desc': 'IFNULL(e.rating,0) DESC, f.updated_at DESC',
    'ext_rating_asc': 'IFNULL(e.rating,0) ASC, f.updated_at DESC',
    'ext_screenshots_desc': '(SELECT COUNT(*) FROM screenshots s WHERE s.hash = f.hash) DESC, f.updated_at DESC',
    'ext_screenshots_asc': '(SELECT COUNT(*) FROM screenshots s WHERE s.hash = f.hash) ASC, f.updated_at DESC',
    'ext_displayname_asc': "ext_namekey(COALESCE(NULLIF(e.display_name,''), f.filename)) ASC",
    'ext_displayname_desc': "ext_namekey(COALESCE(NULLIF(e.display_name,''), f.filename)) DESC",
};

// 画像変換用 sharp (未インストールでも動作: null のときは変換をスキップ)
let sharp = null;
try { sharp = require('sharp'); } catch (e) { /* 変換なしでも動作 */ }

module.exports = { db, initSchema, splitList, joinList, getSetting, setSetting, hashOfVideo, imageContentType, IMG_EXTS, SORT_MAP, sharp };
