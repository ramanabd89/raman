const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const compression = require('compression');
const { db, tx, hashPassword, verifyPassword, newReferralCode, getSettings, setSetting, UPLOAD_DIR } = require('./db');
const fs = require('fs');
const { sendOtp, verifyOtp, OtpError, PROVIDER: SMS_PROVIDER } = require('./sms');
const { notify, orderMessage, escHtml, enabled: telegramEnabled } = require('./notify');
const { startBackups, snapshot, listBackups, DIR: BACKUP_DIR } = require('./backup');
const { newSecret, verifyTotp, otpauthUrl } = require('./totp');
const { processUpload, ogImageFor } = require('./images');
const { normalize, searchClause, relevance } = require('./search');
const extrasModule = require('./extras');
const smart = require('./smart');
const repair = require('./repair');
const reviews = require('./reviews');
const { isStaff } = extrasModule;
let extras = { recordStock: () => {}, pruneAnalytics: () => {} }; // filled in once the admin router exists

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY); // e.g. 1 behind Nginx / a PaaS, so rate limits see the real client IP
app.use(compression()); // gzip: pages and scripts are ~4× smaller on mobile data
app.use(express.json({ limit: '1mb' }));
// Security headers. The CSP only allows our own scripts (+ cdnjs for the admin QR code) and Google Fonts.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' https:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY'); // nobody can embed the shop/admin in a frame (clickjacking)
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Content-Security-Policy', CSP);
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// ---------------- utils ----------------
const ORDER_STATUSES = ['pending', 'preparing', 'shipping', 'delivered', 'cancelled'];
const ORDER_SOURCES = ['tiktok', 'instagram', 'facebook', 'snapchat', 'friend', 'influencer', 'google', 'store', 'other'];
const PUBLIC_SETTINGS = ['store_name', 'delivery_fee', 'free_delivery_over', 'referral_reward', 'flash_sale_end',
  'search_tags', 'cities', 'whatsapp', 'instagram', 'facebook', 'tiktok', 'support_phone', 'delivery_zones', 'store_address', 'store_map_url', 'exchange_days', 'warranty_text',
  'slogan', 'seo_description', 'maintenance_mode', 'maintenance_message', 'price_display', 'cashback_percent', 'usd_rate', 'tradein_enabled', 'repair_enabled', 'proof_enabled',
  'reviews_enabled', 'reviews_buyers_only', 'bundle_discount_percent', 'store_hours'];
const ADMIN_SETTINGS = [...PUBLIC_SETTINGS, 'max_pending_orders', 'confirm_over', 'usd_round', 'min_profit',
  'repair_pickup', 'repair_pickup_fee', 'repair_free_diagnosis', 'repair_honest_pct', 'repair_open', 'repair_close', 'repair_closed_days', 'repair_slot_capacity'];
// Secret admin address, e.g. ADMIN_PATH=/the-gate (default /admin).
const ADMIN_PATH = '/' + String(process.env.ADMIN_PATH || '/admin').replace(/^\/+|\/+$/g, '').replace(/[^\w-]/g, '');
const SESSION_DAYS = { customer: 30 }; // staff accounts: 7 days
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');

class HttpError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }
const wrap = (fn) => (req, res, next) => { try { const r = fn(req, res, next); if (r && r.catch) r.catch(next); } catch (e) { next(e); } };
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const str = (v, max = 500) => (v == null ? '' : String(v).trim().slice(0, max));
const normPhone = (p) => str(p, 20).replace(/[^\d+]/g, '');

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, name: u.name, phone: u.phone, role: u.role, wallet: u.wallet, referral_code: u.referral_code, avatar: u.avatar, created_at: u.created_at, totp_enabled: !!u.totp_enabled };
}
const parseJson = (v, d) => { try { const x = JSON.parse(v); return x ?? d; } catch { return d; } };
function productOut(p, isAdmin = false) {
  if (!p) return p;
  const out = { ...p, images: parseJson(p.images || '[]', []), specs: parseJson(p.specs || '[]', []), bundle_ids: parseJson(p.bundle_ids || '[]', []), attrs: parseJson(p.attrs || '{}', {}),
    featured: !!p.featured, trending: !!p.trending, flash_sale: !!p.flash_sale, active: !!p.active, has_variants: p.variant_count > 0 };
  if (!isAdmin) { delete out.cost_price; delete out.search_text; delete out.bundle_ids; }
  return out;
}
const publicVariant = ({ cost_price, ...v }) => v; // never send purchase cost to customers
const tagsOf = (productId) => db.prepare('SELECT t.id, t.name_ku, t.name_ar, t.name_en, t.color FROM tags t JOIN product_tags pt ON pt.tag_id = t.id WHERE pt.product_id = ? ORDER BY t.id').all(productId);
const variantsOf = (productId) => db.prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY sort, id').all(productId);
function attachVariants(list) {
  const ids = list.filter((p) => p.has_variants).map((p) => p.id);
  if (!ids.length) return list;
  const rows = db.prepare(`SELECT * FROM product_variants WHERE product_id IN (${ids.map(() => '?').join(',')}) ORDER BY sort, id`).all(...ids);
  for (const p of list) p.variants = rows.filter((v) => v.product_id === p.id);
  return list;
}
// Keep products.price/old_price/stock equal to the cheapest variant / total variant stock so sorting and listing stay simple.
function syncProductFromVariants(productId) {
  const vs = variantsOf(productId);
  if (!vs.length) return;
  const cheapest = vs.reduce((a, v) => (v.price < a.price ? v : a), vs[0]);
  db.prepare('UPDATE products SET price = ?, old_price = ?, stock = ? WHERE id = ?')
    .run(cheapest.price, cheapest.old_price, vs.reduce((a, v) => a + v.stock, 0), productId);
}
// ---- delivery zones ----
function zonesOf(s) {
  try { const z = JSON.parse(s.delivery_zones || '[]'); return Array.isArray(z) ? z.filter((x) => x && x.name) : []; } catch { return []; }
}
function deliveryFor(city, subtotal, s) {
  const zones = zonesOf(s);
  const zone = zones.find((z) => z.name === city);
  if (zones.length && city && !zone) throw new HttpError(400, 'invalid_city');
  const freeOver = int(s.free_delivery_over, 0);
  if (freeOver && subtotal >= freeOver) return 0;
  return zone ? Math.max(0, int(zone.fee)) : int(s.delivery_fee, 0);
}

// ---- USD-linked prices: IQD price = USD × rate, rounded to usd_round (default 250) ----
function toIqd(usd, s = getSettings()) {
  const rate = Number(s.usd_rate) || 0;
  const step = Math.max(1, int(s.usd_round, 250));
  return usd ? Math.round((usd * rate) / step) * step : null;
}
function repriceUsd() {
  const s = getSettings();
  if (!(Number(s.usd_rate) > 0)) return 0;
  const products = db.prepare('SELECT id, price_usd, old_price_usd FROM products WHERE usd_priced = 1').all();
  for (const p of products) {
    db.prepare('UPDATE products SET price = ?, old_price = ? WHERE id = ?').run(toIqd(p.price_usd, s) || 0, toIqd(p.old_price_usd, s), p.id);
    for (const v of db.prepare('SELECT id, price_usd, old_price_usd FROM product_variants WHERE product_id = ?').all(p.id)) {
      db.prepare('UPDATE product_variants SET price = ?, old_price = ? WHERE id = ?').run(toIqd(v.price_usd, s) || 0, toIqd(v.old_price_usd, s), v.id);
    }
    syncProductFromVariants(p.id);
  }
  return products.length;
}

// ---- search index: normalised names + brand + category names (see server/search.js) ----
function indexProduct(id) {
  // Own category only: a screen protector must not match "case" through its parent "Cases & Protection".
  const p = db.prepare(`SELECT p.name_ku, p.name_ar, p.name_en, p.brand, c.name_ku ck, c.name_ar ca, c.name_en ce
    FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?`).get(id);
  if (!p) return;
  const labels = db.prepare('SELECT label FROM product_variants WHERE product_id = ?').all(id).map((v) => v.label);
  db.prepare('UPDATE products SET search_text = ? WHERE id = ?').run(` ${normalize([...Object.values(p), ...labels].filter(Boolean).join(' '))} `, id);
}
function rebuildSearchIndex() { for (const { id } of db.prepare('SELECT id FROM products').all()) indexProduct(id); }

const VARIANT_COUNT_SQL = '(SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id) AS variant_count';

// ---------------- auth ----------------
function auth(req, _res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (token) {
    const row = db.prepare("SELECT u.*, julianday('now') - julianday(s.created_at) AS session_age FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?").get(token);
    if (row && row.session_age <= (SESSION_DAYS[row.role] || 7)) { req.user = row; req.token = token; }
    else if (row) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
  next();
}
const requireUser = (req, _res, next) => (req.user ? next() : next(new HttpError(401, 'unauthorized')));
const requireAdmin = (req, _res, next) => (req.user && isStaff(req.user.role) ? next() : next(new HttpError(403, 'forbidden'))); // any staff role; sections are checked in extras.js
app.use('/api', auth);

// Rate limiting stored in the database, so it survives restarts. Keys look like "ip:1.2.3.4" or "phone:0750...".
const WINDOW_MS = 15 * 60 * 1000;
const LIMITS = { ip: 30, phone: 8, coupon: 15, revup: 12 };
function failures(key) { return db.prepare('SELECT COUNT(*) n FROM auth_failures WHERE key = ? AND ts > ?').get(key, Date.now() - WINDOW_MS).n; }
function checkLimit(keys) {
  for (const k of keys) if (failures(k) >= LIMITS[k.split(':')[0]]) throw new HttpError(429, 'too_many_attempts');
}
function recordFailure(keys) { const ins = db.prepare('INSERT INTO auth_failures(key, ts) VALUES(?, ?)'); for (const k of keys) ins.run(k, Date.now()); }
function rateLimit(req) { const k = [`ip:${req.ip}`]; checkLimit(k); recordFailure(k); } // generic throttle: counts every call
function logAdmin(req, action, details) {
  db.prepare('INSERT INTO admin_log(user_id, user_name, action, details) VALUES(?,?,?,?)')
    .run(req.user ? req.user.id : null, req.user ? req.user.name : '', action, typeof details === 'string' ? details : JSON.stringify(details ?? ''));
}
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions(token, user_id) VALUES(?, ?)').run(token, userId);
  return token;
}

