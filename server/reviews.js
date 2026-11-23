// Product reviews: star rating + comment + up to 3 photos.
// Buyers (a delivered order with the product) get a "verified purchase" badge and are published at once.
// Others can only review when the shop allows it (reviews_buyers_only = 0), and then wait for approval.
const STATUSES = ['pending', 'approved', 'hidden'];

function register(app, admin, h) {
  const { db, wrap, HttpError, int, str, requireUser, getSettings, logAdmin } = h;

  // cached average / count on the product (shown on every product card)
  function recalc(productId) {
    const r = db.prepare("SELECT COUNT(*) n, AVG(rating) a FROM reviews WHERE product_id = ? AND status = 'approved'").get(productId);
    db.prepare('UPDATE products SET rating_count = ?, rating_avg = ? WHERE id = ?').run(r.n, r.n ? Math.round(r.a * 10) / 10 : 0, productId);
  }
  const boughtIt = (userId, productId) => !!db.prepare(`SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.user_id = ? AND oi.product_id = ? AND o.status = 'delivered' LIMIT 1`).get(userId, productId);
  // "Ahmed K." — first name + initial; the phone number is never shown
  function shortName(name) {
    const w = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!w.length) return '—';
    return w.length > 1 ? `${w[0]} ${w[1].charAt(0)}.` : w[0];
  }
  const photosOf = (x) => { try { return JSON.parse(x || '[]'); } catch { return []; } };
  const pub = (r) => ({ id: r.id, rating: r.rating, comment: r.comment, photos: photosOf(r.photos), name: r.name, city: r.city,
    verified: !!r.verified, reply: r.reply, created_at: r.created_at });

  function canReview(user, productId) {
    const s = getSettings();
    if (s.reviews_enabled === '0') return 'off';
    if (!user) return 'login';
    if (boughtIt(user.id, productId)) return 'yes';
    return s.reviews_buyers_only === '0' ? 'yes' : 'buy';
  }

  app.get('/api/products/:id/reviews', wrap((req, res) => {
    const pid = int(req.params.id);
    const limit = Math.min(int(req.query.limit, 5), 30);
    const offset = Math.max(int(req.query.offset, 0), 0);
    const photosOnly = req.query.photos === '1';
    const sum = db.prepare("SELECT COUNT(*) n, AVG(rating) a FROM reviews WHERE product_id = ? AND status = 'approved'").get(pid);
    const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const r of db.prepare("SELECT rating, COUNT(*) n FROM reviews WHERE product_id = ? AND status = 'approved' GROUP BY rating").all(pid)) dist[r.rating] = r.n;
    const list = db.prepare(`SELECT * FROM reviews WHERE product_id = ? AND status = 'approved' ${photosOnly ? "AND photos != '[]'" : ''}
      ORDER BY verified DESC, (photos != '[]') DESC, id DESC LIMIT ? OFFSET ?`).all(pid, limit, offset).map(pub);
    const photos = db.prepare("SELECT photos FROM reviews WHERE product_id = ? AND status = 'approved' AND photos != '[]' ORDER BY id DESC LIMIT 12").all(pid)
      .flatMap((r) => photosOf(r.photos)).slice(0, 12);
    const mine = req.user ? db.prepare('SELECT * FROM reviews WHERE product_id = ? AND user_id = ?').get(pid, req.user.id) : null;
    res.json({ avg: sum.n ? Math.round(sum.a * 10) / 10 : 0, count: sum.n, dist, list, photos,
      mine: mine ? { ...pub(mine), status: mine.status } : null, can_review: canReview(req.user, pid) });
  }));

  app.post('/api/products/:id/reviews', requireUser, wrap((req, res) => {
    const pid = int(req.params.id);
    const p = db.prepare('SELECT id FROM products WHERE id = ? AND active = 1').get(pid);
    if (!p) throw new HttpError(404, 'not_found');
    const can = canReview(req.user, pid);
    if (can === 'off') throw new HttpError(400, 'reviews_off');
    if (can === 'buy') throw new HttpError(403, 'review_buyers_only');
    const rating = int(req.body.rating);
    if (rating < 1 || rating > 5) throw new HttpError(400, 'invalid_input');
    const comment = str(req.body.comment, 1000);
    // only photos this shop processed (our own uploads)
    const photos = (Array.isArray(req.body.photos) ? req.body.photos : []).map((x) => str(x, 120)).filter((x) => /^\/uploads\/[a-f0-9]{24}\.webp$/.test(x)).slice(0, 3);
    const verified = boughtIt(req.user.id, pid) ? 1 : 0;
    const status = verified ? 'approved' : 'pending';
    const city = (db.prepare('SELECT city FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(req.user.id) || {}).city || null;
    const name = shortName(req.user.name);
    const old = db.prepare('SELECT id FROM reviews WHERE product_id = ? AND user_id = ?').get(pid, req.user.id);
    if (old) {
      db.prepare("UPDATE reviews SET rating = ?, comment = ?, photos = ?, verified = ?, status = ?, name = ?, city = ?, updated_at = datetime('now') WHERE id = ?")
        .run(rating, comment, JSON.stringify(photos), verified, status, name, city, old.id);
    } else {
      db.prepare('INSERT INTO reviews(product_id, user_id, rating, comment, photos, verified, status, name, city) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(pid, req.user.id, rating, comment, JSON.stringify(photos), verified, status, name, city);
    }
    recalc(pid);
    res.json({ ok: true, status });
  }));

  // Products from the customer's delivered orders they have not reviewed yet ("rate your purchase")
  app.get('/api/me/to-review', requireUser, wrap((req, res) => {
    const rows = db.prepare(`SELECT DISTINCT p.id, p.name_ku, p.name_ar, p.name_en, p.image FROM order_items oi JOIN orders o ON o.id = oi.order_id
      JOIN products p ON p.id = oi.product_id WHERE o.user_id = ? AND o.status = 'delivered' AND p.active = 1
      AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.product_id = p.id AND r.user_id = ?) ORDER BY o.id DESC LIMIT 10`).all(req.user.id, req.user.id);
    res.json(rows);
  }));

  // ---------- admin ----------
  admin.get('/reviews', wrap((req, res) => {
    const status = STATUSES.includes(req.query.status) ? req.query.status : null;
    const rows = db.prepare(`SELECT r.*, p.name_ku product_name, p.image product_image, u.phone FROM reviews r JOIN products p ON p.id = r.product_id
      LEFT JOIN users u ON u.id = r.user_id ${status ? 'WHERE r.status = ?' : ''} ORDER BY (r.status = 'pending') DESC, r.id DESC LIMIT 300`).all(...(status ? [status] : []));
    const counts = Object.fromEntries(STATUSES.map((s) => [s, db.prepare('SELECT COUNT(*) n FROM reviews WHERE status = ?').get(s).n]));
    res.json({ list: rows.map((r) => ({ ...r, photos: photosOf(r.photos) })), counts });
  }));
  admin.patch('/reviews/:id', wrap((req, res) => {
    const r = db.prepare('SELECT * FROM reviews WHERE id = ?').get(int(req.params.id));
    if (!r) throw new HttpError(404, 'not_found');
    const status = STATUSES.includes(req.body.status) ? req.body.status : r.status;
    const reply = 'reply' in req.body ? str(req.body.reply, 1000) || null : r.reply;
    db.prepare('UPDATE reviews SET status = ?, reply = ? WHERE id = ?').run(status, reply, r.id);
    recalc(r.product_id);
    logAdmin(req, 'review_update', { id: r.id, status });
    res.json({ ok: true });
  }));
  admin.delete('/reviews/:id', wrap((req, res) => {
    const r = db.prepare('SELECT * FROM reviews WHERE id = ?').get(int(req.params.id));
    if (!r) throw new HttpError(404, 'not_found');
    db.prepare('DELETE FROM reviews WHERE id = ?').run(r.id);
    recalc(r.product_id);
    logAdmin(req, 'review_delete', { id: r.id });
    res.json({ ok: true });
  }));
  admin.get('/reviews/pending-count', wrap((_req, res) => res.json({ n: db.prepare("SELECT COUNT(*) n FROM reviews WHERE status = 'pending'").get().n })));
}

module.exports = { register };
