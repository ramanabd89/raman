// Phase 2 API checks (used phones, accessory finder, cart/wishlist merge, live search, cache).
// Needs Node 18+ only to RUN the checks; the store itself is pure PHP.  php tests/setup.php ramanphone_test root "" && php -S 127.0.0.1:8765 tests/dev-router.php && node tests/phase2.test.js
const B = process.env.API_URL || 'http://127.0.0.1:8765/api';
let ok = 0, bad = 0;
const check = (name, cond, extra) => { cond ? ok++ : bad++; console.log(`${cond ? '✔' : '✘'} ${name}${cond ? '' : ' → ' + JSON.stringify(extra).slice(0, 600)}`); };
let CSRF = '';
async function call(path, { method = 'GET', body, token } = {}) {
  if (!CSRF) { const r0 = await fetch(B + '/settings'); CSRF = (r0.headers.get('set-cookie') || '').match(/rp_csrf=([a-f0-9]+)/)[1]; }
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', 'x-client': 'api', cookie: 'rp_csrf=' + CSRF, 'x-csrf-token': CSRF, ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
(async () => {
  let r = await call('/auth/login', { method: 'POST', body: { phone: '07500000000', password: 'admin123' } });
  const A = r.data.token; check('admin login', !!A, r);

  // ---- F1 used phone ----
  r = await call('/admin/products', { method: 'POST', token: A, body: { name_ku: 'iPhone 13 used', name_en: 'iPhone 13 128GB', brand: 'Apple', price: 650000, stock: 1, is_used: true, attrs: { os: 'ios', storage: 128 } } });
  check('used product needs a grade (422)', r.status === 422 && r.data.fields?.includes('condition_grade'), r);
  r = await call('/admin/products', { method: 'POST', token: A, body: { name_ku: 'iPhone 13 used', name_en: 'iPhone 13 128GB', brand: 'Apple', price: 650000, stock: 1, is_used: true, condition_grade: 'A+', battery_health: 94,
    has_box: true, has_charger: false, used_warranty_days: 30, cosmetic_notes_en: 'Tiny mark on frame', cosmetic_notes_ar: 'أثر بسيط', model_code: 'a2633', attrs: { os: 'ios', storage: 128 } } });
  const UP = r.data; check('used product saved with inspection fields', UP.is_used === true && UP.condition_grade === 'A+' && UP.battery_health === 94 && UP.has_box === true && UP.has_charger === false && UP.model_code === 'A2633', UP);
  r = await call('/products?used=1');
  check('used filter lists only used phones', r.data.length >= 1 && r.data.every((p) => p.is_used), r.data.map((p) => p.id));
  check('grid payload is light (no desc/specs/images)', !('desc_ku' in r.data[0]) && !('specs' in r.data[0]) && !('images' in r.data[0]) && !('search_text' in r.data[0]), Object.keys(r.data[0]));
  r = await call(`/products/${UP.id}`);
  check('product page has cosmetic notes', r.data.product.cosmetic_notes_en === 'Tiny mark on frame' && r.data.product.used_warranty_days === 30, r.data.product);
  const html = await (await fetch(B.replace(/api$/, '') + 'en/used')).text();
  check('/en/used SSR with UsedCondition JSON-LD', html.includes('UsedCondition') && html.includes('hreflang="ckb"') && html.includes('rel="canonical"'), html.slice(0, 200));
  const ph = await (await fetch(B.replace(/api$/, '') + `en/product/${UP.id}`, { redirect: 'follow' })).text();
  check('used product page: report + UsedCondition', ph.includes('inspect-card') && ph.includes('https://schema.org/UsedCondition') && ph.includes('A2633'), ph.length);

  // ---- F4 model code search + suggest ----
  r = await call('/search/suggest?q=A2633');
  check('suggest finds exact model code', r.data.products[0]?.id === UP.id && r.data.products[0].code_match === true, r.data);
  r = await call('/search/suggest?q=a26');
  check('suggest finds partial model code', r.data.products.some((p) => p.id === UP.id), r.data);
  r = await call('/admin/products', { method: 'POST', token: A, body: { name_ku: 'Galaxy S24 Ultra', name_en: 'Galaxy S24 Ultra 256GB', brand: 'Samsung', price: 1400000, stock: 3, model_code: 'SM-S928B', attrs: { os: 'android', storage: 256 } } });
  const S24 = r.data;
  for (const q of ['SM-S928B', 'sms928b', 'sm s928b']) { r = await call('/search/suggest?q=' + encodeURIComponent(q)); check(`suggest "${q}"`, r.data.products.some((p) => p.id === S24.id), r.data.products.map((p) => p.name_en)); }
  r = await call('/products?q=' + encodeURIComponent('SM-S928B'));
  check('full search by model code', r.data.some((p) => p.id === S24.id), r.data.map((p) => p.id));
  r = await call('/search/suggest?q=' + encodeURIComponent('ئایفۆن'));
  check('suggest Kurdish iPhone', r.data.products.length > 0 && r.data.products.length <= 8 && r.data.products.every((p) => !('desc_ku' in p)), r.data.products.length);
  r = await call('/search/suggest?q=samsnug');
  check('suggest tolerates a typo', r.data.products.length > 0, r.data);
  r = await call('/search/suggest?q=' + encodeURIComponent('كفر'));
  check('suggest returns categories array', Array.isArray(r.data.categories), r.data);

  // ---- F2 accessories ----
  r = await call('/admin/products', { method: 'POST', token: A, body: { name_ku: 'Clear case', name_en: 'Clear Case', price: 15000, stock: 5, compatible_models: ['Galaxy S24 Ultra', 'Samsung Galaxy S24 Ultra', 'iPhone 15 Pro Max'] } });
  const CASE = r.data; check('compatible models saved (same model spelled twice kept once)', Array.isArray(CASE.compatible_models) && CASE.compatible_models.length === 2, CASE.compatible_models);
  r = await call('/admin/products', { method: 'POST', token: A, body: { name_ku: 'Lightning cable', name_en: 'Lightning Cable 1m', price: 10000, stock: 5 } });
  const LIGHT = r.data;
  r = await call('/admin/products', { method: 'POST', token: A, body: { name_ku: 'USB-C cable', name_en: 'USB-C to USB-C Cable', price: 10000, stock: 5 } });
  const USBC = r.data;
  r = await call('/accessories/models');
  const brands = r.data.brands.map((b) => b.brand);
  check('models list has brands (Apple, Samsung)', brands.includes('Apple') && brands.includes('Samsung'), brands);
  r = await call('/accessories/by-model?brand=Samsung&model=' + encodeURIComponent('S24 Ultra'));
  const ids = r.data.items.map((x) => x.id);
  check('S24 Ultra: tagged case first as exact', r.data.items[0]?.id === CASE.id && r.data.items[0].fit === 'exact', r.data.items.slice(0, 3));
  check('S24 Ultra: no Lightning cable, has USB-C cable', !ids.includes(LIGHT.id) && ids.includes(USBC.id), ids);
  check('no phones in accessory results', r.data.items.every((x) => !x.attrs || !x.attrs.os), ids);
  r = await call('/accessories/by-model?brand=Apple&model=' + encodeURIComponent('iPhone 13'));
  const ids13 = r.data.items.map((x) => x.id);
  check('iPhone 13: Lightning yes, case for other models no', ids13.includes(LIGHT.id) && !ids13.includes(CASE.id), ids13);
  r = await call('/accessories/by-model?brand=Apple&model=' + encodeURIComponent('iPhone 15 Pro Max') + '&category=case');
  check('type filter: cases only', r.data.items.length >= 1 && r.data.items.every((x) => x.acc_type === 'case'), r.data.items.map((x) => [x.id, x.acc_type]));
  check('types counted', r.data.types.some((t) => t.type === 'case'), r.data.types);

  // ---- F3 cart & wishlist merge ----
  r = await call('/auth/otp', { method: 'POST', body: { phone: '07701239999', purpose: 'register' } });
  r = await call('/auth/register', { method: 'POST', body: { name: 'Merge', phone: '07701239999', password: 'secret1', code: r.data.dev_code } });
  const U = r.data.token; check('customer registered', !!U, r);
  await call('/cart/sync', { method: 'POST', token: U, body: { items: [{ id: CASE.id, qty: 2 }] } });
  r = await call('/cart/merge', { method: 'POST', token: U, body: { items: [{ id: CASE.id, qty: 4 }, { id: UP.id, qty: 3 }, { id: 999999, qty: 1 }] } });
  const caseLine = r.data.items.find((i) => i.id === CASE.id); const upLine = r.data.items.find((i) => i.id === UP.id);
  check('merge sums and caps to stock (case 2+4 → 5)', caseLine?.qty === 5, r.data);
  check('merge caps used phone to 1', upLine?.qty === 1, r.data);
  check('merge notices: reduced + unavailable', r.data.notices.filter((n) => n.reason === 'reduced').length === 2 && r.data.notices.some((n) => n.reason === 'unavailable'), r.data.notices);
  check('merge totals in IQD', r.data.subtotal === 5 * 15000 + 650000 && r.data.currency === 'IQD', r.data.subtotal);
  r = await call('/cart/merge', { method: 'POST', token: U, body: { items: [] } });
  check('saved cart is kept after merge', r.data.items.length === 2, r.data.items.length);
  r = await call('/wishlist/merge', { method: 'POST', token: U, body: { ids: [UP.id, S24.id, 999999, 'x'] } });
  check('wishlist merge skips unknown', r.data.ids.length === 2 && r.data.ids.includes(UP.id), r.data);
  r = await call('/wishlist/toggle', { method: 'POST', token: U, body: { product_id: S24.id } });
  check('wishlist toggle off', r.data.on === false && !r.data.ids.includes(S24.id), r.data);
  r = await call('/wishlist/toggle', { method: 'POST', token: U, body: { product_id: S24.id } });
  check('wishlist toggle on', r.data.on === true, r.data);
  r = await call('/wishlist', { token: U }); check('GET /wishlist', r.data.ids.length === 2, r.data);
  r = await call('/wishlist'); check('wishlist needs sign-in', r.status === 401, r.status);

  // ---- F5 cache ----
  r = await call('/admin/cache', { token: A }); check('cache stats', typeof r.data.files === 'number' && r.data.writable === true, r.data);
  await call('/categories'); await call('/products?flash=1&limit=12');
  r = await call('/admin/cache', { token: A }); const before = r.data.files;
  check('cache has files', before >= 2, r.data);
  r = await call('/products?used=1');
  const n1 = r.data.length;
  await call(`/admin/products/${UP.id}`, { method: 'PUT', token: A, body: { ...UP, active: false } });
  r = await call('/products?used=1');
  check('admin edit invalidates cached list', r.data.length === n1 - 1, [n1, r.data.length]);
  r = await call('/settings'); const nm = r.data.store_name;
  await call('/admin/settings', { method: 'PUT', token: A, body: { store_name: 'Cached Test' } });
  r = await call('/settings'); check('settings change invalidates cache', r.data.store_name === 'Cached Test', r.data.store_name);
  await call('/admin/settings', { method: 'PUT', token: A, body: { store_name: nm } });
  await call('/categories');
  r = await call('/admin/cache/clear', { method: 'POST', token: A }); check('clear cache', r.data.files === 0 && r.data.cleared >= 1, r.data);
  r = await call('/admin/cache/clear', { method: 'POST' }); check('clear cache is staff only', r.status === 403 || r.status === 401, r.status);

  // ---- trade-in → used listing ----
  r = await call('/tradein/models'); const M = r.data.models[0];
  r = await call('/tradein/quote', { method: 'POST', body: { model_id: M.id, answers: { screen: 'perfect', body: 'scratches', battery: 'good', works: 'yes', box: 'yes' } } });
  check('trade-in quote', r.data.estimate > 0, r.data);
  const order = await call('/orders', { method: 'POST', token: U, body: { items: [{ id: S24.id, qty: 1 }], city: 'هەولێر', address: 'x', tradein: { model_id: M.id, answers: { screen: 'perfect', body: 'scratches', battery: 'good', works: 'yes', box: 'yes' } } } });
  r = await call('/admin/tradeins', { token: A }); const T = r.data[0];
  check('trade-in attached to order', !!T && T.status === 'pending', order.data);
  if (T) {
    r = await call(`/admin/tradeins/${T.id}/list-used`, { method: 'POST', token: A }); check('pending trade-in cannot be listed', r.status === 422 && r.data.error === 'tradein_not_accepted', r);
    await call(`/admin/tradeins/${T.id}`, { method: 'PUT', token: A, body: { status: 'accepted', imei: '351234567890123' } });
    r = await call(`/admin/tradeins/${T.id}/list-used`, { method: 'POST', token: A });
    const D = r.data.product;
    check('draft used product from trade-in', D && D.is_used === true && D.active === false && D.condition_grade === 'B' && D.has_box === true && D.stock === 1 && D.price % 5000 === 0, D);
    r = await call(`/admin/tradeins/${T.id}/list-used`, { method: 'POST', token: A });
    check('listing twice returns the same draft', r.data.product_id === D.id, r.data.product_id);
  }
  console.log(`\n${ok} passed, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
