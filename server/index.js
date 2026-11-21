const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { db, tx, hashPassword, verifyPassword, newReferralCode, getSettings, setSetting, UPLOAD_DIR } = require('./db');
const { sendOtp, verifyOtp, OtpError } = require('./sms');

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY); // e.g. 1 behind Nginx / a PaaS, so rate limits see the real client IP
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

// ---------------- utils ----------------
const ORDER_STATUSES = ['pending', 'preparing', 'shipping', 'delivered', 'cancelled'];
const PUBLIC_SETTINGS = ['store_name', 'delivery_fee', 'free_delivery_over', 'referral_reward', 'flash_sale_end',
  'search_tags', 'cities', 'whatsapp', 'instagram', 'facebook', 'tiktok', 'support_phone'];

class HttpError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }
const wrap = (fn) => (req, res, next) => { try { const r = fn(req, res, next); if (r && r.catch) r.catch(next); } catch (e) { next(e); } };
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const str = (v, max = 500) => (v == null ? '' : String(v).trim().slice(0, max));
const normPhone = (p) => str(p, 20).replace(/[^\d+]/g, '');

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, name: u.name, phone: u.phone, role: u.role, wallet: u.wallet, referral_code: u.referral_code, avatar: u.avatar, created_at: u.created_at };
}
function productOut(p) {
  if (!p) return p;
  let images = [];
  try { images = JSON.parse(p.images || '[]'); } catch { images = []; }
  return { ...p, images, featured: !!p.featured, trending: !!p.trending, flash_sale: !!p.flash_sale, active: !!p.active };
}

// ---------------- auth ----------------
function auth(req, _res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (token) {
    const row = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').get(token);
    if (row) { req.user = row; req.token = token; }
  }
  next();
}
const requireUser = (req, _res, next) => (req.user ? next() : next(new HttpError(401, 'unauthorized')));
const requireAdmin = (req, _res, next) => (req.user && req.user.role === 'admin' ? next() : next(new HttpError(403, 'forbidden')));
app.use('/api', auth);

const attempts = new Map(); // naive login rate limit per IP
function rateLimit(req) {
  const key = req.ip;
  const now = Date.now();
  const a = (attempts.get(key) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (a.length >= 20) throw new HttpError(429, 'too_many_attempts');
  a.push(now); attempts.set(key, a);
}
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions(token, user_id) VALUES(?, ?)').run(token, userId);
  return token;
}

// Send a verification code. purpose: register | reset | change_phone
app.post('/api/auth/otp', wrap(async (req, res) => {
  const phone = normPhone(req.body.phone);
  const purpose = String(req.body.purpose || '');
  if (phone.length < 7) throw new HttpError(400, 'invalid_input');
  const exists = !!db.prepare('SELECT 1 FROM users WHERE phone = ?').get(phone);
  if (purpose === 'register' && exists) throw new HttpError(409, 'phone_taken');
  if (purpose === 'reset' && !exists) throw new HttpError(404, 'phone_not_found');
  if (purpose === 'change_phone') {
    if (!req.user) throw new HttpError(401, 'unauthorized');
    if (exists) throw new HttpError(409, 'phone_taken');
  }
  const lang = ['ku', 'ar', 'en'].includes(req.body.lang) ? req.body.lang : 'ku';
  res.json(await sendOtp({ phone, purpose, ip: req.ip, lang, storeName: getSettings().store_name }));
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
  rateLimit(req);
  const phone = normPhone(req.body.phone);
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user || !verifyPassword(String(req.body.password || ''), user.password_hash)) throw new HttpError(401, 'wrong_credentials');
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
  if (q.q) {
    const like = `%${str(q.q, 100)}%`;
    where.push('(p.name_ku LIKE ? OR p.name_ar LIKE ? OR p.name_en LIKE ? OR p.brand LIKE ?)');
    params.push(like, like, like, like);
  }
  if (q.flash) where.push('p.flash_sale = 1');
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
  const sql = `SELECT p.* FROM products p ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order} LIMIT ? OFFSET ?`;
  return db.prepare(sql).all(...params, limit, offset).map(productOut);
}

app.get('/api/products', wrap((req, res) => res.json(productQuery(req.query))));

app.get('/api/products/:id', wrap((req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(int(req.params.id));
  if (!p) throw new HttpError(404, 'not_found');
  const related = db.prepare('SELECT * FROM products WHERE active = 1 AND category_id = ? AND id != ? ORDER BY sold DESC LIMIT 8')
    .all(p.category_id, p.id).map(productOut);
  res.json({ product: productOut(p), related });
}));

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
  res.json({ user: publicUser(req.user), stats: userStats(req.user.id) });
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
  return { ...o, items: db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id) };
}

