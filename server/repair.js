// Repair service: public price list & honest advice, booking (walk-in slot or pickup), tracking with
// customer approval for any extra cost, admin tickets, warranty certificates.
const crypto = require('crypto');

const STATUSES = ['booked', 'received', 'diagnosing', 'awaiting_approval', 'repairing', 'testing', 'ready', 'delivered', 'cancelled'];
const QUALITIES = ['original', 'copy', 'diagnosis'];
const IRAQ_OFFSET_MS = 3 * 3600 * 1000; // Asia/Baghdad, no daylight saving
const iraqNow = () => new Date(Date.now() + IRAQ_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' '); // "YYYY-MM-DD HH:MM"

function newCode(db) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    const c = 'R' + Array.from(crypto.randomBytes(6), (b) => A[b % A.length]).join('');
    if (!db.prepare('SELECT 1 FROM repairs WHERE code = ?').get(c)) return c;
  }
}

function register(app, admin, h) {
  const { db, tx, wrap, HttpError, int, str, logAdmin, requireUser, getSettings, notify, escHtml, PUBLIC_URL } = h;
  const enabled = () => getSettings().repair_enabled === '1';
  const services = () => db.prepare('SELECT * FROM repair_services WHERE active = 1 ORDER BY sort, id').all();

  // Value of the phone (good condition) from the trade-in list — used for honest "not worth repairing" advice.
  const phoneValue = (brand, model) => db.prepare('SELECT MAX(base_price) v FROM tradein_models WHERE active = 1 AND LOWER(brand) = LOWER(?) AND LOWER(model) = LOWER(?)').get(brand, model).v || null;

  function quote(brand, model, serviceId) {
    const svc = db.prepare('SELECT * FROM repair_services WHERE id = ? AND active = 1').get(int(serviceId));
    if (!svc) throw new HttpError(400, 'repair_service');
    const row = db.prepare('SELECT * FROM repair_prices WHERE service_id = ? AND LOWER(brand) = LOWER(?) AND LOWER(model) = LOWER(?) AND active = 1').get(svc.id, brand, model);
    const options = [];
    if (!svc.needs_diagnosis && row) {
      if (row.price_original) options.push({ quality: 'original', price: row.price_original, warranty_days: row.warranty_original });
      if (row.price_copy) options.push({ quality: 'copy', price: row.price_copy, warranty_days: row.warranty_copy });
    }
    if (!options.length) options.push({ quality: 'diagnosis', price: 0, warranty_days: row ? row.warranty_original : 90 });
    const s = getSettings();
    const value = phoneValue(brand, model);
    const cheapest = Math.min(...options.map((o) => o.price || Infinity));
    let advice = null;
    if (value && Number.isFinite(cheapest) && cheapest > (value * int(s.repair_honest_pct, 50)) / 100) advice = { phone_value: value, repair_price: cheapest };
    return { service: svc, options, duration_min: row ? row.duration_min : null, advice };
  }

  // ---------- public ----------
  app.get('/api/repair/catalog', wrap((_req, res) => {
    const s = getSettings();
    if (!enabled()) return res.json({ enabled: false });
    res.json({
      enabled: true, services: services(),
      models: db.prepare('SELECT DISTINCT brand, model FROM repair_prices WHERE active = 1 ORDER BY brand, model').all(),
      pickup: s.repair_pickup === '1', pickup_fee: int(s.repair_pickup_fee, 0), free_diagnosis: s.repair_free_diagnosis === '1',
    });
  }));
  app.get('/api/repair/quote', wrap((req, res) => {
    if (!enabled()) throw new HttpError(400, 'repair_disabled');
    const q = quote(str(req.query.brand, 40), str(req.query.model, 80), req.query.service);
    res.json({ options: q.options, duration_min: q.duration_min, advice: q.advice, needs_diagnosis: !!q.service.needs_diagnosis });
  }));
  function slotsFor(date) {
    const s = getSettings();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
    const [y, m, d] = date.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (String(s.repair_closed_days || '').split(',').map((x) => x.trim()).filter(Boolean).map(Number).includes(dow)) return [];
    const now = iraqNow();
    const cap = Math.max(1, int(s.repair_slot_capacity, 2));
    const out = [];
    for (let hr = int(s.repair_open, 10); hr < int(s.repair_close, 21); hr++) {
      const slot = `${date} ${String(hr).padStart(2, '0')}:00`;
      if (slot <= now) continue;
      const taken = db.prepare("SELECT COUNT(*) n FROM repairs WHERE appointment = ? AND status != 'cancelled'").get(slot).n;
      out.push({ slot, time: slot.slice(11), free: Math.max(0, cap - taken) });
    }
    return out;
  }
  app.get('/api/repair/slots', wrap((req, res) => res.json(slotsFor(String(req.query.date || '')))));

  app.post('/api/repairs', requireUser, wrap((req, res) => {
    if (!enabled()) throw new HttpError(400, 'repair_disabled');
    const s = getSettings();
    const brand = str(req.body.brand, 40); const model = str(req.body.model, 80);
    const q = quote(brand, model, req.body.service_id);
    const opt = q.options.find((o) => o.quality === req.body.quality) || (q.options.length === 1 ? q.options[0] : null);
    if (!opt) throw new HttpError(400, 'repair_quality');
    const method = req.body.method === 'pickup' ? 'pickup' : 'walkin';
    let appointment = null; let city = null; let address = null;
    if (method === 'walkin') {
      appointment = str(req.body.appointment, 16);
      const slot = slotsFor(appointment.slice(0, 10)).find((x) => x.slot === appointment);
      if (!slot || slot.free < 1) throw new HttpError(400, 'repair_slot');
    } else {
      if (s.repair_pickup !== '1') throw new HttpError(400, 'repair_pickup');
      city = str(req.body.city, 60); address = str(req.body.address, 300);
      if (!city || !address) throw new HttpError(400, 'invalid_input');
    }
    const svcName = q.service.name_ku;
    const code = newCode(db);
    const id = tx(() => {
      const rid = Number(db.prepare(`INSERT INTO repairs(code, user_id, customer_name, phone, brand, model, service_id, service_label, quality, quoted_price,
        pickup_fee, warranty_days, method, appointment, city, address, imei, problem) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(code, req.user.id, str(req.body.name, 80) || req.user.name, str(req.body.phone, 20).replace(/[^\d+]/g, '') || req.user.phone, brand, model,
          q.service.id, svcName, opt.quality, opt.price, method === 'pickup' ? int(s.repair_pickup_fee, 0) : 0, opt.warranty_days,
          method, appointment, city, address, str(req.body.imei, 20) || null, str(req.body.problem, 500) || null).lastInsertRowid);
      db.prepare('INSERT INTO repair_events(repair_id, status, by_name) VALUES(?,?,?)').run(rid, 'booked', req.user.name);
      return rid;
    });
    const r = db.prepare('SELECT * FROM repairs WHERE id = ?').get(id);
    notify([`🔧 <b>حجز تصليح ${r.code}</b>`, `👤 ${escHtml(r.customer_name)} — 📞 ${escHtml(r.phone)}`, `📱 ${escHtml(`${r.brand} ${r.model}`)} — ${escHtml(svcName)}`,
      `💰 ${r.quality === 'diagnosis' ? 'بعد الفحص' : `${Number(r.quoted_price).toLocaleString('en-US')} د.ع (${r.quality === 'original' ? 'أصلي' : 'بديل'})`}`,
      r.method === 'pickup' ? `🚗 استلام من: ${escHtml(r.city)} — ${escHtml(r.address)}` : `🕐 موعد: ${escHtml(r.appointment)}`,
      r.problem ? `📝 ${escHtml(r.problem)}` : null, PUBLIC_URL ? `${escHtml(PUBLIC_URL)}/admin/#/repairs` : null].filter(Boolean).join('\n'));
    res.json(withEvents(r));
  }));

  function withEvents(r, { forCustomer = true } = {}) {
    if (!r) return r;
    let photos = []; try { photos = JSON.parse(r.photos || '[]'); } catch { photos = []; }
    const out = { ...r, photos, old_part_returned: !!r.old_part_returned,
      events: db.prepare('SELECT status, note, created_at FROM repair_events WHERE repair_id = ? ORDER BY id').all(r.id),
      total: (r.final_price ?? (r.quoted_price + r.approved_extra)) + r.pickup_fee };
    if (forCustomer) { delete out.parts_cost; delete out.technician; }
    return out;
  }
  app.get('/api/repairs', requireUser, wrap((req, res) => {
    res.json(db.prepare('SELECT * FROM repairs WHERE user_id = ? ORDER BY id DESC').all(req.user.id).map((r) => withEvents(r)));
  }));
  app.get('/api/repairs/:code', requireUser, wrap((req, res) => {
    const r = db.prepare('SELECT * FROM repairs WHERE code = ? AND user_id = ?').get(str(req.params.code, 12).toUpperCase(), req.user.id);
    if (!r) throw new HttpError(404, 'not_found');
    res.json(withEvents(r));
  }));
  // Customer answers an extra-cost request: nothing extra is ever charged without this.
  app.post('/api/repairs/:code/decision', requireUser, wrap((req, res) => {
    const r = db.prepare('SELECT * FROM repairs WHERE code = ? AND user_id = ?').get(str(req.params.code, 12).toUpperCase(), req.user.id);
    if (!r) throw new HttpError(404, 'not_found');
    if (r.status !== 'awaiting_approval' || r.extra_status !== 'pending') throw new HttpError(400, 'repair_no_request');
    const approve = !!req.body.approve;
    tx(() => {
      if (approve) db.prepare("UPDATE repairs SET extra_status = 'approved', approved_extra = approved_extra + extra_price, status = 'repairing', updated_at = datetime('now') WHERE id = ?").run(r.id);
      else db.prepare("UPDATE repairs SET extra_status = 'rejected', status = 'ready', updated_at = datetime('now') WHERE id = ?").run(r.id);
      db.prepare('INSERT INTO repair_events(repair_id, status, note, by_name) VALUES(?,?,?,?)')
        .run(r.id, approve ? 'repairing' : 'ready', approve ? `approved:${r.extra_price}` : 'rejected', req.user.name);
    });
    notify(`🔧 ${r.code}: الزبون ${approve ? '✅ وافق على' : '❌ رفض'} السعر الإضافي ${Number(r.extra_price).toLocaleString('en-US')} د.ع`);
    res.json(withEvents(db.prepare('SELECT * FROM repairs WHERE id = ?').get(r.id)));
  }));
  app.post('/api/repairs/:code/cancel', requireUser, wrap((req, res) => {
    const r = db.prepare('SELECT * FROM repairs WHERE code = ? AND user_id = ?').get(str(req.params.code, 12).toUpperCase(), req.user.id);
    if (!r) throw new HttpError(404, 'not_found');
    if (r.status !== 'booked') throw new HttpError(400, 'cannot_cancel');
    db.prepare("UPDATE repairs SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(r.id);
    db.prepare("INSERT INTO repair_events(repair_id, status, by_name) VALUES(?, 'cancelled', ?)").run(r.id, req.user.name);
    notify(`🔧 ${r.code}: الزبون ألغى الحجز`);
    res.json({ ok: true });
  }));
  // Public warranty check by certificate code: no personal data.
  app.get('/api/warranty/:code', wrap((req, res) => {
    const r = db.prepare("SELECT code, brand, model, service_label, quality, warranty_days, warranty_until, status, updated_at FROM repairs WHERE code = ? AND status = 'delivered'").get(str(req.params.code, 12).toUpperCase());
    if (!r) throw new HttpError(404, 'not_found');
    res.json({ ...r, valid: !!r.warranty_until && r.warranty_until >= iraqNow().slice(0, 10) });
  }));

  // ---------- admin ----------
  admin.get('/repairs', wrap((req, res) => {
    const where = []; const params = [];
    if (STATUSES.includes(req.query.status)) { where.push('status = ?'); params.push(req.query.status); }
    else if (req.query.status === 'open') where.push("status NOT IN ('delivered', 'cancelled')");
    const q = str(req.query.q, 40);
    if (q) { where.push('(code LIKE ? OR phone LIKE ? OR customer_name LIKE ? OR imei LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
    const rows = db.prepare(`SELECT * FROM repairs ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY CASE WHEN status IN ('delivered','cancelled') THEN 1 ELSE 0 END, COALESCE(appointment, created_at) LIMIT 300`).all(...params);
    // warranty claims: same IMEI repaired before and still under warranty
    res.json(rows.map((r) => {
      const prior = r.imei ? db.prepare("SELECT code, service_label, warranty_until FROM repairs WHERE imei = ? AND id != ? AND status = 'delivered' AND warranty_until >= ?").get(r.imei, r.id, iraqNow().slice(0, 10)) : null;
      return { ...withEvents(r, { forCustomer: false }), warranty_claim: prior || null };
    }));
  }));
  admin.put('/repairs/:id', wrap((req, res) => {
    const r = db.prepare('SELECT * FROM repairs WHERE id = ?').get(int(req.params.id));
    if (!r) throw new HttpError(404, 'not_found');
    const b = req.body;
    const status = STATUSES.includes(b.status) ? b.status : r.status;
    if (r.status === 'delivered' && status !== 'delivered') throw new HttpError(400, 'repair_closed');
    let photos = r.photos;
    if (Array.isArray(b.photos)) photos = JSON.stringify(b.photos.map((x) => str(x, 300)).filter((x) => /^\/uploads\//.test(x)).slice(0, 12));
    const finalPrice = b.final_price !== undefined && b.final_price !== '' && b.final_price !== null ? Math.max(0, int(b.final_price)) : r.final_price;
    let warrantyUntil = r.warranty_until;
    if (status === 'delivered' && r.status !== 'delivered' && r.extra_status !== 'rejected' && r.warranty_days > 0) {
      const d = new Date(Date.now() + IRAQ_OFFSET_MS + r.warranty_days * 864e5);
      warrantyUntil = d.toISOString().slice(0, 10);
    }
    tx(() => {
      db.prepare(`UPDATE repairs SET status = ?, technician = ?, imei = ?, final_price = ?, parts_cost = ?, photos = ?, old_part_returned = ?, warranty_until = ?,
        updated_at = datetime('now') WHERE id = ?`).run(status, b.technician !== undefined ? str(b.technician, 60) : r.technician, b.imei !== undefined ? (str(b.imei, 20) || null) : r.imei,
        finalPrice, b.parts_cost !== undefined && b.parts_cost !== '' ? Math.max(0, int(b.parts_cost)) : r.parts_cost, photos,
        b.old_part_returned !== undefined ? (b.old_part_returned ? 1 : 0) : r.old_part_returned, warrantyUntil, r.id);
      if (status !== r.status || b.note) db.prepare('INSERT INTO repair_events(repair_id, status, note, by_name) VALUES(?,?,?,?)').run(r.id, status, str(b.note, 300) || null, req.user.name);
    });
    if (status !== r.status) logAdmin(req, 'repair_status', { code: r.code, from: r.status, to: status });
    res.json(withEvents(db.prepare('SELECT * FROM repairs WHERE id = ?').get(r.id), { forCustomer: false }));
  }));
  // Diagnosis found something else: ask the customer before doing it.
  admin.post('/repairs/:id/extra', wrap((req, res) => {
    const r = db.prepare('SELECT * FROM repairs WHERE id = ?').get(int(req.params.id));
    if (!r) throw new HttpError(404, 'not_found');
    const price = Math.max(0, int(req.body.price));
    const note = str(req.body.note, 300);
    if (!price || !note) throw new HttpError(400, 'invalid_input');
    tx(() => {
      db.prepare("UPDATE repairs SET extra_price = ?, extra_note = ?, extra_status = 'pending', status = 'awaiting_approval', updated_at = datetime('now') WHERE id = ?").run(price, note, r.id);
      db.prepare("INSERT INTO repair_events(repair_id, status, note, by_name) VALUES(?, 'awaiting_approval', ?, ?)").run(r.id, `+${price}: ${note}`, req.user.name);
    });
    logAdmin(req, 'repair_extra', { code: r.code, price });
    res.json(withEvents(db.prepare('SELECT * FROM repairs WHERE id = ?').get(r.id), { forCustomer: false }));
  }));

  // price list
  admin.get('/repair-prices', wrap((_req, res) => res.json({
    services: db.prepare('SELECT * FROM repair_services ORDER BY sort, id').all(),
    prices: db.prepare('SELECT * FROM repair_prices ORDER BY brand, model, service_id').all(),
  })));
  const priceValues = (b) => {
    const n = (x) => (x === '' || x == null ? null : Math.max(0, int(x)));
    const v = { service_id: int(b.service_id), brand: str(b.brand, 40), model: str(b.model, 80), price_original: n(b.price_original), price_copy: n(b.price_copy),
      duration_min: Math.max(5, int(b.duration_min, 60)), warranty_original: Math.max(0, int(b.warranty_original, 90)), warranty_copy: Math.max(0, int(b.warranty_copy, 30)), active: b.active === false ? 0 : 1 };
    if (!v.service_id || !v.brand || !v.model) throw new HttpError(400, 'invalid_input');
    return v;
  };
  const PF = ['service_id', 'brand', 'model', 'price_original', 'price_copy', 'duration_min', 'warranty_original', 'warranty_copy', 'active'];
  admin.post('/repair-prices', wrap((req, res) => {
    const v = priceValues(req.body);
    const id = Number(db.prepare(`INSERT INTO repair_prices(${PF.join(',')}) VALUES(${PF.map(() => '?').join(',')})`).run(...PF.map((f) => v[f])).lastInsertRowid);
    res.json(db.prepare('SELECT * FROM repair_prices WHERE id = ?').get(id));
  }));
  admin.put('/repair-prices/:id', wrap((req, res) => {
    const v = priceValues(req.body);
    db.prepare(`UPDATE repair_prices SET ${PF.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`).run(...PF.map((f) => v[f]), int(req.params.id));
    logAdmin(req, 'repair_price', { id: int(req.params.id), model: v.model, service: v.service_id, original: v.price_original, copy: v.price_copy });
    res.json(db.prepare('SELECT * FROM repair_prices WHERE id = ?').get(int(req.params.id)));
  }));
  admin.delete('/repair-prices/:id', wrap((req, res) => { db.prepare('DELETE FROM repair_prices WHERE id = ?').run(int(req.params.id)); res.json({ ok: true }); }));
  admin.put('/repair-services/:id', wrap((req, res) => {
    db.prepare('UPDATE repair_services SET name_ku = ?, name_ar = ?, name_en = ?, active = ?, needs_diagnosis = ? WHERE id = ?')
      .run(str(req.body.name_ku, 60), str(req.body.name_ar, 60), str(req.body.name_en, 60), req.body.active === false ? 0 : 1, req.body.needs_diagnosis ? 1 : 0, int(req.params.id));
    res.json({ ok: true });
  }));
}

module.exports = { register, STATUSES, QUALITIES };
