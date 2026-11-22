// Database layer: SQLite via Node's built-in node:sqlite (no native build needed).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'store.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer',
  wallet INTEGER NOT NULL DEFAULT 0,
  referral_code TEXT UNIQUE,
  referred_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  referral_paid INTEGER NOT NULL DEFAULT 0,
  avatar TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  city TEXT NOT NULL,
  area TEXT,
  details TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  name_ku TEXT NOT NULL,
  name_ar TEXT,
  name_en TEXT,
  image TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name_ku TEXT NOT NULL,
  name_ar TEXT,
  name_en TEXT,
  desc_ku TEXT,
  desc_ar TEXT,
  desc_en TEXT,
  brand TEXT,
  price INTEGER NOT NULL,
  old_price INTEGER,
  stock INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  images TEXT NOT NULL DEFAULT '[]',
  featured INTEGER NOT NULL DEFAULT 0,
  trending INTEGER NOT NULL DEFAULT 0,
  flash_sale INTEGER NOT NULL DEFAULT 0,
  sold INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS banners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tag_ku TEXT, tag_ar TEXT, tag_en TEXT,
  title_ku TEXT, title_ar TEXT, title_en TEXT,
  subtitle_ku TEXT, subtitle_ar TEXT, subtitle_en TEXT,
  image TEXT,
  link TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT NOT NULL,
  note TEXT,
  subtotal INTEGER NOT NULL,
  delivery_fee INTEGER NOT NULL,
  wallet_used INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT NOT NULL DEFAULT 'cod',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  image TEXT,
  price INTEGER NOT NULL,
  qty INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
`);


// ---------- migrations (safe to run on every start) ----------
function addColumn(table, col, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
addColumn('users', 'blocked', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'block_reason', 'TEXT');
addColumn('users', 'totp_secret', 'TEXT');
addColumn('users', 'totp_enabled', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'admin_note', 'TEXT');
addColumn('order_items', 'variant_id', 'INTEGER');
addColumn('order_items', 'variant_label', 'TEXT');
addColumn('orders', 'admin_note', 'TEXT');
addColumn('products', 'usd_priced', 'INTEGER NOT NULL DEFAULT 0');
addColumn('products', 'price_usd', 'REAL');
addColumn('products', 'old_price_usd', 'REAL');
addColumn('products', 'search_text', 'TEXT');
addColumn('orders', 'source', 'TEXT');
addColumn('orders', 'utm', 'TEXT');
addColumn('orders', 'coupon_code', 'TEXT');
addColumn('orders', 'discount', 'INTEGER NOT NULL DEFAULT 0');
addColumn('products', 'cost_price', 'INTEGER');
addColumn('products', 'specs', "TEXT NOT NULL DEFAULT '[]'");
addColumn('products', 'bundle_ids', "TEXT NOT NULL DEFAULT '[]'");
addColumn('order_items', 'cost', 'INTEGER');
addColumn('orders', 'cashback', 'INTEGER NOT NULL DEFAULT 0');
addColumn('products', 'attrs', "TEXT NOT NULL DEFAULT '{}'");
addColumn('orders', 'tradein_id', 'INTEGER');
addColumn('orders', 'tradein_credit', 'INTEGER NOT NULL DEFAULT 0');
db.exec(`
CREATE TABLE IF NOT EXISTS tradein_models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  storage_gb INTEGER NOT NULL,
  base_price INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tradeins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  order_id INTEGER,
  model_id INTEGER,
  label TEXT NOT NULL,
  answers TEXT NOT NULL,
  estimate INTEGER NOT NULL,
  final_value INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  imei TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);