// Send a verification code. purpose: register | reset | change_phone | quick (passwordless sign-in / sign-up)
app.post('/api/auth/otp', wrap(async (req, res) => {
  const phone = normPhone(req.body.phone);
  const purpose = String(req.body.purpose || '');
  if (phone.length < 7) throw new HttpError(400, 'invalid_input');
  const exists = !!db.prepare('SELECT 1 FROM users WHERE phone = ?').get(phone);
  if (purpose === 'register' && exists) throw new HttpError(409, 'phone_taken');
  if (purpose === 'reset' && !exists) throw new HttpError(404, 'phone_not_found');
  if (purpose === 'quick' && exists && db.prepare('SELECT role FROM users WHERE phone = ?').get(phone).role !== 'customer') throw new HttpError(403, 'use_password');
  if (purpose === 'change_phone') {
    if (!req.user) throw new HttpError(401, 'unauthorized');
    if (exists) throw new HttpError(409, 'phone_taken');
  }
  const lang = ['ku', 'ar', 'en'].includes(req.body.lang) ? req.body.lang : 'ku';
  const out = await sendOtp({ phone, purpose, ip: req.ip, lang, storeName: getSettings().store_name });
  if (purpose === 'quick') out.is_new = !exists;
  res.json(out);
}));

// Passwordless: phone + code. Logs in an existing customer or creates the account (name required for new ones).
app.post('/api/auth/quick', wrap((req, res) => {
  rateLimit(req);
  const phone = normPhone(req.body.phone);
  if (phone.length < 7) throw new HttpError(400, 'invalid_input');
  const existing = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (existing && existing.role !== 'customer') throw new HttpError(403, 'use_password'); // staff must use password (+2FA)
  const name = str(req.body.name, 80);
  if (!existing && !name) throw new HttpError(400, 'name_required');
  let referredBy = null;
  const ref = str(req.body.referral, 20).toUpperCase();
  if (!existing && ref) {
    const r = db.prepare('SELECT id FROM users WHERE referral_code = ?').get(ref);
    if (!r) throw new HttpError(400, 'invalid_referral');
    referredBy = r.id;
  }
  verifyOtp({ phone, purpose: 'quick', code: req.body.code });
  let user = existing;
  if (!user) {
    const id = Number(db.prepare('INSERT INTO users(name, phone, password_hash, referral_code, referred_by) VALUES(?,?,?,?,?)')
      .run(name, phone, hashPassword(crypto.randomBytes(24).toString('hex')), newReferralCode(), referredBy).lastInsertRowid);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }
  res.json({ token: createSession(user.id), user: publicUser(user), created: !existing });
}));

app.post('/api/auth/reset', wrap((req, res) => {
  rateLimit(req);
  const phone = normPhone(req.body.phone);
  const password = String(req.body.password || '');
  if (password.length < 6) throw new HttpError(400, 'password_short');
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user) throw new HttpError(404, 'phone_not_found');
  verifyOtp({ phone, purpose: 'reset', code: req.body.code });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id); // log out other devices
  res.json({ token: createSession(user.id), user: publicUser(user) });
}));

app.post('/api/auth/register', wrap((req, res) => {
  rateLimit(req);
  const name = str(req.body.name, 80);
  const phone = normPhone(req.body.phone);
  const password = String(req.body.password || '');
  const ref = str(req.body.referral, 20).toUpperCase();
  if (!name || phone.length < 7) throw new HttpError(400, 'invalid_input');
  if (password.length < 6) throw new HttpError(400, 'password_short');
  if (db.prepare('SELECT 1 FROM users WHERE phone = ?').get(phone)) throw new HttpError(409, 'phone_taken');
  let referredBy = null;
  if (ref) {
    const r = db.prepare('SELECT id FROM users WHERE referral_code = ?').get(ref);
    if (!r) throw new HttpError(400, 'invalid_referral');
    referredBy = r.id;
  }
  verifyOtp({ phone, purpose: 'register', code: req.body.code });
  const id = Number(db.prepare('INSERT INTO users(name, phone, password_hash, referral_code, referred_by) VALUES(?,?,?,?,?)')
    .run(name, phone, hashPassword(password), newReferralCode(), referredBy).lastInsertRowid);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.json({ token: createSession(id), user: publicUser(user) });
}));

app.post('/api/auth/login', wrap((req, res) => {
  const phone = normPhone(req.body.phone);
  const keys = [`ip:${req.ip}`, `phone:${phone}`];
  checkLimit(keys);
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user || !verifyPassword(String(req.body.password || ''), user.password_hash)) {
    recordFailure(keys);
    throw new HttpError(401, 'wrong_credentials');
  }
  db.prepare('DELETE FROM auth_failures WHERE key = ?').run(`phone:${phone}`);
  if (user.totp_enabled) {
    const ticket = crypto.randomBytes(24).toString('hex');
    db.prepare('DELETE FROM login_tickets WHERE expires_at < ?').run(Date.now());
    db.prepare('INSERT INTO login_tickets(ticket, user_id, expires_at) VALUES(?,?,?)').run(ticket, user.id, Date.now() + 5 * 60 * 1000);
    return res.json({ need_2fa: true, ticket });
  }
  res.json({ token: createSession(user.id), user: publicUser(user) });
}));

// Second step for accounts with two-factor authentication (authenticator app code).
app.post('/api/auth/login/2fa', wrap((req, res) => {
  const t = db.prepare('SELECT * FROM login_tickets WHERE ticket = ?').get(String(req.body.ticket || ''));
  if (!t || t.expires_at < Date.now() || t.attempts >= 5) throw new HttpError(401, 'login_expired');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(t.user_id);
  if (!user || !verifyTotp(user.totp_secret, req.body.code)) {
    db.prepare('UPDATE login_tickets SET attempts = attempts + 1 WHERE ticket = ?').run(t.ticket);
    recordFailure([`ip:${req.ip}`]);
    throw new HttpError(401, 'wrong_2fa_code');
  }
  db.prepare('DELETE FROM login_tickets WHERE ticket = ?').run(t.ticket);
  res.json({ token: createSession(user.id), user: publicUser(user) });
}));

app.post('/api/auth/logout', requireUser, wrap((req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
  res.json({ ok: true });
}));

// ---------------- public catalogue ----------------
app.get('/api/settings', wrap((_req, res) => {
  const s = getSettings();
  const out = {};
  for (const k of PUBLIC_SETTINGS) out[k] = s[k] ?? '';
  res.json(out);
}));

app.get('/api/categories', wrap((_req, res) => {
  const rows = db.prepare('SELECT * FROM categories ORDER BY sort, id').all();
  const counts = Object.fromEntries(db.prepare('SELECT category_id, COUNT(*) n FROM products WHERE active = 1 GROUP BY category_id').all().map((r) => [r.category_id, r.n]));
  const top = rows.filter((c) => !c.parent_id).map((c) => ({ ...c, count: counts[c.id] || 0, children: rows.filter((s) => s.parent_id === c.id).map((s) => ({ ...s, count: counts[s.id] || 0 })) }));
  top.forEach((c) => { c.count += c.children.reduce((a, s) => a + s.count, 0); });
  res.json(top);
}));

app.get('/api/banners', wrap((_req, res) => {
  res.json(db.prepare('SELECT * FROM banners WHERE active = 1 ORDER BY sort, id').all());
}));

function productQuery(q, { admin = false } = {}) {
  const where = [];
  const params = [];
  if (!admin) where.push('p.active = 1');
  if (q.category) {
    const cid = int(q.category);
    where.push('(p.category_id = ? OR p.category_id IN (SELECT id FROM categories WHERE parent_id = ?))');
    params.push(cid, cid);
  }
  let searchTokens = null;
  if (q.q) {
    const c = searchClause(str(q.q, 100));
    if (c) { where.push(`(${c.sql})`); params.push(...c.params); searchTokens = c.tokens; }
  }
  if (q.flash) where.push('p.flash_sale = 1');
  // filters (category / search pages) and "recently viewed" ids
  if (q.ids) {
    const ids = String(q.ids).split(',').map((x) => int(x)).filter((x) => x > 0).slice(0, 30);
    where.push(ids.length ? `p.id IN (${ids.map(() => '?').join(',')})` : '0'); params.push(...ids);
  }
  if (q.brand) {
    const brands = String(q.brand).split(',').map((x) => str(x, 60)).filter(Boolean).slice(0, 20);
    if (brands.length) { where.push(`LOWER(p.brand) IN (${brands.map(() => '?').join(',')})`); params.push(...brands.map((b) => b.toLowerCase())); }
  }
  if (int(q.min_price, 0) > 0) { where.push('p.price >= ?'); params.push(int(q.min_price)); }
  if (int(q.max_price, 0) > 0) { where.push('p.price <= ?'); params.push(int(q.max_price)); }
  if (int(q.storage, 0) > 0) { where.push("json_extract(p.attrs, '$.storage') = ?"); params.push(int(q.storage)); }
  if (q.in_stock === '1') where.push('p.stock > 0');
  if (q.phones === '1') where.push("json_extract(p.attrs, '$.os') IS NOT NULL");
  if (q.featured) where.push('p.featured = 1');
  const sorts = {
    foryou: 'p.featured DESC, p.trending DESC, (p.stock > 0) DESC, p.id DESC',
    popular: 'p.sold DESC',
    cheap: 'p.price ASC',
    expensive: 'p.price DESC',
    newest: 'p.id DESC',
  };
  const order = sorts[q.sort] || sorts.foryou;
  const limit = Math.min(int(q.limit, 40), 200);
  const offset = Math.max(int(q.offset, 0), 0);
  const sql = `SELECT p.*, ${VARIANT_COUNT_SQL} FROM products p ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order} LIMIT ? OFFSET ?`;
  const rows = db.prepare(sql).all(...params, limit, offset);
  // Search with the default order: best name matches first (e.g. the case named "17 Pro Max" before a generic one).
  if (searchTokens && (!q.sort || q.sort === 'foryou')) {
    rows.forEach((r, i) => { r._rel = relevance(r, searchTokens); r._i = i; });
    rows.sort((a, b) => b._rel - a._rel || a._i - b._i);
    rows.forEach((r) => { delete r._rel; delete r._i; });
  }
  if (q.ids) { const order = String(q.ids).split(',').map((x) => int(x)); rows.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)); }
  return rows.map((p) => productOut(p, admin));
}