app.post('/api/orders', requireUser, wrap((req, res) => {
  const s = getSettings();
  const items = Array.isArray(req.body.items) ? req.body.items.slice(0, 50) : [];
  const name = str(req.body.name, 80) || req.user.name;
  const phone = normPhone(req.body.phone) || req.user.phone;
  const city = str(req.body.city, 60);
  const address = str(req.body.address, 300);
  if (!items.length) throw new HttpError(400, 'cart_empty');
  if (!city || !address) throw new HttpError(400, 'invalid_input');

  const order = tx(() => {
    let subtotal = 0;
    const lines = [];
    for (const it of items) {
      const qty = Math.max(1, Math.min(int(it.qty, 1), 99));
      const p = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(int(it.id));
      if (!p) throw new HttpError(400, 'product_unavailable');
      if (p.stock < qty) throw Object.assign(new HttpError(400, 'out_of_stock'), { detail: p.name_ku });
      subtotal += p.price * qty;
      lines.push({ p, qty });
    }
    const freeOver = int(s.free_delivery_over, 0);
    const delivery = freeOver && subtotal >= freeOver ? 0 : int(s.delivery_fee, 0);
    const user = db.prepare('SELECT wallet FROM users WHERE id = ?').get(req.user.id);
    const walletUsed = req.body.use_wallet ? Math.min(user.wallet, subtotal + delivery) : 0;
    const total = subtotal + delivery - walletUsed;
    const oid = Number(db.prepare(`INSERT INTO orders(user_id, customer_name, phone, city, address, note, subtotal, delivery_fee, wallet_used, total)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).run(req.user.id, name, phone, city, address, str(req.body.note, 500), subtotal, delivery, walletUsed, total).lastInsertRowid);
    const insItem = db.prepare('INSERT INTO order_items(order_id, product_id, name, image, price, qty) VALUES(?,?,?,?,?,?)');
    for (const { p, qty } of lines) {
      insItem.run(oid, p.id, p.name_ku, p.image, p.price, qty);
      db.prepare('UPDATE products SET stock = stock - ?, sold = sold + ? WHERE id = ?').run(qty, qty, p.id);
    }
    if (walletUsed) db.prepare('UPDATE users SET wallet = wallet - ? WHERE id = ?').run(walletUsed, req.user.id);
    return db.prepare('SELECT * FROM orders WHERE id = ?').get(oid);
  });
  res.json(orderWithItems(order));
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

function cancelOrder(o) {
  for (const it of db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id)) {
    if (it.product_id) db.prepare('UPDATE products SET stock = stock + ?, sold = MAX(sold - ?, 0) WHERE id = ?').run(it.qty, it.qty, it.product_id);
  }
  if (o.wallet_used && o.user_id) db.prepare('UPDATE users SET wallet = wallet + ? WHERE id = ?').run(o.wallet_used, o.user_id);
}

app.post('/api/orders/:id/cancel', requireUser, wrap((req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(int(req.params.id), req.user.id);
  if (!o) throw new HttpError(404, 'not_found');
  if (o.status !== 'pending') throw new HttpError(400, 'cannot_cancel');
  tx(() => {
    cancelOrder(o);
    db.prepare("UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(o.id);
  });
  res.json(orderWithItems(db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id)));
}));

// ---------------- admin ----------------
const admin = express.Router();
admin.use(requireAdmin);

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }[file.mimetype] || '.img';
      cb(null, crypto.randomBytes(12).toString('hex') + ext);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)),
});
admin.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'invalid_file' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

admin.get('/stats', wrap((_req, res) => {
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
    recent: db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 8').all(),
  });
}));

admin.get('/orders', wrap((req, res) => {
  const status = ORDER_STATUSES.includes(req.query.status) ? req.query.status : null;
  const q = str(req.query.q, 50);
  const where = []; const params = [];
  if (status) { where.push('status = ?'); params.push(status); }
  if (q) { where.push('(customer_name LIKE ? OR phone LIKE ? OR CAST(id AS TEXT) = ?)'); params.push(`%${q}%`, `%${q}%`, q); }
  const rows = db.prepare(`SELECT * FROM orders ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 300`).all(...params);
  res.json(rows.map(orderWithItems));
}));

admin.put('/orders/:id', wrap((req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(int(req.params.id));
  if (!o) throw new HttpError(404, 'not_found');
  const status = req.body.status;
  if (!ORDER_STATUSES.includes(status)) throw new HttpError(400, 'invalid_status');
  if (o.status === 'cancelled' && status !== 'cancelled') throw new HttpError(400, 'order_cancelled');
  tx(() => {
    if (status === 'cancelled' && o.status !== 'cancelled') cancelOrder(o);
    db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, o.id);
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
  res.json(orderWithItems(db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id)));
}));

// products
admin.get('/products', wrap((req, res) => res.json(productQuery({ ...req.query, sort: req.query.sort || 'newest', limit: 200 }, { admin: true }))));
const PRODUCT_FIELDS = ['category_id', 'name_ku', 'name_ar', 'name_en', 'desc_ku', 'desc_ar', 'desc_en', 'brand', 'price', 'old_price', 'stock', 'image', 'images', 'featured', 'trending', 'flash_sale', 'sold', 'active'];
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
    sold: Math.max(0, int(b.sold)), active: b.active === false || b.active === 0 ? 0 : 1,
  };
  if (!v.name_ku || !v.price) throw new HttpError(400, 'invalid_input');
  return v;
}
admin.post('/products', wrap((req, res) => {
  const v = productValues(req.body);
  const id = Number(db.prepare(`INSERT INTO products(${PRODUCT_FIELDS.join(',')}) VALUES(${PRODUCT_FIELDS.map(() => '?').join(',')})`)
    .run(...PRODUCT_FIELDS.map((f) => v[f])).lastInsertRowid);
  res.json(productOut(db.prepare('SELECT * FROM products WHERE id = ?').get(id)));
}));
admin.put('/products/:id', wrap((req, res) => {
  const v = productValues(req.body);
  db.prepare(`UPDATE products SET ${PRODUCT_FIELDS.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`)
    .run(...PRODUCT_FIELDS.map((f) => v[f]), int(req.params.id));
  res.json(productOut(db.prepare('SELECT * FROM products WHERE id = ?').get(int(req.params.id))));
}));
admin.delete('/products/:id', wrap((req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(int(req.params.id));
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
  res.json(db.prepare('SELECT * FROM categories WHERE id = ?').get(id));
}));
admin.put('/categories/:id', wrap((req, res) => {
  const v = catValues(req.body);
  const id = int(req.params.id);
  if (v.parent_id === id) throw new HttpError(400, 'invalid_input');
  db.prepare('UPDATE categories SET parent_id=?, name_ku=?, name_ar=?, name_en=?, image=?, sort=? WHERE id=?')
    .run(v.parent_id, v.name_ku, v.name_ar, v.name_en, v.image, v.sort, id);
  res.json(db.prepare('SELECT * FROM categories WHERE id = ?').get(id));
}));
admin.delete('/categories/:id', wrap((req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(int(req.params.id));
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
  res.json({ ok: true });
}));

// users
admin.get('/users', wrap((req, res) => {
  const q = str(req.query.q, 50);
  const rows = q
    ? db.prepare('SELECT * FROM users WHERE name LIKE ? OR phone LIKE ? ORDER BY id DESC LIMIT 300').all(`%${q}%`, `%${q}%`)
    : db.prepare('SELECT * FROM users ORDER BY id DESC LIMIT 300').all();
  res.json(rows.map((u) => ({ ...publicUser(u), orders: db.prepare('SELECT COUNT(*) n FROM orders WHERE user_id = ?').get(u.id).n })));
}));
admin.put('/users/:id', wrap((req, res) => {
  const id = int(req.params.id);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) throw new HttpError(404, 'not_found');
  const role = ['customer', 'admin'].includes(req.body.role) ? req.body.role : u.role;
  if (id === req.user.id && role !== 'admin') throw new HttpError(400, 'cannot_demote_self');
  const wallet = req.body.wallet != null ? Math.max(0, int(req.body.wallet)) : u.wallet;
  db.prepare('UPDATE users SET role = ?, wallet = ? WHERE id = ?').run(role, wallet, id);
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)));
}));

// settings
admin.get('/settings', wrap((_req, res) => res.json(getSettings())));
admin.put('/settings', wrap((req, res) => {
  for (const k of PUBLIC_SETTINGS) if (k in req.body) setSetting(k, str(req.body[k], 2000));
  res.json(getSettings());
}));

app.use('/api/admin', admin);
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'not_found')));

// ---------------- static ----------------
app.use('/uploads', express.static(UPLOAD_DIR, {
  maxAge: '7d',
  setHeaders: (res) => res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'"),
}));
const PUBLIC = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC));
app.get('/admin*', (_req, res) => res.sendFile(path.join(PUBLIC, 'admin', 'index.html')));
app.get('*', (_req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));

// ---------------- errors ----------------
app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, detail: err.detail });
  if (err instanceof OtpError) {
    const status = { otp_wait: 429, too_many_attempts: 429, otp_send_failed: 502 }[err.code] || 400;
    return res.status(status).json({ error: err.code, retry_in: err.retry_in, attempts_left: err.attempts_left });
  }
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' });
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'file_too_large' });
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Store running on http://localhost:${PORT}  (admin: /admin)`));
}
module.exports = app;
