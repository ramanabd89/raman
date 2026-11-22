// Store-management features: staff roles, abandoned carts, expenses & profit, bulk price changes,
// variant presets, product tags, stock movements, visitor analytics, FAQ, maintenance mode.
const crypto = require('crypto');

// ---- staff roles: which admin sections each role may open ----
const ROLE_SECTIONS = {
  admin: '*',
  manager: ['dashboard', 'orders', 'customers', 'carts', 'products', 'catalog', 'stock', 'coupons', 'expenses', 'analytics', 'faqs', 'banners'],
  orders: ['dashboard', 'orders', 'customers', 'carts'],
  products: ['dashboard', 'products', 'catalog', 'stock'],
};
const STAFF_ROLES = Object.keys(ROLE_SECTIONS);
const isStaff = (role) => STAFF_ROLES.includes(role);
// First path segment of /api/admin/<segment> → section
const SECTION_OF = {
  stats: 'dashboard', orders: 'orders', users: 'customers', carts: 'carts',
  products: 'products', upload: 'products', 'bulk-price': 'products', 'variant-presets': 'products',
  categories: 'catalog', tags: 'catalog', stock: 'stock', coupons: 'coupons',
  expenses: 'expenses', profit: 'expenses', analytics: 'analytics', faqs: 'faqs', banners: 'banners',
};
function canAccess(role, section) {
  const allowed = ROLE_SECTIONS[role];
  return allowed === '*' || (Array.isArray(allowed) && allowed.includes(section));
}

const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|curl|wget|python|headless/i;