app.get('/api/products', wrap((req, res) => res.json(productQuery(req.query))));
// Filter options for a category / search: brands, price range, storage sizes (only values that exist)
app.get('/api/products/facets', wrap((req, res) => {
  const rows = productQuery({ category: req.query.category, q: req.query.q, limit: 200 });
  const count = (arr) => Object.entries(arr.reduce((m, x) => { if (x) m[x] = (m[x] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ v: k, n }));
  res.json({
    brands: count(rows.map((p) => p.brand && p.brand.trim())),
    storages: count(rows.map((p) => p.attrs && p.attrs.storage)).sort((a, b) => Number(a.v) - Number(b.v)),
    min: rows.length ? Math.min(...rows.map((p) => p.price)) : 0,
    max: rows.length ? Math.max(...rows.map((p) => p.price)) : 0,
  });
}));

app.get('/api/products/:id', wrap((req, res) => {
  const p = db.prepare(`SELECT p.*, ${VARIANT_COUNT_SQL} FROM products p WHERE p.id = ? AND p.active = 1`).get(int(req.params.id));
  if (!p) throw new HttpError(404, 'not_found');
  const related = db.prepare(`SELECT p.*, ${VARIANT_COUNT_SQL} FROM products p WHERE p.active = 1 AND p.category_id = ? AND p.id != ? ORDER BY p.sold DESC LIMIT 8`)
    .all(p.category_id, p.id).map(productOut);
  const product = productOut(p);
  product.variants = variantsOf(p.id).map(publicVariant);
  product.tags = tagsOf(p.id);
  // Real numbers only: people who opened this product in the last 15 minutes, units sold in the last 30 days
  const viewers = db.prepare('SELECT COUNT(DISTINCT visitor) n FROM page_views WHERE product_id = ? AND created_at > ?').get(p.id, Date.now() - 15 * 60 * 1000).n;
  const sold30 = db.prepare(`SELECT COALESCE(SUM(oi.qty), 0) n FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE oi.product_id = ? AND o.status != 'cancelled' AND o.created_at >= datetime('now', '-30 days')`).get(p.id).n;
  res.json({ product, related, bundle: boughtTogether(p), proof: { viewers, sold30 } });
}));

// "Frequently bought together": products the admin picked, else what other customers bought with it, else popular accessories.
// ---- accessory compatibility ("frequently bought together" must fit the phone) ----
// Model signature from a name: family (iphone/galaxy/redmi/...), model number and modifiers (pro, max, plus, ultra, mini...).
const FAMILIES = ['iphone', 'galaxy', 'redmi', 'poco', 'pixel', 'honor', 'infinix', 'tecno', 'huawei'];
const MODIFIERS = ['pro', 'max', 'plus', 'ultra', 'mini', 'lite', 'fe', 'edge'];
function modelSig(text) {
  const t = ` ${normalize(text)} `.replace(/ برو /g, ' pro ').replace(/ ماكس /g, ' max ').replace(/ ايفون /g, ' iphone ').replace(/ (جالكسي|كالاكسي|كالكسي) /g, ' galaxy ')
    .split(' ').filter(Boolean);
  const fi = t.findIndex((w) => FAMILIES.includes(w));
  if (fi < 0) return null;
  const rest = t.slice(fi + 1, fi + 6);
  const ni = rest.findIndex((w) => /^\d{1,3}$/.test(w));
  const series = ni > 0 && /^[a-z]$/.test(rest[ni - 1]) ? rest[ni - 1] : ''; // galaxy "s 24" / "a 55"
  const num = ni >= 0 ? rest[ni] : '';
  const mods = rest.slice(ni >= 0 ? ni + 1 : 0).filter((w) => MODIFIERS.includes(w)).sort().join('+');
  return { family: t[fi], model: `${series}${num}`, mods };
}
const allNames = (x) => [x.name_en, x.name_ar, x.name_ku].filter(Boolean).join(' ');
function compatibleWith(phone, acc) {
  const ps = modelSig(allNames(phone));
  if (!ps) return true;
  const as = modelSig(allNames(acc));
  // accessory made for a specific phone → must be exactly this phone (family, number and Pro/Max/Ultra…)
  if (as && (as.family !== ps.family || (as.model && as.model !== ps.model) || as.mods !== ps.mods)) return false;
  // Lightning only fits iPhone 14 and older
  if (/lightning|لايتنينغ|لايتننغ/i.test(allNames(acc)) && !(ps.family === 'iphone' && Number(ps.model) > 0 && Number(ps.model) <= 14)) return false;
  return true;
}

// Bundle deal: accessories bought together with a phone they fit get bundle_discount_percent off (one per phone).
function bundleDiscount(lines, s = getSettings()) {
  const pct = Math.min(Math.max(Number(s.bundle_discount_percent) || 0, 0), 50);
  if (!pct) return 0;
  const isPh = (p) => !!parseJson(p.attrs || '{}', {}).os;
  const phones = lines.filter((l) => isPh(l.p));
  const nPhones = phones.reduce((a, l) => a + l.qty, 0);
  if (!nPhones) return 0;
  let off = 0;
  for (const l of lines) {
    if (isPh(l.p) || !phones.some((ph) => compatibleWith(ph.p, l.p))) continue;
    off += Math.floor((l.price * Math.min(l.qty, nPhones) * pct) / 100);
  }
  return off;
}
const linesFromPriced = (items) => items.filter((it) => it.available).map((it) => ({ p: db.prepare('SELECT * FROM products WHERE id = ?').get(it.id), price: it.price, qty: it.qty }));

function boughtTogether(p) {
  const isPhone = parseJson(p.attrs || '{}', {}).os;
  const fits = (x) => !isPhone || compatibleWith(p, x);
  const pick = (ids) => ids.length ? db.prepare(`SELECT p.*, ${VARIANT_COUNT_SQL} FROM products p WHERE p.active = 1 AND p.stock > 0 AND p.id IN (${ids.map(() => '?').join(',')})`).all(...ids) : [];
  let list = pick(parseJson(p.bundle_ids || '[]', []).map((x) => int(x)).filter(Boolean).slice(0, 4)).filter(fits);
  if (list.length < 3) {
    const co = db.prepare(`SELECT oi2.product_id id, COUNT(*) n FROM order_items oi1 JOIN order_items oi2 ON oi2.order_id = oi1.order_id AND oi2.product_id != oi1.product_id
      WHERE oi1.product_id = ? GROUP BY oi2.product_id ORDER BY n DESC LIMIT 6`).all(p.id).map((r) => r.id);
    list = [...list, ...pick(co).filter((x) => fits(x) && !list.some((y) => y.id === x.id))];
  }
  if (list.length < 3) {
    const more = db.prepare(`SELECT p.*, ${VARIANT_COUNT_SQL} FROM products p WHERE p.active = 1 AND p.stock > 0 AND p.id != ? AND p.price < ?
      AND (p.category_id IS NULL OR p.category_id NOT IN (SELECT id FROM categories WHERE id = ? OR parent_id = (SELECT parent_id FROM categories WHERE id = ?)))
      ORDER BY p.sold DESC LIMIT 30`).all(p.id, Math.max(p.price * 0.5, 50000), p.category_id || 0, p.category_id || 0);
    // phones: only accessories that fit (no iPhone case on a Galaxy, no Lightning cable on a USB-C iPhone), and no other phones
    list = [...list, ...more.filter((x) => fits(x) && !(isPhone && parseJson(x.attrs || '{}', {}).os) && !list.some((y) => y.id === x.id))];
  }
  return list.filter((x) => x.id !== p.id).slice(0, 4).map((x) => productOut(x));
}

// ---------------- customer account ----------------
function userStats(userId) {
  const byStatus = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0]));
  for (const r of db.prepare('SELECT status, COUNT(*) n FROM orders WHERE user_id = ? GROUP BY status').all(userId)) byStatus[r.status] = r.n;
  const spent = db.prepare("SELECT COALESCE(SUM(total + wallet_used), 0) s FROM orders WHERE user_id = ? AND status = 'delivered'").get(userId).s;
  const orders = db.prepare('SELECT COUNT(*) n FROM orders WHERE user_id = ?').get(userId).n;
  const invited = db.prepare('SELECT COUNT(*) n FROM users WHERE referred_by = ?').get(userId).n;
  return { by_status: byStatus, total_spent: spent, orders, invited };
}

app.get('/api/me', requireUser, wrap((req, res) => {
  const out = { user: publicUser(req.user), stats: userStats(req.user.id) };
  if (isStaff(req.user.role)) { out.admin_path = ADMIN_PATH; out.sections = extrasModule.ROLE_SECTIONS[req.user.role]; }
  res.json(out);
}));

app.put('/api/me', requireUser, wrap((req, res) => {
  const name = str(req.body.name, 80) || req.user.name;
  const phone = normPhone(req.body.phone) || req.user.phone;
  if (phone !== req.user.phone) {
    if (db.prepare('SELECT 1 FROM users WHERE phone = ? AND id != ?').get(phone, req.user.id)) throw new HttpError(409, 'phone_taken');
    verifyOtp({ phone, purpose: 'change_phone', code: req.body.code });
  }
  db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(name, phone, req.user.id);
  if (req.body.new_password) {
    if (!verifyPassword(String(req.body.current_password || ''), req.user.password_hash)) throw new HttpError(401, 'wrong_credentials');
    if (String(req.body.new_password).length < 6) throw new HttpError(400, 'password_short');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(req.body.new_password)), req.user.id);
  }
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
}));

