// End-to-end API test: starts the server on a throwaway database and checks the main flows.
// Run with: npm test
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const PORT = 3900 + Math.floor(Math.random() * 90);
const B = `http://localhost:${PORT}/api`;
const { hotp } = require('../server/totp.js');
let ok = 0, bad = 0;
const check = (name, cond, extra) => { cond ? ok++ : bad++; console.log(`${cond ? '✔' : '✘'} ${name}${cond ? '' : ' → ' + JSON.stringify(extra)}`); };
async function call(path, { method = 'GET', body, token } = {}) {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
const totpNow = (secret) => hotp(secret, Math.floor(Date.now() / 30000));
async function startServer() {
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

(async () => {
  const stop = await startServer();
  // admin login
  let r = await call('/auth/login', { method: 'POST', body: { phone: '07500000000', password: 'admin123' } });
  const A = r.data.token; check('admin login', !!A, r);
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
  let up = await fetch(B + '/admin/upload', { method: 'POST', headers: { authorization: 'Bearer ' + A2 }, body: fd });
  check('fake PNG rejected', up.status === 400);
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
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
  check('backup download is a SQLite file', buf.subarray(0, 15).toString() === 'SQLite format 3', buf.subarray(0, 16).toString());
  r = await fetch(B + '/admin/backups/download?name=../store.db', { headers: { authorization: 'Bearer ' + A2 } });
  check('backup path traversal rejected', r.status === 400);
  r = await call('/admin/backups', { token: U });
  check('customer cannot access backups', r.status === 403);

  console.log(`\n${ok} passed, ${bad} failed`);
  stop();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