db.exec(`
CREATE TABLE IF NOT EXISTS product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  price INTEGER NOT NULL,
  old_price INTEGER,
  stock INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
CREATE TABLE IF NOT EXISTS auth_failures (
  key TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_failures ON auth_failures(key, ts);
CREATE TABLE IF NOT EXISTS login_tickets (
  ticket TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  owner TEXT,
  type TEXT NOT NULL DEFAULT 'percent',
  value INTEGER NOT NULL,
  max_discount INTEGER,
  min_order INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER,
  uses INTEGER NOT NULL DEFAULT 0,
  once_per_customer INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS admin_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  user_name TEXT,
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

addColumn('product_variants', 'price_usd', 'REAL');
addColumn('product_variants', 'old_price_usd', 'REAL');
addColumn('product_variants', 'cost_price', 'INTEGER');
db.exec(`
CREATE TABLE IF NOT EXISTS carts (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  items TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  reminded_at TEXT
);
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  category TEXT NOT NULL,
  amount INTEGER NOT NULL,
  note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER,
  variant_id INTEGER,
  product_name TEXT,
  variant_label TEXT,
  delta INTEGER NOT NULL,
  stock_after INTEGER,
  reason TEXT NOT NULL,
  ref TEXT,
  user_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_stock_mov_product ON stock_movements(product_id);
CREATE TABLE IF NOT EXISTS page_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  visitor TEXT NOT NULL,
  path TEXT,
  product_id INTEGER,
  src TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_page_views_day ON page_views(day);
CREATE TABLE IF NOT EXISTS faqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  q_ku TEXT NOT NULL, q_ar TEXT, q_en TEXT,
  a_ku TEXT NOT NULL, a_ar TEXT, a_en TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_ku TEXT NOT NULL, name_ar TEXT, name_en TEXT,
  color TEXT NOT NULL DEFAULT '#8B5CF6'
);
CREATE TABLE IF NOT EXISTS product_tags (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, tag_id)
);
`);

// ---------- helpers ----------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64);
  const real = Buffer.from(hash, 'hex');
  return real.length === test.length && crypto.timingSafeEqual(real, test);
}
function newReferralCode() {
  for (;;) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 8);
    if (!db.prepare('SELECT 1 FROM users WHERE referral_code = ?').get(code)) return code;
  }
}
function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
function getSettings() {
  const out = {};
  for (const r of db.prepare('SELECT key, value FROM settings').all()) out[r.key] = r.value;
  return out;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value == null ? '' : String(value));
}

// ---------- placeholder product art (SVG) ----------
function productSvg(kind, c1, c2, label) {
  const shapes = {
    phone: `<rect x="120" y="50" width="160" height="300" rx="28" fill="#1A1D2E"/><rect x="130" y="62" width="140" height="276" rx="20" fill="url(#g)"/><rect x="180" y="70" width="40" height="8" rx="4" fill="#1A1D2E"/>`,
    case: `<rect x="120" y="50" width="160" height="300" rx="32" fill="url(#g)"/><rect x="140" y="70" width="58" height="70" rx="16" fill="#1A1D2E" opacity=".85"/><circle cx="158" cy="90" r="9" fill="#555"/><circle cx="180" cy="120" r="9" fill="#555"/>`,
    charger: `<rect x="140" y="110" width="120" height="120" rx="22" fill="url(#g)"/><rect x="170" y="70" width="12" height="44" rx="4" fill="#bbb"/><rect x="218" y="70" width="12" height="44" rx="4" fill="#bbb"/><path d="M200 230 C200 300 260 290 260 350" stroke="#1A1D2E" stroke-width="12" fill="none" stroke-linecap="round"/>`,
    cable: `<path d="M110 120 C200 20 260 380 300 260" stroke="url(#g)" stroke-width="18" fill="none" stroke-linecap="round"/><rect x="90" y="100" width="40" height="60" rx="8" fill="#1A1D2E"/><rect x="285" y="250" width="34" height="56" rx="8" fill="#1A1D2E"/>`,
    earbuds: `<ellipse cx="200" cy="230" rx="110" ry="80" fill="url(#g)"/><circle cx="160" cy="150" r="34" fill="#fff" stroke="#ddd" stroke-width="4"/><rect x="152" y="160" width="16" height="70" rx="8" fill="#fff" stroke="#ddd" stroke-width="4"/><circle cx="240" cy="150" r="34" fill="#fff" stroke="#ddd" stroke-width="4"/><rect x="232" y="160" width="16" height="70" rx="8" fill="#fff" stroke="#ddd" stroke-width="4"/>`,
    headphones: `<path d="M110 230 C110 80 290 80 290 230" stroke="#1A1D2E" stroke-width="20" fill="none"/><rect x="85" y="210" width="60" height="100" rx="24" fill="url(#g)"/><rect x="255" y="210" width="60" height="100" rx="24" fill="url(#g)"/>`,
    powerbank: `<rect x="130" y="60" width="140" height="280" rx="24" fill="url(#g)"/><rect x="185" y="300" width="30" height="10" rx="4" fill="#1A1D2E"/><circle cx="170" cy="110" r="5" fill="#fff"/><circle cx="190" cy="110" r="5" fill="#fff"/><circle cx="210" cy="110" r="5" fill="#fff"/><circle cx="230" cy="110" r="5" fill="#fff" opacity=".4"/>`,
    watch: `<rect x="165" y="40" width="70" height="320" rx="20" fill="#1A1D2E"/><rect x="130" y="120" width="140" height="160" rx="36" fill="#1A1D2E"/><rect x="142" y="132" width="116" height="136" rx="28" fill="url(#g)"/><rect x="270" y="170" width="12" height="40" rx="5" fill="#888"/>`,
    glass: `<rect x="120" y="50" width="160" height="300" rx="28" fill="url(#g)" opacity=".55"/><path d="M140 80 L200 80 L140 160 Z" fill="#fff" opacity=".6"/><rect x="120" y="50" width="160" height="300" rx="28" fill="none" stroke="#fff" stroke-width="6"/>`,
    car: `<rect x="150" y="90" width="100" height="170" rx="18" fill="#1A1D2E"/><rect x="158" y="100" width="84" height="150" rx="12" fill="url(#g)"/><rect x="190" y="260" width="20" height="60" fill="#555"/><rect x="150" y="315" width="100" height="24" rx="10" fill="#333"/>`,
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="400" height="400" fill="#F4F5F8"/>${shapes[kind] || shapes.phone}<text x="200" y="385" font-family="Arial" font-size="20" font-weight="700" text-anchor="middle" fill="#9AA0AE">${label}</text></svg>`;
}
function writeSeedImage(name, svg) {
  fs.writeFileSync(path.join(UPLOAD_DIR, name), svg);
  return `/uploads/${name}`;
}