// Two-factor authentication (authenticator app) — offered in the admin panel.
app.post('/api/me/2fa/setup', requireUser, wrap((req, res) => {
  if (req.user.totp_enabled) throw new HttpError(400, 'already_enabled');
  const secret = newSecret();
  db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(secret, req.user.id);
  res.json({ secret, otpauth: otpauthUrl(secret, req.user.phone, getSettings().store_name || 'Store') });
}));
app.post('/api/me/2fa/enable', requireUser, wrap((req, res) => {
  if (!req.user.totp_secret || !verifyTotp(req.user.totp_secret, req.body.code)) throw new HttpError(400, 'wrong_2fa_code');
  db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(req.user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(req.user.id, req.token); // sign out other devices
  logAdmin(req, '2fa_enabled', '');
  res.json({ ok: true });
}));
app.post('/api/me/2fa/disable', requireUser, wrap((req, res) => {
  if (!verifyPassword(String(req.body.password || ''), req.user.password_hash)) throw new HttpError(401, 'wrong_credentials');
  if (!verifyTotp(req.user.totp_secret, req.body.code)) throw new HttpError(400, 'wrong_2fa_code');
  db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?').run(req.user.id);
  logAdmin(req, '2fa_disabled', '');
  res.json({ ok: true });
}));

app.get('/api/me/addresses', requireUser, wrap((req, res) => {
  res.json(db.prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC').all(req.user.id));
}));
app.post('/api/me/addresses', requireUser, wrap((req, res) => {
  const city = str(req.body.city, 60);
  const details = str(req.body.details, 300);
  if (!city || !details) throw new HttpError(400, 'invalid_input');
  const first = !db.prepare('SELECT 1 FROM addresses WHERE user_id = ?').get(req.user.id);
  const isDefault = first || req.body.is_default ? 1 : 0;
  if (isDefault) db.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(req.user.id);
  const id = Number(db.prepare('INSERT INTO addresses(user_id, city, area, details, is_default) VALUES(?,?,?,?,?)')
    .run(req.user.id, city, str(req.body.area, 100), details, isDefault).lastInsertRowid);
  res.json(db.prepare('SELECT * FROM addresses WHERE id = ?').get(id));
}));
app.delete('/api/me/addresses/:id', requireUser, wrap((req, res) => {
  db.prepare('DELETE FROM addresses WHERE id = ? AND user_id = ?').run(int(req.params.id), req.user.id);
  res.json({ ok: true });
}));

// ---------------- orders ----------------
function orderWithItems(o) {
  if (!o) return o;
  // purchase cost stays on the server (used for profit reports only)
  const t = o.tradein_id ? db.prepare('SELECT id, label, estimate, final_value, status, answers FROM tradeins WHERE id = ?').get(o.tradein_id) : null;
  return { ...o, items: db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id).map(({ cost, ...it }) => it), tradein: t ? { ...t, answers: parseJson(t.answers, {}) } : null };
}

// ---- coupons (influencer / campaign codes) ----
const normCode = (c) => str(c, 30).toUpperCase().replace(/\s+/g, '');
function evaluateCoupon(code, userId, subtotal) {
  const c = db.prepare('SELECT * FROM coupons WHERE code = ?').get(normCode(code));
  if (!c || !c.active) throw new HttpError(400, 'coupon_invalid');
  if (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) throw new HttpError(400, 'coupon_expired');
  if (c.max_uses && c.uses >= c.max_uses) throw new HttpError(400, 'coupon_used_up');
  if (subtotal < c.min_order) throw Object.assign(new HttpError(400, 'coupon_min_order'), { detail: c.min_order });
  if (c.once_per_customer && userId && db.prepare("SELECT 1 FROM orders WHERE user_id = ? AND coupon_code = ? AND status != 'cancelled'").get(userId, c.code)) {
    throw new HttpError(400, 'coupon_already_used');
  }
  let discount = c.type === 'fixed' ? c.value : Math.floor((subtotal * c.value) / 100);
  if (c.max_discount) discount = Math.min(discount, c.max_discount);
  return { coupon: c, discount: Math.max(0, Math.min(discount, subtotal)) };
}
function priceItems(rawItems) {
  return (Array.isArray(rawItems) ? rawItems.slice(0, 50) : []).map((it) => {
    const qty = Math.max(1, Math.min(int(it.qty, 1), 99));
    const p = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(int(it.id));
    if (!p) return { id: int(it.id), variant_id: it.variant_id || null, qty, available: false };
    const v = it.variant_id ? db.prepare('SELECT * FROM product_variants WHERE id = ? AND product_id = ?').get(int(it.variant_id), p.id) : null;
    if (it.variant_id && !v) return { id: p.id, variant_id: it.variant_id, qty, available: false };
    return { id: p.id, variant_id: v ? v.id : null, variant_label: v ? v.label : null, name_ku: p.name_ku, name_ar: p.name_ar, name_en: p.name_en,
      image: p.image, price: v ? v.price : p.price, stock: v ? v.stock : p.stock, qty, available: true };
  });
}
app.post('/api/coupons/check', wrap((req, res) => {
  const keys = [`coupon:${req.ip}`];
  checkLimit(keys); // stops guessing codes: 15 wrong codes per 15 minutes
  const items = priceItems(req.body.items);
  const subtotal = items.reduce((a, it) => a + (it.available ? it.price * it.qty : 0), 0) - bundleDiscount(linesFromPriced(items));
  let result;
  try { result = evaluateCoupon(req.body.code, req.user && req.user.id, subtotal); }
  catch (e) { if (e.code === 'coupon_invalid') recordFailure(keys); throw e; }
  const { coupon, discount } = result;
  res.json({ code: coupon.code, type: coupon.type, value: coupon.value, discount });
}));

// Current prices / stock for the cart, plus delivery for a city — so the cart never shows stale prices.
app.post('/api/cart/quote', wrap((req, res) => {
  const s = getSettings();
  const items = priceItems(req.body.items);
  const subtotal = items.reduce((a, it) => a + (it.available ? it.price * it.qty : 0), 0);
  const bundle = bundleDiscount(linesFromPriced(items), s);
  let delivery = null;
  try { delivery = deliveryFor(str(req.body.city, 60), subtotal - bundle, s); } catch { delivery = null; }
  res.json({ items, subtotal, bundle_discount: bundle, delivery });
}));

app.post('/api/orders', requireUser, wrap((req, res) => {
  const s = getSettings();
  const items = Array.isArray(req.body.items) ? req.body.items.slice(0, 50) : [];
  const name = str(req.body.name, 80) || req.user.name;
  const phone = normPhone(req.body.phone) || req.user.phone;
  const city = str(req.body.city, 60);
  const address = str(req.body.address, 300);
  if (!items.length) throw new HttpError(400, 'cart_empty');
  if (!city || !address) throw new HttpError(400, 'invalid_input');
  if (s.maintenance_mode === '1' && !isStaff(req.user.role)) throw new HttpError(503, 'maintenance');
  // Fake-order protection
  if (req.user.blocked) throw new HttpError(403, 'account_blocked');
  const maxPending = int(s.max_pending_orders, 2);
  if (maxPending > 0) {
    const pending = db.prepare("SELECT COUNT(*) n FROM orders WHERE user_id = ? AND status = 'pending'").get(req.user.id).n;
    if (pending >= maxPending) throw new HttpError(400, 'too_many_pending');
  }

  const order = tx(() => {
    let subtotal = 0;
    const lines = [];
    for (const it of items) {
      const qty = Math.max(1, Math.min(int(it.qty, 1), 99));
      const p = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(int(it.id));
      if (!p) throw new HttpError(400, 'product_unavailable');
      const variants = variantsOf(p.id);
      let price = p.price; let variant = null;
      if (variants.length) {
        variant = variants.find((v) => v.id === int(it.variant_id));
        if (!variant) throw Object.assign(new HttpError(400, 'choose_variant'), { detail: p.name_ku });
        if (variant.stock < qty) throw Object.assign(new HttpError(400, 'out_of_stock'), { detail: `${p.name_ku} (${variant.label})` });
        price = variant.price;
        db.prepare('UPDATE product_variants SET stock = stock - ? WHERE id = ?').run(qty, variant.id);
      } else if (p.stock < qty) {
        throw Object.assign(new HttpError(400, 'out_of_stock'), { detail: p.name_ku });
      }
      // Decrement inside the loop so a product listed twice cannot oversell.
      db.prepare('UPDATE products SET stock = stock - ?, sold = sold + ? WHERE id = ?').run(qty, qty, p.id);
      subtotal += price * qty;
      lines.push({ p, qty, price, variant });
    }
    const bundleOff = bundleDiscount(lines, s);
    subtotal -= bundleOff; // coupon, delivery and trade-in all work on the bundle price
    let discount = 0; let couponCode = null;
    if (req.body.coupon) {
      const c = evaluateCoupon(req.body.coupon, req.user.id, subtotal);
      discount = c.discount; couponCode = c.coupon.code;
      db.prepare('UPDATE coupons SET uses = uses + 1 WHERE id = ?').run(c.coupon.id);
    }
    const delivery = deliveryFor(city, subtotal - discount, s);
    // Trade-in: estimated value of the customer's old phone, confirmed when the courier/shop inspects it.
    let tradein = null; let tradeinCredit = 0;
    if (req.body.tradein && req.body.tradein.model_id) {
      if (s.tradein_enabled !== '1') throw new HttpError(400, 'tradein_disabled');
      tradein = smart.quoteTradein(db, s, req.body.tradein.model_id, req.body.tradein.answers);
      if (tradein.error) throw new HttpError(400, tradein.error);
      tradeinCredit = Math.min(tradein.estimate, subtotal - discount);
    }
    const user = db.prepare('SELECT wallet FROM users WHERE id = ?').get(req.user.id);
    const walletUsed = req.body.use_wallet ? Math.min(user.wallet, subtotal - discount - tradeinCredit + delivery) : 0;
    const total = subtotal - discount - tradeinCredit + delivery - walletUsed;
    const source = ORDER_SOURCES.includes(req.body.source) ? req.body.source : null;
    const utm = str(req.body.utm, 100).replace(/[^\w\-.:/ ]/g, '') || null;
    // stored subtotal = item prices before the bundle deal; bundle_discount shown as its own line
    const oid = Number(db.prepare(`INSERT INTO orders(user_id, customer_name, phone, city, address, note, subtotal, delivery_fee, wallet_used, total, discount, coupon_code, source, utm, bundle_discount)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(req.user.id, name, phone, city, address, str(req.body.note, 500), subtotal + bundleOff, delivery, walletUsed, total, discount, couponCode, source, utm, bundleOff).lastInsertRowid);
    const insItem = db.prepare('INSERT INTO order_items(order_id, product_id, variant_id, variant_label, name, image, price, qty, cost) VALUES(?,?,?,?,?,?,?,?,?)');
    for (const { p, qty, price, variant } of lines) {
      const cost = variant && variant.cost_price != null ? variant.cost_price : p.cost_price; // snapshot for profit reports
      insItem.run(oid, p.id, variant ? variant.id : null, variant ? variant.label : null, p.name_ku, p.image, price, qty, cost ?? null);
      extras.recordStock({ productId: p.id, variantId: variant ? variant.id : null, delta: -qty, reason: 'order', ref: `#${oid}`, userName: name });
    }
    db.prepare('DELETE FROM carts WHERE user_id = ?').run(req.user.id);
    if (tradein) {
      const tid = Number(db.prepare('INSERT INTO tradeins(user_id, order_id, model_id, label, answers, estimate) VALUES(?,?,?,?,?,?)')
        .run(req.user.id, oid, tradein.model.id, tradein.label, JSON.stringify(tradein.answers), tradein.estimate).lastInsertRowid);
      db.prepare('UPDATE orders SET tradein_id = ?, tradein_credit = ? WHERE id = ?').run(tid, tradeinCredit, oid);
    }
    if (walletUsed) db.prepare('UPDATE users SET wallet = wallet - ? WHERE id = ?').run(walletUsed, req.user.id);
    return db.prepare('SELECT * FROM orders WHERE id = ?').get(oid);
  });
  const full = orderWithItems(order);
  const highValue = int(s.confirm_over, 0) > 0 && order.total + order.wallet_used >= int(s.confirm_over, 0);
  notify(orderMessage({ ...full, tradein_label: full.tradein && full.tradein.label }, full.items, { highValue, publicUrl: PUBLIC_URL }));
  res.json(full);
}));

app.get('/api/orders', requireUser, wrap((req, res) => {
  const status = ORDER_STATUSES.includes(req.query.status) ? req.query.status : null;
  const rows = status
    ? db.prepare('SELECT * FROM orders WHERE user_id = ? AND status = ? ORDER BY id DESC').all(req.user.id, status)
    : db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  res.json(rows.map(orderWithItems));
}));

app.get('/api/orders/:id', requireUser, wrap((req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(int(req.params.id), req.user.id);
  if (!o) throw new HttpError(404, 'not_found');
  res.json(orderWithItems(o));
}));

function cancelOrder(o, userName = null) {
  for (const it of db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id)) {
    if (it.product_id) db.prepare('UPDATE products SET stock = stock + ?, sold = MAX(sold - ?, 0) WHERE id = ?').run(it.qty, it.qty, it.product_id);
    if (it.variant_id) db.prepare('UPDATE product_variants SET stock = stock + ? WHERE id = ?').run(it.qty, it.variant_id);
    if (it.product_id) extras.recordStock({ productId: it.product_id, variantId: it.variant_id, delta: it.qty, reason: 'cancel', ref: `#${o.id}`, userName });
  }
  if (o.cashback && o.user_id) db.prepare('UPDATE users SET wallet = MAX(wallet - ?, 0) WHERE id = ?').run(o.cashback, o.user_id);
  if (o.wallet_used && o.user_id) db.prepare('UPDATE users SET wallet = wallet + ? WHERE id = ?').run(o.wallet_used, o.user_id);
  if (o.coupon_code) db.prepare('UPDATE coupons SET uses = MAX(uses - 1, 0) WHERE code = ?').run(o.coupon_code);
  if (o.tradein_id) db.prepare("UPDATE tradeins SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(o.tradein_id);
}

app.post('/api/orders/:id/cancel', requireUser, wrap((req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(int(req.params.id), req.user.id);
  if (!o) throw new HttpError(404, 'not_found');
  if (o.status !== 'pending') throw new HttpError(400, 'cannot_cancel');
  tx(() => {
    cancelOrder(o, req.user.name);
    db.prepare("UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(o.id);
  });
  notify(`❌ الزبون ألغى الطلب #${o.id} — ${escHtml(o.customer_name)} (${escHtml(o.phone)})`);
  res.json(orderWithItems(db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id)));
}));

// ---------------- admin ----------------
const admin = express.Router();
admin.use(requireAdmin);
extras = extrasModule.register(app, admin, { db, tx, wrap, HttpError, int, str, logAdmin, requireUser, getSettings, setSetting, priceItems, repriceUsd, syncProductFromVariants });
smart.register(app, admin, { db, tx, wrap, HttpError, int, str, logAdmin, getSettings, setSetting, productOut, variantsOf, publicVariant });
repair.register(app, admin, { db, tx, wrap, HttpError, int, str, logAdmin, requireUser, getSettings, notify, escHtml, PUBLIC_URL });
reviews.register(app, admin, { db, wrap, HttpError, int, str, requireUser, getSettings, logAdmin });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      const ext = '.upload'; // temporary name; the processed file is saved as .webp
      cb(null, crypto.randomBytes(12).toString('hex') + ext);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 }, // phone photos are big; they are shrunk after upload
  fileFilter: (_req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)),
});
// Check the file really is an image (the browser-declared type can be faked).
function looksLikeImage(file) {
  const fd = fs.openSync(file, 'r'); const b = Buffer.alloc(12);
  fs.readSync(fd, b, 0, 12, 0); fs.closeSync(fd);
  return (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) // jpeg
    || b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) // png
    || b.subarray(0, 4).toString('latin1') === 'GIF8'
    || (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP');
}
// Customers: photos for a review (max 12 per 15 minutes per account; checked, re-encoded, metadata stripped)
app.post('/api/reviews/upload', requireUser, (req, res, next) => {
  try { checkLimit([`revup:${req.user.id}`]); recordFailure([`revup:${req.user.id}`]); } catch (e) { return next(e); }
  next();
}, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'invalid_file' });
  if (!looksLikeImage(req.file.path)) { fs.unlinkSync(req.file.path); return res.status(400).json({ error: 'invalid_file' }); }
  processUpload(req.file.path, UPLOAD_DIR)
    .then((url) => res.json({ url }))
    .catch(() => res.status(400).json({ error: 'invalid_file' }));
});
admin.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'invalid_file' });
  if (!looksLikeImage(req.file.path)) { fs.unlinkSync(req.file.path); return res.status(400).json({ error: 'invalid_file' }); }
  processUpload(req.file.path, UPLOAD_DIR)
    .then((url) => res.json({ url }))
    .catch((e) => { console.error('Image processing failed:', e.message); res.status(400).json({ error: 'invalid_file' }); });
});