function register(app, admin, h) {
  const { db, tx, wrap, HttpError, int, str, logAdmin, requireUser, getSettings, setSetting, priceItems, repriceUsd } = h;

  // Section check for every admin route (requireStaff already ran).
  admin.use((req, _res, next) => {
    const seg = req.path.split('/')[1] || '';
    if (seg === 'settings' && req.method === 'GET') return next(); // read-only, needed by product forms
    const section = SECTION_OF[seg] || 'admin_only';
    return canAccess(req.user.role, section) ? next() : next(new HttpError(403, 'forbidden'));
  });

  // ================= stock movements =================
  function recordStock({ productId, variantId = null, delta, reason, ref = null, userName = null }) {
    if (!delta) return;
    const p = db.prepare('SELECT name_ku, stock FROM products WHERE id = ?').get(productId);
    const v = variantId ? db.prepare('SELECT label, stock FROM product_variants WHERE id = ?').get(variantId) : null;
    db.prepare(`INSERT INTO stock_movements(product_id, variant_id, product_name, variant_label, delta, stock_after, reason, ref, user_name)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(productId, variantId, p ? p.name_ku : null, v ? v.label : null, delta, v ? v.stock : (p ? p.stock : null), reason, ref, userName);
  }
  admin.get('/stock', wrap((req, res) => {
    const pid = int(req.query.product_id);
    res.json(pid
      ? db.prepare('SELECT * FROM stock_movements WHERE product_id = ? ORDER BY id DESC LIMIT 300').all(pid)
      : db.prepare('SELECT * FROM stock_movements ORDER BY id DESC LIMIT 300').all());
  }));
  // Quick restock / correction without opening the product form.
  admin.post('/stock/adjust', wrap((req, res) => {
    const productId = int(req.body.product_id);
    const variantId = req.body.variant_id ? int(req.body.variant_id) : null;
    const delta = int(req.body.delta);
    const reason = ['restock', 'damage', 'correction', 'return'].includes(req.body.reason) ? req.body.reason : 'correction';
    if (!delta) throw new HttpError(400, 'invalid_input');
    tx(() => {
      if (variantId) {
        const v = db.prepare('SELECT * FROM product_variants WHERE id = ? AND product_id = ?').get(variantId, productId);
        if (!v) throw new HttpError(404, 'not_found');
        if (v.stock + delta < 0) throw new HttpError(400, 'invalid_input');
        db.prepare('UPDATE product_variants SET stock = stock + ? WHERE id = ?').run(delta, variantId);
        db.prepare('UPDATE products SET stock = (SELECT COALESCE(SUM(stock),0) FROM product_variants WHERE product_id = ?) WHERE id = ?').run(productId, productId);
      } else {
        const p = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
        if (!p) throw new HttpError(404, 'not_found');
        if (p.stock + delta < 0) throw new HttpError(400, 'invalid_input');
        db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(delta, productId);
      }
      recordStock({ productId, variantId, delta, reason, ref: str(req.body.note, 200) || null, userName: req.user.name });
    });
    logAdmin(req, 'stock_adjust', { product: productId, variant: variantId, delta, reason });
    res.json({ ok: true, stock: db.prepare('SELECT stock FROM products WHERE id = ?').get(productId).stock });
  }));

  // ================= abandoned carts =================
  app.post('/api/cart/sync', requireUser, wrap((req, res) => {
    const items = priceItems(req.body.items).filter((i) => i.available);
    if (!items.length) { db.prepare('DELETE FROM carts WHERE user_id = ?').run(req.user.id); return res.json({ ok: true }); }
    const value = items.reduce((a, i) => a + i.price * i.qty, 0);
    const slim = items.map((i) => ({ id: i.id, variant_id: i.variant_id, qty: i.qty }));
    db.prepare(`INSERT INTO carts(user_id, items, value, updated_at) VALUES(?,?,?,datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET items = excluded.items, value = excluded.value, updated_at = excluded.updated_at`).run(req.user.id, JSON.stringify(slim), value);
    res.json({ ok: true });
  }));
  admin.get('/carts', wrap((_req, res) => {
    const rows = db.prepare(`SELECT c.*, u.name, u.phone, (julianday('now') - julianday(c.updated_at)) * 24 AS hours
      FROM carts c JOIN users u ON u.id = c.user_id ORDER BY c.updated_at DESC LIMIT 300`).all();
    res.json(rows.map((r) => {
      let items = []; try { items = JSON.parse(r.items); } catch { items = []; }
      return { ...r, items: priceItems(items) };
    }));
  }));
  admin.post('/carts/:userId/reminded', wrap((req, res) => {
    db.prepare("UPDATE carts SET reminded_at = datetime('now') WHERE user_id = ?").run(int(req.params.userId));
    res.json({ ok: true });
  }));

  // ================= expenses & profit =================
  const EXPENSE_CATS = ['rent', 'salaries', 'ads', 'delivery', 'utilities', 'stock_purchase', 'other'];
  admin.get('/expenses', wrap((req, res) => {
    const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : new Date().toISOString().slice(0, 7);
    res.json(db.prepare("SELECT * FROM expenses WHERE substr(date, 1, 7) = ? ORDER BY date DESC, id DESC").all(month));
  }));
  admin.post('/expenses', wrap((req, res) => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body.date || '') ? req.body.date : new Date().toISOString().slice(0, 10);
    const category = EXPENSE_CATS.includes(req.body.category) ? req.body.category : 'other';
    const amount = Math.max(0, int(req.body.amount));
    if (!amount) throw new HttpError(400, 'invalid_input');
    const id = Number(db.prepare('INSERT INTO expenses(date, category, amount, note, created_by) VALUES(?,?,?,?,?)')
      .run(date, category, amount, str(req.body.note, 300), req.user.name).lastInsertRowid);
    logAdmin(req, 'expense_add', { id, category, amount });
    res.json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(id));
  }));
  admin.delete('/expenses/:id', wrap((req, res) => {
    const e = db.prepare('SELECT * FROM expenses WHERE id = ?').get(int(req.params.id));
    db.prepare('DELETE FROM expenses WHERE id = ?').run(int(req.params.id));
    logAdmin(req, 'expense_delete', e ? { id: e.id, amount: e.amount, category: e.category } : {});
    res.json({ ok: true });
  }));
  // Monthly profit: product sales − cost of goods − wallet/referral credit used − expenses. Delivery fees are left out (they go to the courier).
  admin.get('/profit', wrap((req, res) => {
    const months = Math.min(Math.max(int(req.query.months, 6), 1), 24);
    const out = [];
    const now = new Date();
    for (let i = 0; i < months; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const m = d.toISOString().slice(0, 7);
      const o = db.prepare(`SELECT COUNT(*) orders, COALESCE(SUM(subtotal - discount), 0) sales, COALESCE(SUM(wallet_used), 0) wallet,
          COALESCE(SUM(delivery_fee), 0) delivery FROM orders WHERE status = 'delivered' AND substr(updated_at, 1, 7) = ?`).get(m);
      const c = db.prepare(`SELECT COALESCE(SUM(CASE WHEN oi.cost IS NOT NULL THEN oi.cost * oi.qty END), 0) cogs,
          COALESCE(SUM(CASE WHEN oi.cost IS NULL THEN 1 END), 0) missing FROM order_items oi JOIN orders o ON o.id = oi.order_id
          WHERE o.status = 'delivered' AND substr(o.updated_at, 1, 7) = ?`).get(m);
      const ex = db.prepare('SELECT COALESCE(SUM(amount), 0) total FROM expenses WHERE substr(date, 1, 7) = ?').get(m).total;
      const byCat = db.prepare('SELECT category, SUM(amount) amount FROM expenses WHERE substr(date, 1, 7) = ? GROUP BY category ORDER BY 2 DESC').all(m);
      out.push({ month: m, orders: o.orders, sales: o.sales, delivery: o.delivery, wallet: o.wallet, cogs: c.cogs, missing_cost: c.missing,
        gross: o.sales - c.cogs, expenses: ex, expenses_by_cat: byCat, net: o.sales - c.cogs - o.wallet - ex });
    }
    res.json(out);
  }));

  // ================= bulk price change =================
  admin.post('/bulk-price', wrap((req, res) => {
    const s = getSettings();
    const mode = req.body.mode === 'amount' ? 'amount' : 'percent';
    const value = Number(req.body.value) || 0;
    if (!value || (mode === 'percent' && (value <= -90 || value > 300))) throw new HttpError(400, 'invalid_input');
    const step = Math.max(1, int(req.body.round, int(s.usd_round, 250)));
    const where = []; const params = [];
    if (req.body.category_id) { const c = int(req.body.category_id); where.push('(category_id = ? OR category_id IN (SELECT id FROM categories WHERE parent_id = ?))'); params.push(c, c); }
    if (req.body.brand) { where.push('LOWER(brand) = LOWER(?)'); params.push(str(req.body.brand, 80)); }
    const products = db.prepare(`SELECT * FROM products ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`).all(...params);
    const roundTo = (n) => Math.max(step, Math.round(n / step) * step);
    const changeIqd = (p) => roundTo(mode === 'percent' ? p * (1 + value / 100) : p + value);
    const changes = [];
    for (const p of products) {
      if (p.usd_priced) {
        if (mode !== 'percent') continue; // dinar amounts don't apply to dollar prices
        changes.push({ id: p.id, name: p.name_ku, usd: true, from: p.price_usd, to: Math.round(p.price_usd * (1 + value / 100) * 100) / 100 });
      } else {
        const vs = db.prepare('SELECT * FROM product_variants WHERE product_id = ?').all(p.id);
        if (vs.length) for (const v of vs) changes.push({ id: p.id, variant_id: v.id, name: `${p.name_ku} (${v.label})`, from: v.price, to: changeIqd(v.price) });
        else changes.push({ id: p.id, name: p.name_ku, from: p.price, to: changeIqd(p.price) });
      }
    }
    if (req.body.preview) return res.json({ count: changes.length, changes: changes.slice(0, 200), skipped_usd: mode === 'amount' ? products.filter((p) => p.usd_priced).length : 0 });
    tx(() => {
      for (const c of changes) {
        if (c.usd) {
          db.prepare('UPDATE products SET price_usd = ? WHERE id = ?').run(c.to, c.id);
          db.prepare('UPDATE product_variants SET price_usd = ROUND(price_usd * ?, 2) WHERE product_id = ? AND price_usd IS NOT NULL').run(1 + value / 100, c.id);
        } else if (c.variant_id) {
          db.prepare('UPDATE product_variants SET price = ? WHERE id = ?').run(c.to, c.variant_id);
        } else {
          db.prepare('UPDATE products SET price = ? WHERE id = ?').run(c.to, c.id);
        }
      }
      for (const id of new Set(changes.filter((c) => c.variant_id).map((c) => c.id))) h.syncProductFromVariants(id);
      if (changes.some((c) => c.usd)) repriceUsd();
    });
    logAdmin(req, 'bulk_price', { mode, value, count: changes.length, category: req.body.category_id || null, brand: req.body.brand || null });
    res.json({ ok: true, count: changes.length });
  }));

  // ================= variant presets (e.g. Storage: 128GB, 256GB …) =================
  admin.put('/variant-presets', wrap((req, res) => {
    const presets = (Array.isArray(req.body.presets) ? req.body.presets : []).slice(0, 10)
      .map((g) => ({ name: str(g.name, 40), values: (Array.isArray(g.values) ? g.values : []).map((v) => str(v, 40)).filter(Boolean).slice(0, 30) }))
      .filter((g) => g.name && g.values.length);
    setSetting('variant_presets', JSON.stringify(presets));
    logAdmin(req, 'variant_presets', { groups: presets.map((g) => g.name) });
    res.json(presets);
  }));

  // ================= product tags (custom labels) =================
  const tagValues = (b) => {
    const v = { name_ku: str(b.name_ku, 40), name_ar: str(b.name_ar, 40), name_en: str(b.name_en, 40), color: /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : '#8B5CF6' };
    if (!v.name_ku) throw new HttpError(400, 'invalid_input');
    return v;
  };
  admin.get('/tags', wrap((_req, res) => res.json(db.prepare('SELECT t.*, (SELECT COUNT(*) FROM product_tags pt WHERE pt.tag_id = t.id) AS products FROM tags t ORDER BY t.id').all())));
  admin.post('/tags', wrap((req, res) => {
    const v = tagValues(req.body);
    const id = Number(db.prepare('INSERT INTO tags(name_ku, name_ar, name_en, color) VALUES(?,?,?,?)').run(v.name_ku, v.name_ar, v.name_en, v.color).lastInsertRowid);
    res.json(db.prepare('SELECT * FROM tags WHERE id = ?').get(id));
  }));
  admin.put('/tags/:id', wrap((req, res) => {
    const v = tagValues(req.body);
    db.prepare('UPDATE tags SET name_ku=?, name_ar=?, name_en=?, color=? WHERE id=?').run(v.name_ku, v.name_ar, v.name_en, v.color, int(req.params.id));
    res.json(db.prepare('SELECT * FROM tags WHERE id = ?').get(int(req.params.id)));
  }));
  admin.delete('/tags/:id', wrap((req, res) => { db.prepare('DELETE FROM tags WHERE id = ?').run(int(req.params.id)); res.json({ ok: true }); }));

  // ================= visitor analytics (no cookies, no third parties) =================
  const ANALYTICS_SALT = crypto.randomBytes(16).toString('hex'); // rotates on restart → visitor ids can't be tracked long-term
  app.post('/api/track', wrap((req, res) => {
    const ua = String(req.headers['user-agent'] || '');
    if (!ua || BOT_RE.test(ua) || (req.user && isStaff(req.user.role))) return res.json({ ok: true });
    const day = new Date().toISOString().slice(0, 10);
    const visitor = crypto.createHash('sha256').update(`${ANALYTICS_SALT}|${day}|${req.ip}|${ua}`).digest('hex').slice(0, 16);
    db.prepare('INSERT INTO page_views(day, visitor, path, product_id, src, created_at) VALUES(?,?,?,?,?,?)')
      .run(day, visitor, str(req.body.path, 120), req.body.product_id ? int(req.body.product_id) : null, str(req.body.src, 60).replace(/[^\w\-.]/g, '') || null, Date.now());
    res.json({ ok: true });
  }));
  admin.get('/analytics', wrap((req, res) => {
    const days = Math.min(Math.max(int(req.query.days, 30), 1), 180);
    const since = new Date(Date.now() - (days - 1) * 864e5).toISOString().slice(0, 10);
    const daily = db.prepare('SELECT day, COUNT(*) views, COUNT(DISTINCT visitor) visitors FROM page_views WHERE day >= ? GROUP BY day ORDER BY day').all(since);
    const orders = Object.fromEntries(db.prepare("SELECT substr(created_at, 1, 10) day, COUNT(*) n FROM orders WHERE substr(created_at, 1, 10) >= ? AND status != 'cancelled' GROUP BY 1").all(since).map((r) => [r.day, r.n]));
    const visitors = db.prepare('SELECT COUNT(DISTINCT day || visitor) n FROM page_views WHERE day >= ?').get(since).n;
    const totalOrders = Object.values(orders).reduce((a, n) => a + n, 0);
    res.json({
      days,
      daily: daily.map((d) => ({ ...d, orders: orders[d.day] || 0 })),
      totals: { views: daily.reduce((a, d) => a + d.views, 0), visitors, orders: totalOrders, conversion: visitors ? Math.round((totalOrders / visitors) * 1000) / 10 : 0 },
      top_products: db.prepare(`SELECT pv.product_id id, p.name_ku name, COUNT(*) views, COUNT(DISTINCT pv.day || pv.visitor) visitors,
          (SELECT COALESCE(SUM(oi.qty),0) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = pv.product_id AND substr(o.created_at,1,10) >= ? AND o.status != 'cancelled') sold
          FROM page_views pv JOIN products p ON p.id = pv.product_id WHERE pv.day >= ? GROUP BY pv.product_id ORDER BY views DESC LIMIT 15`).all(since, since),
      sources: db.prepare("SELECT COALESCE(src, 'direct') src, COUNT(DISTINCT day || visitor) visitors FROM page_views WHERE day >= ? GROUP BY 1 ORDER BY 2 DESC LIMIT 10").all(since),
      pages: db.prepare('SELECT path, COUNT(*) views FROM page_views WHERE day >= ? GROUP BY path ORDER BY 2 DESC LIMIT 10').all(since),
    });
  }));
  function pruneAnalytics() {
    const cutoff = new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10);
    db.prepare('DELETE FROM page_views WHERE day < ?').run(cutoff);
    setSetting('last_db_prune_date', new Date().toISOString().slice(0, 10));
  }

  // ================= staff (system admins) =================
  admin.get('/staff', wrap((_req, res) => {
    res.json(db.prepare(`SELECT id, name, phone, role, totp_enabled, created_at FROM users WHERE role != 'customer' ORDER BY id`).all()
      .map((u) => ({ ...u, totp_enabled: !!u.totp_enabled })));
  }));
  admin.post('/staff', wrap((req, res) => {
    const phone = str(req.body.phone, 20).replace(/[^\d+]/g, '');
    const role = req.body.role;
    if (!STAFF_ROLES.includes(role)) throw new HttpError(400, 'invalid_input');
    const u = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    if (!u) throw new HttpError(404, 'phone_not_found');
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, u.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id); // must log in again with the new role
    logAdmin(req, 'staff_role', { phone, from: u.role, to: role });
    res.json({ ok: true });
  }));
  admin.put('/staff/:id', wrap((req, res) => {
    const id = int(req.params.id);
    if (id === req.user.id) throw new HttpError(400, 'cannot_demote_self');
    const role = req.body.role === 'customer' ? 'customer' : req.body.role;
    if (role !== 'customer' && !STAFF_ROLES.includes(role)) throw new HttpError(400, 'invalid_input');
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!u) throw new HttpError(404, 'not_found');
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    logAdmin(req, 'staff_role', { phone: u.phone, from: u.role, to: role });
    res.json({ ok: true });
  }));

  // ================= FAQ =================
  app.get('/api/faqs', wrap((_req, res) => res.json(db.prepare('SELECT * FROM faqs WHERE active = 1 ORDER BY sort, id').all())));
  const FAQ_FIELDS = ['q_ku', 'q_ar', 'q_en', 'a_ku', 'a_ar', 'a_en', 'sort', 'active'];
  const faqValues = (b) => {
    const v = { q_ku: str(b.q_ku, 300), q_ar: str(b.q_ar, 300), q_en: str(b.q_en, 300), a_ku: str(b.a_ku, 3000), a_ar: str(b.a_ar, 3000), a_en: str(b.a_en, 3000), sort: int(b.sort), active: b.active === false || b.active === 0 ? 0 : 1 };
    if (!v.q_ku || !v.a_ku) throw new HttpError(400, 'invalid_input');
    return FAQ_FIELDS.map((f) => v[f]);
  };
  admin.get('/faqs', wrap((_req, res) => res.json(db.prepare('SELECT * FROM faqs ORDER BY sort, id').all())));
  admin.post('/faqs', wrap((req, res) => {
    const id = Number(db.prepare(`INSERT INTO faqs(${FAQ_FIELDS.join(',')}) VALUES(${FAQ_FIELDS.map(() => '?').join(',')})`).run(...faqValues(req.body)).lastInsertRowid);
    res.json(db.prepare('SELECT * FROM faqs WHERE id = ?').get(id));
  }));
  admin.put('/faqs/:id', wrap((req, res) => {
    db.prepare(`UPDATE faqs SET ${FAQ_FIELDS.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`).run(...faqValues(req.body), int(req.params.id));
    res.json(db.prepare('SELECT * FROM faqs WHERE id = ?').get(int(req.params.id)));
  }));
  admin.delete('/faqs/:id', wrap((req, res) => { db.prepare('DELETE FROM faqs WHERE id = ?').run(int(req.params.id)); res.json({ ok: true }); }));

  return { recordStock, pruneAnalytics };
}

module.exports = { register, isStaff, STAFF_ROLES, ROLE_SECTIONS, canAccess };
