// Trade-in ("swap your old phone") and the phone finder ("help me choose").

const TRADEIN_QUESTIONS = {
  screen: ['perfect', 'scratches', 'cracked'],
  body: ['perfect', 'scratches', 'damaged'],
  battery: ['good', 'ok', 'weak'],
  works: ['yes', 'no'],
  box: ['yes', 'no'],
};
const MAX_DEDUCTION = 80; // % — a phone that turns on is never worth less than 20% of its base price

function rulesOf(settings) {
  try { return JSON.parse(settings.tradein_rules || '{}'); } catch { return {}; }
}

/** Price a used phone: base price × (1 − sum of deductions), rounded down to 5,000 IQD. */
function quoteTradein(db, settings, modelId, answers) {
  const m = db.prepare('SELECT * FROM tradein_models WHERE id = ? AND active = 1').get(Number(modelId));
  if (!m) return { error: 'tradein_model' };
  const rules = rulesOf(settings);
  const clean = {};
  let pct = 0;
  const breakdown = [];
  for (const [q, options] of Object.entries(TRADEIN_QUESTIONS)) {
    const a = answers && answers[q];
    if (!options.includes(a)) return { error: 'tradein_answers' };
    clean[q] = a;
    const d = Number((rules[q] || {})[a]) || 0;
    if (d) breakdown.push({ q, a, pct: d });
    pct += d;
  }
  pct = Math.min(pct, MAX_DEDUCTION);
  // integer maths (avoid 1 − 0.8 = 0.19999… shaving 5,000 IQD off the customer)
  const value = Math.round(m.base_price * (100 - pct)) / 100;
  const estimate = Math.max(0, Math.floor((value + 1e-6) / 5000) * 5000);
  return { model: m, answers: clean, estimate, deduction_pct: pct, breakdown, label: `${m.brand} ${m.model} ${m.storage_gb}GB` };
}

// ---------- phone finder ----------
const USES = ['camera', 'battery', 'gaming', 'social', 'basic'];
const TIER_SCORE = { flagship: 1, upper: 0.75, mid: 0.5, entry: 0.25 };
const clamp01 = (x) => Math.max(0, Math.min(1, x));

function phoneScore(a, uses) {
  const tier = TIER_SCORE[a.tier] ?? 0.4;
  const cam = clamp01((Math.log2(Math.max(a.camera || 12, 8)) - 3) / (Math.log2(200) - 3)); // 8MP→0, 200MP→1
  const bat = clamp01(((a.battery || 3000) - 3000) / 2500); // 3000→0, 5500→1
  const ram = clamp01(((a.ram || 4) - 3) / 9); // 3GB→0, 12GB→1
  const chg = clamp01(((a.charging || 15) - 15) / 60);
  const parts = {
    camera: 0.55 * cam + 0.45 * tier,
    battery: 0.75 * bat + 0.25 * chg,
    gaming: 0.55 * tier + 0.45 * ram,
    social: 0.4 * cam + 0.35 * bat + 0.25 * tier,
    basic: 0.6 * bat + 0.4 * (1 - tier * 0.5),
  };
  const chosen = uses.length ? uses : ['social'];
  return chosen.reduce((s, u) => s + parts[u], 0) / chosen.length;
}

function reasonsFor(a, uses, price, budgetMax) {
  const r = [];
  if (a.tier === 'flagship') r.push({ code: 'flagship' });
  if ((uses.includes('camera') || uses.includes('social')) && a.camera >= 48) r.push({ code: 'camera', x: a.camera });
  if ((uses.includes('battery') || uses.includes('basic') || uses.includes('social')) && a.battery >= 4500) r.push({ code: 'battery', x: a.battery });
  if (uses.includes('gaming') && a.ram >= 8) r.push({ code: 'gaming', x: a.ram });
  if (a.charging >= 45) r.push({ code: 'charging', x: a.charging });
  if (a.g5) r.push({ code: 'g5' });
  if (budgetMax && price <= budgetMax * 0.8) r.push({ code: 'under_budget', x: budgetMax - price });
  return r.slice(0, 4);
}