admin.get('/stats', wrap((req, res) => {
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  res.json({
    revenue: one("SELECT COALESCE(SUM(total + wallet_used),0) v FROM orders WHERE status = 'delivered'").v,
    orders: one('SELECT COUNT(*) v FROM orders').v,
    pending: one("SELECT COUNT(*) v FROM orders WHERE status = 'pending'").v,
    today: one("SELECT COUNT(*) v FROM orders WHERE date(created_at) = date('now')").v,
    customers: one("SELECT COUNT(*) v FROM users WHERE role = 'customer'").v,
    products: one('SELECT COUNT(*) v FROM products').v,
    low_stock: db.prepare('SELECT id, name_ku, stock FROM products WHERE stock <= 3 ORDER BY stock LIMIT 10').all(),
    top: db.prepare('SELECT id, name_ku, sold, price FROM products ORDER BY sold DESC LIMIT 5').all(),
    recent: db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 8').all().map(adminOrderExtras),
    open_repairs: one("SELECT COUNT(*) v FROM repairs WHERE status NOT IN ('delivered', 'cancelled')").v,
    repairs_today: one("SELECT COUNT(*) v FROM repairs WHERE substr(appointment, 1, 10) = date('now', '+3 hours') AND status != 'cancelled'").v,
    sources: db.prepare("SELECT COALESCE(source, 'unknown') source, COUNT(*) orders, COALESCE(SUM(CASE WHEN status = 'delivered' THEN total + wallet_used END), 0) revenue FROM orders WHERE status != 'cancelled' GROUP BY 1 ORDER BY 2 DESC").all(),
    utm: db.prepare("SELECT utm, COUNT(*) orders FROM orders WHERE utm IS NOT NULL AND status != 'cancelled' GROUP BY utm ORDER BY 2 DESC LIMIT 10").all(),
    warnings: [
      verifyPassword('admin123', req.user.password_hash) && 'default_password',
      !req.user.totp_enabled && 'no_2fa',
      SMS_PROVIDER === 'console' && 'sms_console',
      !telegramEnabled && 'no_telegram',
    ].filter(Boolean),
  });
}));

