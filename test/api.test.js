// End-to-end API test: starts the server on a throwaway database and checks the main flows.
// Run with: npm test
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const PORT = 3900 + Math.floor(Math.random() * 90);
// API_URL=http://host/api runs the same checks against another server (e.g. the PHP version) instead of starting Node
const B = process.env.API_URL || `http://localhost:${PORT}/api`;
const { hotp } = require('../server/totp.js');
let ok = 0, bad = 0;
const check = (name, cond, extra) => { cond ? ok++ : bad++; console.log(`${cond ? '✔' : '✘'} ${name}${cond ? '' : ' → ' + JSON.stringify(extra)}`); };
async function call(path, { method = 'GET', body, token } = {}) {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
const totpNow = (secret) => hotp(secret, Math.floor(Date.now() / 30000));
async function startServer() {
  if (process.env.API_URL) return () => {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-test-'));
  const srv = spawn(process.execPath, ['--no-warnings', path.join(__dirname, '..', 'server', 'index.js')], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: path.join(dir, 'db'), UPLOAD_DIR: path.join(dir, 'up'), SMS_PROVIDER: 'console', NODE_ENV: 'test', ADMIN_PHONE: '07500000000', ADMIN_PASSWORD: 'admin123', TELEGRAM_BOT_TOKEN: '' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    srv.stdout.on('data', (d) => { if (String(d).includes('Store running')) resolve(); });
    srv.on('exit', (c) => reject(new Error('server exited ' + c)));
  });
  return () => { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); };
}

