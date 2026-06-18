// =============================================================
// 出演者タグ 自動付与ルール
//  ルール = { field, op, value, tag }
//  例: { field:'height', op:'>=', value:'170', tag:'高身長' }
//  ・適用: 条件に合う出演者へタグを付与 (冪等)
//  ・同期(sync): 条件に合わない出演者から「ルールのタグ」を外す
// =============================================================
const { db, splitList, joinList, getSetting, setSetting } = require('../db');

const RULES_KEY = 'ext_performer_tag_rules';
const NUMERIC = ['height', 'weight', 'bust', 'waist', 'hip', 'rating', 'age'];

function getRulesArr() {
    const r = getSetting(RULES_KEY, []);
    return Array.isArray(r) ? r : [];
}

exports.getRules = (req, res) => {
    try { res.json(getRulesArr()); }
    catch (e) { res.status(500).json({ error: e.message }); }
};

exports.setRules = (req, res) => {
    try {
        const rules = (req.body && req.body.rules) || [];
        const clean = (Array.isArray(rules) ? rules : []).map(r => ({
            field: String(r.field || '').trim(),
            op: String(r.op || '').trim(),
            value: String(r.value == null ? '' : r.value).trim(),
            tag: String(r.tag || '').trim(),
        })).filter(r => r.field && r.op && r.tag && r.value !== '');
        setSetting(RULES_KEY, clean);
        res.json({ success: true, count: clean.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

function ageYears(birthday) {
    if (!birthday) return null;
    const m = String(birthday).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return null;
    const b = new Date(+m[1], +m[2] - 1, +m[3]);
    if (isNaN(b.getTime())) return null;
    const now = new Date();
    let a = now.getFullYear() - b.getFullYear();
    if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--;
    return a < 0 ? null : a;
}

function fieldVal(p, field, age) {
    switch (field) {
        case 'age': return age;
        case 'height': return p.height; case 'weight': return p.weight;
        case 'bust': return p.bust; case 'waist': return p.waist; case 'hip': return p.hip;
        case 'rating': return p.rating; case 'cup': return p.cup; case 'blood_type': return p.blood_type;
        default: return null;
    }
}

function compareNum(a, b, op) {
    switch (op) {
        case '>=': return a >= b; case '<=': return a <= b;
        case '>': return a > b; case '<': return a < b;
        case '=': return a === b; case '≠': case '!=': return a !== b;
        default: return false;
    }
}
function compareStr(a, b, op) {
    switch (op) {
        case '=': return a === b; case '≠': case '!=': return a !== b;
        case '含む': case 'contains': return a.includes(b);
        case '>=': return a >= b; case '<=': return a <= b;
        case '>': return a > b; case '<': return a < b;
        default: return false;
    }
}

function evalRule(rule, p, age) {
    const raw = fieldVal(p, rule.field, age);
    if (rule.op === '含む' || rule.op === 'contains') {
        return String(raw == null ? '' : raw).includes(String(rule.value));
    }
    if (NUMERIC.includes(rule.field)) {
        const a = (rule.field === 'age') ? raw : parseFloat(raw);
        const b = parseFloat(rule.value);
        if (a === null || a === undefined || isNaN(a) || isNaN(b)) return false;
        return compareNum(a, b, rule.op);
    }
    return compareStr(String(raw == null ? '' : raw), String(rule.value), rule.op);
}

// コア処理: 全出演者へルール適用
function applyRules(sync) {
    const rules = getRulesArr();
    if (!rules.length) return { rules: 0, performersChanged: 0, tagsAdded: 0, tagsRemoved: 0 };

    const performers = db.prepare(`
        SELECT id, height, weight, bust, waist, hip, cup, rating, blood_type, birthday, tags
        FROM ext_performers
    `).all();
    const ruleTags = [...new Set(rules.map(r => r.tag))];
    const upd = db.prepare('UPDATE ext_performers SET tags=?, updated_at=CURRENT_TIMESTAMP WHERE id=?');

    let performersChanged = 0, tagsAdded = 0, tagsRemoved = 0;

    db.transaction(() => {
        for (const p of performers) {
            const age = ageYears(p.birthday);
            let tags = splitList(p.tags);
            let changed = false;

            const matchedTags = new Set();
            for (const rule of rules) { if (evalRule(rule, p, age)) matchedTags.add(rule.tag); }

            matchedTags.forEach(t => { if (!tags.includes(t)) { tags.push(t); tagsAdded++; changed = true; } });

            if (sync) {
                ruleTags.forEach(t => {
                    if (!matchedTags.has(t) && tags.includes(t)) { tags = tags.filter(x => x !== t); tagsRemoved++; changed = true; }
                });
            }

            if (changed) { upd.run(joinList(tags), p.id); performersChanged++; }
        }
    })();

    return { rules: rules.length, performersChanged, tagsAdded, tagsRemoved };
}
exports.applyRules = applyRules;

exports.apply = (req, res) => {
    try {
        const sync = !!(req.body && req.body.sync);
        res.json({ success: true, ...applyRules(sync) });
    } catch (e) {
        console.error('[ext tagrules apply]', e);
        res.status(500).json({ error: e.message });
    }
};