function adminOrderExtras(o) {
  const confirmOver = int(getSettings().confirm_over, 0);
  const u = o.user_id ? db.prepare('SELECT blocked FROM users WHERE id = ?').get(o.user_id) : null;
  return {
    ...o,
    high_value: confirmOver > 0 && o.total + o.wallet_used >= confirmOver,
    customer_blocked: !!(u && u.blocked),
    phone_cancelled: db.prepare("SELECT COUNT(*) n FROM orders WHERE phone = ? AND status = 'cancelled' AND id != ?").get(o.phone, o.id).n,
  };
}
admin.get('/orders', wrap((req, res) => {
  const status = ORDER_STATUSES.includes(req.query.status) ? req.query.status : null;
  const q = str(req.query.q, 50);
  const where = []; const params = [];
  if (status) { where.push('status = ?'); params.push(status); }
  if (q) { where.push('(customer_name LIKE ? OR phone LIKE ? OR CAST(id AS TEXT) = ?)'); params.push(`%${q}%`, `%${q}%`, q); }
  const rows = db.prepare(`SELECT * FROM orders ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 300`).all(...params);
  res.json(rows.map((o) => adminOrderExtras(orderWithItems(o))));
}));

admin.put('/orders/:id', wrap((req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(int(req.params.id));
  if (!o) throw new HttpError(404, 'not_found');
  const status = req.body.status;
  if (!ORDER_STATUSES.includes(status)) throw new HttpError(400, 'invalid_status');
  if (o.status === 'cancelled' && status !== 'cancelled') throw new HttpError(400, 'order_cancelled');
  tx(() => {
    if (status === 'cancelled' && o.status !== 'cancelled') cancelOrder(o, req.user.name);
    db.prepare("UPDATE orders SET status = ?, admin_note = COALESCE(?, admin_note), updated_at = datetime('now') WHERE id = ?").run(status, req.body.admin_note != null ? str(req.body.admin_note, 500) : null, o.id);
    // Cashback ("points"): a % of the products total goes to the customer's wallet once, when delivered.
    const cashbackPct = Number(getSettings().cashback_percent) || 0;
    if (status === 'delivered' && o.user_id && !o.cashback && cashbackPct > 0) {
      const cb = Math.floor(((o.subtotal - o.discount) * Math.min(cashbackPct, 50)) / 100);
      if (cb > 0) {
        db.prepare('UPDATE users SET wallet = wallet + ? WHERE id = ?').run(cb, o.user_id);
        db.prepare('UPDATE orders SET cashback = ? WHERE id = ?').run(cb, o.id);
      }
    }
    // Referral reward: first delivered order of a referred customer credits the referrer.
    if (status === 'delivered' && o.user_id) {
      const u = db.prepare('SELECT * FROM users WHERE id = ?').get(o.user_id);
      if (u && u.referred_by && !u.referral_paid) {
        const reward = int(getSettings().referral_reward, 0);
        if (reward > 0) db.prepare('UPDATE users SET wallet = wallet + ? WHERE id = ?').run(reward, u.referred_by);
        db.prepare('UPDATE users SET referral_paid = 1 WHERE id = ?').run(u.id);
      }
    }
  });
  logAdmin(req, 'order_status', { order: o.id, from: o.status, to: status });
  res.json(orderWithItems(db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id)));
}));

