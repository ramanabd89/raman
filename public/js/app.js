/* Storefront SPA — vanilla JS, hash routing, no build step. */
(() => {
  'use strict';

  // ---------------- icons ----------------
  const I = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    basket: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.6 2.7a1 1 0 0 1 .4 1.4L7.7 8h8.6L14 4.1a1 1 0 1 1 1.7-1l2.9 4.9H21a1 1 0 0 1 1 1.2l-1.9 9.3A3 3 0 0 1 17.2 21H6.8a3 3 0 0 1-2.9-2.5L2 9.2A1 1 0 0 1 3 8h2.4l2.9-4.9a1 1 0 0 1 1.3-.4ZM9 12a1 1 0 0 0-1 1v3a1 1 0 1 0 2 0v-3a1 1 0 0 0-1-1Zm3 0a1 1 0 0 0-1 1v3a1 1 0 1 0 2 0v-3a1 1 0 0 0-1-1Zm3 0a1 1 0 0 0-1 1v3a1 1 0 1 0 2 0v-3a1 1 0 0 0-1-1Z"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M5 12h14"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
    chevR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5m6-6-6 6 6 6"/></svg>',
    fire: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2s5 4.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 1-3.5S9 11 11 11c0-4 1-9 1-9Zm0 20a7 7 0 0 0 7-7c0-1.5-.4-2.8-1-4 0 0-1 7-6 7s-5-3-5-3a7 7 0 0 0 5 7Z"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 3 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3l-6.2 3.3 1.4-6.8L2 9.1l7-.8L12 2Z"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/></svg>',
    sortUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 20V4m0 0L3 7m3-3 3 3M13 6h8M13 11h6M13 16h4"/></svg>',
    sortDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 4v16m0 0-3-3m3 3 3-3M13 6h4M13 11h6M13 16h8"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 7.5 7 4h4l-1.5 4H3V7.5ZM21 7.5 17 4h-4l1.5 4H21V7.5ZM3 10h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8Zm6 3a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2H9Z"/></svg>',
    bag: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 7V6a4 4 0 1 1 8 0v1h2a1 1 0 0 1 1 .9l1 12A2 2 0 0 1 18 22H6a2 2 0 0 1-2-2.1l1-12A1 1 0 0 1 6 7h2Zm2 0h4V6a2 2 0 1 0-4 0v1Z"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.3 2.3a1 1 0 0 1 1.4 0l9 8.5A1 1 0 0 1 21 12.5h-1V20a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-7.5H3a1 1 0 0 1-.7-1.7l9-8.5Z"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2 4a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm4 0a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-8Zm-4 4a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm4 0a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-8Zm-4 4a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm4 0a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-8Z"/></svg>',
    shapes: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 17 10H7l5-8Z"/><circle cx="7" cy="17" r="5"/><rect x="13" y="12" width="9" height="10" rx="2"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9"/></svg>',
    gift: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 7h-2.2A3 3 0 0 0 12 3.8 3 3 0 0 0 6.2 7H4a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h7V7h2v5h7a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1ZM9 7a1 1 0 1 1 1-1v1H9Zm6 0h-1V6a1 1 0 1 1 1 1ZM4 14v5a2 2 0 0 0 2 2h5v-7H4Zm9 7h5a2 2 0 0 0 2-2v-5h-7v7Z"/></svg>',
    map: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Z"/></svg>',
    headset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5" fill="currentColor"/><rect x="17" y="14" width="4" height="6" rx="1.5" fill="currentColor"/></svg>',
    money: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 3h6l-1.5 3h-3L9 3Zm1.5 4h3C17 9 20 13 20 16.5 20 19.5 17.5 21 12 21s-8-1.5-8-4.5C4 13 7 9 10.5 7Zm2.2 4h-1.4v.8c-1 .2-1.8.9-1.8 1.9 0 1.2 1 1.6 2 1.9.8.2 1 .4 1 .7 0 .3-.3.5-.8.5-.6 0-1-.3-1.2-.7l-1.2.5c.3.8 1 1.3 2 1.4v.8h1.4v-.8c1-.2 1.8-.9 1.8-2 0-1.2-1-1.6-2-1.8-.8-.2-1-.4-1-.7 0-.3.3-.5.8-.5s.8.2 1 .6l1.2-.5c-.3-.7-.9-1.1-1.8-1.3V11Z"/></svg>',
    wallet: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 5h14a2 2 0 0 1 2 2v1h-5a4 4 0 0 0 0 8h5v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm11 5h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-6a2 2 0 1 1 0-4Z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.6 14.2c-.2.7-1.4 1.3-2 1.3-.5.1-1.2.1-1.9-.1-.4-.1-1-.3-1.7-.6-3-1.3-5-4.4-5.1-4.6-.2-.2-1.2-1.6-1.2-3s.8-2.2 1-2.5c.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .7.5l1 2.3c.1.2.1.4 0 .6l-.3.5-.5.5c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.7-.1l1-1.2c.2-.3.4-.3.7-.2l2.2 1c.3.2.5.2.6.4 0 0 0 .7-.2 1.4Z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-1.6 19.9V14.9H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 12 2Z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 2h-3.3v13.2a2.9 2.9 0 1 1-2-2.8V9a6.2 6.2 0 1 0 5.3 6.2V8.6a7.6 7.6 0 0 0 4.4 1.4V6.7a4.4 4.4 0 0 1-4.4-4.7Z"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm1 5h-2v6l5 3 1-1.7-4-2.3V7Z"/></svg>',
    truck: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1h2.6a2 2 0 0 1 1.7 1l1.5 2.6c.1.3.2.6.2.9V16a2 2 0 0 1-2 2h-.3a3 3 0 0 1-5.4 0H9.7a3 3 0 0 1-5.4 0H4a2 2 0 0 1-2-2V6Zm14 3v3h4.2l-1.6-3H16ZM7 16a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm10 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm4.3 6.3-5.6 5.6-2.3-2.3-1.4 1.4 3.7 3.7 7-7-1.4-1.4Z"/></svg>',
    xCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25c1.1.37 2.3.57 3.6.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.3.2 2.5.57 3.6a1 1 0 0 1-.25 1l-2.2 2.2Z"/></svg>',
    wand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m3 21 12-12M15 4V2M15 10V8M19 6h2M9 6h2M18 3l1-1M18 9l1 1"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
    admin: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z"/></svg>',
  };

  // ---------------- state ----------------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };
  const S = {
    lang: store.get('lang', 'ku'),
    token: store.get('token', null),
    user: store.get('user', null),
    cart: store.get('cart', []), // [{id, qty, name_ku, name_ar, name_en, price, image, stock}]
    settings: {},
    categories: [],
    sort: 'foryou',
    activeCat: null,
  };
  const $ = (s, r = document) => r.querySelector(s);
  const app = $('#app');

  // ---------------- helpers ----------------
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = (k, vars) => {
    let s = (I18N[S.lang] && I18N[S.lang][k]) ?? I18N.ku[k] ?? k;
    if (vars) for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, b);
    return s;
  };
  const L = (obj, field) => obj[`${field}_${S.lang}`] || obj[`${field}_ku`] || obj[`${field}_en`] || '';
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const money = (n) => `<span class="price"><span class="num">${fmt(n)}</span><small>${T('currency')}</small></span>`;
  const safeUrl = (u) => (/^(https?:\/\/|\/|#)/i.test(String(u || '')) ? String(u) : '');
  const img = (u) => esc(safeUrl(u) || '/img/placeholder.svg');
  const dateFmt = (d) => { try { return new Date(d.replace(' ', 'T') + 'Z').toLocaleDateString(S.lang === 'en' ? 'en-GB' : 'ar-IQ', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return d; } };

  async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (S.token) headers.Authorization = `Bearer ${S.token}`;
    const res = await fetch(`/api${path}`, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && S.token && path !== '/auth/login') { setAuth(null, null); }
    if (!res.ok) { const e = new Error(data.error || 'generic'); e.code = data.error; e.data = data; throw e; }
    return data;
  }
  const errMsg = (e) => T(`err_${e.code}`) !== `err_${e.code}` ? T(`err_${e.code}`) : T('err_generic');

  function setAuth(token, user) {
    S.token = token; S.user = user;
    if (token) { store.set('token', token); store.set('user', user); } else { store.del('token'); store.del('user'); }
    renderMenu();
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.innerHTML = `${I.check}<span>${esc(msg)}</span>`;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ---------------- cart ----------------
  const cartCount = () => S.cart.reduce((a, i) => a + i.qty, 0);
  const cartTotal = () => S.cart.reduce((a, i) => a + i.qty * i.price, 0);
  function saveCart() { store.set('cart', S.cart); updateCartBadge(); }
  function updateCartBadge() {
    const n = cartCount();
    $('#btnCart').innerHTML = I.basket + (n ? `<span class="badge-count num">${n}</span>` : '');
  }
  const cartKey = (i) => `${i.id}:${i.variant_id || ''}`;
  function addToCart(p, qty = 1, variant = null) {
    if (p.has_variants && !variant) { location.hash = `#/product/${p.id}`; return; }
    const stock = variant ? variant.stock : p.stock;
    if (stock <= 0) { toast(T('outOfStockMsg')); return; }
    const key = `${p.id}:${variant ? variant.id : ''}`;
    const ex = S.cart.find((i) => cartKey(i) === key);
    const cur = ex ? ex.qty : 0;
    if (cur + qty > stock) { toast(T('maxStock', { x: stock })); return; }
    if (ex) ex.qty += qty;
    else S.cart.push({ id: p.id, variant_id: variant ? variant.id : null, variant_label: variant ? variant.label : null, qty,
      name_ku: p.name_ku, name_ar: p.name_ar, name_en: p.name_en, price: variant ? variant.price : p.price, image: p.image, stock });
    saveCart();
    toast(T('added'));
  }
  const productCache = new Map();

  // ---------------- chrome (header, menu, search, categories) ----------------
  function applyLang() {
    const d = I18N[S.lang] || I18N.ku;
    document.documentElement.lang = S.lang === 'ku' ? 'ckb' : S.lang;
    document.documentElement.dir = d.dir;
    $('#btnSearch').innerHTML = I.search;
    $('#btnMenu').innerHTML = I.menu;
    updateCartBadge();
    $('#desktopNav').innerHTML = `
      <a href="#/" data-nav="home">${T('home')}</a>
      <a href="#" data-open-cats>${T('categories')}</a>
      <a href="#/orders" data-nav="orders">${T('myOrders')}</a>
      <a href="#/profile" data-nav="profile">${T('profile')}</a>`;
    renderMenu();
  }

  function openPanel(el) { closePanels(); el.classList.add('open'); $('#overlay').classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closePanels() {
    document.querySelectorAll('.sheet.open, .drawer.open').forEach((e) => e.classList.remove('open'));
    $('#overlay').classList.remove('open'); document.body.style.overflow = '';
  }
  $('#overlay').addEventListener('click', closePanels);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanels(); });

  function renderMenu() {
    const u = S.user;
    const route = location.hash.split('/')[1] || '';
    const item = (href, icon, cls, label, active, attrs = '') =>
      `<a class="menu-item ${active ? 'active' : ''}" href="${href}" ${attrs}><span class="mi ${cls}">${icon}</span>${label}<span class="chev">${I.chev}</span></a>`;
    const s = S.settings;
    $('#menuDrawer').innerHTML = `
      <div class="drawer-head">
        <a href="#/" class="logo"><span>${esc(s.store_name || 'Store')}</span><span class="dot"></span></a>
        <button class="close-btn" data-close>${I.close}</button>
      </div>
      <div class="drawer-body">
        ${u ? `<a href="#/profile" class="card menu-user"><span class="avatar">${esc((u.name || '?').charAt(0).toUpperCase())}</span>
          <span class="info"><b>${esc(u.name)}</b><span class="num">${esc(u.phone)}</span><br><span class="pill">${T('customer')}</span> <span style="color:var(--brand);font-weight:700">${T('profile')}</span></span>
          <span class="chev" style="width:20px;color:var(--muted)">${I.chev}</span></a>`
        : `<div class="card menu-user"><span class="avatar">?</span><span class="info"><b>${T('welcome')}</b><a class="pill" href="#/quick">${T('login')}</a></span></div>`}
        <div class="card menu-list">
          ${item('#/', I.home, `o ${route === '' ? 'solid' : ''}`, T('home'), route === '')}
          ${item('#', I.list, 'b', T('categories'), false, 'data-open-cats')}
          ${item('#/cart', I.basket, 'g', T('cart'), route === 'cart')}
          ${item('#/orders', I.bag, 'p', T('myOrders'), route === 'orders')}
          ${item('#', I.search, 'y', T('search'), false, 'data-open-search')}
          ${u && u.role === 'admin' ? item('/admin', I.admin, 'r', T('adminPanel'), false) : ''}
        </div>
        <div class="card lang-box">
          <div class="lbl">${I.globe}${T('language')}</div>
          <div class="seg">
            <button data-lang="ku" class="${S.lang === 'ku' ? 'active' : ''}">کوردی</button>
            <button data-lang="en" class="${S.lang === 'en' ? 'active' : ''}">English</button>
            <button data-lang="ar" class="${S.lang === 'ar' ? 'active' : ''}">العربية</button>
          </div>
        </div>
        <div class="socials-lbl">${T('followUs')}</div>
        <div class="socials">
          ${s.whatsapp ? `<a href="https://wa.me/${esc(String(s.whatsapp).replace(/\D/g, ''))}" target="_blank" rel="noopener" style="color:#25D366">${I.whatsapp}</a>` : ''}
          ${safeUrl(s.instagram) ? `<a href="${esc(s.instagram)}" target="_blank" rel="noopener" style="color:#E1306C">${I.instagram}</a>` : ''}
          ${safeUrl(s.facebook) ? `<a href="${esc(s.facebook)}" target="_blank" rel="noopener" style="color:#1877F2">${I.facebook}</a>` : ''}
          ${safeUrl(s.tiktok) ? `<a href="${esc(s.tiktok)}" target="_blank" rel="noopener" style="color:#111">${I.tiktok}</a>` : ''}
        </div>
        ${u ? `<button class="btn btn-danger btn-block" data-logout>${I.logout}${T('logout')}</button>` : ''}
      </div>`;
  }

  function renderSearchSheet() {
    const tags = String(S.settings.search_tags || '').split(',').map((x) => x.trim()).filter(Boolean);
    $('#searchSheet').innerHTML = `
      <div class="grab"></div>
      <div class="sheet-head"><h3><span class="hic">${I.search}</span>${T('searchTitle')}</h3><button class="close-btn" data-close>${I.close}</button></div>
      <form id="searchForm">
        <label class="search-box">${I.search}<input id="searchInput" type="search" placeholder="${esc(T('searchPh'))}" autocomplete="off"></label>
        <div class="chips"><span class="lbl">${I.wand}${T('trendingNow')}</span>${tags.map((t) => `<button type="button" class="chip" data-q="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        <button class="btn btn-primary" type="submit">${I.search}${T('search')}</button>
        <button class="btn btn-soft" type="button" data-close>${T('close')}</button>
      </form>`;
    $('#searchForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = $('#searchInput').value.trim();
      if (q) { closePanels(); location.hash = `#/search/${encodeURIComponent(q)}`; }
    });
  }
  function openSearch() { renderSearchSheet(); openPanel($('#searchSheet')); setTimeout(() => $('#searchInput').focus(), 250); }

  function renderCatDrawer(selId) {
    const cats = S.categories;
    if (!cats.length) return;
    const sel = cats.find((c) => c.id === selId) || cats[0];
    $('#catDrawer').innerHTML = `
      <div class="drawer-head"><h3><span style="color:var(--brand);width:28px;height:28px;display:inline-block">${I.shapes}</span>${T('categories')}</h3><button class="close-btn" data-close style="background:none">${I.close}</button></div>
      <div class="cat-layout">
        <div class="cat-side">${cats.map((c) => `<button data-cat-side="${c.id}" class="${c.id === sel.id ? 'active' : ''}"><div class="img"><img src="${img(c.image)}" alt=""></div>${esc(L(c, 'name'))}</button>`).join('')}</div>
        <div class="cat-main">
          <a class="sub-item all" href="#/category/${sel.id}" data-close-nav>${esc(T('allOf', { x: L(sel, 'name') }))}<span>${I.arrow}</span></a>
          ${sel.children.map((s) => `<a class="sub-item" href="#/category/${s.id}" data-close-nav>${esc(L(s, 'name'))}<span class="cnt num">${s.count}</span><span>${I.chev}</span></a>`).join('')}
        </div>
      </div>`;
  }
  function openCats() { renderCatDrawer(); openPanel($('#catDrawer')); }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-close],[data-close-nav],[data-open-cats],[data-open-search],[data-lang],[data-logout],[data-cat-side],[data-q],[data-add]');
    if (!t) return;
    if (t.matches('[data-close]')) { e.preventDefault(); closePanels(); }
    else if (t.matches('[data-close-nav]')) { closePanels(); }
    else if (t.matches('[data-open-cats]')) { e.preventDefault(); openCats(); }
    else if (t.matches('[data-open-search]')) { e.preventDefault(); openSearch(); }
    else if (t.matches('[data-lang]')) {
      S.lang = t.dataset.lang; store.set('lang', S.lang); applyLang(); route();
      setTimeout(() => openPanel($('#menuDrawer')), 0);
    } else if (t.matches('[data-logout]')) {
      api('/auth/logout', { method: 'POST' }).catch(() => {});
      setAuth(null, null); closePanels(); location.hash = '#/';
    } else if (t.matches('[data-cat-side]')) { renderCatDrawer(Number(t.dataset.catSide)); }
    else if (t.matches('[data-q]')) { closePanels(); location.hash = `#/search/${encodeURIComponent(t.dataset.q)}`; }
    else if (t.matches('[data-add]')) {
      e.preventDefault(); e.stopPropagation();
      const p = productCache.get(Number(t.dataset.add));
      if (p) addToCart(p);
    }
  });
  $('#btnSearch').addEventListener('click', openSearch);
  $('#btnMenu').addEventListener('click', () => { renderMenu(); openPanel($('#menuDrawer')); });

  // ---------------- product card ----------------
  function productCard(p) {
    productCache.set(p.id, p);
    const out = p.stock <= 0;
    const off = p.old_price && p.old_price > p.price ? Math.round((1 - p.price / p.old_price) * 100) : 0;
    const startTags = []; const endTags = [];
    if (out) endTags.push(`<span class="tag out">${T('soldOut')}</span>`);
    else if (off) endTags.push(`<span class="tag off">-${off}%</span>`);
    if (p.featured) startTags.push(`<span class="tag feat">${I.star}${T('featured')}</span>`);
    else if (p.trending) startTags.push(`<span class="tag trend">${I.fire}${T('trending')}</span>`);
    else if (p.sold >= 20) startTags.push(`<span class="tag sold">+${p.sold} ${I.fire}</span>`);
    if (!out && p.stock <= 3) startTags.push(`<span class="tag low">${T('lowStock')}</span>`);
    return `
      <a class="p-card ${out ? 'soldout' : ''}" href="#/product/${p.id}">
        <div class="img">
          <div class="tags-stack start">${startTags.join('')}</div>
          <div class="tags-stack end">${endTags.join('')}</div>
          <img src="${img(p.image)}" alt="${esc(L(p, 'name'))}" loading="lazy">
        </div>
        <div class="body">
          <div class="nm">${esc(L(p, 'name'))}</div>
          <div class="foot">
            <div class="prices">${p.has_variants ? `<small style="color:var(--ink-2);font-weight:600">${T('from')}</small>` : ''}${money(p.price)}${off ? `<span class="old-price num">${fmt(p.old_price)}</span>` : ''}</div>
            <button class="add-btn" data-add="${p.id}" ${out ? 'disabled' : ''} aria-label="${esc(T('addToCart'))}">${I.plus}</button>
          </div>
        </div>
      </a>`;
  }
  const gridSkeleton = (n = 8) => `<div class="grid">${Array.from({ length: n }, () => '<div class="skeleton" style="aspect-ratio:3/4"></div>').join('')}</div>`;

  // ---------------- views ----------------
  const pageHead = (title, extra = '') => `<div class="page-head"><div class="container"><h1><button class="back-btn" onclick="history.length>1?history.back():location.hash='#/'">${I.chevR}</button>${title}</h1>${extra}</div></div>`;

  let sliderTimer; let countdownTimer;
  async function viewHome() {
    const cats = S.categories;
    app.innerHTML = `
      <div class="cat-strip-wrap"><div class="container" style="padding:0"><div class="cat-strip">
        <a class="cat-chip active" href="#/"><div class="img">${I.shapes}</div>${T('all')}</a>
        ${cats.map((c) => `<a class="cat-chip" href="#/category/${c.id}"><div class="img"><img src="${img(c.image)}" alt=""></div>${esc(L(c, 'name'))}</a>`).join('')}
      </div></div></div>
      <div class="container">
        <div id="slider"></div>
        <div id="flash"></div>
        <div class="sort-tabs" id="sortTabs"></div>
        <div id="grid">${gridSkeleton()}</div>
      </div>`;
    renderSortTabs(() => loadGrid({}));
    const [banners, flash] = await Promise.all([api('/banners').catch(() => []), api('/products?flash=1&limit=12').catch(() => [])]);
    renderSlider(banners);
    renderFlash(flash);
    loadGrid({});
  }

  function renderSortTabs(onChange) {
    const tabs = [['foryou', T('forYou'), ''], ['popular', T('popular'), I.fire], ['cheap', T('cheap'), I.sortDown], ['expensive', T('expensive'), I.sortUp]];
    const el = $('#sortTabs');
    el.innerHTML = tabs.map(([k, l, ic]) => `<button class="sort-tab ${S.sort === k ? 'active' : ''}" data-sort="${k}">${ic}${l}</button>`).join('');
    el.onclick = (e) => {
      const b = e.target.closest('[data-sort]'); if (!b) return;
      S.sort = b.dataset.sort;
      el.querySelectorAll('.sort-tab').forEach((x) => x.classList.toggle('active', x === b));
      onChange();
    };
  }

  async function loadGrid(params) {
    const g = $('#grid'); if (!g) return;
    const qs = new URLSearchParams({ ...params, sort: S.sort, limit: 60 }).toString();
    try {
      const list = await api(`/products?${qs}`);
      if (!$('#grid')) return;
      $('#grid').innerHTML = list.length ? `<div class="grid">${list.map(productCard).join('')}</div>`
        : `<div class="empty"><div class="ic sq">${I.search}</div><h3>${T('noResults')}</h3></div>`;
    } catch { g.innerHTML = `<div class="empty"><h3>${T('err_generic')}</h3></div>`; }
  }

  function renderSlider(banners) {
    clearInterval(sliderTimer);
    const el = $('#slider'); if (!el || !banners.length) return;
    el.innerHTML = `<div class="slider">${banners.map((b, i) => `
      <a class="slide ${i === 0 ? 'active' : ''}" href="${esc(safeUrl(b.link) || '#/')}">
        <img src="${img(b.image)}" alt="">
        ${L(b, 'title') ? `<div class="caption">${L(b, 'tag') ? `<span class="tag" style="position:static">${esc(L(b, 'tag'))}</span>` : ''}<h3>${esc(L(b, 'title'))}</h3><p>${esc(L(b, 'subtitle'))}</p></div>` : ''}
      </a>`).join('')}
      ${banners.length > 1 ? `<div class="dots">${banners.map((_, i) => `<button class="${i === 0 ? 'active' : ''}" data-dot="${i}" aria-label="slide ${i + 1}"></button>`).join('')}</div>` : ''}
    </div>`;
    let cur = 0;
    const go = (n) => {
      const slides = el.querySelectorAll('.slide'); const dots = el.querySelectorAll('.dots button');
      if (!slides.length) return;
      cur = (n + slides.length) % slides.length;
      slides.forEach((s, i) => s.classList.toggle('active', i === cur));
      dots.forEach((d, i) => d.classList.toggle('active', i === cur));
    };
    el.onclick = (e) => { const d = e.target.closest('[data-dot]'); if (d) { e.preventDefault(); go(Number(d.dataset.dot)); } };
    if (banners.length > 1) sliderTimer = setInterval(() => { if (!document.body.contains(el)) return clearInterval(sliderTimer); go(cur + 1); }, 4500);
  }

  function renderFlash(list) {
    clearInterval(countdownTimer);
    const el = $('#flash'); if (!el) return;
    const end = new Date(S.settings.flash_sale_end || 0).getTime();
    if (!list.length || !(end > Date.now())) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="card flash">
      <div class="flash-head"><h2>${I.bolt}${T('flashSale')}</h2><div class="countdown">${T('timeLeft')} <span class="t" id="cd"></span></div></div>
      <div class="flash-row">${list.map((p) => { productCache.set(p.id, p); return `
        <a class="flash-item" href="#/product/${p.id}">
          <div class="img"><img src="${img(p.image)}" alt="" loading="lazy">${p.stock > 0 && p.stock <= 10 ? `<div class="bar">${T('lowStock')}</div>` : p.stock <= 0 ? `<div class="bar">${T('soldOut')}</div>` : ''}</div>
          <div class="nm">${esc(L(p, 'name'))}</div><div class="pr">${money(p.price)}</div>
        </a>`; }).join('')}</div></div>`;
    const tick = () => {
      const cd = $('#cd'); if (!cd) return clearInterval(countdownTimer);
      let s = Math.max(0, Math.floor((end - Date.now()) / 1000));
      if (s <= 0) { el.innerHTML = ''; return clearInterval(countdownTimer); }
      const h = Math.floor(s / 3600); s %= 3600; const m = Math.floor(s / 60); s %= 60;
      const p2 = (n) => String(n).padStart(2, '0');
      cd.innerHTML = `<b>${p2(h)}</b>:<b>${p2(m)}</b>:<b>${p2(s)}</b>`;
    };
    tick(); countdownTimer = setInterval(tick, 1000);
  }

  function findCat(id) {
    for (const c of S.categories) { if (c.id === id) return { cat: c, parent: null }; for (const s of c.children) if (s.id === id) return { cat: s, parent: c }; }
    return null;
  }

  async function viewCategory(id) {
    const f = findCat(id);
    const top = f ? (f.parent || f.cat) : null;
    app.innerHTML = `${pageHead(esc(f ? L(f.cat, 'name') : T('categories')))}
      <div class="container">
        ${top && top.children.length ? `<div class="tabs">
          <a href="#/category/${top.id}"><button class="${top.id === id ? 'active' : ''}">${T('all')}</button></a>
          ${top.children.map((s) => `<a href="#/category/${s.id}"><button class="${s.id === id ? 'active' : ''}">${esc(L(s, 'name'))}</button></a>`).join('')}
        </div>` : '<div style="height:16px"></div>'}
        <div class="sort-tabs" id="sortTabs"></div>
        <div id="grid">${gridSkeleton()}</div>
      </div>`;
    renderSortTabs(() => loadGrid({ category: id }));
    loadGrid({ category: id });
  }

  async function viewSearch(q) {
    app.innerHTML = `${pageHead(esc(T('resultsFor', { x: q })))}
      <div class="container" style="padding-top:16px"><div class="sort-tabs" id="sortTabs"></div><div id="grid">${gridSkeleton()}</div></div>`;
    renderSortTabs(() => loadGrid({ q }));
    loadGrid({ q });
  }

  async function viewProduct(id) {
    app.innerHTML = '<div class="spinner"></div>';
    let data;
    try { data = await api(`/products/${id}`); } catch { app.innerHTML = `<div class="empty"><h3>${T('noResults')}</h3><a class="btn btn-primary" href="#/">${T('backToShop')}</a></div>`; return; }
    const p = data.product; productCache.set(p.id, p);
    const variants = p.variants || [];
    let variant = variants.find((v) => v.stock > 0) || variants[0] || null;
    const gallery = [p.image, ...(p.images || [])].filter(Boolean);
    let qty = 1;
    app.innerHTML = `${pageHead(esc(L(p, 'name')).slice(0, 40))}
      <div class="container">
        <div class="pd">
          <div class="pd-gallery">
            <div class="main"><span class="tag off end hidden" id="offTag"></span><img id="mainImg" src="${img(gallery[0])}" alt="${esc(L(p, 'name'))}"></div>
            ${gallery.length > 1 ? `<div class="thumbs">${gallery.map((g, i) => `<button class="${i === 0 ? 'active' : ''}" data-img="${img(g)}"><img src="${img(g)}" alt=""></button>`).join('')}</div>` : ''}
          </div>
          <div class="card pd-info">
            ${p.brand ? `<div class="brand">${esc(p.brand)}</div>` : ''}
            <h1>${esc(L(p, 'name'))}</h1>
            <div class="prices" id="pdPrice"></div>
            ${variants.length ? `<div class="variant-lbl">${T('chooseOption')}</div><div class="variants">${variants.map((v) => `<button class="variant ${v.stock <= 0 ? 'oos' : ''}" data-variant="${v.id}">${esc(v.label)}</button>`).join('')}</div>` : ''}
            <div class="stock" id="pdStock"></div>
            <div class="pd-actions">
              <div class="qty" id="qtyBox"><button id="qMinus">${I.minus}</button><span id="qVal" class="num">1</span><button id="qPlus">${I.plus}</button></div>
              <button class="btn btn-primary" id="addBtn">${I.basket}${T('addToCart')}</button>
            </div>
            <button class="btn btn-soft btn-block" id="shareBtn" style="margin-bottom:6px">${I.share}${T('share')}</button>
            ${L(p, 'desc') ? `<div class="pd-desc"><h3>${T('description')}</h3><p>${esc(L(p, 'desc'))}</p></div>` : ''}
          </div>
        </div>
        ${data.related.length ? `<div class="section-title">${T('related')}</div><div class="grid">${data.related.map(productCard).join('')}</div>` : ''}
      </div>`;
    const render = () => {
      const price = variant ? variant.price : p.price;
      const old = variant ? variant.old_price : p.old_price;
      const stock = variant ? variant.stock : p.stock;
      const off = old && old > price ? Math.round((1 - price / old) * 100) : 0;
      $('#pdPrice').innerHTML = `${money(price)}${off ? `<span class="old-price num">${fmt(old)}</span>` : ''}`;
      $('#offTag').textContent = `-${off}%`; $('#offTag').classList.toggle('hidden', !off);
      const out = stock <= 0;
      const st = $('#pdStock');
      st.className = `stock ${out ? 'out' : stock <= 3 ? 'low' : 'in'}`;
      st.textContent = out ? T('soldOut') : stock <= 3 ? T('maxStock', { x: stock }) : T('inStock');
      $('#addBtn').disabled = out;
      $('#qtyBox').classList.toggle('hidden', out);
      qty = Math.max(1, Math.min(qty, stock || 1)); $('#qVal').textContent = qty;
      app.querySelectorAll('[data-variant]').forEach((b) => b.classList.toggle('active', variant && Number(b.dataset.variant) === variant.id));
    };
    render();
    app.querySelectorAll('[data-variant]').forEach((b) => b.addEventListener('click', () => { variant = variants.find((v) => v.id === Number(b.dataset.variant)); qty = 1; render(); }));
    app.querySelectorAll('[data-img]').forEach((b) => b.addEventListener('click', () => {
      $('#mainImg').src = b.dataset.img;
      app.querySelectorAll('[data-img]').forEach((x) => x.classList.toggle('active', x === b));
    }));
    $('#qMinus').onclick = () => { qty = Math.max(1, qty - 1); $('#qVal').textContent = qty; };
    $('#qPlus').onclick = () => { qty = Math.min(variant ? variant.stock : p.stock, qty + 1); $('#qVal').textContent = qty; };
    $('#addBtn').onclick = () => addToCart(p, qty, variant);
    $('#shareBtn').onclick = async () => {
      const url = `${location.origin}/p/${p.id}`;
      const text = `${L(p, 'name')} — ${fmt(variant ? variant.price : p.price)} ${T('currency')}`;
      if (navigator.share) { try { await navigator.share({ title: L(p, 'name'), text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
      window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`, '_blank', 'noopener');
    };
  }

  // Delivery zones from settings: [{ name, fee }]
  function zones() {
    try { const z = JSON.parse(S.settings.delivery_zones || '[]'); if (Array.isArray(z) && z.length) return z; } catch { /* fall back */ }
    return String(S.settings.cities || '').split(',').map((c) => c.trim()).filter(Boolean).map((name) => ({ name, fee: Number(S.settings.delivery_fee || 0) }));
  }
  function deliveryFor(city, sub) {
    const freeOver = Number(S.settings.free_delivery_over || 0);
    if (freeOver && sub >= freeOver) return 0;
    const z = zones().find((x) => x.name === city);
    return z ? Number(z.fee) : Number(S.settings.delivery_fee || 0);
  }
  // Refresh cart prices / stock from the server (prices can change, e.g. when the dollar rate changes).
  async function refreshCart() {
    if (!S.cart.length) return;
    try {
      const q = await api('/cart/quote', { method: 'POST', body: { items: S.cart.map((i) => ({ id: i.id, variant_id: i.variant_id, qty: i.qty })) } });
      let removed = false;
      S.cart = S.cart.map((i, idx) => {
        const it = q.items[idx];
        if (!it || !it.available || it.stock <= 0) { removed = true; return null; }
        return { ...i, ...it, qty: Math.min(i.qty, it.stock) };
      }).filter(Boolean);
      saveCart();
      if (removed) toast(T('err_product_unavailable'));
    } catch { /* offline: keep stored prices */ }
  }

  async function viewCart(skipRefresh) {
    if (!skipRefresh && S.cart.length) { app.innerHTML = '<div class="spinner"></div>'; await refreshCart(); }
    const n = cartCount();
    if (!n) {
      app.innerHTML = `${pageHead(T('cartTitle'), `<span class="pill num">${n} ${T('pcs')}</span>`)}
        <div class="empty"><div class="ic">${I.basket}</div><h3>${T('cartEmpty')}</h3><p>${T('cartEmptySub')}</p><a class="btn btn-primary" href="#/">${T('backToShop')}</a></div>`;
      return;
    }
    const sub = cartTotal();
    const freeOver = Number(S.settings.free_delivery_over || 0);
    const fees = zones().map((z) => Number(z.fee));
    const minFee = fees.length ? Math.min(...fees) : Number(S.settings.delivery_fee || 0);
    const isFree = freeOver && sub >= freeOver;
    app.innerHTML = `${pageHead(T('cartTitle'), `<span class="pill">${n} ${T('pcs')}</span>`)}
      <div class="container cart-layout">
        <div>${S.cart.map((i) => `
          <div class="card cart-item">
            <a href="#/product/${i.id}"><img src="${img(i.image)}" alt=""></a>
            <div class="info"><div class="nm">${esc(L(i, 'name'))}</div>${i.variant_label ? `<div class="vlabel">${esc(i.variant_label)}</div>` : ''}${money(i.price)}</div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
              <button class="rm-btn" data-rm="${esc(cartKey(i))}" aria-label="${esc(T('delete'))}">${I.trash}</button>
              <div class="qty"><button data-dec="${esc(cartKey(i))}">${I.minus}</button><span class="num">${i.qty}</span><button data-inc="${esc(cartKey(i))}">${I.plus}</button></div>
            </div>
          </div>`).join('')}</div>
        <div class="card summary">
          ${freeOver && sub < freeOver ? `<div class="hint">${esc(T('freeDeliveryHint', { x: `${fmt(freeOver - sub)} ${T('currency')}` }))}<div class="progress"><i style="width:${Math.min(100, (sub / freeOver) * 100)}%"></i></div></div>` : ''}
          <div class="sum-row"><span>${T('subtotal')}</span>${money(sub)}</div>
          <div class="sum-row"><span>${T('delivery')}</span>${isFree || !minFee ? `<b style="color:var(--green)">${T('free')}</b>` : `<span>${fees.length > 1 && new Set(fees).size > 1 ? `<small style="color:var(--ink-2)">${T('from')}</small> ` : ''}${money(minFee)}</span>`}</div>
          <div class="sum-row total"><span>${T('total')}</span>${money(sub + (isFree ? 0 : minFee))}</div>
          <a class="btn btn-primary btn-block" href="#/checkout" style="margin-top:12px">${T('checkout')}</a>
        </div>
      </div>`;
    app.onclick = (e) => {
      const b = e.target.closest('[data-inc],[data-dec],[data-rm]'); if (!b) return;
      const key = b.dataset.inc || b.dataset.dec || b.dataset.rm;
      const it = S.cart.find((x) => cartKey(x) === key); if (!it) return;
      if (b.dataset.inc) { if (it.qty < (it.stock || 99)) it.qty++; else toast(T('maxStock', { x: it.stock })); }
      if (b.dataset.dec) it.qty = Math.max(1, it.qty - 1);
      if (b.dataset.rm) S.cart = S.cart.filter((x) => cartKey(x) !== key);
      saveCart(); viewCart(true);
    };
  }

  async function viewCheckout() {
    if (!S.user) { location.hash = '#/quick?next=checkout'; return; }
    if (!cartCount()) { location.hash = '#/cart'; return; }
    app.innerHTML = '<div class="spinner"></div>';
    const [me, addresses] = await Promise.all([api('/me').catch(() => null), api('/me/addresses').catch(() => []), refreshCart()]);
    if (!me) { location.hash = '#/quick?next=checkout'; return; }
    if (!cartCount()) { location.hash = '#/cart'; return; }
    const user = me.user;
    const def = addresses[0] || {};
    const zs = zones();
    const sub = cartTotal();
    let useWallet = false;
    app.innerHTML = `${pageHead(T('checkout'))}
      <div class="container cart-layout">
        <form class="card" id="coForm" style="padding:20px">
          <div class="section-title" style="margin-top:0">${T('shippingInfo')}</div>
          <div id="coErr"></div>
          <div class="field"><label>${T('name')}</label><input class="input" name="name" value="${esc(user.name)}" required></div>
          <div class="field"><label>${T('phone')}</label><input class="input num" name="phone" type="tel" value="${esc(user.phone)}" required style="text-align:start"></div>
          <div class="field"><label>${T('city')}</label><select class="input" name="city" required>
            ${zs.length > 1 ? `<option value="" ${def.city ? '' : 'selected'} disabled>${T('chooseCity')}</option>` : ''}
            ${zs.map((z) => `<option value="${esc(z.name)}" ${z.name === def.city ? 'selected' : ''}>${esc(z.name)} — ${Number(z.fee) ? `${fmt(z.fee)} ${T('currency')}` : T('free')}</option>`).join('')}</select></div>
          <div class="field"><label>${T('address')}</label><input class="input" name="address" value="${esc([def.area, def.details].filter(Boolean).join(' - '))}" required></div>
          <div class="field"><label>${T('note')}</label><textarea class="input" name="note"></textarea></div>
          <div class="section-title">${T('payment')}</div>
          <label class="check on"><input type="radio" checked> ${T('cod')}</label>
          ${user.wallet > 0 ? `<label class="check" id="walletChk"><input type="checkbox" name="use_wallet"> ${esc(T('useWallet', { x: `${fmt(user.wallet)} ${T('currency')}` }))}</label>` : ''}
        </form>
        <div class="card summary">
          ${S.cart.map((i) => `<div class="sum-row"><span>${esc(L(i, 'name'))}${i.variant_label ? ` (${esc(i.variant_label)})` : ''} × <span class="num">${i.qty}</span></span><span class="num">${fmt(i.price * i.qty)}</span></div>`).join('')}
          <div class="sum-row" style="border-top:1px solid var(--line);padding-top:10px"><span>${T('delivery')}</span><span id="coDelivery"></span></div>
          <div class="sum-row hidden" id="walletRow"><span>${T('walletUsed')}</span><span class="num" style="color:var(--green)" id="walletAmt"></span></div>
          <div class="sum-row total"><span>${T('total')}</span><span id="coTotal"></span></div>
          <button class="btn btn-primary btn-block" id="placeBtn" style="margin-top:12px">${T('placeOrder')}</button>
        </div>
      </div>`;
    const recalc = () => {
      const city = $('#coForm').city.value;
      const delivery = city ? deliveryFor(city, sub) : 0;
      $('#coDelivery').innerHTML = !city ? '<span style="color:var(--muted)">—</span>' : delivery ? money(delivery) : `<b style="color:var(--green)">${T('free')}</b>`;
      const used = useWallet ? Math.min(user.wallet, sub + delivery) : 0;
      $('#walletRow').classList.toggle('hidden', !used);
      $('#walletAmt').textContent = `-${fmt(used)}`;
      $('#coTotal').innerHTML = money(sub + delivery - used);
    };
    recalc();
    $('#coForm').city.onchange = recalc;
    const wc = $('#walletChk');
    if (wc) wc.querySelector('input').onchange = (e) => { useWallet = e.target.checked; wc.classList.toggle('on', useWallet); recalc(); };
    $('#placeBtn').onclick = async () => {
      const f = $('#coForm');
      if (!f.reportValidity()) return;
      const fd = new FormData(f);
      const btn = $('#placeBtn'); btn.disabled = true;
      try {
        const order = await api('/orders', { method: 'POST', body: {
          items: S.cart.map((i) => ({ id: i.id, variant_id: i.variant_id || undefined, qty: i.qty })),
          name: fd.get('name'), phone: fd.get('phone'), city: fd.get('city'), address: fd.get('address'), note: fd.get('note'), use_wallet: useWallet,
        } });
        if (!addresses.length) api('/me/addresses', { method: 'POST', body: { city: fd.get('city'), details: fd.get('address') } }).catch(() => {});
        S.cart = []; saveCart();
        app.innerHTML = `<div class="empty"><div class="ic" style="background:var(--green-soft);color:var(--green)">${I.check}</div>
          <h3>${T('orderPlaced')}</h3><p>${T('orderPlacedSub')}</p>
          <p><b>${esc(T('orderNo', { x: order.id }))}</b></p>
          <a class="btn btn-primary" href="#/order/${order.id}">${T('myOrders')}</a></div>`;
      } catch (e) {
        btn.disabled = false;
        $('#coErr').innerHTML = `<div class="err">${esc(errMsg(e))}</div>`;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };
  }

  // Passwordless: phone → code (→ name for new customers). Used at checkout so buying needs no password.
  function viewQuick(next) {
    const nextQ = next ? `?next=${encodeURIComponent(next)}` : '';
    app.innerHTML = `<div class="container"><form class="card form-card" id="qForm">
      <div class="auth-title"><div class="logo"><span>${esc(S.settings.store_name || '')}</span><span class="dot"></span></div><p>${T('quickTitle')}</p></div>
      <div id="qErr"></div>
      <div class="field"><label>${T('phone')}</label><input class="input num" name="phone" type="tel" required placeholder="07xx xxx xxxx" autocomplete="tel" style="text-align:start"></div>
      <button class="btn btn-primary btn-block" type="submit">${T('sendCode')}</button>
      <div class="switch-link"><a href="#/login${nextQ}">${T('loginWithPassword')}</a></div>
    </form></div>`;
    $('#qForm').onsubmit = async (e) => {
      e.preventDefault();
      const phone = e.target.phone.value;
      const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
      try {
        const sent = await requestCode(phone, 'quick');
        viewQuickCode(phone, sent, next);
      } catch (err) {
        btn.disabled = false;
        if (err.code === 'use_password') { location.hash = `#/login${nextQ}`; return; }
        $('#qErr').innerHTML = errHtml(err);
      }
    };
  }
  function viewQuickCode(phone, sent, next) {
    app.innerHTML = `<div class="container"><form class="card form-card" id="qcForm">
      <div class="auth-title"><div class="empty" style="padding:0 0 12px"><div class="ic sq" style="margin-bottom:0">${I.shield}</div></div>
        <h3 style="margin:0 0 6px">${T('verifyTitle')}</h3><p>${esc(T('codeSentTo', { x: phone }))}</p></div>
      <div id="qcErr"></div>
      ${codeInput()}
      ${sent.is_new ? `<div class="field"><label>${T('name')}</label><input class="input" name="name" required autocomplete="name"></div>
        <div class="field"><label>${T('referralOpt')}</label><input class="input num" name="referral" style="text-transform:uppercase;text-align:start" value="${esc(store.get('ref', '') || '')}"></div>` : ''}
      <button class="btn btn-primary btn-block" type="submit">${T('continue')}</button>
      <button class="btn btn-soft btn-block" type="button" id="resendBtn" style="margin-top:10px"></button>
      <div class="switch-link"><a href="#" id="changeNum">${T('changeNumber')}</a></div>
    </form></div>`;
    const form = $('#qcForm');
    form.querySelector('[name=code]').focus();
    startResendCountdown($('#resendBtn'), sent.resend_in || 60);
    $('#resendBtn').onclick = async () => {
      try { const r = await requestCode(phone, 'quick'); startResendCountdown($('#resendBtn'), r.resend_in || 60); $('#qcErr').innerHTML = ''; }
      catch (err) { $('#qcErr').innerHTML = errHtml(err); }
    };
    $('#changeNum').onclick = (e) => { e.preventDefault(); viewQuick(next); };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const body = { phone, ...Object.fromEntries(new FormData(form)) };
      const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      try {
        const r = await api('/auth/quick', { method: 'POST', body });
        setAuth(r.token, r.user); store.del('ref');
        location.hash = next ? `#/${next}` : '#/profile';
      } catch (err) { btn.disabled = false; $('#qcErr').innerHTML = errHtml(err); }
    };
  }

  // ---- verification code step (shared by register / reset / phone change) ----
  let resendTimer;
  async function requestCode(phone, purpose) {
    const r = await api('/auth/otp', { method: 'POST', body: { phone, purpose, lang: S.lang } });
    if (r.dev_code) toast(T('devCode', { x: r.dev_code }));
    return r;
  }
  function startResendCountdown(btn, seconds) {
    clearInterval(resendTimer);
    let left = seconds;
    const tick = () => {
      if (!document.body.contains(btn)) return clearInterval(resendTimer);
      btn.disabled = left > 0;
      btn.textContent = left > 0 ? T('resendIn', { x: left }) : T('resend');
      if (left-- <= 0) clearInterval(resendTimer);
    };
    tick(); resendTimer = setInterval(tick, 1000);
  }
  const codeInput = () => `<div class="field"><label>${T('code')}</label><input class="input num otp-input" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required placeholder="••••••"></div>`;
  function errHtml(e) {
    const extra = e.data && e.data.attempts_left != null ? ` ${T('attemptsLeft', { x: e.data.attempts_left })}` : '';
    return `<div class="err">${esc(errMsg(e) + extra)}</div>`;
  }

  function viewLogin(mode, next) {
    const reg = mode === 'register';
    const reset = mode === 'reset';
    const nextQ = next ? `?next=${encodeURIComponent(next)}` : '';
    const subtitle = reset ? T('resetTitle') : reg ? T('register') : T('loginToContinue');
    app.innerHTML = `<div class="container"><form class="card form-card" id="authForm">
      <div class="auth-title"><div class="logo"><span>${esc(S.settings.store_name || '')}</span><span class="dot"></span></div><p>${subtitle}</p></div>
      <div id="authErr"></div>
      ${reg ? `<div class="field"><label>${T('name')}</label><input class="input" name="name" required autocomplete="name"></div>` : ''}
      <div class="field"><label>${T('phone')}</label><input class="input num" name="phone" type="tel" required placeholder="07xx xxx xxxx" autocomplete="tel" style="text-align:start"></div>
      ${reset ? '' : `<div class="field"><label>${T('password')}</label><input class="input" name="password" type="password" required minlength="6" autocomplete="${reg ? 'new-password' : 'current-password'}"></div>`}
      ${reg ? `<div class="field"><label>${T('referralOpt')}</label><input class="input num" name="referral" style="text-transform:uppercase;text-align:start" value="${esc(store.get('ref', '') || '')}"></div>` : ''}
      ${mode === 'login' ? `<div style="display:flex;justify-content:space-between;margin:-4px 0 14px;font-size:14px;font-weight:700"><a href="#/quick${nextQ}" style="color:var(--brand)">${T('loginWithCode')}</a><a href="#/reset${nextQ}" style="color:var(--ink-2)">${T('forgotPassword')}</a></div>` : ''}
      <button class="btn btn-primary btn-block" type="submit">${reg || reset ? T('sendCode') : T('login')}</button>
      <div class="switch-link">${reg ? T('haveAccount') : T('noAccount')} <a href="#/${reg ? 'login' : 'register'}${nextQ}">${reg ? T('login') : T('register')}</a></div>
    </form></div>`;
    const finish = (r) => { setAuth(r.token, r.user); store.del('ref'); location.hash = next ? `#/${next}` : '#/profile'; };
    $('#authForm').onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
      try {
        if (mode === 'login') {
          const r = await api('/auth/login', { method: 'POST', body: fd });
          return r.need_2fa ? viewTwoFactor(r.ticket, finish) : finish(r);
        }
        const sent = await requestCode(fd.phone, reg ? 'register' : 'reset');
        viewCodeStep(fd, mode, sent, finish);
      } catch (err) {
        btn.disabled = false;
        $('#authErr').innerHTML = errHtml(err);
      }
    };
  }

  function viewTwoFactor(ticket, finish) {
    app.innerHTML = `<div class="container"><form class="card form-card" id="tfaForm">
      <div class="auth-title"><div class="empty" style="padding:0 0 12px"><div class="ic sq" style="margin-bottom:0">${I.shield}</div></div>
        <h3 style="margin:0 0 6px">${T('twoFaTitle')}</h3><p>${T('twoFaSub')}</p></div>
      <div id="tfaErr"></div>${codeInput()}
      <button class="btn btn-primary btn-block" type="submit">${T('verify')}</button></form></div>`;
    const form = $('#tfaForm'); form.querySelector('[name=code]').focus();
    form.onsubmit = async (e) => {
      e.preventDefault();
      try { finish(await api('/auth/login/2fa', { method: 'POST', body: { ticket, code: form.code.value } })); }
      catch (err) { $('#tfaErr').innerHTML = errHtml(err); if (err.code === 'login_expired') setTimeout(() => viewLogin('login'), 1500); }
    };
  }

  function viewCodeStep(fd, mode, sent, finish) {
    const reset = mode === 'reset';
    app.innerHTML = `<div class="container"><form class="card form-card" id="codeForm">
      <div class="auth-title"><div class="empty" style="padding:0 0 12px"><div class="ic sq" style="margin-bottom:0">${I.shield}</div></div>
        <h3 style="margin:0 0 6px">${T('verifyTitle')}</h3><p>${esc(T('codeSentTo', { x: fd.phone }))}</p></div>
      <div id="codeErr"></div>
      ${codeInput()}
      ${reset ? `<div class="field"><label>${T('newPasswordReq')}</label><input class="input" name="password" type="password" required minlength="6" autocomplete="new-password"></div>` : ''}
      <button class="btn btn-primary btn-block" type="submit">${T('verify')}</button>
      <button class="btn btn-soft btn-block" type="button" id="resendBtn" style="margin-top:10px"></button>
      <div class="switch-link"><a href="#" id="changeNum">${T('changeNumber')}</a></div>
    </form></div>`;
    const form = $('#codeForm');
    form.querySelector('[name=code]').focus();
    startResendCountdown($('#resendBtn'), sent.resend_in || 60);
    $('#resendBtn').onclick = async () => {
      try { const r = await requestCode(fd.phone, reset ? 'reset' : 'register'); $('#codeErr').innerHTML = ''; startResendCountdown($('#resendBtn'), r.resend_in || 60); }
      catch (err) { $('#codeErr').innerHTML = errHtml(err); if (err.data && err.data.retry_in) startResendCountdown($('#resendBtn'), err.data.retry_in); }
    };
    $('#changeNum').onclick = (e) => { e.preventDefault(); viewLogin(mode, new URLSearchParams(location.hash.split('?')[1] || '').get('next')); };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const extra = Object.fromEntries(new FormData(form));
      const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      try {
        const r = reset
          ? await api('/auth/reset', { method: 'POST', body: { phone: fd.phone, code: extra.code, password: extra.password } })
          : await api('/auth/register', { method: 'POST', body: { ...fd, code: extra.code } });
        finish(r);
      } catch (err) {
        btn.disabled = false;
        $('#codeErr').innerHTML = errHtml(err);
      }
    };
  }

  async function viewProfile() {
    if (!S.user) { location.hash = '#/quick?next=profile'; return; }
    app.innerHTML = '<div class="spinner"></div>';
    let me;
    try { me = await api('/me'); } catch { location.hash = '#/login?next=profile'; return; }
    const u = me.user; const st = me.stats;
    S.user = u; store.set('user', u);
    const reward = `${fmt(S.settings.referral_reward)} ${T('currency')}`;
    const shareText = T('shareMsg', { s: S.settings.store_name || '', c: u.referral_code }) + ` ${location.origin}/#/register?ref=${u.referral_code}`;
    const statuses = [['pending', I.clock, 'gray'], ['preparing', I.box, 'o'], ['shipping', I.truck, 'b'], ['delivered', I.check, 'g'], ['cancelled', I.xCircle, 'r']];
    const initials = (u.name || '?').slice(0, 2).toUpperCase();
    app.innerHTML = `
      <div class="profile-hero"><div class="container">
        <span class="avatar">${esc(initials)}</span>
        <div><b>${esc(u.name)}</b><a class="num" href="tel:${esc(u.phone)}">${esc(u.phone)}</a></div>
      </div></div>
      <div class="container" style="padding-bottom:30px">
        <div class="stats">
          <a class="card stat" href="#/orders"><span class="mi o">${I.box}</span><div><div class="lbl">${T('myOrders')}</div><div class="val num">${st.orders}</div></div></a>
          <div class="card stat"><span class="mi g">${I.money}</span><div><div class="lbl">${T('totalSpent')}</div><div class="val">${money(st.total_spent)}</div></div></div>
        </div>
        <div class="wallet"><span class="mi">${I.wallet}</span><div><div class="lbl">${T('walletBalance')}</div><div class="val">${money(u.wallet)}</div></div></div>
        <div class="invite" id="invite">
          <div class="top"><span class="mi">${I.gift}</span><div><h4>${T('inviteTitle')}</h4><p>${esc(T('inviteSub', { x: reward }))}</p>
            <p style="margin-top:6px"><b class="num">${st.invited}</b> ${T('invited')}</p></div></div>
          <div class="code-row">
            <div class="code-box"><b>${esc(u.referral_code)}</b><button id="copyCode" aria-label="copy">${I.copy}</button></div>
            <a class="sq-btn wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(shareText)}">${I.whatsapp}</a>
          </div>
        </div>
        <div class="card status-card">
          <div class="hd"><h4>${T('myOrders')}</h4><a class="pill" href="#/orders">${T('viewAll')}</a></div>
          <div class="status-grid">${statuses.map(([k, ic, c]) => `<a href="#/orders/${k}"><span class="mi ${c}">${ic}</span>${st.by_status[k] ? `<span class="n num">${st.by_status[k]}</span>` : ''}${T(`st_${k}`)}</a>`).join('')}</div>
        </div>
        <div class="card menu-list">
          <a class="menu-item" href="#invite"><span class="mi y">${I.gift}</span>${T('invite')}<span class="chev">${I.chev}</span></a>
          <a class="menu-item" href="#/addresses"><span class="mi o">${I.map}</span>${T('addresses')}<span class="chev">${I.chev}</span></a>
          <a class="menu-item" href="#/edit-profile"><span class="mi g">${I.shield}</span>${T('editProfile')}<span class="chev">${I.chev}</span></a>
          <a class="menu-item" href="#/support"><span class="mi b">${I.headset}</span>${T('support')}<span class="chev">${I.chev}</span></a>
          ${u.role === 'admin' ? `<a class="menu-item" href="/admin"><span class="mi r">${I.admin}</span>${T('adminPanel')}<span class="chev">${I.chev}</span></a>` : ''}
        </div>
        <button class="btn btn-danger btn-block" data-logout>${I.logout}${T('logout')}</button>
      </div>`;
    $('#copyCode').onclick = () => { navigator.clipboard?.writeText(u.referral_code).then(() => toast(T('copied'))).catch(() => {}); };
    app.querySelector('a[href="#invite"]').onclick = (e) => { e.preventDefault(); $('#invite').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  }

  async function viewOrders(status) {
    if (!S.user) { location.hash = '#/quick?next=orders'; return; }
    const statuses = ['', 'pending', 'preparing', 'shipping', 'delivered', 'cancelled'];
    app.innerHTML = `${pageHead(T('myOrders'))}<div class="container">
      <div class="tabs">${statuses.map((s) => `<a href="#/orders${s ? '/' + s : ''}"><button class="${(status || '') === s ? 'active' : ''}">${s ? T(`st_${s}`) : T('all')}</button></a>`).join('')}</div>
      <div id="olist"><div class="spinner"></div></div></div>`;
    let orders = [];
    try { orders = await api(`/orders${status ? `?status=${status}` : ''}`); } catch { /* handled below */ }
    const el = $('#olist'); if (!el) return;
    if (!orders.length) {
      el.innerHTML = `<div class="empty"><div class="ic sq">${I.box}</div><h3>${T('noOrders')}</h3><p>${T('noOrdersSub')}</p><a class="btn btn-primary" href="#/">${I.bag}${T('shopNow')}</a></div>`;
      return;
    }
    el.innerHTML = orders.map((o) => `
      <a class="card order-card" href="#/order/${o.id}">
        <div class="hd"><div><b>${esc(T('orderNo', { x: o.id }))}</b><div class="date">${esc(dateFmt(o.created_at))}</div></div><span class="st ${o.status}">${T(`st_${o.status}`)}</span></div>
        <div class="order-thumbs">${o.items.slice(0, 5).map((i) => `<img src="${img(i.image)}" alt="">`).join('')}</div>
        <div class="ft"><span>${o.items.reduce((a, i) => a + i.qty, 0)} ${T('pcs')}</span>${money(o.total)}</div>
      </a>`).join('');
  }

  async function viewOrder(id) {
    if (!S.user) { location.hash = '#/login'; return; }
    app.innerHTML = '<div class="spinner"></div>';
    let o;
    try { o = await api(`/orders/${id}`); } catch { location.hash = '#/orders'; return; }
    const flow = [['pending', I.clock], ['preparing', I.box], ['shipping', I.truck], ['delivered', I.check]];
    const idx = flow.findIndex(([k]) => k === o.status);
    app.innerHTML = `${pageHead(esc(T('orderNo', { x: o.id })), `<span class="st ${o.status}">${T(`st_${o.status}`)}</span>`)}
      <div class="container cart-layout">
        <div>
          ${o.status !== 'cancelled' ? `<div class="card" style="padding:18px 10px;margin-bottom:14px"><div class="timeline">${flow.map(([k, ic], i) => `<div class="step ${i <= idx ? 'done' : ''}"><div class="c">${ic}</div>${T(`st_${k}`)}</div>`).join('')}</div></div>` : ''}
          ${o.items.map((i) => `<div class="card cart-item"><a href="#/product/${i.product_id}"><img src="${img(i.image)}" alt=""></a><div class="info"><div class="nm">${esc(i.name)}</div>${i.variant_label ? `<div class="vlabel">${esc(i.variant_label)}</div>` : ''}<span class="num">${fmt(i.price)} × ${i.qty}</span></div>${money(i.price * i.qty)}</div>`).join('')}
        </div>
        <div class="card summary">
          <div class="sum-row"><span>${T('name')}</span><b>${esc(o.customer_name)}</b></div>
          <div class="sum-row"><span>${T('phone')}</span><b class="num">${esc(o.phone)}</b></div>
          <div class="sum-row"><span>${T('city')}</span><b>${esc(o.city)}</b></div>
          <div class="sum-row"><span>${T('address')}</span><b>${esc(o.address)}</b></div>
          ${o.note ? `<div class="sum-row"><span>${T('note')}</span><b>${esc(o.note)}</b></div>` : ''}
          <div class="sum-row" style="border-top:1px solid var(--line);padding-top:10px"><span>${T('subtotal')}</span>${money(o.subtotal)}</div>
          <div class="sum-row"><span>${T('delivery')}</span>${o.delivery_fee ? money(o.delivery_fee) : `<b style="color:var(--green)">${T('free')}</b>`}</div>
          ${o.wallet_used ? `<div class="sum-row"><span>${T('walletUsed')}</span><b class="num" style="color:var(--green)">-${fmt(o.wallet_used)}</b></div>` : ''}
          <div class="sum-row total"><span>${T('total')}</span>${money(o.total)}</div>
          <div class="sum-row"><span>${T('payment')}</span><b>${T('cod')}</b></div>
          ${o.status === 'pending' ? `<button class="btn btn-danger btn-block" id="cancelBtn" style="margin-top:10px">${T('cancelOrder')}</button>` : ''}
        </div>
      </div>`;
    const cb = $('#cancelBtn');
    if (cb) cb.onclick = async () => {
      if (!confirm(T('confirmCancel'))) return;
      try { await api(`/orders/${o.id}/cancel`, { method: 'POST' }); viewOrder(o.id); } catch (e) { toast(errMsg(e)); }
    };
  }

  async function viewAddresses() {
    if (!S.user) { location.hash = '#/login'; return; }
    const list = await api('/me/addresses').catch(() => []);
    const cities = zones().map((z) => z.name);
    app.innerHTML = `${pageHead(T('addresses'))}<div class="container" style="max-width:640px;padding-top:18px">
      ${list.length ? list.map((a) => `<div class="card cart-item"><span class="mi o" style="width:48px;height:48px;border-radius:14px;display:grid;place-items:center">${I.map}</span>
        <div class="info"><div class="nm">${esc(a.city)} ${a.is_default ? `<span class="pill">${T('default')}</span>` : ''}</div><div style="color:var(--ink-2)">${esc([a.area, a.details].filter(Boolean).join(' - '))}</div></div>
        <button class="rm-btn" data-del-addr="${a.id}">${I.trash}</button></div>`).join('') : `<div class="empty" style="padding:30px"><div class="ic sq">${I.map}</div><h3>${T('noAddresses')}</h3></div>`}
      <form class="card" id="addrForm" style="padding:20px;margin-top:14px">
        <div class="section-title" style="margin-top:0">${T('addAddress')}</div>
        <div class="field"><label>${T('city')}</label><select class="input" name="city">${cities.map((c) => `<option>${esc(c)}</option>`).join('')}</select></div>
        <div class="field"><label>${T('area')}</label><input class="input" name="area"></div>
        <div class="field"><label>${T('address')}</label><input class="input" name="details" required></div>
        <button class="btn btn-primary btn-block">${T('add')}</button>
      </form></div>`;
    $('#addrForm').onsubmit = async (e) => {
      e.preventDefault();
      try { await api('/me/addresses', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast(T('saved')); viewAddresses(); } catch (err) { toast(errMsg(err)); }
    };
    app.querySelectorAll('[data-del-addr]').forEach((b) => b.onclick = async () => { await api(`/me/addresses/${b.dataset.delAddr}`, { method: 'DELETE' }); viewAddresses(); });
  }

  function viewEditProfile() {
    if (!S.user) { location.hash = '#/login'; return; }
    const u = S.user;
    app.innerHTML = `${pageHead(T('editProfile'))}<div class="container"><form class="card form-card" id="epForm">
      <div id="epErr"></div>
      <div class="field"><label>${T('name')}</label><input class="input" name="name" value="${esc(u.name)}" required></div>
      <div class="field"><label>${T('phone')}</label><input class="input num" name="phone" type="tel" value="${esc(u.phone)}" required style="text-align:start"></div>
      <div id="epCode"></div>
      <div class="field"><label>${T('newPassword')}</label><input class="input" name="new_password" type="password" minlength="6" autocomplete="new-password"></div>
      <div class="field"><label>${T('currentPassword')}</label><input class="input" name="current_password" type="password" autocomplete="current-password"></div>
      <button class="btn btn-primary btn-block">${T('save')}</button>
    </form></div>`;
    let codeSentFor = null;
    $('#epForm').onsubmit = async (e) => {
      e.preventDefault();
      const form = e.target;
      const body = Object.fromEntries(new FormData(form));
      if (!body.new_password) { delete body.new_password; delete body.current_password; }
      const phoneChanged = body.phone.replace(/[^\d+]/g, '') !== u.phone;
      try {
        if (phoneChanged && codeSentFor !== body.phone) {
          const sent = await requestCode(body.phone, 'change_phone');
          codeSentFor = body.phone;
          $('#epCode').innerHTML = `<div class="hint">${esc(T('phoneCodeHint'))}</div>${codeInput()}<button class="btn btn-soft btn-block" type="button" id="resendBtn" style="margin-bottom:14px"></button>`;
          startResendCountdown($('#resendBtn'), sent.resend_in || 60);
          $('#resendBtn').onclick = async () => {
            try { const r = await requestCode(body.phone, 'change_phone'); startResendCountdown($('#resendBtn'), r.resend_in || 60); }
            catch (err) { $('#epErr').innerHTML = errHtml(err); }
          };
          $('#epErr').innerHTML = '';
          form.querySelector('[name=code]').focus();
          return;
        }
        const r = await api('/me', { method: 'PUT', body });
        setAuth(S.token, r.user); toast(T('saved')); location.hash = '#/profile';
      } catch (err) { $('#epErr').innerHTML = errHtml(err); }
    };
  }

  function viewSupport() {
    const s = S.settings;
    app.innerHTML = `${pageHead(T('support'))}<div class="container" style="max-width:520px;padding-top:24px">
      <div class="empty" style="padding:20px"><div class="ic">${I.headset}</div></div>
      ${s.whatsapp ? `<a class="btn btn-block" style="background:#25D366;color:#fff;margin-bottom:12px" target="_blank" rel="noopener" href="https://wa.me/${esc(String(s.whatsapp).replace(/\D/g, ''))}">${I.whatsapp}${T('contactWhatsapp')}</a>` : ''}
      ${s.support_phone ? `<a class="btn btn-soft btn-block" href="tel:${esc(s.support_phone)}">${I.phone}${T('callUs')} <span class="num">${esc(s.support_phone)}</span></a>` : ''}
    </div>`;
  }

  // ---------------- router ----------------
  function route() {
    app.onclick = null;
    closePanels();
    const [pathPart, query] = location.hash.replace(/^#/, '').split('?');
    const parts = pathPart.split('/').filter(Boolean);
    const qs = new URLSearchParams(query || '');
    if (qs.get('ref')) store.set('ref', qs.get('ref'));
    document.querySelectorAll('#desktopNav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === (parts[0] || 'home')));
    window.scrollTo(0, 0);
    const [p0, p1] = parts;
    switch (p0) {
      case undefined: return viewHome();
      case 'category': return viewCategory(Number(p1));
      case 'search': return viewSearch(decodeURIComponent(p1 || ''));
      case 'product': return viewProduct(Number(p1));
      case 'cart': return viewCart();
      case 'checkout': return viewCheckout();
      case 'login': return viewLogin('login', qs.get('next'));
      case 'register': return viewLogin('register', qs.get('next'));
      case 'reset': return viewLogin('reset', qs.get('next'));
      case 'quick': return viewQuick(qs.get('next'));
      case 'profile': return viewProfile();
      case 'orders': return viewOrders(p1);
      case 'order': return viewOrder(Number(p1));
      case 'addresses': return viewAddresses();
      case 'edit-profile': return viewEditProfile();
      case 'support': return viewSupport();
      default: return viewHome();
    }
  }

  async function init() {
    $('#year').textContent = new Date().getFullYear();
    applyLang();
    const [settings, cats] = await Promise.all([api('/settings').catch(() => ({})), api('/categories').catch(() => [])]);
    S.settings = settings; S.categories = cats;
    const name = settings.store_name || 'Store';
    document.title = name;
    $('#storeName').textContent = name;
    document.querySelectorAll('.js-store-name').forEach((e) => { e.textContent = name; });
    renderMenu();
    window.addEventListener('hashchange', route);
    route();
  }
  init();
})();