// ---------- seed ----------
function seed() {
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) return;
  console.log('Seeding database with demo data...');

  const defaults = {
    store_name: 'Raman Mobile',
    delivery_fee: '5000',
    free_delivery_over: '100000',
    referral_reward: '5000',
    flash_sale_end: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
    search_tags: 'iPhone,Samsung,AirPods,Charger,Power Bank',
    cities: 'هەولێر,سلێمانی,دهۆک,کەرکوک,هەڵەبجە,بەغدا',
    whatsapp: '9647500000000',
    instagram: 'https://instagram.com/',
    facebook: 'https://facebook.com/',
    tiktok: 'https://tiktok.com/',
    support_phone: '07500000000',
  };
  for (const [k, v] of Object.entries(defaults)) setSetting(k, v);

  const adminPhone = process.env.ADMIN_PHONE || '07500000000';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  db.prepare('INSERT INTO users(name, phone, password_hash, role, referral_code) VALUES(?,?,?,?,?)')
    .run('Admin', adminPhone, hashPassword(adminPass), 'admin', newReferralCode());

  const insCat = db.prepare('INSERT INTO categories(parent_id, name_ku, name_ar, name_en, image, sort) VALUES(?,?,?,?,?,?)');
  const cats = {};
  const catDefs = [
    ['phones', 'مۆبایل', 'موبايلات', 'Phones', 'phone', '#5B8DEF', '#A06CF0', [
      ['iphone', 'ئایفۆن', 'آيفون', 'iPhone'], ['samsung', 'سامسۆنگ', 'سامسونج', 'Samsung'], ['xiaomi', 'شاومی', 'شاومي', 'Xiaomi']]],
    ['chargers', 'شەحن و وایەر', 'شواحن وكيبلات', 'Chargers & Cables', 'charger', '#F0904A', '#EE6C2D', [
      ['wall', 'شەحنی دیوار', 'شواحن جدارية', 'Wall Chargers'], ['cables', 'وایەر', 'كيبلات', 'Cables'], ['wireless', 'شەحنی بێوایەر', 'شحن لاسلكي', 'Wireless Chargers']]],
    ['audio', 'هێدفۆن و ئێرپۆد', 'سماعات', 'Earphones', 'earbuds', '#34C3A0', '#2A8CD8', [
      ['earbuds', 'ئێرپۆد', 'سماعات لاسلكية', 'Earbuds'], ['headphones', 'هێدفۆن', 'سماعات رأس', 'Headphones']]],
    ['cases', 'کەڤەر و پاراستن', 'كفرات وحماية', 'Cases & Protection', 'case', '#F06C9B', '#F0A04A', [
      ['covers', 'کەڤەر', 'كفرات', 'Cases'], ['glass', 'شاشەی پاراستن', 'شاشات حماية', 'Screen Protectors']]],
    ['power', 'پاوەر بانک', 'باور بانك', 'Power Banks', 'powerbank', '#2A2F45', '#5B6380', []],
    ['watches', 'کاتژمێری زیرەک', 'ساعات ذكية', 'Smart Watches', 'watch', '#7C5CFA', '#2AC0E0', []],
    ['car', 'ئەکسسواری ئۆتۆمبێل', 'إكسسوارات السيارة', 'Car Accessories', 'car', '#E04A4A', '#F0904A', []],
  ];
  catDefs.forEach(([key, ku, ar, en, kind, c1, c2, subs], i) => {
    const img = writeSeedImage(`cat-${key}.svg`, productSvg(kind, c1, c2, ''));
    const id = Number(insCat.run(null, ku, ar, en, img, i).lastInsertRowid);
    cats[key] = id;
    subs.forEach(([sk, sku, sar, sen], j) => {
      cats[`${key}.${sk}`] = Number(insCat.run(id, sku, sar, sen, null, j).lastInsertRowid);
    });
  });

  const insProd = db.prepare(`INSERT INTO products(category_id, name_ku, name_ar, name_en, desc_ku, desc_ar, desc_en, brand,
    price, old_price, stock, image, featured, trending, flash_sale, sold) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const P = [
    ['phones.iphone', 'ئایفۆن ١٦ پرۆ ماکس ٢٥٦ گێگا', 'آيفون 16 برو ماكس 256 جيجا', 'iPhone 16 Pro Max 256GB', 'Apple', 1850000, 1950000, 8, 'phone', '#C9B79C', '#8A7A66', 1, 1, 0, 34],
    ['phones.iphone', 'ئایفۆن ١٥ ١٢٨ گێگا', 'آيفون 15 128 جيجا', 'iPhone 15 128GB', 'Apple', 1150000, null, 12, 'phone', '#F5B5C8', '#E58AA6', 0, 0, 0, 51],
    ['phones.samsung', 'سامسۆنگ گالاکسی S24 ئەڵترا', 'سامسونج جالكسي S24 الترا', 'Samsung Galaxy S24 Ultra', 'Samsung', 1450000, 1600000, 5, 'phone', '#6C7A89', '#2C3440', 1, 0, 0, 22],
    ['phones.samsung', 'سامسۆنگ گالاکسی A55', 'سامسونج جالكسي A55', 'Samsung Galaxy A55', 'Samsung', 520000, null, 20, 'phone', '#A8D8F0', '#5B8DEF', 0, 1, 0, 64],
    ['phones.xiaomi', 'شاومی ڕێدمی نۆت ١٣ پرۆ', 'شاومي ريدمي نوت 13 برو', 'Xiaomi Redmi Note 13 Pro', 'Xiaomi', 340000, 375000, 0, 'phone', '#A06CF0', '#5B3FD0', 0, 0, 0, 80],
    ['chargers.wall', 'شەحنی خێرای ٢٠ وات USB-C', 'شاحن سريع 20 واط USB-C', '20W USB-C Fast Charger', 'Apple', 25000, 30000, 40, 'charger', '#FFFFFF', '#DADDE5', 1, 0, 1, 120],
    ['chargers.wall', 'شەحنی سامسۆنگ ٤٥ وات', 'شاحن سامسونج 45 واط', 'Samsung 45W Super Fast Charger', 'Samsung', 35000, null, 3, 'charger', '#2A2F45', '#1A1D2E', 0, 1, 0, 45],
    ['chargers.cables', 'وایەری Type-C بۆ لایتنینگ ١ مەتر', 'كيبل Type-C إلى لايتنينغ 1 متر', 'USB-C to Lightning Cable 1m', 'Anker', 12000, 15000, 60, 'cable', '#F0904A', '#EE6C2D', 0, 0, 1, 210],
    ['chargers.wireless', 'شەحنی بێوایەری MagSafe', 'شاحن ماغ سيف لاسلكي', 'MagSafe Wireless Charger', 'Apple', 45000, null, 15, 'charger', '#E8ECF2', '#B8C2D0', 1, 0, 0, 30],
    ['audio.earbuds', 'ئێرپۆدس پرۆ ٢', 'إيربودز برو 2', 'AirPods Pro 2', 'Apple', 285000, 320000, 10, 'earbuds', '#FFFFFF', '#E6E9EF', 1, 1, 0, 95],
    ['audio.earbuds', 'گالاکسی بادز ٣', 'جالكسي بودز 3', 'Galaxy Buds 3', 'Samsung', 165000, null, 7, 'earbuds', '#C9CED8', '#8F97A8', 0, 0, 0, 18],
    ['audio.headphones', 'هێدفۆنی JBL Tune 520BT', 'سماعة JBL Tune 520BT', 'JBL Tune 520BT Headphones', 'JBL', 60000, 70000, 14, 'headphones', '#2A8CD8', '#1A5FA8', 0, 1, 1, 40],
    ['cases.covers', 'کەڤەری سیلیکۆن ئایفۆن ١٦', 'كفر سيليكون آيفون 16', 'iPhone 16 Silicone Case', 'Apple', 15000, 20000, 50, 'case', '#F06C9B', '#C8457A', 0, 0, 1, 150],
    ['cases.glass', 'شاشەی پاراستنی ٩D', 'شاشة حماية 9D', '9D Tempered Glass', 'Generic', 5000, null, 200, 'glass', '#A8D8F0', '#5B8DEF', 0, 1, 0, 320],
    ['power', 'پاوەر بانکی Anker ٢٠٠٠٠ mAh', 'باور بانك انكر 20000 mAh', 'Anker Power Bank 20000mAh', 'Anker', 55000, 65000, 25, 'powerbank', '#2A2F45', '#5B6380', 1, 0, 0, 70],
    ['watches', 'ئەپڵ واچ سیریس ١٠', 'ساعة ابل سيريس 10', 'Apple Watch Series 10', 'Apple', 520000, null, 6, 'watch', '#F0904A', '#EE6C2D', 1, 0, 0, 12],
    ['watches', 'سامسۆنگ گالاکسی واچ ٧', 'سامسونج جالكسي واتش 7', 'Galaxy Watch 7', 'Samsung', 320000, 350000, 9, 'watch', '#7C5CFA', '#2AC0E0', 0, 0, 0, 9],
    ['car', 'هۆڵدەری مۆبایل بۆ ئۆتۆمبێل', 'حامل موبايل للسيارة', 'Magnetic Car Phone Holder', 'Baseus', 18000, 22000, 30, 'car', '#E04A4A', '#F0904A', 0, 0, 0, 55],
  ];
  P.forEach((p, i) => {
    const [cat, ku, ar, en, brand, price, old, stock, kind, c1, c2, featured, trending, flash, sold] = p;
    const img = writeSeedImage(`p${i + 1}.svg`, productSvg(kind, c1, c2, brand));
    const desc = [`${ku} — ئۆریجیناڵ، بە گەرەنتی.`, `${ar} — أصلي مع ضمان.`, `${en} — 100% original with warranty.`];
    insProd.run(cats[cat], ku, ar, en, desc[0], desc[1], desc[2], brand, price, old, stock, img, featured, trending, flash, sold);
  });

  const insBanner = db.prepare(`INSERT INTO banners(tag_ku, tag_ar, tag_en, title_ku, title_ar, title_en, subtitle_ku, subtitle_ar, subtitle_en, image, link, sort)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
  const b1 = writeSeedImage('banner1.svg', bannerSvg('#2A2F45', '#5B6380', 'phone'));
  const b2 = writeSeedImage('banner2.svg', bannerSvg('#EE6C2D', '#F0A04A', 'earbuds'));
  insBanner.run('نوێ', 'جديد', 'New', 'ئایفۆن ١٦ گەیشت', 'وصل آيفون 16', 'iPhone 16 is here', 'باشترین نرخ لە کوردستان', 'أفضل سعر في كردستان', 'Best price in town', b1, '#/category/' + cats.phones, 0);
  insBanner.run('پرفرۆشترین', 'الأكثر مبيعاً', 'Best seller', 'دەنگی ڕوون، بێوایەر', 'صوت نقي، لاسلكي', 'Pure sound, no wires', 'ئێرپۆد و هێدفۆن بە داشکاندن', 'سماعات بخصومات', 'Earbuds & headphones on sale', b2, '#/category/' + cats.audio, 1);
}
function bannerSvg(c1, c2, kind) {
  const inner = productSvg(kind, '#ffffff', '#dfe3ea', '').replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '').replace('<rect width="400" height="400" fill="#F4F5F8"/>', '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 360"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="900" height="360" fill="url(#bg)"/><circle cx="160" cy="60" r="160" fill="#fff" opacity=".07"/><circle cx="800" cy="330" r="120" fill="#fff" opacity=".06"/><g transform="translate(40 10) scale(.85)">${inner}</g></svg>`;
}