// products
admin.get('/products', wrap((req, res) => res.json(adminDecorate(attachVariants(productQuery({ ...req.query, sort: req.query.sort || 'newest', limit: 200 }, { admin: true }))))));
const PRODUCT_FIELDS = ['category_id', 'name_ku', 'name_ar', 'name_en', 'desc_ku', 'desc_ar', 'desc_en', 'brand', 'price', 'old_price', 'stock', 'image', 'images', 'featured', 'trending', 'flash_sale', 'active', 'usd_priced', 'price_usd', 'old_price_usd', 'cost_price', 'specs', 'bundle_ids', 'attrs', 'video_url'];
function productValues(b) {
  const v = {
    category_id: b.category_id ? int(b.category_id) : null,
    name_ku: str(b.name_ku, 200), name_ar: str(b.name_ar, 200), name_en: str(b.name_en, 200),
    desc_ku: str(b.desc_ku, 5000), desc_ar: str(b.desc_ar, 5000), desc_en: str(b.desc_en, 5000),
    brand: str(b.brand, 80),
    price: Math.max(0, int(b.price)), old_price: b.old_price ? Math.max(0, int(b.old_price)) : null,
    stock: Math.max(0, int(b.stock)), image: str(b.image, 500),
    images: JSON.stringify(Array.isArray(b.images) ? b.images.map((x) => str(x, 500)).filter(Boolean).slice(0, 10) : []),
    featured: b.featured ? 1 : 0, trending: b.trending ? 1 : 0, flash_sale: b.flash_sale ? 1 : 0,
    active: b.active === false || b.active === 0 ? 0 : 1,
    cost_price: b.cost_price !== '' && b.cost_price != null ? Math.max(0, int(b.cost_price)) : null,
    specs: JSON.stringify((Array.isArray(b.specs) ? b.specs : []).slice(0, 30).map((x) => ({ k: str(x && x.k, 60), v: str(x && x.v, 200) })).filter((x) => x.k && x.v)),
    bundle_ids: JSON.stringify((Array.isArray(b.bundle_ids) ? b.bundle_ids : []).map((x) => int(x)).filter((x) => x > 0).slice(0, 4)),
    attrs: JSON.stringify(cleanAttrs(b.attrs)),
    // product video: an https link (YouTube / TikTok / Instagram / .mp4) or our own upload
    video_url: /^(https:\/\/[^\s"'<>]+|\/uploads\/[\w.-]+)$/.test(str(b.video_url, 500)) ? str(b.video_url, 500) : null,
  };
  v.tag_ids = (Array.isArray(b.tag_ids) ? b.tag_ids : []).map((x) => int(x)).filter((x) => x > 0).slice(0, 10);
  // USD-priced products: the admin types prices in dollars; IQD prices are calculated from the rate.
  const st = getSettings();
  const num = (x) => Math.max(0, Math.round((Number(x) || 0) * 100) / 100);
  v.usd_priced = b.usd_priced ? 1 : 0;
  if (v.usd_priced && !(Number(st.usd_rate) > 0)) throw new HttpError(400, 'usd_rate_missing');
  if (v.usd_priced) {
    v.price_usd = num(b.price) || null; v.old_price_usd = num(b.old_price) || null;
    v.price = toIqd(v.price_usd, st) || 0; v.old_price = toIqd(v.old_price_usd, st);
  } else { v.price_usd = null; v.old_price_usd = null; }
  v.variants = (Array.isArray(b.variants) ? b.variants : []).slice(0, 30).map((x, i) => {
    const pu = v.usd_priced ? num(x.price) || null : null;
    const opu = v.usd_priced ? num(x.old_price) || null : null;
    return {
      id: x.id ? int(x.id) : null, label: str(x.label, 80),
      price: v.usd_priced ? toIqd(pu, st) || 0 : Math.max(0, int(x.price)),
      old_price: v.usd_priced ? toIqd(opu, st) : (x.old_price ? Math.max(0, int(x.old_price)) : null),
      price_usd: pu, old_price_usd: opu, stock: Math.max(0, int(x.stock)), sort: i,
      cost_price: x.cost_price !== '' && x.cost_price != null ? Math.max(0, int(x.cost_price)) : null,
    };
  }).filter((x) => x.label && x.price);
  // Guard against a dinar amount typed into a dollar field (e.g. 1,500,000 "$").
  if (v.usd_priced && [v.price_usd, v.old_price_usd, ...v.variants.flatMap((x) => [x.price_usd, x.old_price_usd])].some((x) => x > 50000)) throw new HttpError(400, 'usd_price_too_high');
  if (v.variants.length) { v.price = Math.min(...v.variants.map((x) => x.price)); v.stock = v.variants.reduce((a, x) => a + x.stock, 0); }
  if (!v.name_ku || !v.price) throw new HttpError(400, 'invalid_input');
  return v;
}
// Phone-finder data (only for phones): os, tier, ram, storage, battery, camera, screen, charging, 5G
function cleanAttrs(a) {
  if (!a || typeof a !== 'object' || !['ios', 'android'].includes(a.os)) return {};
  const n = (x, max) => Math.max(0, Math.min(Number(x) || 0, max));
  return { os: a.os, tier: ['flagship', 'upper', 'mid', 'entry'].includes(a.tier) ? a.tier : 'mid', ram: n(a.ram, 32), storage: n(a.storage, 2048),
    battery: n(a.battery, 10000), camera: n(a.camera, 300), screen: n(a.screen, 10), charging: n(a.charging, 300), g5: !!a.g5 };
}
function saveVariants(productId, variants) {
  const keep = variants.filter((x) => x.id).map((x) => x.id);
  db.prepare(`DELETE FROM product_variants WHERE product_id = ? ${keep.length ? `AND id NOT IN (${keep.map(() => '?').join(',')})` : ''}`).run(productId, ...keep);
  for (const x of variants) {
    const exists = x.id && db.prepare('SELECT 1 FROM product_variants WHERE id = ? AND product_id = ?').get(x.id, productId);
    if (exists) db.prepare('UPDATE product_variants SET label=?, price=?, old_price=?, price_usd=?, old_price_usd=?, stock=?, sort=?, cost_price=? WHERE id=?').run(x.label, x.price, x.old_price, x.price_usd, x.old_price_usd, x.stock, x.sort, x.cost_price, x.id);
    else db.prepare('INSERT INTO product_variants(product_id, label, price, old_price, price_usd, old_price_usd, stock, sort, cost_price) VALUES(?,?,?,?,?,?,?,?,?)').run(productId, x.label, x.price, x.old_price, x.price_usd, x.old_price_usd, x.stock, x.sort, x.cost_price);
  }
  syncProductFromVariants(productId);
}
function saveTags(productId, tagIds) {
  db.prepare('DELETE FROM product_tags WHERE product_id = ?').run(productId);
  for (const t of tagIds) if (db.prepare('SELECT 1 FROM tags WHERE id = ?').get(t)) db.prepare('INSERT OR IGNORE INTO product_tags(product_id, tag_id) VALUES(?,?)').run(productId, t);
}
// Admin list extras: tag ids and a warning when the margin is below the "minimum profit" setting.
function adminDecorate(list) {
  const minProfit = int(getSettings().min_profit, 0);
  for (const p of list) {
    p.tag_ids = db.prepare('SELECT tag_id FROM product_tags WHERE product_id = ?').all(p.id).map((r) => r.tag_id);
    const pairs = p.variants && p.variants.length ? p.variants.map((v) => [v.price, v.cost_price ?? p.cost_price]) : [[p.price, p.cost_price]];
    p.low_margin = pairs.some(([price, cost]) => cost != null && price - cost < minProfit);
  }
  return list;
}
const adminProduct = (id) => adminDecorate(attachVariants([productOut(db.prepare(`SELECT p.*, ${VARIANT_COUNT_SQL} FROM products p WHERE p.id = ?`).get(id), true)]))[0];
admin.post('/products', wrap((req, res) => {
  const v = productValues(req.body);
  const id = tx(() => {
    const pid = Number(db.prepare(`INSERT INTO products(${PRODUCT_FIELDS.join(',')}) VALUES(${PRODUCT_FIELDS.map(() => '?').join(',')})`)
      .run(...PRODUCT_FIELDS.map((f) => v[f])).lastInsertRowid);
    saveVariants(pid, v.variants);
    saveTags(pid, v.tag_ids);
    indexProduct(pid);
    const created = db.prepare('SELECT stock FROM products WHERE id = ?').get(pid).stock;
    if (created) extras.recordStock({ productId: pid, delta: created, reason: 'initial', userName: req.user.name });
    return pid;
  });
  logAdmin(req, 'product_create', { id, name: v.name_ku, price: v.price });
  res.json(adminProduct(id));
}));
admin.put('/products/:id', wrap((req, res) => {
  const v = productValues(req.body);
  const id = int(req.params.id);
  const before = db.prepare('SELECT price, stock FROM products WHERE id = ?').get(id);
  if (!before) throw new HttpError(404, 'not_found');
  const beforeVariants = Object.fromEntries(variantsOf(id).map((x) => [x.id, x.stock]));
  tx(() => {
    db.prepare(`UPDATE products SET ${PRODUCT_FIELDS.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`).run(...PRODUCT_FIELDS.map((f) => v[f]), id);
    saveVariants(id, v.variants);
    saveTags(id, v.tag_ids);
    indexProduct(id);
    // Stock log: record what the edit changed
    const afterVariants = variantsOf(id);
    if (afterVariants.length) {
      for (const x of afterVariants) extras.recordStock({ productId: id, variantId: x.id, delta: x.stock - (beforeVariants[x.id] ?? 0), reason: 'admin_edit', userName: req.user.name });
    } else {
      extras.recordStock({ productId: id, delta: v.stock - before.stock, reason: 'admin_edit', userName: req.user.name });
    }
  });
  logAdmin(req, 'product_update', { id, name: v.name_ku, price: [before.price, v.price], stock: [before.stock, v.stock] });
  res.json(adminProduct(id));
}));
admin.delete('/products/:id', wrap((req, res) => {
  const p = db.prepare('SELECT name_ku FROM products WHERE id = ?').get(int(req.params.id));
  db.prepare('DELETE FROM products WHERE id = ?').run(int(req.params.id));
  logAdmin(req, 'product_delete', { id: int(req.params.id), name: p && p.name_ku });
  res.json({ ok: true });
}));

// categories
admin.get('/categories', wrap((_req, res) => res.json(db.prepare('SELECT * FROM categories ORDER BY parent_id IS NOT NULL, sort, id').all())));
function catValues(b) {
  const v = { parent_id: b.parent_id ? int(b.parent_id) : null, name_ku: str(b.name_ku, 100), name_ar: str(b.name_ar, 100), name_en: str(b.name_en, 100), image: str(b.image, 500), sort: int(b.sort) };
  if (!v.name_ku) throw new HttpError(400, 'invalid_input');
  return v;
}
admin.post('/categories', wrap((req, res) => {
  const v = catValues(req.body);
  const id = Number(db.prepare('INSERT INTO categories(parent_id, name_ku, name_ar, name_en, image, sort) VALUES(?,?,?,?,?,?)')
    .run(v.parent_id, v.name_ku, v.name_ar, v.name_en, v.image, v.sort).lastInsertRowid);
  logAdmin(req, 'category_create', { id, name: v.name_ku });
  rebuildSearchIndex();
  res.json(db.prepare('SELECT * FROM categories WHERE id = ?').get(id));
}));
admin.put('/categories/:id', wrap((req, res) => {
  const v = catValues(req.body);
  const id = int(req.params.id);
  if (v.parent_id === id) throw new HttpError(400, 'invalid_input');
  db.prepare('UPDATE categories SET parent_id=?, name_ku=?, name_ar=?, name_en=?, image=?, sort=? WHERE id=?')
    .run(v.parent_id, v.name_ku, v.name_ar, v.name_en, v.image, v.sort, id);
  rebuildSearchIndex();
  res.json(db.prepare('SELECT * FROM categories WHERE id = ?').get(id));
}));
admin.delete('/categories/:id', wrap((req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(int(req.params.id));
  logAdmin(req, 'category_delete', { id: int(req.params.id) });
  res.json({ ok: true });
}));

// banners
const BANNER_FIELDS = ['tag_ku', 'tag_ar', 'tag_en', 'title_ku', 'title_ar', 'title_en', 'subtitle_ku', 'subtitle_ar', 'subtitle_en', 'image', 'link', 'sort', 'active'];
const bannerValues = (b) => BANNER_FIELDS.map((f) => (f === 'sort' ? int(b.sort) : f === 'active' ? (b.active === false || b.active === 0 ? 0 : 1) : str(b[f], 500)));
admin.get('/banners', wrap((_req, res) => res.json(db.prepare('SELECT * FROM banners ORDER BY sort, id').all())));
admin.post('/banners', wrap((req, res) => {
  const id = Number(db.prepare(`INSERT INTO banners(${BANNER_FIELDS.join(',')}) VALUES(${BANNER_FIELDS.map(() => '?').join(',')})`).run(...bannerValues(req.body)).lastInsertRowid);
  res.json(db.prepare('SELECT * FROM banners WHERE id = ?').get(id));
}));
admin.put('/banners/:id', wrap((req, res) => {
  db.prepare(`UPDATE banners SET ${BANNER_FIELDS.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`).run(...bannerValues(req.body), int(req.params.id));
  res.json(db.prepare('SELECT * FROM banners WHERE id = ?').get(int(req.params.id)));
}));
admin.delete('/banners/:id', wrap((req, res) => {
  db.prepare('DELETE FROM banners WHERE id = ?').run(int(req.params.id));
  logAdmin(req, 'banner_delete', { id: int(req.params.id) });
  res.json({ ok: true });
}));

// users
admin.get('/users', wrap((req, res) => {
  const q = str(req.query.q, 50);
  const rows = q
    ? db.prepare('SELECT * FROM users WHERE name LIKE ? OR phone LIKE ? ORDER BY id DESC LIMIT 300').all(`%${q}%`, `%${q}%`)
    : db.prepare('SELECT * FROM users ORDER BY id DESC LIMIT 300').all();
  res.json(rows.map((u) => ({
    ...publicUser(u), blocked: !!u.blocked, block_reason: u.block_reason,
    orders: db.prepare('SELECT COUNT(*) n FROM orders WHERE user_id = ?').get(u.id).n,
    cancelled: db.prepare("SELECT COUNT(*) n FROM orders WHERE user_id = ? AND status = 'cancelled'").get(u.id).n,
  })));
}));
admin.put('/users/:id', wrap((req, res) => {
  const id = int(req.params.id);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) throw new HttpError(404, 'not_found');
  const role = u.role; // roles are changed on the staff page (owner only)
  if (req.body.wallet != null && !['admin', 'manager'].includes(req.user.role)) throw new HttpError(403, 'forbidden');
  const wallet = req.body.wallet != null ? Math.max(0, int(req.body.wallet)) : u.wallet;
  const blocked = req.body.blocked != null ? (req.body.blocked ? 1 : 0) : u.blocked;
  if (id === req.user.id && blocked) throw new HttpError(400, 'cannot_demote_self');
  const reason = req.body.block_reason != null ? str(req.body.block_reason, 200) : u.block_reason;
  db.prepare('UPDATE users SET role = ?, wallet = ?, blocked = ?, block_reason = ? WHERE id = ?').run(role, wallet, blocked, reason, id);
  const changes = {};
  if (role !== u.role) changes.role = [u.role, role];
  if (wallet !== u.wallet) changes.wallet = [u.wallet, wallet];
  if (blocked !== u.blocked) changes.blocked = [!!u.blocked, !!blocked];
  if (Object.keys(changes).length) logAdmin(req, 'user_update', { id, phone: u.phone, ...changes });
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)));
}));