let stop = () => {};
(async () => {
  stop = await startServer();
  // admin login
  let r = await call('/auth/login', { method: 'POST', body: { phone: '07500000000', password: 'admin123' } });
  const A = r.data.token; check('admin login', !!A, r);
  await call('/admin/settings', { method: 'PUT', token: A, body: { delivery_zones: JSON.stringify([{ name: 'Erbil', fee: 5000 }]) } });
  r = await call('/admin/stats', { token: A });
  check('stats warnings', ['default_password', 'no_2fa', 'sms_console', 'no_telegram'].every((w) => r.data.warnings.includes(w)), r.data.warnings);

  // OTP prefix restriction
  r = await call('/auth/otp', { method: 'POST', body: { phone: '+447700900123', purpose: 'register' } });
  check('OTP blocked for non-Iraqi number', r.data.error === 'phone_not_allowed', r);

  // product with variants
  r = await call('/admin/products', { method: 'POST', token: A, body: { name_ku: 'iPhone 17', price: 1, stock: 0, active: true, variants: [
    { label: '256GB · Black', price: 1500000, old_price: 1600000, stock: 2 }, { label: '512GB · Silver', price: 1800000, stock: 1 }] } });
  const P = r.data; check('variant product created; price=min, stock=sum', P.price === 1500000 && P.stock === 3 && P.variants.length === 2, P);
  r = await call(`/products/${P.id}`); check('public product exposes variants', r.data.product.has_variants && r.data.product.variants.length === 2, r.data.product);

  // customer
  r = await call('/auth/otp', { method: 'POST', body: { phone: '07701234567', purpose: 'register' } });
  r = await call('/auth/register', { method: 'POST', body: { name: 'Ali', phone: '07701234567', password: 'secret1', code: r.data.dev_code } });
  const U = r.data.token; check('customer registered', !!U, r);

  r = await call('/orders', { method: 'POST', token: U, body: { items: [{ id: P.id, qty: 1 }], city: 'Erbil', address: 'x' } });
  check('variant required', r.data.error === 'choose_variant', r);
  r = await call('/orders', { method: 'POST', token: U, body: { items: [{ id: P.id, variant_id: P.variants[1].id, qty: 1 }, { id: P.id, variant_id: P.variants[1].id, qty: 1 }], city: 'Erbil', address: 'x' } });
  check('duplicate line cannot oversell variant', r.data.error === 'out_of_stock', r);
  r = await call('/orders', { method: 'POST', token: U, body: { items: [{ id: P.id, variant_id: P.variants[0].id, qty: 1 }], city: 'Erbil', address: 'x' } });
  const O1 = r.data; check('variant order uses variant price & label', O1.subtotal === 1500000 && O1.items[0].variant_label === '256GB · Black', r);
  r = await call('/admin/products', { token: A });
  const P2 = r.data.find((x) => x.id === P.id);
  check('stock decremented on variant and product', P2.stock === 2 && P2.variants[0].stock === 1, P2);
  r = await call('/orders', { method: 'POST', token: U, body: { items: [{ id: 14, qty: 1 }], city: 'Erbil', address: 'x' } });
  check('second pending order allowed', !!r.data.id, r);
  r = await call('/orders', { method: 'POST', token: U, body: { items: [{ id: 14, qty: 1 }], city: 'Erbil', address: 'x' } });
  check('third pending order blocked (max 2)', r.data.error === 'too_many_pending', r);

  r = await call('/admin/orders', { token: A });
  const ao = r.data.find((x) => x.id === O1.id);
  check('admin sees high-value flag', ao.high_value === true, ao);
  r = await call(`/admin/orders/${O1.id}`, { method: 'PUT', token: A, body: { status: 'cancelled' } });
  r = await call('/admin/products', { token: A });
  check('admin cancel restores variant stock', r.data.find((x) => x.id === P.id).variants[0].stock === 2);

  // block user
  const uid = (await call('/me', { token: U })).data.user.id;
  await call(`/admin/users/${uid}`, { method: 'PUT', token: A, body: { blocked: true, block_reason: 'refused 3 deliveries' } });
  r = await call('/orders', { method: 'POST', token: U, body: { items: [{ id: 14, qty: 1 }], city: 'Erbil', address: 'x' } });
  check('blocked user cannot order', r.data.error === 'account_blocked', r);

  // 2FA
  r = await call('/me/2fa/setup', { method: 'POST', token: A });
  const secret = r.data.secret; check('2FA setup returns secret+otpauth', secret && r.data.otpauth.startsWith('otpauth://'), r);
  r = await call('/me/2fa/enable', { method: 'POST', token: A, body: { code: '000000' } });
  check('2FA enable rejects wrong code', r.data.error === 'wrong_2fa_code', r);
  r = await call('/me/2fa/enable', { method: 'POST', token: A, body: { code: totpNow(secret) } });
  check('2FA enabled', r.data.ok, r);
  r = await call('/auth/login', { method: 'POST', body: { phone: '07500000000', password: 'admin123' } });
  check('login now asks for 2FA (no token)', r.data.need_2fa && !r.data.token, r);
  const ticket = r.data.ticket;
  r = await call('/auth/login/2fa', { method: 'POST', body: { ticket, code: '123456' } });
  check('wrong 2FA code rejected', r.data.error === 'wrong_2fa_code', r);
  r = await call('/auth/login/2fa', { method: 'POST', body: { ticket, code: totpNow(secret) } });
  const A2 = r.data.token; check('2FA login ok', !!A2, r);

  // login brute force per phone
  let last;
  for (let i = 0; i < 9; i++) last = await call('/auth/login', { method: 'POST', body: { phone: '07701234567', password: 'wrong' + i } });
  check('per-phone lockout after 8 failures', last.status === 429, last);

  // upload: fake image
  const fd = new FormData(); fd.append('file', new Blob(['<html><script>alert(1)</script>'], { type: 'image/png' }), 'x.png');
  var up = await fetch(B + '/admin/upload', { method: 'POST', headers: { authorization: 'Bearer ' + A2 }, body: fd });
  check('fake PNG rejected', up.status === 400);
  const png = await require('sharp')({ create: { width: 4, height: 4, channels: 4, background: '#ff000080' } }).png().toBuffer();
  const fd2 = new FormData(); fd2.append('file', new Blob([png], { type: 'image/png' }), 'y.png');
  up = await fetch(B + '/admin/upload', { method: 'POST', headers: { authorization: 'Bearer ' + A2 }, body: fd2 });
  check('real PNG accepted', up.status === 200);

  // log + backups
  r = await call('/admin/log', { token: A2 });
  check('admin log records actions', ['product_create', 'order_status', 'user_update', '2fa_enabled'].every((a) => r.data.some((l) => l.action === a)), r.data.map((l) => l.action));
  r = await call('/admin/backups', { token: A2 });
  check('daily backup exists', r.data.length >= 1, r);
  const dl = await fetch(B + '/admin/backups/download?name=now', { headers: { authorization: 'Bearer ' + A2 } });
  const buf = Buffer.from(await dl.arrayBuffer());
  check('backup download is a database file (SQLite for Node, SQL dump for PHP)', buf.subarray(0, 15).toString() === 'SQLite format 3' || buf.subarray(0, 20).toString() === '-- RamanPhone backup', buf.subarray(0, 20).toString());
  r = await fetch(B + '/admin/backups/download?name=../store.db', { headers: { authorization: 'Bearer ' + A2 } });
  check('backup path traversal rejected', r.status === 400);
  r = await call('/admin/backups', { token: U });
  check('customer cannot access backups', r.status === 403);

  // ---------- phase 2 ----------
  // delivery zones
  r = await call('/admin/settings', { method: 'PUT', token: A2, body: { delivery_zones: JSON.stringify([{ name: 'Erbil', fee: 3000 }, { name: 'Baghdad', fee: 7000 }]), free_delivery_over: '0' } });
  check('zones saved and cities synced', r.data.cities === 'Erbil,Baghdad', r.data);
  r = await call('/cart/quote', { method: 'POST', body: { items: [{ id: 14, qty: 2 }], city: 'Baghdad' } });
  check('quote uses city fee', r.data.delivery === 7000 && r.data.subtotal === 10000, r.data);
  r = await call('/auth/otp', { method: 'POST', body: { phone: '07709998877', purpose: 'quick' } });
  check('quick OTP says new customer', r.data.is_new === true, r.data);
  let qc = r.data.dev_code;
  r = await call('/auth/quick', { method: 'POST', body: { phone: '07709998877', code: qc } });
  check('quick sign-up needs a name', r.data.error === 'name_required', r.data);
  r = await call('/auth/quick', { method: 'POST', body: { phone: '07709998877', code: qc, name: 'Zana' } });
  const Q = r.data.token; check('quick sign-up creates account', !!Q && r.data.created === true, r.data);
  r = await call('/orders', { method: 'POST', token: Q, body: { items: [{ id: 14, qty: 1 }], city: 'Mosul', address: 'x' } });
  check('unknown city rejected', r.data.error === 'invalid_city', r.data);
  r = await call('/orders', { method: 'POST', token: Q, body: { items: [{ id: 14, qty: 1 }], city: 'Erbil', address: 'x' } });
  check('order charged Erbil fee', r.data.delivery_fee === 3000, r.data);
  r = await call('/auth/otp', { method: 'POST', body: { phone: '07500000000', purpose: 'quick' } });
  check('admin cannot use passwordless login', r.data.error === 'use_password', r.data);

  // USD pricing
  r = await call('/admin/products', { method: 'POST', token: A2, body: { name_ku: 'Galaxy S26', usd_priced: true, price: 1000, stock: 5 } });
  check('USD product needs a rate first', r.data.error === 'usd_rate_missing', r.data);
  await call('/admin/settings', { method: 'PUT', token: A2, body: { usd_rate: '1480', usd_round: '250' } });
  r = await call('/admin/products', { method: 'POST', token: A2, body: { name_ku: 'Galaxy S26', usd_priced: true, price: 999, old_price: 1099, stock: 0,
    variants: [{ label: '256GB', price: 999, stock: 2 }, { label: '512GB', price: 1199, stock: 1 }] } });
  const G = r.data;
  check('USD → IQD rounded to 250', G.price === 1478500 && G.variants[1].price === 1774500 && G.variants[0].price_usd === 999, G);
  r = await call('/admin/products', { method: 'POST', token: A2, body: { name_ku: 'Bad', usd_priced: true, price: 999, old_price: 1500000, stock: 1 } });
  check('dinar amount in dollar field rejected', r.data.error === 'usd_price_too_high', r.data);
  await call('/admin/settings', { method: 'PUT', token: A2, body: { usd_rate: '1500' } });
  r = await call('/admin/products', { token: A2 });
  const G2 = r.data.find((x) => x.id === G.id);
  check('rate change reprices product & variants', G2.price === 1498500 && G2.variants[1].price === 1798500, G2);

  // image processing
  const sharp = require('sharp');
  const big = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#3366ff' } }).jpeg().withMetadata({ exif: { IFD0: { Copyright: 'gps-test' } } }).toBuffer();
  const fd3 = new FormData(); fd3.append('file', new Blob([big], { type: 'image/jpeg' }), 'big.jpg');
  up = await fetch(B + '/admin/upload', { method: 'POST', headers: { authorization: 'Bearer ' + A2 }, body: fd3 });
  const upj = await up.json();
  check('upload converted to webp', /^\/uploads\/[a-f0-9]+\.webp$/.test(upj.url), upj);
  const img = Buffer.from(await (await fetch(B.replace('/api', '') + upj.url)).arrayBuffer());
  const meta = await sharp(img).metadata();
  check('image resized to ≤1400px and metadata stripped', meta.width === 1400 && !meta.exif, { w: meta.width, exif: !!meta.exif });
  check('image much smaller than original', img.length < big.length / 3, { before: big.length, after: img.length });

  // link preview
  await call(`/admin/products/${G.id}`, { method: 'PUT', token: A2, body: { ...G2, price: 999, old_price: 1099, variants: G2.variants.map((v) => ({ ...v, price: v.price_usd })), image: upj.url } });
  const html = await (await fetch(B.replace('/api', '') + `/p/${G.id}`)).text();
  check('product link has og tags + preview image', html.includes('og:title" content="Galaxy S26') && /og:image" content="http[^"]+-og\.jpg"/.test(html) && html.includes(`content="0;url=/#/product/${G.id}"`), html.slice(0, 300));
  const home = await (await fetch(B.replace('/api', '') + '/')).text();
  check('home page has og tags', home.includes('og:site_name'));

  // ---------- sales features ----------
  // multilingual search
  const findIds = async (q) => (await call(`/products?q=${encodeURIComponent(q)}`)).data.map((x) => x.id);
  const ip = await findIds('iPhone');
  check('search: ايفون = iPhone', JSON.stringify(await findIds('ايفون')) === JSON.stringify(ip) && ip.length >= 2, { ip, ar: await findIds('ايفون') });
  check('search: Kurdish ئایفۆن = iPhone', JSON.stringify(await findIds('ئایفۆن')) === JSON.stringify(ip));
  check('search: سامسونج finds Samsung products', (await findIds('سامسونج')).length >= 3);
  check('search: كفر ايفون finds the iPhone case', (await findIds('كفر ايفون')).includes(13));
  check('search: Arabic digits ١٦ = 16', (await findIds('ايفون ١٦')).includes(1));
  check('search: باور بانك finds power bank', (await findIds('باور بانك')).includes(15));
  check('search: nonsense finds nothing', (await findIds('zzqqxx')).length === 0);

  // sold count cannot be faked
  const before = (await call('/products/14')).data.product.sold;
  const p14 = (await call('/admin/products', { token: A2 })).data.find((x) => x.id === 14);
  await call('/admin/products/14', { method: 'PUT', token: A2, body: { ...p14, sold: 99999 } });
  check('sold count not editable by admin', (await call('/products/14')).data.product.sold === before);

  // coupons
  r = await call('/admin/coupons', { method: 'POST', token: A2, body: { code: 'ali10', owner: 'Ali (TikTok)', type: 'percent', value: 10, max_discount: 3000, min_order: 20000 } });
  check('coupon created (code uppercased)', r.data.code === 'ALI10', r.data);
  r = await call('/coupons/check', { method: 'POST', token: Q, body: { code: 'ALI10', items: [{ id: 14, qty: 1 }] } });
  check('coupon min order enforced', r.data.error === 'coupon_min_order' && r.data.detail === 20000, r.data);
  r = await call('/coupons/check', { method: 'POST', token: Q, body: { code: 'ali10', items: [{ id: 6, qty: 2 }] } });
  check('coupon 10% capped at max discount', r.data.discount === 3000, r.data);
  r = await call('/coupons/check', { method: 'POST', body: { code: 'NOPE', items: [{ id: 6, qty: 2 }] } });
  check('unknown coupon rejected', r.data.error === 'coupon_invalid', r.data);
  // Q has 1 pending order already (Erbil); place a coupon order
  r = await call('/orders', { method: 'POST', token: Q, body: { items: [{ id: 6, qty: 2 }], city: 'Erbil', address: 'x', coupon: 'ali10', source: 'tiktok', utm: 'tiktok_bio' } });
  const CO = r.data;
  check('order applies coupon, keeps source + utm', CO.discount === 3000 && CO.coupon_code === 'ALI10' && CO.total === 50000 - 3000 + 3000 && CO.source === 'tiktok' && CO.utm === 'tiktok_bio', CO);
  await call(`/admin/orders/${CO.id}`, { method: 'PUT', token: A2, body: { status: 'delivered' } });
  r = await call('/orders', { method: 'POST', token: Q, body: { items: [{ id: 6, qty: 2 }], city: 'Erbil', address: 'x', coupon: 'ALI10' } });
  check('coupon once per customer', r.data.error === 'coupon_already_used', r.data);
  r = await call('/admin/coupons', { token: A2 });
  const cs = r.data.find((c) => c.code === 'ALI10');
  check('coupon stats: uses, orders, revenue', cs.uses === 1 && cs.orders === 1 && cs.revenue === 50000 && cs.discount_given === 3000, cs);
  r = await call('/admin/stats', { token: A2 });
  check('dashboard shows order sources', r.data.sources.some((x) => x.source === 'tiktok' && x.orders === 1) && r.data.utm.some((x) => x.utm === 'tiktok_bio'), r.data.sources);

  // ---------- store management ----------
  // cost price stays private; profit report uses it
  const p6 = (await call('/admin/products', { token: A2 })).data.find((x) => x.id === 6);
  r = await call('/admin/products/6', { method: 'PUT', token: A2, body: { ...p6, cost_price: 18000, specs: [{ k: 'Power', v: '20W' }, { k: 'Port', v: 'USB-C' }], bundle_ids: [8, 14], tag_ids: [] } });
  check('admin sees cost + specs', r.data.cost_price === 18000 && r.data.specs.length === 2, r.data);
  r = await call('/products/6');
  check('public product hides cost, shows specs + bundle', r.data.product.cost_price === undefined && r.data.product.specs[0].k === 'Power' && r.data.bundle.map((x) => x.id).includes(8) && r.data.bundle.every((x) => x.cost_price === undefined), r.data);
  r = await call('/admin/settings', { method: 'PUT', token: A2, body: { min_profit: '10000' } });
  r = await call('/admin/products', { token: A2 });
  check('low margin warning (25,000 − 18,000 < 10,000)', r.data.find((x) => x.id === 6).low_margin === true);

  // tags
  r = await call('/admin/tags', { method: 'POST', token: A2, body: { name_ku: 'نوێ', name_ar: 'جديد', name_en: 'New', color: '#22aa55' } });
  const TAG = r.data.id;
  await call('/admin/products/6', { method: 'PUT', token: A2, body: { ...p6, cost_price: 18000, tag_ids: [TAG] } });
  check('product shows its tag', (await call('/products/6')).data.product.tags[0].name_en === 'New');

  // abandoned cart: saved, listed, cleared by an order
  await call('/cart/sync', { method: 'POST', token: Q, body: { items: [{ id: 6, qty: 1 }] } });
  r = await call('/admin/carts', { token: A2 });
  check('abandoned cart listed with value', r.data.some((c) => c.phone === '07709998877' && c.value === 25000), r.data);
  // stock movement + cogs: Q orders product 6 (cost 18,000)
  r = await call('/orders', { method: 'POST', token: Q, body: { items: [{ id: 6, qty: 1 }], city: 'Erbil', address: 'x' } });
  const MO = r.data;
  check('customer order items never include cost', MO.items.every((i) => i.cost === undefined), MO.items);
  r = await call('/admin/carts', { token: A2 });
  check('order clears the saved cart', !r.data.some((c) => c.phone === '07709998877'));
  r = await call('/admin/stock?product_id=6', { token: A2 });
  check('stock movement recorded for the order', r.data.some((m) => m.reason === 'order' && m.delta === -1 && m.ref === `#${MO.id}`), r.data.slice(0, 3));
  r = await call('/admin/stock/adjust', { method: 'POST', token: A2, body: { product_id: 6, delta: 10, reason: 'restock', note: 'supplier' } });
  check('quick restock adds stock + log', r.data.ok && (await call('/admin/stock?product_id=6', { token: A2 })).data[0].reason === 'restock', r.data);

  // cashback on delivery
  await call('/admin/settings', { method: 'PUT', token: A2, body: { cashback_percent: '2' } });
  const walletBefore = (await call('/me', { token: Q })).data.user.wallet;
  await call(`/admin/orders/${MO.id}`, { method: 'PUT', token: A2, body: { status: 'delivered' } });
  const walletAfter = (await call('/me', { token: Q })).data.user.wallet;
  check('2% cashback credited on delivery', walletAfter - walletBefore === 500, { walletBefore, walletAfter });
  await call(`/admin/orders/${MO.id}`, { method: 'PUT', token: A2, body: { status: 'delivered' } });
  check('cashback only once', (await call('/me', { token: Q })).data.user.wallet === walletAfter);

  // expenses + profit
  await call('/admin/expenses', { method: 'POST', token: A2, body: { category: 'ads', amount: 4000, note: 'TikTok' } });
  r = await call('/admin/profit?months=1', { token: A2 });
  const pm = r.data[0];
  check('profit report: cogs, expenses, net', pm.cogs >= 18000 && pm.expenses === 4000 && pm.net === pm.sales - pm.cogs - pm.wallet - pm.expenses, pm);

  // bulk price change (preview then apply) on the power-bank category
  const pbCat = (await call('/products/15')).data.product.category_id;
  r = await call('/admin/bulk-price', { method: 'POST', token: A2, body: { category_id: pbCat, mode: 'percent', value: 10, round: 250, preview: true } });
  check('bulk price preview', r.data.count === 1 && r.data.changes[0].from === 55000 && r.data.changes[0].to === 60500, r.data);
  check('preview changes nothing', (await call('/products/15')).data.product.price === 55000);
  await call('/admin/bulk-price', { method: 'POST', token: A2, body: { category_id: pbCat, mode: 'percent', value: 10, round: 250 } });
  check('bulk price applied', (await call('/products/15')).data.product.price === 60500);

  // analytics
  const track = (ua, body) => fetch(B + '/track', { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': ua }, body: JSON.stringify(body) });
  await track('Mozilla/5.0 (iPhone)', { path: '/product/6', product_id: 6, src: 'tiktok_bio' });
  await track('Mozilla/5.0 (iPhone)', { path: '/' });
  await track('facebookexternalhit/1.1', { path: '/' });
  r = await call('/admin/analytics?days=7', { token: A2 });
  check('analytics counts real visits, ignores bots', r.data.totals.views === 2 && r.data.totals.visitors === 1 && r.data.top_products[0].id === 6 && r.data.sources.some((x) => x.src === 'tiktok_bio'), r.data.totals);

  // FAQ
  r = await call('/faqs');
  check('FAQ seeded', r.data.length === 3 && r.data[0].q_ar, r.data.length);

  // staff roles
  await call('/admin/staff', { method: 'POST', token: A2, body: { phone: '07701234567', role: 'orders' } });
  // that account was locked by the brute-force test earlier, so give it a fresh password via reset
  r = await call('/auth/otp', { method: 'POST', body: { phone: '07508080808', purpose: 'register' } });
  r = await call('/auth/register', { method: 'POST', body: { name: 'Staff', phone: '07508080808', password: 'staff123', code: r.data.dev_code } });
  await call('/admin/staff', { method: 'POST', token: A2, body: { phone: '07508080808', role: 'orders' } });
  const ST = (await call('/auth/login', { method: 'POST', body: { phone: '07508080808', password: 'staff123' } })).data.token;
  check('orders-staff can open orders', (await call('/admin/orders', { token: ST })).status === 200);
  check('orders-staff cannot open products', (await call('/admin/products', { token: ST })).status === 403);
  check('orders-staff cannot change settings', (await call('/admin/settings', { method: 'PUT', token: ST, body: { store_name: 'x' } })).status === 403);
  check('orders-staff cannot manage staff', (await call('/admin/staff', { token: ST })).status === 403);
  check('orders-staff cannot edit wallets', (await call(`/admin/users/${uid}`, { method: 'PUT', token: ST, body: { wallet: 999999 } })).status === 403);
  r = await call('/me', { token: ST });
  check('staff /me includes admin path + sections', r.data.admin_path === '/admin' && r.data.sections.includes('orders'), r.data);
  check('staff cannot use code-only login', (await call('/auth/otp', { method: 'POST', body: { phone: '07508080808', purpose: 'quick' } })).data.error === 'use_password');

  // maintenance mode
  await call('/admin/settings', { method: 'PUT', token: A2, body: { maintenance_mode: '1' } });
  r = await call('/orders', { method: 'POST', token: Q, body: { items: [{ id: 14, qty: 1 }], city: 'Erbil', address: 'x' } });
  check('maintenance blocks customer orders', r.status === 503 && r.data.error === 'maintenance', r);
  await call('/admin/settings', { method: 'PUT', token: A2, body: { maintenance_mode: '0' } });

  // ---------- trade-in ----------
  r = await call('/tradein/models');
  check('trade-in models listed', r.data.enabled && r.data.models.length >= 10, r.data);
  const iphone14 = r.data.models.find((m) => m.model === 'iPhone 14');
  const good = { screen: 'perfect', body: 'perfect', battery: 'good', works: 'yes', box: 'yes' };
  r = await call('/tradein/quote', { method: 'POST', body: { model_id: iphone14.id, answers: good } });
  check('perfect phone = full base price', r.data.estimate === 600000, r.data);
  r = await call('/tradein/quote', { method: 'POST', body: { model_id: iphone14.id, answers: { ...good, screen: 'cracked', works: 'no' } } });
  check('cracked + faulty: 65% off, rounded to 5,000', r.data.estimate === 210000 && r.data.deduction_pct === 65, r.data);
  r = await call('/tradein/quote', { method: 'POST', body: { model_id: iphone14.id, answers: { ...good, screen: 'cracked', body: 'damaged', battery: 'weak', works: 'no', box: 'no' } } });
  check('deductions capped at 80%', r.data.estimate === 120000 && r.data.deduction_pct === 80, r.data);
  r = await call('/tradein/quote', { method: 'POST', body: { model_id: iphone14.id, answers: { ...good, screen: 'hacked' } } });
  check('invalid answer rejected', r.data.error === 'tradein_answers', r.data);

  // order with trade-in: credit capped at products total, admin adjusts after inspection
  await call('/admin/settings', { method: 'PUT', token: A2, body: { max_pending_orders: '0' } });
  r = await call('/orders', { method: 'POST', token: Q, body: { items: [{ id: 2, qty: 1 }], city: 'Erbil', address: 'x', tradein: { model_id: iphone14.id, answers: { ...good, battery: 'ok' } } } });
  const TO = r.data;
  check('order takes trade-in credit off the total', TO.tradein_credit === 550000 && TO.total === 1150000 - 550000 + 3000 && TO.tradein.label === 'Apple iPhone 14 128GB', { credit: TO.tradein_credit, total: TO.total });
  r = await call('/admin/tradeins', { token: A2 });
  const TI = r.data.find((t) => t.order_id === TO.id);
  check('admin sees trade-in request', TI && TI.status === 'pending' && TI.answers.battery === 'ok', TI);
  r = await call(`/admin/tradeins/${TI.id}`, { method: 'PUT', token: A2, body: { status: 'adjusted', final_value: 500000, imei: '356789012345678', note: 'scratch on back' } });
  const TO2 = (await call(`/orders/${TO.id}`, { token: Q })).data;
  check('adjusted value updates what the customer pays', TO2.tradein_credit === 500000 && TO2.total === TO.total + 50000, { credit: TO2.tradein_credit, total: TO2.total });
  await call(`/admin/tradeins/${TI.id}`, { method: 'PUT', token: A2, body: { status: 'rejected' } });
  check('rejected trade-in removes the credit', (await call(`/orders/${TO.id}`, { token: Q })).data.total === 1150000 + 3000);
  r = await call('/orders', { method: 'POST', token: Q, body: { items: [{ id: 14, qty: 1 }], city: 'Erbil', address: 'x', tradein: { model_id: iphone14.id, answers: good } } });
  check('trade-in credit never exceeds the products total', r.data.tradein_credit === 5000 && r.data.total === 3000, { credit: r.data.tradein_credit, total: r.data.total });
  await call(`/admin/orders/${r.data.id}`, { method: 'PUT', token: A2, body: { status: 'cancelled' } });
  check('cancelling the order cancels the trade-in', (await call('/admin/tradeins', { token: A2 })).data.find((t) => t.order_id === r.data.id).status === 'cancelled');
  await call('/admin/settings', { method: 'PUT', token: A2, body: { max_pending_orders: '2' } });

  // ---------- phone finder ----------
  r = await call('/finder?max=2000000&uses=camera');
  check('finder returns up to 3 phones with best pick', r.data.results.length >= 2 && r.data.results.length <= 3 && r.data.results[0].best && r.data.results.every((x) => x.price <= 2000000), r.data.results.map((x) => [x.product.name_en, x.match]));
  check('finder never exposes cost price', r.data.results.every((x) => x.product.cost_price === undefined));
  r = await call('/finder?max=1500000&os=ios&uses=camera,social');
  check('finder respects iPhone-only + budget', r.data.results.length && r.data.results.every((x) => x.attrs.os === 'ios' && x.price <= 1500000), r.data.results.map((x) => x.product.name_en));
  r = await call('/finder?max=100000&uses=basic');
  check('nothing in budget → closest phone above it', !r.data.results.length && r.data.stretch && r.data.stretch.over_by > 0, r.data);

  // ---------- precise search ----------
  const mk = async (b) => (await call('/admin/products', { method: 'POST', token: A2, body: { brand: 'Apple', stock: 5, ...b } })).data.id;
  const casesCat = (await call('/products/13')).data.product.category_id;   // "Cases"
  const glassCat = (await call('/products/14')).data.product.category_id;   // "Screen Protectors" (same parent "Cases & Protection")
  const iphoneCat = (await call('/products/2')).data.product.category_id;
  const PH17 = await mk({ name_ku: 'ئایفۆن ١٧ پرۆ ماکس', name_ar: 'آيفون 17 برو ماكس', name_en: 'iPhone 17 Pro Max', category_id: iphoneCat, price: 2000000 });
  const C1 = await mk({ name_ku: 'کەڤەری سیلیکۆن ئایفۆن ١٧ پرۆ ماکس', name_en: 'iPhone 17 Pro Max Silicone Case', category_id: casesCat, price: 20000 });
  const C2 = await mk({ name_ku: 'غڵافی شەفاف بۆ ئایفۆن 17 Pro Max', name_en: 'Clear Cover for iPhone 17 Pro Max', category_id: casesCat, price: 15000 });
  const C3 = await mk({ name_ku: 'کەڤەری ئایفۆن ١٧ پرۆ', name_en: 'iPhone 17 Pro Case', category_id: casesCat, price: 18000 });
  const G17 = await mk({ name_ku: 'شاشەی پاراستنی ئایفۆن ١٧ پرۆ ماکس', name_en: 'iPhone 17 Pro Max Screen Protector', category_id: glassCat, price: 7000 });
  const ids = async (q) => (await call(`/products?q=${encodeURIComponent(q)}`)).data.map((x) => x.id);
  const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  for (const q of ['كفر ١٧ بروماكس', 'كفر 17 برو ماكس', 'كفر 17promax', 'cover 17 pro max', 'کەڤەری ١٧ پرۆ ماکس', 'جراب ايفون 17 برو ماكس']) {
    const got = await ids(q);
    check(`search "${q}" → only the two 17 Pro Max cases`, same(got, [C1, C2]), got);
  }
  check('"كفر 17 برو" also finds the 17 Pro case', (await ids('كفر 17 برو')).includes(C3));
  check('"شاشة حماية 17 برو ماكس" → only the screen protector', same(await ids('شاشة حماية 17 برو ماكس'), [G17]));
  check('"ايفون 17 برو ماكس" → the phone first', (await ids('ايفون 17 برو ماكس'))[0] === PH17);
  const sam = (await call(`/products?q=${encodeURIComponent('سامسونك')}`)).data;
  check('"سامسونك" → only Samsung products', sam.length >= 3 && sam.every((x) => /samsung|galaxy/i.test(`${x.name_ku} ${x.name_en} ${x.brand}`)), sam.map((x) => x.name_en));
  check('"17" does not match 170 / 1700', !(await ids('17')).some((id) => id === 15));

  // ---------- repairs ----------
  r = await call('/repair/catalog');
  check('repair catalog', r.data.enabled && r.data.services.length >= 8 && r.data.models.length >= 10, r.data);
  const screenSvc = r.data.services.find((x) => x.key === 'screen');
  const waterSvc = r.data.services.find((x) => x.key === 'water');
  r = await call(`/repair/quote?brand=Apple&model=${encodeURIComponent('iPhone 13')}&service=${screenSvc.id}`);
  check('repair quote: original + copy with warranty', r.data.options.length === 2 && r.data.options[0].quality === 'original' && r.data.options[0].warranty_days === 90, r.data);
  r = await call(`/repair/quote?brand=Apple&model=${encodeURIComponent('iPhone 13')}&service=${waterSvc.id}`);
  check('water damage → price after free diagnosis', r.data.needs_diagnosis && r.data.options[0].quality === 'diagnosis', r.data);
  await call('/admin/settings', { method: 'PUT', token: A2, body: { repair_honest_pct: '10' } });
  r = await call(`/repair/quote?brand=Apple&model=${encodeURIComponent('iPhone 13')}&service=${screenSvc.id}`);
  check('honest advice when repair costs too much vs phone value', r.data.advice && r.data.advice.phone_value === 500000, r.data);
  await call('/admin/settings', { method: 'PUT', token: A2, body: { repair_honest_pct: '50', repair_closed_days: '', repair_open: '0', repair_close: '24', repair_slot_capacity: '1' } });
  const tomorrow = new Date(Date.now() + 3 * 3600e3 + 864e5).toISOString().slice(0, 10);
  r = await call(`/repair/slots?date=${tomorrow}`);
  const slot = r.data[0];
  check('appointment slots listed', r.data.length === 24 && slot.free === 1, r.data.length);
  r = await call('/repairs', { method: 'POST', token: Q, body: { brand: 'Apple', model: 'iPhone 13', service_id: screenSvc.id, quality: 'original', method: 'walkin', appointment: slot.slot, problem: 'lines on screen' } });
  const RP = r.data;
  check('repair booked with code, price and warranty', /^R[A-Z0-9]{6}$/.test(RP.code) && RP.quoted_price === 155000 && RP.warranty_days === 90 && RP.status === 'booked', RP);
  r = await call('/repairs', { method: 'POST', token: Q, body: { brand: 'Apple', model: 'iPhone 13', service_id: screenSvc.id, quality: 'original', method: 'walkin', appointment: slot.slot } });
  check('full slot cannot be double-booked', r.data.error === 'repair_slot', r.data);
  r = await call('/repairs', { method: 'POST', token: Q, body: { brand: 'Apple', model: 'iPhone 13', service_id: screenSvc.id, quality: 'original', method: 'pickup', city: 'Erbil', address: 'x', lat: 36.191234, lng: 44.009876, loc_accuracy: 12 } });
  check('home pickup & return is free by default', r.data.pickup_fee === 0 && r.data.total === 155000, r.data);
  await call(`/repairs/${r.data.code}/cancel`, { method: 'POST', token: Q });
  await call('/admin/settings', { method: 'PUT', token: A2, body: { repair_pickup_fee: '5000' } });
  r = await call('/repairs', { method: 'POST', token: Q, body: { brand: 'Apple', model: 'iPhone 13', service_id: screenSvc.id, quality: 'original', method: 'pickup', city: 'Erbil', address: 'x', lat: 36.191234, lng: 44.009876, loc_accuracy: 12 } });
  check('pickup fee applies when the shop sets one', r.data.pickup_fee === 5000 && r.data.total === 160000, r.data);
  await call('/admin/settings', { method: 'PUT', token: A2, body: { repair_pickup_fee: '0' } });
  await call(`/repairs/${r.data.code}/cancel`, { method: 'POST', token: Q });
  check('customer can cancel a booked repair', (await call(`/repairs/${r.data.code}`, { token: Q })).data.status === 'cancelled');
  check('customer never sees parts cost / technician', (await call(`/repairs/${RP.code}`, { token: Q })).data.parts_cost === undefined);
  check('other customers cannot see the repair', (await call(`/repairs/${RP.code}`, { token: U })).status === 404 || (await call(`/repairs/${RP.code}`, { token: U })).status === 401);
  // workshop flow
  const rid = RP.id;
  await call(`/admin/repairs/${rid}`, { method: 'PUT', token: A2, body: { status: 'received', imei: '356700000000001', technician: 'Karwan' } });
  await call(`/admin/repairs/${rid}`, { method: 'PUT', token: A2, body: { status: 'diagnosing' } });
  r = await call(`/admin/repairs/${rid}/extra`, { method: 'POST', token: A2, body: { price: 30000, note: 'Face ID flex damaged' } });
  check('extra cost request waits for the customer', r.data.status === 'awaiting_approval' && r.data.extra_status === 'pending', r.data);
  r = await call(`/repairs/${RP.code}/decision`, { method: 'POST', token: Q, body: { approve: true } });
  check('customer approves → repairing, extra added', r.data.status === 'repairing' && r.data.approved_extra === 30000 && r.data.total === 185000, r.data);
  r = await call(`/repairs/${RP.code}/decision`, { method: 'POST', token: Q, body: { approve: true } });
  check('cannot approve twice', r.data.error === 'repair_no_request', r.data);
  await call(`/admin/repairs/${rid}`, { method: 'PUT', token: A2, body: { status: 'testing', parts_cost: 90000, old_part_returned: true } });
  r = await call(`/admin/repairs/${rid}`, { method: 'PUT', token: A2, body: { status: 'delivered' } });
  check('delivered → warranty until +90 days', r.data.warranty_until && r.data.warranty_until > tomorrow, r.data);
  r = await call(`/warranty/${RP.code.toLowerCase()}`);
  check('public warranty check (no personal data)', r.data.valid === true && r.data.customer_name === undefined && r.data.phone === undefined, r.data);
  check('timeline recorded', (await call(`/repairs/${RP.code}`, { token: Q })).data.events.length >= 6);
  r = await call('/admin/profit?months=1', { token: A2 });
  check('profit includes repair revenue − parts', r.data[0].repair_revenue === 185000 && r.data[0].repair_parts === 90000, r.data[0]);
  // warranty claim: same IMEI comes back
  const slot2 = (await call(`/repair/slots?date=${tomorrow}`)).data.find((x) => x.free > 0);
  r = await call('/repairs', { method: 'POST', token: Q, body: { brand: 'Apple', model: 'iPhone 13', service_id: screenSvc.id, quality: 'original', method: 'walkin', appointment: slot2.slot, imei: '356700000000001' } });
  r = await call('/admin/repairs?status=open', { token: A2 });
  check('returning IMEI flagged as warranty claim', r.data.some((x) => x.warranty_claim && x.warranty_claim.code === RP.code), r.data.map((x) => x.warranty_claim));
  // technician role sees repairs only
  await call('/admin/staff', { method: 'POST', token: A2, body: { phone: '07508080808', role: 'technician' } });
  const TEC = (await call('/auth/login', { method: 'POST', body: { phone: '07508080808', password: 'staff123' } })).data.token;
  check('technician can open repairs', (await call('/admin/repairs', { token: TEC })).status === 200);
  check('technician cannot open orders', (await call('/admin/orders', { token: TEC })).status === 403);

  // ---------- bought-together compatibility ----------
  const bt = async (id) => (await call(`/products/${id}`)).data.bundle.map((x) => x.name_en || x.name_ku);
  const s24 = await bt(3);
  check('Galaxy S24 Ultra: no iPhone accessories, no Lightning', !s24.some((n) => /iphone|lightning/i.test(n)), s24);
  const i16 = await bt(1);
  check('iPhone 16 Pro Max: no iPhone 16 (non-Pro) case, no Lightning', !i16.some((n) => /lightning/i.test(n) || /^iPhone 16 Silicone/i.test(n)), i16);
  check('suggestions are never other phones', !(await bt(1)).some((n) => /^(iPhone|Samsung Galaxy|Xiaomi Redmi) .*(GB|Ultra|A55)$/i.test(n)), i16);

  // ---------- reviews ----------
  r = await call('/products/1/reviews', { method: 'POST', token: Q, body: { rating: 5, comment: 'x' } });
  check('review: only buyers can review', r.status === 403 && r.data.error === 'review_buyers_only', r.data);
  r = await call('/products/6/reviews', { method: 'POST', token: Q, body: { rating: 4, comment: 'زين جداً', photos: ['/uploads/../../etc/passwd', 'https://evil.example/x.png'] } });
  check('review by a buyer is published at once', r.data.status === 'approved', r.data);
  r = await call('/products/6/reviews', { token: Q });
  check('review summary + verified badge, foreign photo paths dropped', r.data.count === 1 && r.data.avg === 4 && r.data.list[0].verified && r.data.list[0].photos.length === 0 && r.data.mine, r.data);
  check('review shows short name, never the phone', !JSON.stringify(r.data.list).includes('0750'), r.data.list);
  r = await call('/products?ids=6');
  check('product card carries rating', r.data[0].rating_count === 1 && r.data[0].rating_avg === 4, r.data[0]);
  r = await call('/products/6/reviews', { method: 'POST', token: Q, body: { rating: 0 } });
  check('review rating must be 1–5', r.status === 400, r.data);
  r = await call('/admin/reviews?status=approved', { token: A2 });
  const rv = r.data.list[0];
  check('admin sees reviews', rv && rv.product_id === 6, r.data);
  await call(`/admin/reviews/${rv.id}`, { method: 'PATCH', token: A2, body: { status: 'hidden', reply: 'شكراً' } });
  r = await call('/products?ids=6');
  check('hidden review leaves the average', r.data[0].rating_count === 0, r.data[0]);

  // ---------- filters, facets, recently viewed ----------
  r = await call('/products/facets?category=1');
  check('facets list brands and storages', r.data.brands.some((b) => b.v === 'Apple') && r.data.storages.length > 0 && r.data.max > r.data.min, r.data);
  r = await call('/products?category=1&brand=samsung');
  check('brand filter', r.data.length > 0 && r.data.every((p) => p.brand === 'Samsung'), r.data.map((p) => p.brand));
  r = await call('/products?category=1&max_price=600000');
  check('max price filter', r.data.length > 0 && r.data.every((p) => p.price <= 600000), r.data.map((p) => p.price));
  r = await call('/products?category=1&storage=256');
  check('storage filter', r.data.length > 0 && r.data.every((p) => p.attrs.storage === 256), r.data.map((p) => p.attrs));
  r = await call('/products?ids=3,1,2');
  check('ids keep the given order', r.data.map((p) => p.id).join() === '3,1,2', r.data.map((p) => p.id));
  r = await call('/products/1');
  check('product page has real social proof numbers', typeof r.data.proof.viewers === 'number' && typeof r.data.proof.sold30 === 'number', r.data.proof);

  // ---------- bundle deal ----------
  await call('/admin/settings', { method: 'PUT', token: A2, body: { bundle_discount_percent: '10' } });
  const s24b = (await call('/products/3')).data.bundle[0];
  r = await call('/cart/quote', { method: 'POST', body: { items: [{ id: 3, qty: 1 }, { id: s24b.id, qty: 1 }] } });
  check('bundle: 10% off a fitting accessory bought with the phone', r.data.bundle_discount === Math.floor(s24b.price / 10), r.data);
  r = await call('/cart/quote', { method: 'POST', body: { items: [{ id: s24b.id, qty: 1 }] } });
  check('bundle: no discount without a phone', r.data.bundle_discount === 0, r.data);
  const lightning = (await call('/products?q=lightning')).data.find((p) => /lightning/i.test(p.name_en));
  if (lightning) {
    r = await call('/cart/quote', { method: 'POST', body: { items: [{ id: 3, qty: 1 }, { id: lightning.id, qty: 1 }] } });
    check('bundle: no discount on an accessory that does not fit', r.data.bundle_discount === 0, r.data);
  }
  await call('/admin/settings', { method: 'PUT', token: A2, body: { bundle_discount_percent: '0' } });

  // ---------- repair pickup location + comments ----------
  r = await call('/repairs', { method: 'POST', token: Q, body: { brand: 'Apple', model: 'iPhone 13', service_id: screenSvc.id, quality: 'original', method: 'pickup', city: 'Erbil', address: 'x' } });
  check('pickup without a map pin is refused', r.status === 400 && r.data.error === 'repair_location', r.data);
  r = await call('/repairs', { method: 'POST', token: Q, body: { brand: 'Apple', model: 'iPhone 13', service_id: screenSvc.id, quality: 'original', method: 'pickup', city: 'Erbil', address: 'x', lat: 51.5, lng: -0.12 } });
  check('pickup pin outside Iraq is refused', r.data.error === 'repair_location', r.data);
  r = await call('/repairs', { method: 'POST', token: Q, body: { brand: 'Apple', model: 'iPhone 13', service_id: screenSvc.id, quality: 'original', method: 'pickup', city: 'Erbil', address: 'قرب جامع', lat: 36.1912345678, lng: 44.0098765432, loc_accuracy: 9, pickup_note: 'اتصل قبل ما توصل', problem: 'وكع وانكسرت الشاشة' } });
  const PR = r.data;
  check('pickup keeps exact pin, courier note and problem', PR.lat === 36.191235 && PR.lng === 44.009877 && PR.loc_accuracy === 9 && PR.pickup_note === 'اتصل قبل ما توصل' && /maps/.test(PR.map_url), PR);
  r = await call(`/repairs/${PR.code}/comments`, { method: 'POST', token: Q, body: { body: 'الرمز السري 1234' } });
  check('customer can comment on their repair', r.data.comments && r.data.comments.length === 1 && r.data.comments[0].author === 'customer', r.data);
  r = await call(`/repairs/${PR.code}/comments`, { method: 'POST', token: Q, body: { body: '' } });
  check('empty comment refused', r.status === 400, r.data);
  r = await call('/admin/repairs?status=open', { token: A2 });
  const adm = r.data.find((x) => x.code === PR.code);
  check('admin sees the comment as awaiting a reply', adm && adm.awaiting_reply === true, adm);
  r = await call(`/admin/repairs/${adm.id}/comments`, { method: 'POST', token: A2, body: { body: 'تمام، وصلت' } });
  check('shop replies', r.data.comments.length === 2 && r.data.comments[1].author === 'staff', r.data.comments);
  r = await call(`/repairs/${PR.code}`, { token: Q });
  check('customer sees the reply', r.data.comments.length === 2, r.data.comments);
  check('other customers cannot comment on it', (await call(`/repairs/${PR.code}/comments`, { method: 'POST', token: A2, body: { body: 'x' } })).status === 404);

  console.log(`\n${ok} passed, ${bad} failed`);
  stop();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); stop(); process.exit(1); });