function register(app, admin, h) {
  const { db, tx, wrap, HttpError, int, str, logAdmin, getSettings, setSetting, productOut, variantsOf, publicVariant } = h;

  // ---------- trade-in: public ----------
  app.get('/api/tradein/models', wrap((_req, res) => {
    if (getSettings().tradein_enabled !== '1') return res.json({ enabled: false, models: [] });
    res.json({ enabled: true, models: db.prepare('SELECT id, brand, model, storage_gb FROM tradein_models WHERE active = 1 ORDER BY brand, sort, model, storage_gb').all() });
  }));
  app.post('/api/tradein/quote', wrap((req, res) => {
    const s = getSettings();
    if (s.tradein_enabled !== '1') throw new HttpError(400, 'tradein_disabled');
    const q = quoteTradein(db, s, req.body.model_id, req.body.answers);
    if (q.error) throw new HttpError(400, q.error);
    res.json({ estimate: q.estimate, label: q.label, deduction_pct: q.deduction_pct, breakdown: q.breakdown });
  }));

  // ---------- trade-in: admin ----------
  admin.get('/tradein-models', wrap((_req, res) => res.json(db.prepare('SELECT * FROM tradein_models ORDER BY brand, sort, model, storage_gb').all())));
  const modelValues = (b) => {
    const v = { brand: str(b.brand, 40), model: str(b.model, 80), storage_gb: Math.max(1, int(b.storage_gb)), base_price: Math.max(0, int(b.base_price)), active: b.active === false || b.active === 0 ? 0 : 1, sort: int(b.sort) };
    if (!v.brand || !v.model || !v.base_price) throw new HttpError(400, 'invalid_input');
    return v;
  };
  admin.post('/tradein-models', wrap((req, res) => {
    const v = modelValues(req.body);
    const id = Number(db.prepare('INSERT INTO tradein_models(brand, model, storage_gb, base_price, active, sort) VALUES(?,?,?,?,?,?)').run(v.brand, v.model, v.storage_gb, v.base_price, v.active, v.sort).lastInsertRowid);
    logAdmin(req, 'tradein_model', { id, ...v });
    res.json(db.prepare('SELECT * FROM tradein_models WHERE id = ?').get(id));
  }));
  admin.put('/tradein-models/:id', wrap((req, res) => {
    const v = modelValues(req.body);
    const before = db.prepare('SELECT base_price FROM tradein_models WHERE id = ?').get(int(req.params.id));
    db.prepare('UPDATE tradein_models SET brand=?, model=?, storage_gb=?, base_price=?, active=?, sort=? WHERE id=?').run(v.brand, v.model, v.storage_gb, v.base_price, v.active, v.sort, int(req.params.id));
    if (before && before.base_price !== v.base_price) logAdmin(req, 'tradein_model', { id: int(req.params.id), price: [before.base_price, v.base_price] });
    res.json(db.prepare('SELECT * FROM tradein_models WHERE id = ?').get(int(req.params.id)));
  }));
  admin.delete('/tradein-models/:id', wrap((req, res) => { db.prepare('DELETE FROM tradein_models WHERE id = ?').run(int(req.params.id)); res.json({ ok: true }); }));
  admin.put('/tradein-rules', wrap((req, res) => {
    const out = {};
    for (const [q, options] of Object.entries(TRADEIN_QUESTIONS)) {
      out[q] = {};
      for (const o of options) out[q][o] = Math.max(0, Math.min(90, Number((req.body.rules || {})[q]?.[o]) || 0));
    }
    setSetting('tradein_rules', JSON.stringify(out));
    if (req.body.enabled != null) setSetting('tradein_enabled', req.body.enabled ? '1' : '0');
    logAdmin(req, 'tradein_rules', out);
    res.json({ rules: out, enabled: getSettings().tradein_enabled === '1' });
  }));
  admin.get('/tradeins', wrap((_req, res) => {
    res.json(db.prepare(`SELECT t.*, o.status order_status, o.customer_name, o.phone, o.city, o.total order_total FROM tradeins t
      LEFT JOIN orders o ON o.id = t.order_id ORDER BY t.id DESC LIMIT 300`).all().map((t) => ({ ...t, answers: JSON.parse(t.answers || '{}') })));
  }));
  // After inspecting the phone at delivery: accept, adjust the value (order total changes), or reject (customer keeps the phone).
  admin.put('/tradeins/:id', wrap((req, res) => {
    const t = db.prepare('SELECT * FROM tradeins WHERE id = ?').get(int(req.params.id));
    if (!t) throw new HttpError(404, 'not_found');
    const status = ['accepted', 'adjusted', 'rejected'].includes(req.body.status) ? req.body.status : null;
    if (!status) throw new HttpError(400, 'invalid_input');
    const o = t.order_id ? db.prepare('SELECT * FROM orders WHERE id = ?').get(t.order_id) : null;
    let finalValue = status === 'rejected' ? 0 : status === 'accepted' ? t.estimate : Math.max(0, int(req.body.final_value));
    if (o) finalValue = Math.min(finalValue, o.subtotal - o.discount); // credit can't exceed the products total
    tx(() => {
      db.prepare("UPDATE tradeins SET status = ?, final_value = ?, imei = COALESCE(?, imei), note = COALESCE(?, note), updated_at = datetime('now') WHERE id = ?")
        .run(status, finalValue, str(req.body.imei, 20) || null, str(req.body.note, 300) || null, t.id);
      if (o) {
        const diff = o.tradein_credit - finalValue; // positive → customer pays more
        db.prepare("UPDATE orders SET tradein_credit = ?, total = total + ?, updated_at = datetime('now') WHERE id = ?").run(finalValue, diff, o.id);
      }
    });
    logAdmin(req, 'tradein_review', { id: t.id, order: t.order_id, status, estimate: t.estimate, final: finalValue });
    res.json({ ok: true, final_value: finalValue });
  }));

  // ---------- phone finder ----------
  app.get('/api/finder', wrap((req, res) => {
    const min = Math.max(0, int(req.query.min));
    const max = int(req.query.max) > 0 ? int(req.query.max) : Infinity;
    const os = ['ios', 'android'].includes(req.query.os) ? req.query.os : null;
    const uses = String(req.query.uses || '').split(',').filter((u) => USES.includes(u));
    const storageMin = Math.max(0, int(req.query.storage));
    const phones = db.prepare("SELECT p.*, (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id) AS variant_count FROM products p WHERE p.active = 1 AND p.stock > 0 AND p.attrs != '{}'").all();
    const candidates = [];
    for (const p of phones) {
      let a; try { a = JSON.parse(p.attrs); } catch { continue; }
      if (!a.os || (os && a.os !== os)) continue;
      // pick the cheapest in-stock option that has enough storage
      const vs = variantsOf(p.id).filter((v) => v.stock > 0);
      const options = vs.length
        ? vs.map((v) => ({ price: v.price, variant: v, storage: Number((v.label.match(/(\d+)\s*(GB|TB)/i) || [])[1] || 0) * (/TB/i.test(v.label) ? 1024 : 1) || a.storage || 0 }))
        : [{ price: p.price, variant: null, storage: a.storage || 0 }];
      const fits = options.filter((o) => !storageMin || o.storage >= storageMin).sort((x, y) => x.price - y.price);
      if (!fits.length) continue;
      const best = fits.find((o) => o.price >= min && o.price <= max) || fits[0];
      candidates.push({ p, a, ...best, inBudget: best.price >= min && best.price <= max });
    }
    const scored = candidates.map((c) => {
      const quality = phoneScore(c.a, uses);
      // value: how much quality per dinar, compared inside the result set
      return { ...c, quality };
    });
    const inBudget = scored.filter((c) => c.inBudget);
    const maxQ = Math.max(0.01, ...inBudget.map((c) => c.quality));
    const minP = Math.min(...inBudget.map((c) => c.price), Infinity);
    const ranked = inBudget.map((c) => {
      const valueBoost = uses.includes('basic') ? 0.25 * (minP / c.price) : 0.1 * (minP / c.price);
      const match = Math.round(Math.min(99, ((c.quality / maxQ) * 0.85 + valueBoost) * 100));
      return { ...c, match };
    }).sort((x, y) => y.match - x.match).slice(0, 3);
    const out = (c, extra = {}) => ({
      product: productOut(c.p), variant: c.variant ? publicVariant(c.variant) : null, price: c.price, match: c.match,
      attrs: c.a, reasons: reasonsFor(c.a, uses, c.price, Number.isFinite(max) ? max : null), ...extra,
    });
    // If nothing fits, show the closest phone just above the budget.
    let stretch = null;
    if (!ranked.length && Number.isFinite(max)) {
      const above = scored.filter((c) => c.price > max).sort((x, y) => x.price - y.price)[0];
      if (above) stretch = out({ ...above, match: null }, { over_by: above.price - max });
    }
    if (ranked.length) ranked[0].best = true;
    const cheapest = ranked.length ? ranked.reduce((a, b) => (b.price < a.price ? b : a)) : null;
    res.json({
      results: ranked.map((c) => out(c, { best: !!c.best, best_value: cheapest && c === cheapest && ranked.length > 1 && !c.best })),
      stretch,
    });
  }));
}

module.exports = { register, quoteTradein, TRADEIN_QUESTIONS };