seed();
for (const [k, v] of Object.entries({ max_pending_orders: '2', confirm_over: '1000000', usd_rate: '', usd_round: '250', store_address: '', store_map_url: '', exchange_days: '3', warranty_text: '',
  slogan: '', seo_description: '', maintenance_mode: '0', maintenance_message: '', price_display: 'iqd', min_profit: '0', cashback_percent: '0',
  tradein_enabled: '1',
  tradein_rules: JSON.stringify({ screen: { perfect: 0, scratches: 10, cracked: 35 }, body: { perfect: 0, scratches: 8, damaged: 20 }, battery: { good: 0, ok: 8, weak: 15 }, works: { yes: 0, no: 30 }, box: { yes: 0, no: 3 } }),
  variant_presets: JSON.stringify([{ name: 'Storage', values: ['64GB', '128GB', '256GB', '512GB', '1TB'] }, { name: 'Color', values: ['Black', 'White', 'Blue', 'Gold', 'Silver'] }]) })) {
  if (db.prepare('SELECT 1 FROM settings WHERE key = ?').get(k) == null) setSetting(k, v);
}
if (db.prepare('SELECT COUNT(*) n FROM faqs').get().n === 0 && db.prepare("SELECT value FROM settings WHERE key = 'faq_seeded'").get() == null) {
  const ins = db.prepare('INSERT INTO faqs(q_ku, q_ar, q_en, a_ku, a_ar, a_en, sort) VALUES(?,?,?,?,?,?,?)');
  ins.run('بەرهەمەکان ئۆریجیناڵن؟', 'هل المنتجات أصلية؟', 'Are the products original?', 'بەڵێ، هەموو بەرهەمەکان ئۆریجیناڵن و گەرەنتییان هەیە.', 'نعم، كل المنتجات أصلية ومع ضمان.', 'Yes, all products are 100% original with warranty.', 0);
  ins.run('پارەدان چۆنە؟', 'كيف أدفع؟', 'How do I pay?', 'پارە لە کاتی گەیشتنی کاڵاکە دەدەیت.', 'تدفع عند استلام الطلب.', 'You pay cash when the order arrives.', 1);
  ins.run('گەیاندن چەند دەخایەنێت؟', 'كم يستغرق التوصيل؟', 'How long does delivery take?', 'بەپێی شار؛ لە پەڕەی تەواوکردنی داواکاری دەیبینیت.', 'حسب المدينة، يظهر لك عند إتمام الطلب.', 'It depends on the city — you will see it at checkout.', 2);
  setSetting('faq_seeded', '1');
}
if (db.prepare('SELECT COUNT(*) n FROM tradein_models').get().n === 0 && db.prepare("SELECT value FROM settings WHERE key = 'tradein_seeded'").get() == null) {
  // Demo prices (IQD, good condition) — the shop owner must replace them with real market prices.
  const ins = db.prepare('INSERT INTO tradein_models(brand, model, storage_gb, base_price, sort) VALUES(?,?,?,?,?)');
  const list = [
    ['Apple', 'iPhone 11', 64, 260000], ['Apple', 'iPhone 11', 128, 290000], ['Apple', 'iPhone 12', 128, 380000], ['Apple', 'iPhone 13', 128, 500000],
    ['Apple', 'iPhone 13 Pro Max', 256, 720000], ['Apple', 'iPhone 14', 128, 600000], ['Apple', 'iPhone 14 Pro Max', 256, 950000], ['Apple', 'iPhone 15', 128, 780000], ['Apple', 'iPhone 15 Pro Max', 256, 1200000],
    ['Samsung', 'Galaxy A34', 128, 190000], ['Samsung', 'Galaxy A54', 128, 260000], ['Samsung', 'Galaxy S22 Ultra', 256, 520000], ['Samsung', 'Galaxy S23 Ultra', 256, 750000], ['Samsung', 'Galaxy S24 Ultra', 256, 1000000],
    ['Xiaomi', 'Redmi Note 12', 128, 120000], ['Xiaomi', 'Redmi Note 13 Pro', 256, 210000],
  ];
  list.forEach(([b, m, st, p], i) => ins.run(b, m, st, p, i));
  const attrs = {
    1: { os: 'ios', tier: 'flagship', ram: 8, storage: 256, battery: 4685, camera: 48, screen: 6.9, charging: 30, g5: true },
    2: { os: 'ios', tier: 'upper', ram: 6, storage: 128, battery: 3349, camera: 48, screen: 6.1, charging: 20, g5: true },
    3: { os: 'android', tier: 'flagship', ram: 12, storage: 256, battery: 5000, camera: 200, screen: 6.8, charging: 45, g5: true },
    4: { os: 'android', tier: 'mid', ram: 8, storage: 128, battery: 5000, camera: 50, screen: 6.6, charging: 25, g5: true },
    5: { os: 'android', tier: 'mid', ram: 8, storage: 256, battery: 5100, camera: 200, screen: 6.67, charging: 67, g5: false },
  };
  for (const [id, a] of Object.entries(attrs)) db.prepare("UPDATE products SET attrs = ? WHERE id = ? AND attrs = '{}'").run(JSON.stringify(a), Number(id));
  setSetting('tradein_seeded', '1');
}
// Delivery zones: [{ name, fee }]. Built once from the old comma-separated "cities" list.
if (db.prepare("SELECT 1 FROM settings WHERE key = 'delivery_zones'").get() == null) {
  const st = getSettings();
  const zones = String(st.cities || '').split(',').map((c) => c.trim()).filter(Boolean).map((name) => ({ name, fee: parseInt(st.delivery_fee || '0', 10) || 0 }));
  setSetting('delivery_zones', JSON.stringify(zones));
}

module.exports = { db, tx, hashPassword, verifyPassword, newReferralCode, getSettings, setSetting, UPLOAD_DIR, DATA_DIR };