// coupons
admin.get('/coupons', wrap((_req, res) => {
  res.json(db.prepare(`SELECT c.*,
      (SELECT COUNT(*) FROM orders o WHERE o.coupon_code = c.code AND o.status != 'cancelled') AS orders,
      (SELECT COALESCE(SUM(o.total + o.wallet_used), 0) FROM orders o WHERE o.coupon_code = c.code AND o.status = 'delivered') AS revenue,
      (SELECT COALESCE(SUM(o.discount), 0) FROM orders o WHERE o.coupon_code = c.code AND o.status != 'cancelled') AS discount_given
    FROM coupons c ORDER BY c.id DESC`).all());
}));
function couponValues(b) {
  const v = {
    code: normCode(b.code), owner: str(b.owner, 80), type: b.type === 'fixed' ? 'fixed' : 'percent', value: Math.max(0, int(b.value)),
    max_discount: b.max_discount ? Math.max(0, int(b.max_discount)) : null, min_order: Math.max(0, int(b.min_order)),
    max_uses: b.max_uses ? Math.max(1, int(b.max_uses)) : null, once_per_customer: b.once_per_customer === false || b.once_per_customer === 0 ? 0 : 1,
    expires_at: b.expires_at ? str(b.expires_at, 40) : null, active: b.active === false || b.active === 0 ? 0 : 1,
  };
  if (!/^[A-Z0-9_-]{3,30}$/.test(v.code) || !v.value || (v.type === 'percent' && v.value > 90)) throw new HttpError(400, 'invalid_input');
  return v;
}
const COUPON_FIELDS = ['code', 'owner', 'type', 'value', 'max_discount', 'min_order', 'max_uses', 'once_per_customer', 'expires_at', 'active'];
admin.post('/coupons', wrap((req, res) => {
  const v = couponValues(req.body);
  if (db.prepare('SELECT 1 FROM coupons WHERE code = ?').get(v.code)) throw new HttpError(409, 'coupon_exists');
  const id = Number(db.prepare(`INSERT INTO coupons(${COUPON_FIELDS.join(',')}) VALUES(${COUPON_FIELDS.map(() => '?').join(',')})`).run(...COUPON_FIELDS.map((f) => v[f])).lastInsertRowid);
  logAdmin(req, 'coupon_create', { code: v.code, owner: v.owner, value: v.value, type: v.type });
  res.json(db.prepare('SELECT * FROM coupons WHERE id = ?').get(id));
}));
admin.put('/coupons/:id', wrap((req, res) => {
  const v = couponValues(req.body);
  const id = int(req.params.id);
  if (db.prepare('SELECT 1 FROM coupons WHERE code = ? AND id != ?').get(v.code, id)) throw new HttpError(409, 'coupon_exists');
  db.prepare(`UPDATE coupons SET ${COUPON_FIELDS.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`).run(...COUPON_FIELDS.map((f) => v[f]), id);
  logAdmin(req, 'coupon_update', { code: v.code, active: !!v.active });
  res.json(db.prepare('SELECT * FROM coupons WHERE id = ?').get(id));
}));
admin.delete('/coupons/:id', wrap((req, res) => {
  const c = db.prepare('SELECT code FROM coupons WHERE id = ?').get(int(req.params.id));
  db.prepare('DELETE FROM coupons WHERE id = ?').run(int(req.params.id));
  logAdmin(req, 'coupon_delete', { code: c && c.code });
  res.json({ ok: true });
}));

// settings
admin.get('/settings', wrap((_req, res) => res.json(getSettings())));
admin.put('/settings', wrap((req, res) => {
  const before = getSettings();
  const changed = {};
  if ('delivery_zones' in req.body) {
    let zones;
    try { zones = typeof req.body.delivery_zones === 'string' ? JSON.parse(req.body.delivery_zones) : req.body.delivery_zones; } catch { zones = null; }
    if (!Array.isArray(zones)) throw new HttpError(400, 'invalid_input');
    req.body.delivery_zones = JSON.stringify(zones.slice(0, 100).map((z) => ({ name: str(z.name, 60), fee: Math.max(0, int(z.fee)), eta: str(z.eta, 40) })).filter((z) => z.name));
    req.body.cities = JSON.parse(req.body.delivery_zones).map((z) => z.name).join(',');
  }
  for (const k of ADMIN_SETTINGS) if (k in req.body) {
    const v = str(req.body[k], 5000);
    if ((before[k] ?? '') !== v) changed[k] = [before[k] ?? '', v];
    setSetting(k, v);
  }
  if (Object.keys(changed).length) logAdmin(req, 'settings_update', changed);
  if (changed.usd_rate || changed.usd_round) {
    const n = tx(() => repriceUsd());
    if (n) logAdmin(req, 'usd_reprice', { products: n, rate: getSettings().usd_rate });
  }
  res.json(getSettings());
}));

admin.get('/log', wrap((_req, res) => res.json(db.prepare('SELECT * FROM admin_log ORDER BY id DESC LIMIT 300').all())));

admin.get('/backups', wrap((_req, res) => res.json(listBackups())));
admin.get('/backups/download', wrap((req, res) => {
  const name = String(req.query.name || '');
  let file;
  if (name === 'now') {
    file = snapshot(path.join(BACKUP_DIR, `manual-${Date.now()}.db`));
    res.on('finish', () => fs.unlink(file, () => {}));
  } else {
    if (!/^store-\d{4}-\d{2}-\d{2}\.db$/.test(name)) throw new HttpError(400, 'invalid_input');
    file = path.join(BACKUP_DIR, name);
    if (!fs.existsSync(file)) throw new HttpError(404, 'not_found');
  }
  logAdmin(req, 'backup_download', name);
  res.download(file, name === 'now' ? `store-${new Date().toISOString().slice(0, 16).replace(':', '-')}.db` : name);
}));

app.use('/api/admin', admin);
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'not_found')));

// ---------------- static ----------------
app.use('/uploads', express.static(UPLOAD_DIR, {
  maxAge: '7d',
  setHeaders: (res) => res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'"),
}));
const PUBLIC = path.join(__dirname, '..', 'public');
// Link previews (WhatsApp, Facebook, Telegram, Instagram DMs) read <meta property="og:*"> from the HTML.
const attr = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let indexHtml = null;
function renderIndex(req, res, meta = {}) {
  if (!indexHtml || process.env.NODE_ENV !== 'production') indexHtml = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  const s = getSettings();
  const base = PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  const title = meta.title || s.store_name || 'Store';
  const desc = meta.description || s.seo_description || s.slogan || 'مۆبایل و ئەکسسوار — گەیاندن بۆ هەموو شارەکان | موبايلات وإكسسوارات مع التوصيل';
  let image = meta.image;
  if (!image) {
    const b = db.prepare('SELECT image FROM banners WHERE active = 1 ORDER BY sort, id LIMIT 1').get();
    image = b ? ogImageFor(b.image, UPLOAD_DIR) : null;
  }
  const tags = [
    `<meta property="og:type" content="${meta.type || 'website'}">`,
    `<meta property="og:site_name" content="${attr(s.store_name || '')}">`,
    `<meta property="og:title" content="${attr(title)}">`,
    `<meta property="og:description" content="${attr(desc)}">`,
    `<meta property="og:url" content="${attr(base + (meta.path || req.originalUrl))}">`,
    image ? `<meta property="og:image" content="${attr(base + image)}">` : '',
    image ? '<meta name="twitter:card" content="summary_large_image">' : '',
    meta.price ? `<meta property="product:price:amount" content="${meta.price}"><meta property="product:price:currency" content="IQD">` : '',
    meta.redirect ? `<meta http-equiv="refresh" content="0;url=${attr(meta.redirect)}">` : '',
  ].filter(Boolean).join('\n  ');
  const html = indexHtml
    .replace(/<title>[^<]*<\/title>/, `<title>${attr(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${attr(desc)}">`)
    .replace('</head>', `  ${tags}\n</head>`);
  res.setHeader('Cache-Control', 'no-cache'); // always fresh HTML; scripts/styles are cached for an hour
  res.type('html').send(html);
}
// Shareable product link: /p/12 → preview card for crawlers, then the app opens the product.
app.get('/p/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(int(req.params.id));
  if (!p) return res.redirect('/');
  const s = getSettings();
  const price = Number(p.price).toLocaleString('en-US');
  const name = [p.name_ku, p.name_ar && p.name_ar !== p.name_ku ? p.name_ar : null].filter(Boolean).join(' | ');
  renderIndex(req, res, {
    title: `${p.name_ku} — ${price} د.ع`,
    description: `${name} — ${price} د.ع${p.stock > 0 ? '' : ' (نەماوە / نفذت الكمية)'} · ${s.store_name || ''}`,
    image: ogImageFor(p.image, UPLOAD_DIR), type: 'product', price: p.price, path: `/p/${p.id}`,
    redirect: `/#/product/${p.id}`,
  });
});
app.get('/robots.txt', (req, res) => {
  const base = PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\nSitemap: ${base}/sitemap.xml\n`);
});
app.get('/sitemap.xml', (req, res) => {
  const base = PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  const urls = [`${base}/`, ...db.prepare('SELECT id, created_at FROM products WHERE active = 1 ORDER BY id').all().map((p) => `${base}/p/${p.id}`)];
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${attr(u)}</loc></url>`).join('\n')}\n</urlset>\n`);
});
app.get('/', (req, res) => renderIndex(req, res));
app.use(express.static(PUBLIC, { index: false, maxAge: '1h' }));
const sendAdmin = (_req, res) => { res.setHeader('X-Robots-Tag', 'noindex'); res.sendFile(path.join(PUBLIC, 'admin', 'index.html')); };
app.get(ADMIN_PATH, sendAdmin);
app.get(`${ADMIN_PATH}/*`, (req, res, next) => (ADMIN_PATH === '/admin' && /\.(js|css)$/.test(req.path) ? next() : sendAdmin(req, res)));
if (ADMIN_PATH !== '/admin') app.get('/admin', (req, res) => renderIndex(req, res)); // the default address shows the shop
app.get('*', (req, res) => renderIndex(req, res));

// ---------------- errors ----------------
app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, detail: err.detail });
  if (err instanceof OtpError) {
    const status = { otp_wait: 429, too_many_attempts: 429, otp_send_failed: 502 }[err.code] || 400; // phone_not_allowed, otp_invalid, otp_expired → 400
    return res.status(status).json({ error: err.code, retry_in: err.retry_in, attempts_left: err.attempts_left });
  }
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' });
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'file_too_large' });
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  rebuildSearchIndex();
  startBackups();
  extras.pruneAnalytics();
  setInterval(() => extras.pruneAnalytics(), 24 * 3600 * 1000).unref();
  setInterval(() => {
    db.prepare("DELETE FROM sessions WHERE julianday('now') - julianday(created_at) > 30").run();
    db.prepare('DELETE FROM auth_failures WHERE ts < ?').run(Date.now() - 24 * 3600 * 1000);
  }, 3600 * 1000).unref();
  app.listen(PORT, () => console.log(`Store running on http://localhost:${PORT}  (admin: /admin)`));
}
module.exports = app;
