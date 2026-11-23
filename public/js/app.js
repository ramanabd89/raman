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
    help: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm0 14.5a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5ZM12 6a3.5 3.5 0 0 0-3.5 3.5h2a1.5 1.5 0 1 1 2.2 1.3c-.9.5-1.7 1.3-1.7 2.7v.5h2v-.4c0-.6.3-.9.9-1.3A3.5 3.5 0 0 0 12 6Z"/></svg>',
    swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 2 9.4 7.4 4 9l5.4 1.6L11 16l1.6-5.4L18 9l-5.4-1.6L11 2Zm7 11-.9 2.6-2.6.9 2.6.9.9 2.6.9-2.6 2.6-.9-2.6-.9L18 13Z"/></svg>',
    wrench: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.7 6.3a1 1 0 0 0-1.6-.3l-2.6 2.6-2-.4-.4-2 2.6-2.6a1 1 0 0 0-.3-1.6 6 6 0 0 0-7.9 7.6l-6.7 6.7a2.5 2.5 0 0 0 3.5 3.5l6.7-6.7a6 6 0 0 0 7.6-7.9Z"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 12c4.4 0 8 2.2 8 5v1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1c0-2.8 3.6-5 8-5Z"/></svg>',
    sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.1v13.8a1 1 0 0 0 1.5.9l11-6.9a1 1 0 0 0 0-1.8l-11-6.9A1 1 0 0 0 8 5.1Z"/></svg>',
    scale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4 3 8l4 4M3 8h14M17 12l4 4-4 4M21 16H7"/></svg>',
    admin: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z"/></svg>',
  };

  // Phone's language as the first guess: Arabic → ar, English → en, otherwise Kurdish.
  function detectLang() {
    const langs = (navigator.languages || [navigator.language || '']).map((l) => String(l).toLowerCase());
    for (const l of langs) { if (l.startsWith('ckb') || l.startsWith('ku')) return 'ku'; if (l.startsWith('ar')) return 'ar'; if (l.startsWith('en')) return 'en'; }
    return 'ku';
  }
  // ---------------- state ----------------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };
  const S = {
    lang: store.get('lang', null) || detectLang(),
    langChosen: !!store.get('lang', null),
    token: store.get('token', null),
    user: store.get('user', null),
    cart: store.get('cart', []),
    tradein: store.get('tradein', null), // { model_id, answers, estimate, label } // [{id, qty, name_ku, name_ar, name_en, price, image, stock}]
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
  const bidiName = (text) => esc(text).replace(/([A-Za-z0-9][A-Za-z0-9.+\-/]*(?: [A-Za-z0-9][A-Za-z0-9.+\-/]*)*)/g, '<bdi dir="ltr">$1</bdi>');
  const stars = (r) => { const f = Math.round(Number(r) || 0); return `<span class="stars" aria-label="${esc(String(r))}/5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= f ? 'on' : ''}">${I.star}</i>`).join('')}</span>`; };
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
    if (user && user.role !== 'customer') api('/me').then((me) => { S.adminPath = me.admin_path; renderMenu(); }).catch(() => {});
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
  let syncTimer;
  function saveCart() {
    store.set('cart', S.cart); updateCartBadge();
    if ($('#tabbar') && $('#tabbar').innerHTML) renderTabbar(location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] || undefined);
    if (S.token) { clearTimeout(syncTimer); syncTimer = setTimeout(() => api('/cart/sync', { method: 'POST', body: { items: S.cart.map((i) => ({ id: i.id, variant_id: i.variant_id, qty: i.qty })) } }).catch(() => {}), 1500); }
  }
  function updateCartBadge() {
    const n = cartCount();
    $('#btnCart').innerHTML = I.basket + (n ? `<span class="badge-count num">${n}</span>` : '');
  }
  const cartKey = (i) => `${i.id}:${i.variant_id || ''}`;
  // put a product in the cart (no UI); false when it can't be added
  function pushCart(p, qty = 1, variant = null) {
    const stock = variant ? variant.stock : p.stock;
    if (stock <= 0) { toast(T('outOfStockMsg')); return false; }
    const key = `${p.id}:${variant ? variant.id : ''}`;
    const ex = S.cart.find((i) => cartKey(i) === key);
    const cur = ex ? ex.qty : 0;
    if (cur + qty > stock) { toast(T('maxStock', { x: stock })); return false; }
    if (ex) ex.qty += qty;
    else S.cart.push({ id: p.id, variant_id: variant ? variant.id : null, variant_label: variant ? variant.label : null, qty,
      name_ku: p.name_ku, name_ar: p.name_ar, name_en: p.name_en, price: variant ? variant.price : p.price, image: p.image, stock, is_phone: !!(p.attrs && p.attrs.os) });
    return true;
  }
  function addToCart(p, qty = 1, variant = null) {
    if (p.has_variants && !variant) { location.hash = `#/product/${p.id}`; return; }
    if (!pushCart(p, qty, variant)) return;
    saveCart();
    if (S.bundle && S.bundle.forId === p.id && S.bundle.items.length) showBundleSheet(S.bundle.items);
    else toast(T('added'));
  }
  const productCache = new Map();
  function openSheet(html) {
    const el = $('#uiSheet');
    el.innerHTML = `<div class="grab"></div>${html}`;
    el.onclick = null;
    openPanel(el);
    return el;
  }
  function showBundleSheet(items) {
    let el = $('#bundleSheet');
    if (!el) { el = document.createElement('div'); el.id = 'bundleSheet'; el.className = 'sheet'; document.body.appendChild(el); }
    el.innerHTML = `<div class="grab"></div>
      <div class="sheet-head"><h3><span class="hic" style="background:var(--green-soft);color:var(--green)">${I.check}</span>${T('addedTo')}</h3><button class="close-btn" data-close>${I.close}</button></div>
      <div class="section-title" style="margin-top:0;font-size:16px">${T('boughtTogether')}</div>
      <div class="bundle-row">${items.map((b) => { productCache.set(b.id, b); return `<div class="bundle-item"><a href="#/product/${b.id}" data-close-nav><img src="${img(b.image)}" alt=""></a>
        <div class="nm">${esc(L(b, 'name'))}</div><div class="bp">${money(b.price)}</div><button class="add-btn sm" data-add="${b.id}" aria-label="${esc(T('addToCart'))}">${I.plus}</button></div>`; }).join('')}</div>
      <a class="btn btn-primary" href="#/cart" data-close-nav>${I.basket}${T('viewCart')}</a>
      <button class="btn btn-soft" data-close>${T('continueShopping')}</button>`;
    openPanel(el);
  }

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
      <a href="#/repair" data-nav="repair">${T('repairTitle')}</a>
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
          ${item('#/finder', I.spark, 'p', T('finderTitle'), route === 'finder')}
          ${S.settings.tradein_enabled === '1' ? item('#/tradein', I.swap, 'g', T('tiTitle'), route === 'tradein') : ''}
          ${S.settings.repair_enabled === '1' ? item('#/repair', I.wrench, 'o', T('repairTitle'), route === 'repair' || route === 'repairs') : ''}
          ${item('#/faq', I.help, 'b', T('faq'), route === 'faq')}
          ${u && u.role && u.role !== 'customer' ? item(esc(S.adminPath || '/admin'), I.admin, 'r', T('adminPanel'), false) : ''}
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
    if (e.target.closest('[data-back]')) { if (history.length > 1) history.back(); else location.hash = '#/'; return; }
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

  // ---------------- trust strip & WhatsApp ----------------
  function trustStrip() {
    const s = S.settings;
    const items = [[I.shield, T('trustOriginal')], [I.money, T('trustCod')], [I.truck, T('trustFast')]];
    if (Number(s.exchange_days) > 0) items.push([I.check, T('trustExchange', { x: s.exchange_days })]);
    if (s.warranty_text) items.push([I.shield, s.warranty_text]);
    if (s.store_address) items.push([I.map, s.store_address, safeUrl(s.store_map_url)]);
    return `<div class="trust">${items.map(([ic, txt, link]) => link
      ? `<a class="trust-item" href="${esc(link)}" target="_blank" rel="noopener">${ic}<span>${esc(txt)}</span></a>`
      : `<div class="trust-item">${ic}<span>${esc(txt)}</span></div>`).join('')}</div>`;
  }
  S.waContext = '';
  function renderWhatsApp() {
    const num = String(S.settings.whatsapp || '').replace(/\D/g, '');
    let el = $('#waFloat');
    if (!num || S.hideWa) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('a'); el.id = 'waFloat'; el.className = 'wa-float'; el.target = '_blank'; el.rel = 'noopener'; document.body.appendChild(el); }
    const msg = S.waContext ? T('waProductMsg', { x: S.waContext }) : T('waGeneralMsg');
    el.href = `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
    el.innerHTML = `${I.whatsapp}<span>${T('whatsappAsk')}</span>`;
    el.setAttribute('aria-label', T('whatsappAsk'));
  }

  // ---------------- product card ----------------
  function productCard(p) {
    productCache.set(p.id, p);
    const out = p.stock <= 0;
    const off = p.old_price && p.old_price > p.price ? Math.round((1 - p.price / p.old_price) * 100) : 0;
    // One badge at most (Baymard: badges only for meaningful differences); the discount sits next to the price.
    const badge = out ? `<span class="tag out">${T('soldOut')}</span>`
      : p.stock <= 3 ? `<span class="tag low">${T('lowStock')}</span>`
        : p.sold >= 20 ? `<span class="tag sold">${I.fire}${esc(T('soldN', { x: fmt(p.sold) }))}</span>`
          : p.trending ? `<span class="tag trend">${I.fire}${T('trending')}</span>` : '';
    const a = p.attrs || {};
    const spec = a.os ? [a.storage ? `${a.storage >= 1024 ? `${a.storage / 1024}TB` : `${a.storage}GB`}` : '', a.ram ? `${a.ram}GB RAM` : '', a.camera ? `${a.camera}MP` : ''].filter(Boolean).join(' · ') : '';
    return `
      <a class="p-card ${out ? 'soldout' : ''}" href="#/product/${p.id}">
        <div class="img">
          ${badge ? `<div class="tags-stack start">${badge}</div>` : ''}
          <img src="${img(p.image)}" alt="${esc(L(p, 'name'))}" loading="lazy" decoding="async">
        </div>
        <div class="body">
          ${p.brand ? `<div class="c-brand">${esc(p.brand)}</div>` : ''}
          <div class="nm">${bidiName(L(p, 'name'))}</div>
          ${spec ? `<div class="c-spec num">${esc(spec)}</div>` : ''}
          ${p.rating_count ? `<div class="c-rate">${I.star}<b class="num">${Number(p.rating_avg).toFixed(1)}</b><span class="num">(${p.rating_count})</span></div>` : ''}
          <div class="foot">
            <div class="prices">${p.has_variants ? `<small class="c-from">${T('from')}</small>` : ''}${money(p.price)}
              ${off ? `<div class="c-old"><span class="old-price num">${fmt(p.old_price)}</span><span class="off-pill num">-${off}%</span></div>` : ''}</div>
            <button class="add-btn" data-add="${p.id}" ${out ? 'disabled' : ''} aria-label="${esc(T('addToCart'))}">${I.plus}</button>
          </div>
        </div>
      </a>`;
  }
  const gridSkeleton = (n = 8) => `<div class="grid">${Array.from({ length: n }, () => '<div class="skeleton" style="aspect-ratio:3/4"></div>').join('')}</div>`;

  // ---------------- views ----------------
  const pageHead = (title, extra = '') => `<div class="page-head"><div class="container"><h1><button class="back-btn" data-back aria-label="back">${I.chevR}</button>${title}</h1>${extra}</div></div>`;

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
        <p class="hero-value">${T('heroValue')}</p>
        ${trustStrip()}
        ${S.settings.repair_enabled === '1' ? `<section class="repair-ad compact" id="repairAd" aria-label="${esc(T('repairTitle'))}">
          <svg class="ra-art" viewBox="0 0 120 200" aria-hidden="true"><rect x="10" y="6" width="100" height="188" rx="18" fill="#0F1220" stroke="#3A4060" stroke-width="3"/>
            <rect x="18" y="16" width="84" height="168" rx="12" fill="url(#raG)"/><defs><linearGradient id="raG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2B3150"/><stop offset="1" stop-color="#151A2E"/></linearGradient></defs>
            <path class="ra-crack" d="M70 40 L58 72 L74 88 L52 118 L66 132 L48 170 M58 72 L36 80 M74 88 L96 96 M52 118 L30 128" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" opacity=".75"/>
            <circle class="ra-spark" cx="70" cy="40" r="5" fill="#F0904A"/></svg>
          <div class="ra-body">
            <span class="ra-tag">${I.wrench}${T('repairTitle')}</span>
            <div class="ra-hooks" aria-live="polite">${[1, 2, 3, 4, 5].map((n, i) => `<div class="ra-hook ${i === 0 ? 'on' : ''}" data-hook="${n}"><b>${T(`hk${n}q`)}</b><span>${T(`hk${n}a`)}</span></div>`).join('')}</div>
            <div class="ra-dots">${[0, 1, 2, 3, 4].map((i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div>
            <div class="ra-row"><div class="ra-from" id="raFrom"></div><a class="btn btn-primary ra-cta" href="#/repair?start=1">${T('repairHomeCta')}</a></div>
            <div class="ra-chips"><span>${I.shield}${T('chipWarranty')}</span><span>${I.swap}${T('chipOld')}</span><span id="raFree" hidden>${I.check}${T('chipPrice')}</span><span id="raPick" hidden>${I.truck}${T('chipPickup')}</span></div>
          </div>
        </section>` : ''}
        <div class="promo-tiles">
          <a class="promo-tile finder" href="#/finder"><span class="pi">${I.spark}</span><b>${T('finderTitle')}</b></a>
          ${S.settings.tradein_enabled === '1' ? `<a class="promo-tile swap" href="#/tradein"><span class="pi">${I.swap}</span><b>${T('tiTitle')}</b></a>` : ''}
        </div>

        <div id="flash"></div>
        <div id="seenRow"></div>
        <div class="sort-tabs" id="sortTabs"></div>
        <div id="grid">${gridSkeleton()}</div>
        ${S.settings.store_address ? `<section class="card visit">
          <span class="visit-ic">${I.map}</span>
          <div class="visit-txt"><b>${T('visitUs')}</b><p>${esc(S.settings.store_address)}</p>${S.settings.store_hours ? `<small>🕘 ${esc(S.settings.store_hours)}</small>` : ''}<small>${T('visitSub')}</small></div>
          ${safeUrl(S.settings.store_map_url) ? `<a class="btn btn-soft" href="${esc(safeUrl(S.settings.store_map_url))}" target="_blank" rel="noopener">${I.map}${T('openMap')}</a>` : ''}
        </section>` : ''}
      </div>`;
    S.filters = {};
    renderSortTabs(() => loadGrid({}));
    renderSeen();
    startRepairAd();
    const [banners, flash] = await Promise.all([api('/banners').catch(() => []), api('/products?flash=1&limit=12').catch(() => [])]);
    renderSlider(banners);
    renderFlash(flash);
    loadGrid({});
  }

  // Home-page repair ad: rotating "problem? → our answer" hooks + the cheapest real repair price.
  let adTimer;
  async function startRepairAd() {
    clearInterval(adTimer);
    const ad = $('#repairAd'); if (!ad) return;
    const cat = await api('/repair/catalog').catch(() => null);
    if (!document.body.contains(ad)) return;
    if (cat && cat.from_price) $('#raFrom').innerHTML = `${esc(T('fromPrice', { x: '' }))} ${money(cat.from_price)}`;
    if (cat && cat.free_diagnosis) { $('#raFree').innerHTML = `${I.check}${T('chipFree')}`; $('#raFree').hidden = false; }
    else ad.querySelector('[data-hook="3"] span').textContent = T('hk3b');
    // pickup hook: "we collect it from your home" (free when the fee is 0); removed when pickup is off
    const h5 = ad.querySelector('[data-hook="5"]');
    if (cat && cat.pickup) {
      if (cat.pickup_fee) h5.querySelector('span').textContent = T('hk5b');
      else $('#raPick').hidden = false;
    } else { h5.remove(); ad.querySelector('.ra-dots i:last-child').remove(); }
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const hooks = ad.querySelectorAll('.ra-hook'); const dots = ad.querySelectorAll('.ra-dots i');
    let i = 0;
    adTimer = setInterval(() => {
      if (!document.body.contains(ad)) return clearInterval(adTimer);
      i = (i + 1) % hooks.length;
      hooks.forEach((h, n) => h.classList.toggle('on', n === i));
      dots.forEach((d, n) => d.classList.toggle('on', n === i));
    }, 3800);
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

  // 20 products at a time (fewer choices at once = easier decisions, faster on mobile data), then "show more"
  const PAGE = 20;
  async function loadGrid(params, append) {
    const g = $('#grid'); if (!g) return;
    if (!append) { S.gridParams = params || {}; S.gridOffset = 0; }
    const qs = new URLSearchParams({ ...S.gridParams, sort: S.sort, limit: PAGE + 1, offset: S.gridOffset }).toString();
    try {
      const list = await api(`/products?${qs}`);
      if (!$('#grid')) return;
      const more = list.length > PAGE; const items = list.slice(0, PAGE);
      S.gridOffset += items.length;
      const filtered = S.filters && Object.keys(S.filters).length;
      if (!append) {
        $('#grid').innerHTML = items.length ? '<div class="grid" id="gridInner"></div><div id="moreWrap"></div>'
          : `<div class="empty"><div class="ic sq">${I.search}</div><h3>${T(filtered ? 'fNone' : 'noResults')}</h3>${filtered ? `<button class="btn btn-soft" id="fClearEmpty">${T('fClear')}</button>` : ''}</div>`;
        if ($('#fClearEmpty')) $('#fClearEmpty').onclick = () => { S.filters = {}; drawFilterCount(); loadGrid({ ...S.filterBase }); };
      }
      if (!items.length) return;
      $('#gridInner').insertAdjacentHTML('beforeend', items.map(productCard).join(''));
      $('#moreWrap').innerHTML = more ? `<button class="btn btn-soft btn-block more-btn" id="moreBtn">${T('showMore')}</button>` : '';
      if (more) $('#moreBtn').onclick = (e) => { e.currentTarget.disabled = true; loadGrid(null, true); };
    } catch { g.innerHTML = `<div class="empty"><h3>${T('err_generic')}</h3></div>`; }
  }

  // ---------------- filters (category & search pages) ----------------
  const filterRow = () => `<div class="sort-row"><button class="filter-btn" id="filterBtn">${I.sliders}<span>${T('filterBtn')}</span><b class="num hidden" id="fCount"></b></button><div class="sort-tabs" id="sortTabs"></div></div>`;
  function drawFilterCount() {
    const n = Object.keys(S.filters || {}).filter((k) => k !== 'max_price' || !S.filters.min_price).length;
    const b = $('#fCount'); if (!b) return;
    b.textContent = n; b.classList.toggle('hidden', !n);
  }
  function bindFilters(base) {
    S.filters = {}; S.filterBase = base;
    const run = () => loadGrid({ ...base, ...S.filters });
    renderSortTabs(run);
    $('#filterBtn').onclick = async () => {
      const f = await api(`/products/facets?${new URLSearchParams(base)}`).catch(() => null);
      if (!f) return;
      const cur = { ...S.filters };
      const brands = new Set(String(cur.brand || '').split(',').filter(Boolean));
      // price buckets that make sense for this list (phones vs accessories)
      const cuts = f.max > 400000 ? [300000, 600000, 1000000] : [25000, 50000, 100000];
      const buckets = [[0, cuts[0]], [cuts[0], cuts[1]], [cuts[1], cuts[2]], [cuts[2], 0]].filter(([a, b]) => (!b || b >= f.min) && a <= f.max);
      const lbl = ([a, b]) => (!a ? `≤ ${fmt(b)}` : !b ? `${fmt(a)}+` : `${fmt(a)} – ${fmt(b)}`);
      const el = openSheet(`<div class="sheet-head"><h3><span class="hic">${I.sliders}</span>${T('filterBtn')}</h3><button class="close-btn" data-close>${I.close}</button></div>
        <div class="f-body">
          ${f.brands.length > 1 ? `<div class="f-lbl">${T('fBrand')}</div><div class="f-chips">${f.brands.map((b) => `<button type="button" class="chip ${brands.has(b.v.toLowerCase()) ? 'active' : ''}" data-fb="${esc(b.v.toLowerCase())}">${esc(b.v)} <small class="num">${b.n}</small></button>`).join('')}</div>` : ''}
          <div class="f-lbl">${T('fPrice')} <small>(${T('currency')})</small></div>
          <div class="f-chips">${buckets.map((r) => `<button type="button" class="chip num ${Number(cur.min_price || 0) === r[0] && Number(cur.max_price || 0) === r[1] ? 'active' : ''}" data-fp="${r[0]}-${r[1]}">${lbl(r)}</button>`).join('')}</div>
          <div class="f-range"><input class="input num" type="number" inputmode="numeric" min="0" id="fMin" placeholder="${esc(T('fMin'))}" value="${esc(cur.min_price || '')}"><span>—</span><input class="input num" type="number" inputmode="numeric" min="0" id="fMax" placeholder="${esc(T('fMax'))}" value="${esc(cur.max_price || '')}"></div>
          ${f.storages.length > 1 ? `<div class="f-lbl">${T('fStorage')}</div><div class="f-chips">${f.storages.map((x) => `<button type="button" class="chip num ${String(cur.storage) === String(x.v) ? 'active' : ''}" data-fs="${esc(x.v)}">${Number(x.v) >= 1024 ? `${Number(x.v) / 1024}TB` : `${esc(x.v)}GB`}</button>`).join('')}</div>` : ''}
          <label class="check ${cur.in_stock ? 'on' : ''}" id="fStockLbl"><input type="checkbox" id="fStock" ${cur.in_stock ? 'checked' : ''}> ${T('fInStock')}</label>
        </div>
        <div class="f-foot"><button type="button" class="btn btn-soft" id="fClear">${T('fClear')}</button><button type="button" class="btn btn-primary" id="fApply">${T('fApply')}</button></div>`);
      el.onclick = (e) => {
        const b = e.target.closest('[data-fb],[data-fp],[data-fs]'); if (!b) return;
        if (b.dataset.fb) b.classList.toggle('active');
        if (b.dataset.fp) {
          const on = !b.classList.contains('active');
          el.querySelectorAll('[data-fp]').forEach((x) => x.classList.remove('active'));
          b.classList.toggle('active', on);
          const [a, z] = b.dataset.fp.split('-').map(Number);
          $('#fMin').value = on && a ? a : ''; $('#fMax').value = on && z ? z : '';
        }
        if (b.dataset.fs) { const on = !b.classList.contains('active'); el.querySelectorAll('[data-fs]').forEach((x) => x.classList.remove('active')); b.classList.toggle('active', on); }
      };
      $('#fStock').onchange = (e) => $('#fStockLbl').classList.toggle('on', e.target.checked);
      $('#fClear').onclick = () => { S.filters = {}; drawFilterCount(); closePanels(); run(); };
      $('#fApply').onclick = () => {
        const nf = {};
        const bs = [...el.querySelectorAll('[data-fb].active')].map((x) => x.dataset.fb);
        if (bs.length) nf.brand = bs.join(',');
        const mn = Number($('#fMin').value) || 0; const mx = Number($('#fMax').value) || 0;
        if (mn > 0) nf.min_price = mn;
        if (mx > 0) nf.max_price = mx;
        const st = el.querySelector('[data-fs].active'); if (st) nf.storage = st.dataset.fs;
        if ($('#fStock').checked) nf.in_stock = '1';
        S.filters = nf; drawFilterCount(); closePanels(); run();
      };
    };
    run();
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

  async function renderSeen() {
    const ids = store.get('seen', []).filter((x) => Number.isInteger(x)).slice(0, 10);
    const el = $('#seenRow'); if (!el || !ids.length) return;
    const list = await api(`/products?ids=${ids.join(',')}&limit=10`).catch(() => []);
    if (!list.length || !document.body.contains(el)) return;
    el.innerHTML = `<div class="section-title">${T('seenBefore')}</div><div class="mini-row">${list.map((p) => { productCache.set(p.id, p); return `
      <a class="mini-item" href="#/product/${p.id}"><img src="${img(p.image)}" alt="" loading="lazy"><div class="nm">${bidiName(L(p, 'name'))}</div>${money(p.price)}</a>`; }).join('')}</div>`;
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
        ${filterRow()}
        <div id="grid">${gridSkeleton()}</div>
      </div>`;
    bindFilters({ category: id });
  }

  async function viewSearch(q) {
    app.innerHTML = `${pageHead(esc(T('resultsFor', { x: q })))}
      <div class="container" style="padding-top:16px">${filterRow()}<div id="grid">${gridSkeleton()}</div></div>`;
    bindFilters({ q });
  }

  async function viewProduct(id) {
    app.innerHTML = '<div class="spinner"></div>';
    let data;
    try { data = await api(`/products/${id}`); } catch { app.innerHTML = `<div class="empty"><h3>${T('noResults')}</h3><a class="btn btn-primary" href="#/">${T('backToShop')}</a></div>`; return; }
    const p = data.product; productCache.set(p.id, p);
    store.set('seen', [p.id, ...store.get('seen', []).filter((x) => x !== p.id)].slice(0, 12));
    const isPhone = !!(p.attrs && p.attrs.os);
    const pct = Math.min(Number(S.settings.bundle_discount_percent) || 0, 50);
    const bundleItems = isPhone && pct ? (data.bundle || []).filter((b) => !b.has_variants && b.stock > 0 && !(b.attrs && b.attrs.os)).slice(0, 3) : [];
    const vid = safeUrl(p.video_url);
    const vidFile = /\.(mp4|webm)(\?|$)/i.test(vid);
    const pr = data.proof || {};
    const variants = p.variants || [];
    let variant = variants.find((v) => v.stock > 0) || variants[0] || null;
    const gallery = [p.image, ...(p.images || [])].filter(Boolean);
    let qty = 1;
    app.innerHTML = `${pageHead(esc(L(p, 'name')).slice(0, 40))}
      <div class="container">
        <div class="pd">
          <div class="pd-gallery">
            <div class="main"><span class="tag off end hidden" id="offTag"></span>
              <div class="swipe" id="swipe">${gallery.map((g, i) => `<img src="${img(g)}" alt="${esc(L(p, 'name'))}" ${i ? 'loading="lazy"' : ''} decoding="async">`).join('')}</div>
              ${gallery.length > 1 ? `<div class="swipe-dots">${gallery.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}</div>
            ${vid && vidFile ? `<video class="pd-video" src="${esc(vid)}" controls preload="none" playsinline></video>` : ''}
            ${vid && !vidFile ? `<a class="video-btn" href="${esc(vid)}" target="_blank" rel="noopener">${I.play}<span>${T('watchVideo')}</span></a>` : ''}
            ${gallery.length > 1 ? `<div class="thumbs">${gallery.map((g, i) => `<button class="${i === 0 ? 'active' : ''}" data-img="${img(g)}"><img src="${img(g)}" alt=""></button>`).join('')}</div>` : ''}
          </div>
          <div class="card pd-info">
            ${p.brand ? `<div class="brand">${esc(p.brand)}</div>` : ''}
            ${(p.tags || []).length ? `<div class="ptags">${p.tags.map((t) => `<span class="ptag" style="background:${esc(t.color)}1f;color:${esc(t.color)}">${esc(L(t, 'name'))}</span>`).join('')}</div>` : ''}
            <h1>${bidiName(L(p, 'name'))}</h1>
            ${p.rating_count ? `<button class="pd-rate" id="jumpRev">${stars(p.rating_avg)}<b class="num">${Number(p.rating_avg).toFixed(1)}</b><span>${esc(T('reviewsN', { x: p.rating_count }))}</span></button>` : ''}
            <div class="prices" id="pdPrice"></div>
            <div class="usd-approx" id="pdUsd"></div>
            <div class="deliv-line">${I.truck}<span>${T('deliveryLine')}${Number(S.settings.free_delivery_over) ? ` · ${esc(T('freeOverLine', { x: `${fmt(S.settings.free_delivery_over)} ${T('currency')}` }))}` : ''}</span></div>
            ${variants.length ? `<div class="variant-lbl">${T('chooseOption')}</div><div class="variants">${[...variants].sort((a, b) => b.price - a.price).map((v) => `<button class="variant ${v.stock <= 0 ? 'oos' : ''}" data-variant="${v.id}">${esc(v.label)}<small class="num">${fmt(v.price)}</small></button>`).join('')}</div>` : ''}
            <div class="stock" id="pdStock"></div>
            ${pr.viewers >= 2 || pr.sold30 >= 3 ? `<div class="pd-live">${pr.viewers >= 2 ? `<span><i class="dot-live"></i>${esc(T('viewersNow', { x: pr.viewers }))}</span>` : ''}${pr.sold30 >= 3 ? `<span>${I.fire}${esc(T('soldMonth', { x: pr.sold30 }))}</span>` : ''}</div>` : ''}
            ${p.attrs && p.attrs.os && S.settings.proof_enabled === '1' ? `<div class="proof"><b>${I.shield}${T('proofTitle')}</b><ul>
              <li>${T('proof1')}</li><li>${T('proof2')}</li><li>${T('proof3')}</li>${S.settings.warranty_text ? `<li>${esc(S.settings.warranty_text)}</li>` : ''}</ul></div>` : ''}
            <div class="pd-actions">
              <div class="qty" id="qtyBox"><button id="qMinus">${I.minus}</button><span id="qVal" class="num">1</span><button id="qPlus">${I.plus}</button></div>
              <button class="btn btn-primary" id="addBtn">${I.basket}${T('addToCart')}</button>
            </div>
            ${Number(S.settings.exchange_days) > 0 ? `<div class="xchg-note">${I.check}<span>${esc(T('exchangeNote', { x: S.settings.exchange_days }))}</span></div>` : ''}
            <a class="btn btn-wa btn-block hidden" id="askStock" target="_blank" rel="noopener">${I.whatsapp}${T('askStock')}</a>
            ${p.attrs && p.attrs.os && S.settings.tradein_enabled === '1' ? `<a class="ti-hint" href="#/tradein">${I.swap}<span>${T('tiCartBanner')}</span>${I.chev}</a>` : ''}
            <div class="pd-minis"><button class="share-mini" id="shareBtn" aria-label="${esc(T('share'))}">${I.share}${T('share')}</button>
              ${isPhone ? `<button class="share-mini" id="cmpBtn">${I.scale}${T('compareWith')}</button>` : ''}</div>
            ${trustStrip()}
            <div class="cashback-note hidden" id="pdCashback"></div>
            ${(p.specs || []).length ? `<div class="pd-desc"><h3>${T('specs')}</h3><table class="specs">${p.specs.map((x) => `<tr><th>${esc(x.k)}</th><td dir="auto">${esc(x.v)}</td></tr>`).join('')}</table></div>` : ''}
            ${L(p, 'desc') ? `<div class="pd-desc"><h3>${T('description')}</h3><p>${esc(L(p, 'desc'))}</p></div>` : ''}
          </div>
        </div>
        ${bundleItems.length ? `<section class="card bundle-box">
          <h3>${I.gift}${T('bundleTitle')}</h3><p>${esc(T('bundleNote', { x: pct }))}</p>
          <div class="bx-items"><div class="bx-item main"><img src="${img(p.image)}" alt=""><span>${T('thisItem')}</span></div>
            ${bundleItems.map((b) => `<span class="bx-plus">+</span><label class="bx-item"><input type="checkbox" data-bx="${b.id}" checked><img src="${img(b.image)}" alt=""><span>${bidiName(L(b, 'name'))}</span>
              <small><s class="num">${fmt(b.price)}</s> <b class="num">${fmt(b.price - Math.floor((b.price * pct) / 100))}</b></small></label>`).join('')}</div>
          <div class="bx-foot"><div><div id="bxTotal"></div><div class="bx-save" id="bxSave"></div></div><button class="btn btn-primary" id="bxAdd">${I.basket}${T('bundleAdd')}</button></div>
        </section>` : ''}
        ${(data.bundle || []).length ? `<div class="section-title">${T('boughtTogether')}</div><div class="grid">${data.bundle.map(productCard).join('')}</div>` : ''}
        ${S.settings.reviews_enabled !== '0' ? '<section class="card reviews-sec" id="reviewsSec"></section>' : ''}
        ${data.related.length ? `<div class="section-title">${T('related')}</div><div class="grid">${data.related.map(productCard).join('')}</div>` : ''}
      </div>`;
    S.bundle = { forId: p.id, items: data.bundle || [] };
    const render = () => {
      const curPrice = variant ? variant.price : p.price;
      const rate = Number(S.settings.usd_rate) || 0;
      $('#pdUsd').textContent = S.settings.price_display === 'both' && rate ? `≈ $${fmt(Math.round(curPrice / rate))}` : '';
      const cbPct = Number(S.settings.cashback_percent) || 0;
      $('#pdCashback').classList.toggle('hidden', !cbPct);
      if (cbPct) $('#pdCashback').innerHTML = `${I.gift}<span>${esc(T('cashbackNote', { x: `${fmt(Math.floor((curPrice * cbPct) / 100))} ${T('currency')}` }))}</span>`;
      S.waContext = `${L(p, 'name')}${variant ? ` (${variant.label})` : ''} — ${location.origin}/p/${p.id}`;
      renderWhatsApp();
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
      const waNum = String(S.settings.whatsapp || '').replace(/\D/g, '');
      const ask = $('#askStock'); ask.classList.toggle('hidden', !out || !waNum);
      if (out && waNum) ask.href = `https://wa.me/${waNum}?text=${encodeURIComponent(T('waProductMsg', { x: S.waContext }))}`;
      // sticky buy bar (mobile): price + add + WhatsApp, always within thumb reach
      $('#buybar').innerHTML = `<div class="bb-price">${money(price)}${off ? `<span class="off-pill num">-${off}%</span>` : ''}</div>
        ${waNum ? `<a class="bb-wa" target="_blank" rel="noopener" href="https://wa.me/${waNum}?text=${encodeURIComponent(T('waProductMsg', { x: S.waContext }))}" aria-label="WhatsApp">${I.whatsapp}</a>` : ''}
        <button class="btn btn-primary bb-add" ${out ? 'disabled' : ''}>${I.basket}${out ? T('soldOut') : T('addToCart')}</button>`;
      $('#buybar .bb-add').onclick = () => addToCart(p, qty, variant);
      drawBundle();
      $('#qtyBox').classList.toggle('hidden', out);
      qty = Math.max(1, Math.min(qty, stock || 1)); $('#qVal').textContent = qty;
      app.querySelectorAll('[data-variant]').forEach((b) => b.classList.toggle('active', variant && Number(b.dataset.variant) === variant.id));
    };
    function drawBundle() {
      if (!$('#bxTotal')) return;
      const price = variant ? variant.price : p.price;
      const picked = bundleItems.filter((b) => { const c = app.querySelector(`[data-bx="${b.id}"]`); return c && c.checked; });
      const full = price + picked.reduce((a, b) => a + b.price, 0);
      const save = picked.reduce((a, b) => a + Math.floor((b.price * pct) / 100), 0);
      $('#bxTotal').innerHTML = `${save ? `<span class="old-price num">${fmt(full)}</span> ` : ''}${money(full - save)}`;
      $('#bxSave').textContent = save ? T('bundleSave', { x: `${fmt(save)} ${T('currency')}` }) : '';
    }
    render();
    if ($('#bxAdd')) {
      app.querySelectorAll('[data-bx]').forEach((c) => c.onchange = drawBundle);
      $('#bxAdd').onclick = () => {
        if (!pushCart(p, 1, variant)) return;
        bundleItems.forEach((b) => { const c = app.querySelector(`[data-bx="${b.id}"]`); if (c && c.checked) pushCart(b, 1, null); });
        saveCart(); toast(T('bundleAdded')); location.hash = '#/cart';
      };
    }
    if ($('#jumpRev')) $('#jumpRev').onclick = () => { const r = $('#reviewsSec'); if (r) r.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    if ($('#cmpBtn')) $('#cmpBtn').onclick = () => pickPhone([p.id], (id) => { location.hash = `#/compare?ids=${p.id},${id}`; });
    loadReviews(p);
    app.querySelectorAll('[data-variant]').forEach((b) => b.addEventListener('click', () => { variant = variants.find((v) => v.id === Number(b.dataset.variant)); qty = 1; render(); }));
    const sw = $('#swipe');
    const dots = app.querySelectorAll('.swipe-dots i');
    sw.addEventListener('scroll', () => {
      const i = Math.round(Math.abs(sw.scrollLeft) / sw.clientWidth);
      dots.forEach((d, n) => d.classList.toggle('on', n === i));
      app.querySelectorAll('[data-img]').forEach((x, n) => x.classList.toggle('active', n === i));
    }, { passive: true });
    app.querySelectorAll('[data-img]').forEach((b, n) => b.addEventListener('click', () => {
      sw.scrollTo({ left: (document.documentElement.dir === 'rtl' ? -1 : 1) * n * sw.clientWidth, behavior: 'smooth' });
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

  // ---------------- reviews ----------------
  const reviewItem = (x) => `<div class="rv-item">
      <div class="rv-top"><span class="rv-av">${esc((x.name || '?').charAt(0))}</span>
        <div class="rv-who"><b>${esc(x.name || '')}</b>${x.city ? `<small> · ${esc(x.city)}</small>` : ''}<div>${stars(x.rating)}${x.verified ? `<span class="rv-ver">${I.check}${T('verifiedBuyer')}</span>` : ''}</div></div>
        <small class="rv-date num">${esc(String(x.created_at || '').slice(0, 10))}</small></div>
      ${x.comment ? `<p dir="auto">${esc(x.comment)}</p>` : ''}
      ${(x.photos || []).length ? `<div class="rv-photos sm">${x.photos.map((u) => `<a href="${img(u)}" target="_blank" rel="noopener"><img src="${img(u)}" alt="" loading="lazy"></a>`).join('')}</div>` : ''}
      ${x.reply ? `<div class="rv-reply"><b>${T('storeReply')}</b><p dir="auto">${esc(x.reply)}</p></div>` : ''}
    </div>`;
  async function loadReviews(p) {
    const el = $('#reviewsSec'); if (!el) return;
    let r;
    try { r = await api(`/products/${p.id}/reviews?limit=5`); } catch { el.remove(); return; }
    if (!document.body.contains(el)) return;
    if (r.can_review === 'off') { el.remove(); return; }
    let offset = r.list.length;
    const write = r.can_review === 'yes' ? `<button class="btn btn-soft rv-write" id="rvWrite">${I.star}${T(r.mine ? 'editReview' : 'writeReview')}</button>`
      : r.can_review === 'login' ? `<a class="btn btn-soft rv-write" href="#/quick?next=${encodeURIComponent(`product/${p.id}`)}">${T('reviewLogin')}</a>` : '';
    el.innerHTML = `<div class="rv-head"><h2>${T('reviewsT')}</h2>${write}</div>
      ${r.count ? `<div class="rv-sum"><div class="rv-avg"><b class="num">${r.avg.toFixed(1)}</b>${stars(r.avg)}<small>${esc(T('reviewsN', { x: r.count }))}</small></div>
        <div class="rv-dist">${[5, 4, 3, 2, 1].map((n) => `<div><span class="num">${n}</span>${I.star}<i><b style="width:${(r.dist[n] / r.count) * 100}%"></b></i><span class="num">${r.dist[n]}</span></div>`).join('')}</div></div>
        ${r.photos.length ? `<div class="rv-lbl">${T('custPhotos')}</div><div class="rv-photos">${r.photos.map((u) => `<a href="${img(u)}" target="_blank" rel="noopener"><img src="${img(u)}" alt="" loading="lazy"></a>`).join('')}</div>` : ''}
        <div id="rvList">${r.list.map(reviewItem).join('')}</div>
        ${r.count > offset ? `<button class="btn btn-soft btn-block" id="rvMore">${T('moreReviews')}</button>` : ''}`
      : `<div class="rv-empty">${I.star}<b>${T('noReviews')}</b><small>${T(r.can_review === 'buy' || r.can_review === 'login' ? 'reviewBuyOnly' : 'noReviewsSub')}</small></div>`}
      ${r.mine && r.mine.status === 'pending' ? `<p class="rv-note">${T('reviewPending')}</p>` : ''}`;
    if ($('#rvWrite')) $('#rvWrite').onclick = () => openReviewForm(p.id, r.mine, () => loadReviews(p));
    if ($('#rvMore')) $('#rvMore').onclick = async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      const more = await api(`/products/${p.id}/reviews?limit=10&offset=${offset}`).catch(() => null);
      if (!more) { btn.disabled = false; return; }
      $('#rvList').insertAdjacentHTML('beforeend', more.list.map(reviewItem).join(''));
      offset += more.list.length;
      if (offset >= more.count || !more.list.length) btn.remove(); else btn.disabled = false;
    };
  }
  function openReviewForm(pid, mine, done) {
    let rating = mine ? mine.rating : 0;
    const photos = mine ? [...(mine.photos || [])] : [];
    const el = openSheet(`<div class="sheet-head"><h3><span class="hic">${I.star}</span>${T(mine ? 'editReview' : 'writeReview')}</h3><button class="close-btn" data-close>${I.close}</button></div>
      <div class="rv-form"><div class="f-lbl">${T('yourRating')}</div>
        <div class="star-pick">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-star="${n}" aria-label="${n}">${I.star}</button>`).join('')}</div>
        <textarea class="input" id="rvText" rows="4" maxlength="1000" placeholder="${esc(T('reviewPh'))}">${esc(mine ? mine.comment || '' : '')}</textarea>
        <div class="rv-up" id="rvUp"></div><div id="rvErr"></div>
        <button type="button" class="btn btn-primary btn-block" id="rvSend">${T('submitReview')}</button></div>`);
    const drawStars = () => el.querySelectorAll('[data-star]').forEach((b) => b.classList.toggle('on', Number(b.dataset.star) <= rating));
    const drawPhotos = () => {
      $('#rvUp').innerHTML = photos.map((u, i) => `<span class="rv-th"><img src="${img(u)}" alt=""><button type="button" data-rmph="${i}" aria-label="${esc(T('delete'))}">${I.close}</button></span>`).join('')
        + (photos.length < 3 ? `<label class="rv-add">${I.plus}<span>${T('addPhotos')}</span><input type="file" accept="image/*" id="rvFile" hidden></label>` : '');
      const f = $('#rvFile');
      if (f) f.onchange = async () => {
        const file = f.files[0]; if (!file) return;
        const fd = new FormData(); fd.append('file', file);
        $('#rvUp').classList.add('busy');
        try {
          const res = await fetch('/api/reviews/upload', { method: 'POST', headers: { Authorization: `Bearer ${S.token}` }, body: fd });
          const d = await res.json().catch(() => ({}));
          if (!res.ok) toast(errMsg({ code: d.error })); else photos.push(d.url);
        } catch { toast(T('err_generic')); }
        $('#rvUp').classList.remove('busy');
        drawPhotos();
      };
    };
    drawStars(); drawPhotos();
    el.onclick = (e) => {
      const s1 = e.target.closest('[data-star]'); if (s1) { rating = Number(s1.dataset.star); drawStars(); $('#rvErr').innerHTML = ''; return; }
      const rm = e.target.closest('[data-rmph]'); if (rm) { e.preventDefault(); photos.splice(Number(rm.dataset.rmph), 1); drawPhotos(); }
    };
    $('#rvSend').onclick = async () => {
      if (!rating) { $('#rvErr').innerHTML = `<div class="err">${T('pickStars')}</div>`; return; }
      const btn = $('#rvSend'); btn.disabled = true;
      try {
        const r = await api(`/products/${pid}/reviews`, { method: 'POST', body: { rating, comment: $('#rvText').value, photos } });
        closePanels(); toast(T(r.status === 'approved' ? 'reviewThanks' : 'reviewPending'));
        if (done) done();
      } catch (e) { btn.disabled = false; $('#rvErr').innerHTML = `<div class="err">${esc(errMsg(e))}</div>`; }
    };
  }

  // ---------------- compare two phones ----------------
  async function pickPhone(exclude, onPick) {
    const list = (await api('/products?phones=1&limit=100').catch(() => [])).filter((x) => !exclude.includes(x.id));
    const el = openSheet(`<div class="sheet-head"><h3><span class="hic">${I.scale}</span>${T('pickPhone')}</h3><button class="close-btn" data-close>${I.close}</button></div>
      <div class="pick-list">${list.map((x) => `<button type="button" class="pick-item" data-pick-id="${x.id}"><img src="${img(x.image)}" alt=""><span>${bidiName(L(x, 'name'))}</span>${money(x.price)}</button>`).join('')}</div>`);
    el.onclick = (e) => { const b = e.target.closest('[data-pick-id]'); if (b) { closePanels(); onPick(Number(b.dataset.pickId)); } };
  }
  async function viewCompare(idsParam) {
    const ids = String(idsParam || '').split(',').map(Number).filter((x) => x > 0).slice(0, 3);
    app.innerHTML = '<div class="spinner"></div>';
    const prods = (await Promise.all(ids.map((id) => api(`/products/${id}`).then((d) => d.product).catch(() => null)))).filter(Boolean);
    if (!prods.length) { location.hash = '#/'; return; }
    prods.forEach((x) => productCache.set(x.id, x));
    const a = (x, k) => Number((x.attrs || {})[k]) || 0;
    const gb = (n) => (n >= 1024 ? `${n / 1024}TB` : `${n}GB`);
    // [label, value, show, higher-is-better]
    const rows = [
      [T('sPrice'), (x) => x.price, (x) => fmt(x.price), false],
      [T('sStorage'), (x) => a(x, 'storage'), (x) => gb(a(x, 'storage')), true],
      [T('sRam'), (x) => a(x, 'ram'), (x) => `${a(x, 'ram')}GB`, true],
      [T('sCamera'), (x) => a(x, 'camera'), (x) => `${a(x, 'camera')}MP`, true],
      [T('sBattery'), (x) => a(x, 'battery'), (x) => `${fmt(a(x, 'battery'))} mAh`, true],
      [T('sScreen'), (x) => a(x, 'screen'), (x) => `${a(x, 'screen')}″`, true],
      [T('sCharging'), (x) => a(x, 'charging'), (x) => `${a(x, 'charging')}W`, true],
      [T('s5g'), (x) => ((x.attrs || {}).g5 ? 1 : 0), (x) => ((x.attrs || {}).g5 ? '✓' : '—'), true],
      [T('sRating'), (x) => Number(x.rating_avg) || 0, (x) => (x.rating_count ? `★ ${Number(x.rating_avg).toFixed(1)} (${x.rating_count})` : '—'), true],
    ];
    app.innerHTML = `${pageHead(T('compareTitle'))}
      <div class="container"><div class="card cmp" style="--n:${prods.length}">
        <div class="cmp-cols">${prods.map((x, i) => `<div class="cmp-col">
          <a href="#/product/${x.id}"><img src="${img(x.image)}" alt=""></a>
          <b class="cmp-nm">${bidiName(L(x, 'name'))}</b>${money(x.price)}
          <button class="add-btn cmp-add" data-add="${x.id}" ${x.stock <= 0 ? 'disabled' : ''} aria-label="${esc(T('addToCart'))}">${I.plus}</button>
          <button class="share-mini" data-chg="${i}">${I.scale}${T('changeBtn')}</button></div>`).join('')}</div>
        <table class="cmp-table">${rows.map(([lbl, val, show, hi]) => {
          const vals = prods.map(val); const best = hi ? Math.max(...vals) : Math.min(...vals);
          const differ = new Set(vals).size > 1;
          return `<tr><th colspan="${prods.length}">${esc(lbl)}</th></tr><tr>${prods.map((x, i) => `<td class="num ${differ && vals[i] === best && best ? 'win' : ''}">${esc(show(x))}</td>`).join('')}</tr>`;
        }).join('')}</table>
      </div></div>`;
    app.querySelectorAll('[data-chg]').forEach((b) => b.onclick = () => {
      const i = Number(b.dataset.chg);
      pickPhone(prods.map((x) => x.id), (id) => { const nids = prods.map((x) => x.id); nids[i] = id; location.hash = `#/compare?ids=${nids.join(',')}`; });
    });
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
      S.bundleOff = q.bundle_discount || 0;
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
    const bOff = Math.min(S.bundleOff || 0, cartTotal());
    const sub = cartTotal() - bOff;
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
        <div class="card summary cart-summary">
          ${freeOver && sub < freeOver ? `<div class="hint">${esc(T('freeDeliveryHint', { x: `${fmt(freeOver - sub)} ${T('currency')}` }))}<div class="progress"><i style="width:${Math.min(100, (sub / freeOver) * 100)}%"></i></div></div>` : ''}
          ${tradeinBox(sub)}
          <div class="sum-row"><span>${T('subtotal')}</span>${money(sub + bOff)}</div>
          ${bOff ? `<div class="sum-row"><span>${I.gift}${T('bundleOff')}</span><b class="num" style="color:var(--green)">-${fmt(bOff)}</b></div>` : ''}
          ${S.tradein ? `<div class="sum-row"><span>${T('tiCredit')}</span><b class="num" style="color:var(--green)">-${fmt(Math.min(S.tradein.estimate, sub))}</b></div>` : ''}
          <div class="sum-row"><span>${T('delivery')}</span>${isFree || !minFee ? `<b style="color:var(--green)">${T('free')}</b>` : `<span>${fees.length > 1 && new Set(fees).size > 1 ? `<small style="color:var(--ink-2)">${T('from')}</small> ` : ''}${money(minFee)}</span>`}</div>
          <div class="sum-row total"><span>${T('total')}</span>${money(sub - (S.tradein ? Math.min(S.tradein.estimate, sub) : 0) + (isFree ? 0 : minFee))}</div>
          <a class="btn btn-primary btn-block checkout-btn" href="#/checkout">${esc(T('checkoutWith', { x: `${fmt(sub - (S.tradein ? Math.min(S.tradein.estimate, sub) : 0) + (isFree ? 0 : minFee))} ${T('currency')}` }))}</a>
          <p class="checkout-trust">${I.shield}<span>${esc(T('checkoutTrust', { x: S.settings.exchange_days || 3 }))}</span></p>
        </div>
      </div>`;
    app.onclick = (e) => {
      if (e.target.closest('[data-ti-remove]')) { S.tradein = null; store.del('tradein'); return viewCart(true); }
      const b = e.target.closest('[data-inc],[data-dec],[data-rm]'); if (!b) return;
      const key = b.dataset.inc || b.dataset.dec || b.dataset.rm;
      const it = S.cart.find((x) => cartKey(x) === key); if (!it) return;
      if (b.dataset.inc) { if (it.qty < (it.stock || 99)) it.qty++; else toast(T('maxStock', { x: it.stock })); }
      if (b.dataset.dec) it.qty = Math.max(1, it.qty - 1);
      if (b.dataset.rm) S.cart = S.cart.filter((x) => cartKey(x) !== key);
      saveCart(); viewCart(true);
      // the bundle deal depends on what is in the cart → ask the server again
      if (S.cart.length) refreshCart().then(() => { if (location.hash.startsWith('#/cart')) viewCart(true); }); else S.bundleOff = 0;
    };
  }

  function tradeinBox(sub) {
    if (S.settings.tradein_enabled !== '1') return '';
    if (!S.tradein && !S.cart.some((i) => i.is_phone)) return '';
    if (!S.tradein) return `<a class="ti-banner" href="#/tradein?from=cart">${I.swap}<span>${T('tiCartBanner')}</span>${I.chev}</a>`;
    return `<div class="ti-applied">${I.swap}<div><b>${esc(S.tradein.label)}</b><small>${T('tiNote')}</small></div><button data-ti-remove aria-label="${esc(T('delete'))}">${I.close}</button></div>`;
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
    const bOff = Math.min(S.bundleOff || 0, cartTotal());
    const sub = cartTotal() - bOff;
    let useWallet = false;
    let coupon = null; // { code, discount }
    let source = null;
    app.innerHTML = `${pageHead(T('checkout'))}
      <div class="container cart-layout">
        <form class="card" id="coForm" style="padding:20px">
          <div class="section-title" style="margin-top:0">${T('shippingInfo')}</div>
          <div id="coErr"></div>
          <div class="field"><label>${T('name')}</label><input class="input" name="name" value="${esc(user.name)}" required></div>
          <div class="field"><label>${T('phone')}</label><input class="input num" name="phone" type="tel" value="${esc(user.phone)}" required style="text-align:start"></div>
          <div class="field"><label>${T('city')}</label><select class="input" name="city" required>
            ${zs.length > 1 ? `<option value="" ${def.city ? '' : 'selected'} disabled>${T('chooseCity')}</option>` : ''}
            ${zs.map((z) => `<option value="${esc(z.name)}" ${z.name === def.city ? 'selected' : ''}>${esc(z.name)} — ${Number(z.fee) ? `${fmt(z.fee)} ${T('currency')}` : T('free')}${z.eta ? ` · ${esc(z.eta)}` : ''}</option>`).join('')}</select><div class="eta" id="coEta"></div></div>
          <div class="field"><label>${T('address')}</label><input class="input" name="address" value="${esc([def.area, def.details].filter(Boolean).join(' - '))}" required></div>
          <button type="button" class="link-btn" id="noteToggle">${T('addNote')}</button>
          <div class="field hidden" id="noteField"><label>${T('note')}</label><textarea class="input" name="note"></textarea></div>
          ${me.stats.orders === 0 ? `<div class="field"><label>${T('heardFrom')} <span style="font-weight:400;color:var(--muted)">(${T('optional')})</span></label>
            <div class="src-chips">${['tiktok', 'instagram', 'facebook', 'snapchat', 'friend', 'influencer', 'google', 'store', 'other'].map((k) => `<button type="button" class="chip" data-src="${k}">${({ tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook', snapchat: 'Snapchat', google: 'Google' })[k] || T(`src_${k}`)}</button>`).join('')}</div></div>` : ''}
          <div class="section-title">${T('payment')}</div>
          <label class="check on"><input type="radio" checked> ${T('cod')}</label>
          ${user.wallet > 0 ? `<label class="check" id="walletChk"><input type="checkbox" name="use_wallet"> ${esc(T('useWallet', { x: `${fmt(user.wallet)} ${T('currency')}` }))}</label>` : ''}
        </form>
        <div class="card summary">
          ${S.cart.map((i) => `<div class="sum-row"><span>${esc(L(i, 'name'))}${i.variant_label ? ` (${esc(i.variant_label)})` : ''} × <span class="num">${i.qty}</span></span><span class="num">${fmt(i.price * i.qty)}</span></div>`).join('')}
          ${bOff ? `<div class="sum-row"><span>${T('bundleOff')}</span><span class="num" style="color:var(--green)">-${fmt(bOff)}</span></div>` : ''}
          <div class="coupon-row" id="couponBox">
            <input class="input" id="couponIn" placeholder="${esc(T('coupon'))}" autocomplete="off" style="text-transform:uppercase">
            <button type="button" class="btn btn-soft" id="couponBtn">${T('apply')}</button>
          </div>
          <div id="couponMsg"></div>
          ${S.tradein ? `<div class="sum-row"><span>${T('tiCredit')}<br><small style="color:var(--muted)">${esc(S.tradein.label)}</small></span><span class="num" style="color:var(--green)" id="tiAmt"></span></div>` : ''}
          <div class="sum-row hidden" id="discountRow"><span>${T('discountLbl')} <span class="num" id="couponCode"></span></span><span class="num" style="color:var(--green)" id="discountAmt"></span></div>
          <div class="sum-row" style="border-top:1px solid var(--line);padding-top:10px"><span>${T('delivery')}</span><span id="coDelivery"></span></div>
          <div class="sum-row hidden" id="walletRow"><span>${T('walletUsed')}</span><span class="num" style="color:var(--green)" id="walletAmt"></span></div>
          <div class="sum-row total"><span>${T('total')}</span><span id="coTotal"></span></div>
          <button class="btn btn-primary btn-block" id="placeBtn" style="margin-top:12px">${T('placeOrder')}</button>
        </div>
      </div>`;
    const recalc = () => {
      const city = $('#coForm').city.value;
      const disc = coupon ? coupon.discount : 0;
      const zone = zs.find((z) => z.name === city);
      $('#coEta').innerHTML = zone && zone.eta ? `${I.truck}<span>${esc(T('deliveryEta', { x: zone.eta }))}</span>` : '';
      const delivery = city ? deliveryFor(city, sub - disc) : 0;
      $('#coDelivery').innerHTML = !city ? '<span style="color:var(--muted)">—</span>' : delivery ? money(delivery) : `<b style="color:var(--green)">${T('free')}</b>`;
      $('#discountRow').classList.toggle('hidden', !disc);
      $('#discountAmt').textContent = `-${fmt(disc)}`;
      $('#couponCode').textContent = coupon ? `(${coupon.code})` : '';
      const ti = S.tradein ? Math.min(S.tradein.estimate, sub - disc) : 0;
      if ($('#tiAmt')) $('#tiAmt').textContent = `-${fmt(ti)}`;
      const used = useWallet ? Math.min(user.wallet, sub - disc - ti + delivery) : 0;
      $('#walletRow').classList.toggle('hidden', !used);
      $('#walletAmt').textContent = `-${fmt(used)}`;
      $('#coTotal').innerHTML = money(sub - disc - ti + delivery - used);
    };
    recalc();
    $('#coForm').city.onchange = recalc;
    $('#noteToggle').onclick = () => { $('#noteToggle').remove(); $('#noteField').classList.remove('hidden'); $('#coForm').note.focus(); };
    app.querySelectorAll('[data-src]').forEach((b) => b.onclick = () => {
      source = source === b.dataset.src ? null : b.dataset.src;
      app.querySelectorAll('[data-src]').forEach((x) => x.classList.toggle('active', x.dataset.src === source));
    });
    const couponErr = (e) => (e.code === 'coupon_min_order' ? T('err_coupon_min_order', { x: `${fmt(e.data.detail)} ${T('currency')}` }) : errMsg(e));
    const drawCoupon = () => {
      $('#couponBox').classList.toggle('hidden', !!coupon);
      $('#couponMsg').innerHTML = coupon ? `<div class="coupon-ok">${I.check}<span>${T('couponApplied')}: <b class="num">${esc(coupon.code)}</b></span><button type="button" id="couponRm">${T('removeCode')}</button></div>` : '';
      if (coupon) $('#couponRm').onclick = () => { coupon = null; drawCoupon(); recalc(); };
    };
    $('#couponBtn').onclick = async () => {
      const code = $('#couponIn').value.trim();
      if (!code) return;
      try {
        const r = await api('/coupons/check', { method: 'POST', body: { code, items: S.cart.map((i) => ({ id: i.id, variant_id: i.variant_id, qty: i.qty })) } });
        coupon = { code: r.code, discount: r.discount };
        drawCoupon(); recalc();
      } catch (e) { $('#couponMsg').innerHTML = `<div class="err" style="margin:8px 0 0">${esc(couponErr(e))}</div>`; }
    };
    $('#couponIn').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#couponBtn').click(); } };
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
          coupon: coupon ? coupon.code : undefined, source: source || undefined, utm: campaignSource() || undefined,
          tradein: S.tradein ? { model_id: S.tradein.model_id, answers: S.tradein.answers } : undefined,
        } });
        if (!addresses.length) api('/me/addresses', { method: 'POST', body: { city: fd.get('city'), details: fd.get('address') } }).catch(() => {});
        S.cart = []; saveCart(); S.tradein = null; store.del('tradein');
        app.innerHTML = `<div class="empty"><div class="ic" style="background:var(--green-soft);color:var(--green)">${I.check}</div>
          <h3>${T('orderPlaced')}</h3><p>${T('orderPlacedSub')}</p>
          <p><b>${esc(T('orderNo', { x: order.id }))}</b></p>
          <a class="btn btn-primary" href="#/order/${order.id}">${T('myOrders')}</a></div>`;
      } catch (e) {
        btn.disabled = false;
        if (e.code && e.code.startsWith('coupon_')) { coupon = null; drawCoupon(); recalc(); }
        if (e.code && e.code.startsWith('tradein_')) { S.tradein = null; store.del('tradein'); }
        $('#coErr').innerHTML = `<div class="err">${esc(e.code && e.code.startsWith('coupon_') ? couponErr(e) : errMsg(e))}</div>`;
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
        ${u.wallet > 0 ? `<div class="wallet"><span class="mi">${I.wallet}</span><div><div class="lbl">${T('walletBalance')}</div><div class="val">${money(u.wallet)}</div></div></div>`
          : `<a class="wallet" href="#invite" id="inviteNudge" style="background:var(--grad)"><span class="mi" style="color:#fff">${I.gift}</span><div><div class="val" style="font-size:18px">${esc(T('inviteHint', { x: reward }))}</div></div></a>`}
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
          ${S.settings.repair_enabled === '1' ? `<a class="menu-item" href="#/repairs"><span class="mi o">${I.wrench}</span>${T('myRepairs')}<span class="chev">${I.chev}</span></a>` : ''}
          <a class="menu-item" href="#/addresses"><span class="mi o">${I.map}</span>${T('addresses')}<span class="chev">${I.chev}</span></a>
          <a class="menu-item" href="#/edit-profile"><span class="mi g">${I.shield}</span>${T('editProfile')}<span class="chev">${I.chev}</span></a>
          <a class="menu-item" href="#/support"><span class="mi b">${I.headset}</span>${T('support')}<span class="chev">${I.chev}</span></a>
          ${u.role !== 'customer' ? `<a class="menu-item" href="${esc(S.adminPath || '/admin')}"><span class="mi r">${I.admin}</span>${T('adminPanel')}<span class="chev">${I.chev}</span></a>` : ''}
        </div>
        <button class="btn btn-danger btn-block" data-logout>${I.logout}${T('logout')}</button>
      </div>`;
    $('#copyCode').onclick = () => { navigator.clipboard?.writeText(u.referral_code).then(() => toast(T('copied'))).catch(() => {}); };
    app.querySelectorAll('a[href="#invite"]').forEach((a) => a.onclick = (e) => { e.preventDefault(); $('#invite').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
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
          <div id="rateBox"></div>
          ${o.items.map((i) => `<div class="card cart-item"><a href="#/product/${i.product_id}"><img src="${img(i.image)}" alt=""></a><div class="info"><div class="nm">${esc(i.name)}</div>${i.variant_label ? `<div class="vlabel">${esc(i.variant_label)}</div>` : ''}<span class="num">${fmt(i.price)} × ${i.qty}</span></div>${money(i.price * i.qty)}</div>`).join('')}
        </div>
        <div class="card summary">
          <div class="sum-row"><span>${T('name')}</span><b>${esc(o.customer_name)}</b></div>
          <div class="sum-row"><span>${T('phone')}</span><b class="num">${esc(o.phone)}</b></div>
          <div class="sum-row"><span>${T('city')}</span><b>${esc(o.city)}</b></div>
          <div class="sum-row"><span>${T('address')}</span><b>${esc(o.address)}</b></div>
          ${o.note ? `<div class="sum-row"><span>${T('note')}</span><b>${esc(o.note)}</b></div>` : ''}
          <div class="sum-row" style="border-top:1px solid var(--line);padding-top:10px"><span>${T('subtotal')}</span>${money(o.subtotal)}</div>
          ${o.tradein ? `<div class="sum-row"><span>${T('tiCredit')}<br><small style="color:var(--muted)">${esc(o.tradein.label)} · ${T(`ti_${o.tradein.status}`)}</small></span><b class="num" style="color:var(--green)">-${fmt(o.tradein_credit)}</b></div>` : ''}
          ${o.bundle_discount ? `<div class="sum-row"><span>${T('bundleOff')}</span><b class="num" style="color:var(--green)">-${fmt(o.bundle_discount)}</b></div>` : ''}
          ${o.discount ? `<div class="sum-row"><span>${T('discountLbl')} <span class="num">(${esc(o.coupon_code || '')})</span></span><b class="num" style="color:var(--green)">-${fmt(o.discount)}</b></div>` : ''}
          <div class="sum-row"><span>${T('delivery')}</span>${o.delivery_fee ? money(o.delivery_fee) : `<b style="color:var(--green)">${T('free')}</b>`}</div>
          ${o.wallet_used ? `<div class="sum-row"><span>${T('walletUsed')}</span><b class="num" style="color:var(--green)">-${fmt(o.wallet_used)}</b></div>` : ''}
          <div class="sum-row total"><span>${T('total')}</span>${money(o.total)}</div>
          <div class="sum-row"><span>${T('payment')}</span><b>${T('cod')}</b></div>
          ${o.status === 'pending' ? `<button class="btn btn-danger btn-block" id="cancelBtn" style="margin-top:10px">${T('cancelOrder')}</button>` : ''}
        </div>
      </div>`;
    if (o.status === 'delivered' && S.settings.reviews_enabled !== '0') drawRateBox(o);
    const cb = $('#cancelBtn');
    if (cb) cb.onclick = async () => {
      if (!confirm(T('confirmCancel'))) return;
      try { await api(`/orders/${o.id}/cancel`, { method: 'POST' }); viewOrder(o.id); } catch (e) { toast(errMsg(e)); }
    };
  }

  async function drawRateBox(o) {
    const todo = (await api('/me/to-review').catch(() => [])).filter((x) => o.items.some((i) => i.product_id === x.id));
    const el = $('#rateBox'); if (!el || !todo.length) { if (el) el.innerHTML = ''; return; }
    el.innerHTML = `<div class="card rate-box"><b>${I.star}${T('rateBuys')}</b><small>${T('rateBuysSub')}</small>
      ${todo.map((x) => `<div class="rate-row"><img src="${img(x.image)}" alt=""><span>${bidiName(L(x, 'name'))}</span><button class="btn btn-primary" data-rate="${x.id}">${T('rateNow')}</button></div>`).join('')}</div>`;
    el.querySelectorAll('[data-rate]').forEach((b) => b.onclick = () => openReviewForm(Number(b.dataset.rate), null, () => drawRateBox(o)));
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

  // ================= repair =================
  const SVC_ICON = { screen: '📱', battery: '🔋', charging: '🔌', back: '🪟', camera: '📷', audio: '🔊', water: '💧', software: '⚙️', other: '🛠️' };
  async function viewRepair(resume, start) {
    app.innerHTML = '<div class="spinner"></div>';
    const cat = await api('/repair/catalog').catch(() => ({ enabled: false }));
    if (!cat.enabled) { app.innerHTML = `<div class="empty"><h3>${T('err_repair_disabled')}</h3><a class="btn btn-primary" href="#/">${T('backToShop')}</a></div>`; return; }
    let st = { brand: null, model: null, service: null, quote: null, quality: null, problem: '', method: 'walkin', day: null, slot: null, city: '', address: '' };
    if (resume) { const d = store.get('repair_draft', null); if (d) st = { ...st, ...d }; store.del('repair_draft'); }
    const wa = String(S.settings.whatsapp || '').replace(/\D/g, '');
    const shell = (title, body, n) => `${pageHead(T('repairTitle'))}<div class="container wizard"><div class="wz-progress"><i style="width:${n * 20}%"></i></div><div class="wz-step">${esc(T('step', { x: n, y: 5 }))}</div><h2 class="wz-q">${title}</h2>${body}</div>`;
    const svcName = (sv) => L(sv, 'name');
    const intro = () => {
      const promises = [['p_price', I.money], ['p_approval', I.check], ['p_oldpart', I.swap], ['p_warranty', I.shield], ['p_free', I.gift], ['p_front', I.clock]];
      if (cat.pickup && !cat.pickup_fee) promises.splice(1, 0, ['p_pickup', I.truck]);
      app.innerHTML = `${pageHead(T('repairTitle'))}<div class="container wizard">
        <div class="repair-hero"><div class="rh-ic">${I.wrench}</div><h2>${T('repairTitle')}</h2><p>${T('repairSub')}</p>
          <button class="btn btn-primary" id="startR">${T('repairStart')}</button></div>
        <div class="promises">${promises.map(([k, ic]) => `<div class="promise">${ic}<span>${T(k)}</span></div>`).join('')}</div>
        <div class="card how"><h3>${T('howTitle')}</h3><ol>${['how1', 'how2', 'how3', 'how4'].map((k) => `<li>${T(k)}</li>`).join('')}</ol></div>
        <details class="card faq"><summary>🔒 ${T('privacyTitle')}</summary><p>${esc(T('privacyText'))}</p></details>
        <div class="repair-links"><a href="#/repairs">${I.wrench}${T('myRepairs')}</a><a href="#/warranty">${I.shield}${T('checkWarranty')}</a></div></div>`;
      $('#startR').onclick = s1;
    };
    const brands = [...new Set(cat.models.map((m) => m.brand))];
    const s1 = () => {
      app.innerHTML = shell(T('rModel'), `<div class="wz-options">${brands.map((b) => `<button class="wz-opt ${st.brand === b ? 'on' : ''}" data-b="${esc(b)}">${esc(b)}</button>`).join('')}</div>
        <div id="mdl"></div>${wa ? `<a class="wz-link" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent(T('repairTitle'))}">${T('modelNotListed')}</a>` : ''}`, 1);
      const drawModels = () => {
        if (!st.brand) return;
        $('#mdl').innerHTML = `<div class="wz-options list" style="margin-top:12px">${cat.models.filter((m) => m.brand === st.brand).map((m) => `<button class="wz-opt" data-m="${esc(m.model)}">${esc(m.model)}</button>`).join('')}</div>`;
        app.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { st.model = b.dataset.m; s2(); });
      };
      app.querySelectorAll('[data-b]').forEach((b) => b.onclick = () => { st.brand = b.dataset.b; app.querySelectorAll('[data-b]').forEach((x) => x.classList.toggle('on', x === b)); drawModels(); });
      drawModels();
    };
    const s2 = () => {
      app.innerHTML = shell(T('rIssue'), `<div class="svc-grid">${cat.services.map((sv) => `<button class="svc" data-s="${sv.id}"><span>${SVC_ICON[sv.key] || '🛠️'}</span>${esc(svcName(sv))}</button>`).join('')}</div>
        <button class="btn btn-soft wz-back">${T('back')}</button>`, 2);
      app.querySelectorAll('[data-s]').forEach((b) => b.onclick = async () => { st.service = cat.services.find((x) => x.id === Number(b.dataset.s)); await s3(); });
      app.querySelector('.wz-back').onclick = s1;
    };
    const s3 = async () => {
      app.innerHTML = '<div class="spinner"></div>';
      st.quote = await api(`/repair/quote?${new URLSearchParams({ brand: st.brand, model: st.model, service: st.service.id })}`);
      const q = st.quote;
      if (q.options.length === 1) st.quality = q.options[0].quality;
      app.innerHTML = shell(`${esc(st.model)} — ${esc(svcName(st.service))}`, `
        ${q.advice ? `<div class="advice">${I.help}<div><b>${T('adviceTitle')}</b><p>${esc(T('adviceText', { r: `${fmt(q.advice.repair_price)} ${T('currency')}`, v: `${fmt(q.advice.phone_value)} ${T('currency')}` }))}</p>
          ${S.settings.tradein_enabled === '1' ? `<a class="btn btn-soft" href="#/tradein">${I.swap}${T('adviceBtn')}</a>` : ''}</div></div>` : ''}
        <div class="r-options">${q.options.map((o) => `<button class="r-opt ${st.quality === o.quality ? 'on' : ''}" data-rq="${o.quality}">
          <div class="ro-top"><b>${T(`q_${o.quality}`)}</b>${o.quality === 'diagnosis' ? `<span class="free">${T('free')}</span>` : money(o.price)}</div>
          <div class="ro-meta"><span>${I.shield}${esc(T('warrantyDays', { x: o.warranty_days }))}</span>${q.duration_min ? `<span>${I.clock}${esc(T('durationMin', { x: q.duration_min }))}</span>` : ''}${q.duration_min && q.duration_min <= 60 ? `<span class="front">${I.check}${T('inFront')}</span>` : ''}</div></button>`).join('')}</div>
        ${q.needs_diagnosis || cat.free_diagnosis ? `<p class="ti-note">${I.gift}<span>${T('freeDiag')}</span></p>` : ''}
        <div class="field"><label>${T('problemLbl')}</label><textarea class="input" id="prob">${esc(st.problem)}</textarea></div>
        <button class="btn btn-primary btn-block" id="n3" ${st.quality ? '' : 'disabled'}>${T('next')}</button><button class="btn btn-soft wz-back">${T('back')}</button>`, 3);
      app.querySelectorAll('[data-rq]').forEach((b) => b.onclick = () => { st.quality = b.dataset.rq; app.querySelectorAll('[data-rq]').forEach((x) => x.classList.toggle('on', x === b)); $('#n3').disabled = false; });
      $('#n3').onclick = () => { st.problem = $('#prob').value; s4(); };
      app.querySelector('.wz-back').onclick = s2;
    };
    const s4 = async () => {
      const days = []; const base = new Date(Date.now() + 3 * 3600e3);
      for (let i = 0; i < 7; i++) days.push(new Date(base.getTime() + i * 864e5).toISOString().slice(0, 10));
      if (!st.day) st.day = days[0];
      const loc = S.lang === 'en' ? 'en-GB' : 'ar-IQ';
      const dayLbl = (d) => { const x = new Date(`${d}T12:00:00Z`); return `<b>${x.toLocaleDateString(loc, { weekday: 'short', timeZone: 'UTC' })}</b><small class="num">${d.slice(8)}/${d.slice(5, 7)}</small>`; };
      app.innerHTML = shell(T('rMethod'), `
        <div class="wz-options"><button class="wz-opt ${st.method === 'walkin' ? 'on' : ''}" data-meth="walkin">🏪 ${T('walkin')}</button>
          ${cat.pickup ? `<button class="wz-opt ${st.method === 'pickup' ? 'on' : ''}" data-meth="pickup">🚗 ${T('pickup')}<br>${cat.pickup_fee ? `<small>${esc(T('pickupFee', { x: `${fmt(cat.pickup_fee)} ${T('currency')}` }))}</small>` : `<small class="free-tag">${T('pickupFree')}</small>`}</button>` : ''}</div>
        <div id="methBox" style="margin-top:14px"></div>
        <button class="btn btn-primary btn-block" id="n4" style="margin-top:14px">${T('next')}</button><button class="btn btn-soft wz-back">${T('back')}</button>`, 4);
      const draw = async () => {
        const box = $('#methBox');
        if (st.method === 'pickup') {
          box.innerHTML = `<div class="field"><label>${T('city')}</label><select class="input" id="rcity">${zones().map((z) => `<option ${z.name === st.city ? 'selected' : ''}>${esc(z.name)}</option>`).join('')}</select></div>
            <div class="field"><label>${T('address')}</label><input class="input" id="raddr" value="${esc(st.address)}"></div>`;
          return;
        }
        box.innerHTML = `<div class="section-title" style="font-size:15px;margin:0 0 8px">${T('chooseDay')}</div><div class="days">${days.map((d) => `<button class="day ${st.day === d ? 'on' : ''}" data-day="${d}">${dayLbl(d)}</button>`).join('')}</div>
          <div class="section-title" style="font-size:15px;margin:14px 0 8px">${T('chooseTime')}</div><div id="slots"><div class="spinner" style="margin:10px auto"></div></div>`;
        box.querySelectorAll('[data-day]').forEach((b) => b.onclick = () => { st.day = b.dataset.day; st.slot = null; draw(); });
        const slots = await api(`/repair/slots?date=${st.day}`).catch(() => []);
        $('#slots').innerHTML = slots.length ? `<div class="slots">${slots.map((x) => `<button class="slot ${st.slot === x.slot ? 'on' : ''}" data-slot="${x.slot}" ${x.free ? '' : 'disabled'}><span class="num">${x.time}</span>${x.free ? '' : `<small>${T('full')}</small>`}</button>`).join('')}</div>` : `<p class="muted-lbl">${T('noSlots')}</p>`;
        $('#slots').querySelectorAll('[data-slot]').forEach((b) => b.onclick = () => { st.slot = b.dataset.slot; $('#slots').querySelectorAll('[data-slot]').forEach((x) => x.classList.toggle('on', x === b)); });
      };
      app.querySelectorAll('[data-meth]').forEach((b) => b.onclick = () => { st.method = b.dataset.meth; app.querySelectorAll('[data-meth]').forEach((x) => x.classList.toggle('on', x === b)); draw(); });
      $('#n4').onclick = () => {
        if (st.method === 'pickup') { st.city = $('#rcity').value; st.address = $('#raddr').value.trim(); if (!st.address) return toast(T('err_invalid_input')); }
        else if (!st.slot) return toast(T('chooseTime'));
        s5();
      };
      app.querySelector('.wz-back').onclick = s3;
      draw();
    };
    const s5 = () => {
      const o = st.quote.options.find((x) => x.quality === st.quality);
      const fee = st.method === 'pickup' ? cat.pickup_fee : 0;
      app.innerHTML = shell(T('rSummary'), `<div class="card summary" style="position:static">
          <div class="sum-row"><span>${T('rModel')}</span><b>${esc(`${st.brand} ${st.model}`)}</b></div>
          <div class="sum-row"><span>${T('rIssue')}</span><b>${esc(svcName(st.service))}</b></div>
          <div class="sum-row"><span>${T(`q_${st.quality}`)}</span>${o.quality === 'diagnosis' ? `<b>${T('q_diagnosis')}</b>` : money(o.price)}</div>
          <div class="sum-row"><span>${T('certTitle')}</span><b>${esc(T('warrantyDays', { x: o.warranty_days }))}</b></div>
          <div class="sum-row"><span>${st.method === 'pickup' ? T('pickup') : T('walkin')}</span><b class="num">${esc(st.method === 'pickup' ? `${st.city} — ${st.address}` : st.slot)}</b></div>
          ${fee ? `<div class="sum-row"><span>${esc(T('pickupFee', { x: '' }))}</span>${money(fee)}</div>` : ''}
          ${o.quality !== 'diagnosis' ? `<div class="sum-row total"><span>${T('total')}</span>${money(o.price + fee)}</div>` : ''}
          <p class="ti-note">${I.check}<span>${T('p_approval')}</span></p>
          <button class="btn btn-primary btn-block" id="book">${I.wrench}${T('confirmRepair')}</button></div>
          <button class="btn btn-soft wz-back">${T('back')}</button>`, 5);
      app.querySelector('.wz-back').onclick = s4;
      $('#book').onclick = async () => {
        if (!S.user) { store.set('repair_draft', st); location.hash = `#/quick?next=${encodeURIComponent('repair?resume=1')}`; return; }
        const btn = $('#book'); btn.disabled = true;
        try {
          const r = await api('/repairs', { method: 'POST', body: { brand: st.brand, model: st.model, service_id: st.service.id, quality: st.quality, method: st.method, appointment: st.slot, city: st.city, address: st.address, problem: st.problem } });
          toast(T('repairBooked'));
          location.hash = `#/repairs/${r.code}`;
        } catch (e) { btn.disabled = false; toast(errMsg(e)); if (e.code === 'repair_slot') s4(); }
      };
    };
    if (resume && st.quote && st.quality) s5(); else if (start) s1(); else intro();
  }

  async function viewRepairs(code) {
    if (!S.user) { location.hash = '#/quick?next=repairs'; return; }
    if (code) return viewRepairTicket(code);
    app.innerHTML = `${pageHead(T('myRepairs'))}<div class="container" style="padding-top:16px" id="rl"><div class="spinner"></div></div>`;
    const list = await api('/repairs').catch(() => []);
    $('#rl').innerHTML = list.length ? list.map((r) => `<a class="card order-card" href="#/repairs/${esc(r.code)}">
        <div class="hd"><div><b class="num">${esc(r.code)}</b><div class="date">${esc(`${r.brand} ${r.model}`)} · ${esc(L(r.service, 'name'))}</div></div><span class="st ${rStCls(r.status)}">${T(`rs_${r.status}`)}</span></div>
        <div class="ft"><span>${esc(r.appointment || r.city || '')}</span>${r.quality === 'diagnosis' && r.final_price == null ? `<b>${T('q_diagnosis')}</b>` : money(r.total)}</div></a>`).join('')
      : `<div class="empty"><div class="ic sq">${I.wrench}</div><h3>${T('noRepairs')}</h3><a class="btn btn-primary" href="#/repair">${T('repairStart')}</a></div>`;
  }
  const rStCls = (s) => ({ booked: 'pending', received: 'preparing', diagnosing: 'preparing', awaiting_approval: 'cancelled', repairing: 'shipping', testing: 'shipping', ready: 'delivered', delivered: 'delivered', cancelled: 'cancelled' }[s] || 'pending');

  async function viewRepairTicket(code) {
    app.innerHTML = '<div class="spinner"></div>';
    let r;
    try { r = await api(`/repairs/${encodeURIComponent(code)}`); } catch { location.hash = '#/repairs'; return; }
    const flow = ['booked', 'received', 'diagnosing', 'repairing', 'testing', 'ready', 'delivered'];
    const cur = r.status === 'awaiting_approval' ? flow.indexOf('diagnosing') : flow.indexOf(r.status);
    const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
    const valid = r.warranty_until && r.warranty_until >= today;
    app.innerHTML = `${pageHead(esc(T('repairNo', { x: r.code })), `<span class="st ${rStCls(r.status)}">${T(`rs_${r.status}`)}</span>`)}
      <div class="container cart-layout"><div>
        ${r.status === 'awaiting_approval' && r.extra_status === 'pending' ? `<div class="card approval"><b>${T('extraTitle')}</b><p>${esc(r.extra_note || '')}</p>
          <div class="ex-price">${esc(T('extraAsk', { x: `${fmt(r.extra_price)} ${T('currency')}` }))}</div>
          <div class="fd-actions"><button class="btn btn-soft" data-dec="0">${T('reject')}</button><button class="btn btn-primary" data-dec="1">${T('approve')}</button></div>
          <small>${T('extraRejectedNote')}</small></div>` : ''}
        ${r.status !== 'cancelled' ? `<div class="card r-timeline">${flow.map((st, i) => `<div class="rt ${i <= cur ? 'done' : ''} ${i === cur ? 'cur' : ''}"><i></i><span>${T(`rs_${st}`)}</span></div>`).join('')}</div>` : ''}
        ${r.photos.length ? `<div class="card" style="padding:16px;margin-bottom:14px"><h3 style="margin:0 0 10px;font-size:16px">${T('photosTitle')}</h3><div class="r-photos">${r.photos.map((p) => `<a href="${img(p)}" target="_blank" rel="noopener"><img src="${img(p)}" alt=""></a>`).join('')}</div></div>` : ''}
        ${r.status === 'delivered' && r.warranty_until ? `<div class="card cert" id="cert"><div class="cert-hd">${I.shield}<b>${T('certTitle')}</b></div>
          <div class="cert-code num">${esc(r.code)}</div><div class="cert-dev">${esc(`${r.brand} ${r.model}`)} · ${esc(L(r.service, 'name'))} · ${T(`q_${r.quality}`)}</div>
          <div class="cert-valid ${valid ? 'ok' : 'no'}">${valid ? esc(T('validUntil', { x: r.warranty_until })) : T('expired')}</div>
          <div id="qr"></div><div class="cert-url num">${esc(`${location.origin}/#/warranty/${r.code}`)}</div>
          ${r.old_part_returned ? `<div class="ti-note" style="justify-content:center">${I.check}<span>${T('oldPartBack')}</span></div>` : ''}
          <button class="btn btn-soft" id="printCert">${T('printCert')}</button></div>` : ''}
      </div>
      <div class="card summary">
        <div class="sum-row"><span>${T('rModel')}</span><b>${esc(`${r.brand} ${r.model}`)}</b></div>
        <div class="sum-row"><span>${T('rIssue')}</span><b>${esc(L(r.service, 'name'))}</b></div>
        <div class="sum-row"><span>${T(`q_${r.quality}`)}</span>${r.quality === 'diagnosis' && r.final_price == null ? `<b>${T('q_diagnosis')}</b>` : money(r.quoted_price)}</div>
        ${r.approved_extra ? `<div class="sum-row"><span>+ ${esc(r.extra_note || '')}</span>${money(r.approved_extra)}</div>` : ''}
        ${r.pickup_fee ? `<div class="sum-row"><span>${esc(T('pickupFee', { x: '' }))}</span>${money(r.pickup_fee)}</div>` : ''}
        <div class="sum-row total"><span>${T('total')}</span>${money(r.total)}</div>
        <div class="sum-row"><span>${r.method === 'pickup' ? T('pickup') : T('walkin')}</span><b class="num">${esc(r.appointment || `${r.city || ''} — ${r.address || ''}`)}</b></div>
        <div class="sum-row"><span>${T('certTitle')}</span><b>${esc(T('warrantyDays', { x: r.warranty_days }))}</b></div>
        ${r.status === 'booked' ? `<button class="btn btn-danger btn-block" id="rCancel" style="margin-top:10px">${T('cancelOrder')}</button>` : ''}
      </div></div>`;
    app.querySelectorAll('[data-dec]').forEach((b) => b.onclick = async () => {
      try { await api(`/repairs/${r.code}/decision`, { method: 'POST', body: { approve: b.dataset.dec === '1' } }); viewRepairTicket(r.code); } catch (e) { toast(errMsg(e)); }
    });
    if ($('#rCancel')) $('#rCancel').onclick = async () => { if (!confirm(T('confirmCancel'))) return; await api(`/repairs/${r.code}/cancel`, { method: 'POST' }).catch(() => {}); viewRepairTicket(r.code); };
    if ($('#printCert')) $('#printCert').onclick = () => window.print();
    if ($('#qr')) drawQr($('#qr'), `${location.origin}/#/warranty/${r.code}`);
  }
  // QR code for the warranty certificate (library loaded only when needed; the link text is shown anyway).
  function drawQr(el, text) {
    const go = () => { try { const q = window.qrcode(0, 'M'); q.addData(text); q.make(); el.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2 }); } catch { /* no QR */ } };
    if (window.qrcode) return go();
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'; sc.onload = go; document.head.appendChild(sc);
  }

  async function viewWarranty(code) {
    app.innerHTML = `${pageHead(T('checkWarranty'))}<div class="container" style="max-width:520px;padding-top:20px">
      <form class="card" id="wf" style="padding:20px"><div class="field"><label>${T('warrantyCode')}</label><input class="input num" name="code" value="${esc(code || '')}" placeholder="RXXXXXX" style="text-transform:uppercase;text-align:start" required></div>
      <button class="btn btn-primary btn-block">${I.shield}${T('check')}</button></form><div id="wres" style="margin-top:14px"></div></div>`;
    const check = async (c) => {
      try {
        const w = await api(`/warranty/${encodeURIComponent(c.trim())}`);
        $('#wres').innerHTML = `<div class="card cert"><div class="cert-hd">${I.shield}<b>${T('certTitle')}</b></div><div class="cert-code num">${esc(w.code)}</div>
          <div class="cert-dev">${esc(`${w.brand} ${w.model}`)} · ${esc(L(w.service, 'name'))} · ${T(`q_${w.quality}`)}</div>
          <div class="cert-valid ${w.valid ? 'ok' : 'no'}">${w.valid ? esc(T('validUntil', { x: w.warranty_until })) : T('expired')}</div></div>`;
      } catch { $('#wres').innerHTML = `<div class="err">${T('warrantyNotFound')}</div>`; }
    };
    $('#wf').onsubmit = (e) => { e.preventDefault(); check(e.target.code.value); };
    if (code) check(code);
  }

  // ================= trade-in wizard =================
  const TI_Q = { screen: ['perfect', 'scratches', 'cracked'], body: ['perfect', 'scratches', 'damaged'], battery: ['good', 'ok', 'weak'], works: ['yes', 'no'], box: ['yes', 'no'] };
  async function viewTradein(fromCart) {
    app.innerHTML = '<div class="spinner"></div>';
    const data = await api('/tradein/models').catch(() => ({ enabled: false, models: [] }));
    if (!data.enabled) { app.innerHTML = `<div class="empty"><h3>${T('err_tradein_disabled')}</h3><a class="btn btn-primary" href="#/">${T('backToShop')}</a></div>`; return; }
    const models = data.models;
    const st = { brand: null, model: null, model_id: null, answers: {} };
    const qKeys = Object.keys(TI_Q);
    const wa = String(S.settings.whatsapp || '').replace(/\D/g, '');
    const shell = (title, body, stepNo, total) => `${pageHead(T('tiTitle'))}<div class="container wizard">
      <div class="wz-progress"><i style="width:${Math.round((stepNo / total) * 100)}%"></i></div>
      <div class="wz-step">${esc(T('step', { x: stepNo, y: total }))}</div><h2 class="wz-q">${title}</h2>${body}</div>`;
    const total = 3 + qKeys.length;
    const brands = [...new Set(models.map((m) => m.brand))];
    const stepBrand = () => {
      app.innerHTML = shell(T('tiBrand'), `<p class="wz-sub">${T('tiSub')}</p><div class="wz-options">${brands.map((b) => `<button class="wz-opt" data-v="${esc(b)}">${esc(b)}</button>`).join('')}</div>
        ${wa ? `<a class="wz-link" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent(T('tiTitle'))}">${T('tiNotListed')}</a>` : ''}`, 1, total);
      app.querySelectorAll('[data-v]').forEach((b) => b.onclick = () => { st.brand = b.dataset.v; stepModel(); });
    };
    const stepModel = () => {
      const names = [...new Set(models.filter((m) => m.brand === st.brand).map((m) => m.model))];
      app.innerHTML = shell(T('tiModel'), `<div class="wz-options list">${names.map((n) => `<button class="wz-opt" data-v="${esc(n)}">${esc(n)}</button>`).join('')}</div>
        <button class="btn btn-soft wz-back">${T('back')}</button>`, 2, total);
      app.querySelectorAll('[data-v]').forEach((b) => b.onclick = () => { st.model = b.dataset.v; stepStorage(); });
      app.querySelector('.wz-back').onclick = stepBrand;
    };
    const stepStorage = () => {
      const opts = models.filter((m) => m.brand === st.brand && m.model === st.model);
      if (opts.length === 1) { st.model_id = opts[0].id; return stepQ(0); }
      app.innerHTML = shell(T('tiStorage'), `<div class="wz-options">${opts.map((m) => `<button class="wz-opt" data-v="${m.id}">${m.storage_gb >= 1024 ? `${m.storage_gb / 1024}TB` : `${m.storage_gb}GB`}</button>`).join('')}</div>
        <button class="btn btn-soft wz-back">${T('back')}</button>`, 3, total);
      app.querySelectorAll('[data-v]').forEach((b) => b.onclick = () => { st.model_id = Number(b.dataset.v); stepQ(0); });
      app.querySelector('.wz-back').onclick = stepModel;
    };
    const stepQ = (i) => {
      if (i >= qKeys.length) return result();
      const q = qKeys[i];
      app.innerHTML = shell(T(`q_${q}`), `<div class="wz-options list">${TI_Q[q].map((a) => `<button class="wz-opt ${st.answers[q] === a ? 'on' : ''}" data-v="${a}">${T(`a_${q}_${a}`)}</button>`).join('')}</div>
        <button class="btn btn-soft wz-back">${T('back')}</button>`, 4 + i, total);
      app.querySelectorAll('[data-v]').forEach((b) => b.onclick = () => { st.answers[q] = b.dataset.v; stepQ(i + 1); });
      app.querySelector('.wz-back').onclick = () => (i ? stepQ(i - 1) : stepStorage());
    };
    const result = async () => {
      app.innerHTML = '<div class="spinner"></div>';
      let q;
      try { q = await api('/tradein/quote', { method: 'POST', body: { model_id: st.model_id, answers: st.answers } }); }
      catch (e) { app.innerHTML = `<div class="empty"><h3>${esc(errMsg(e))}</h3><button class="btn btn-primary" id="again">${T('retake')}</button></div>`; $('#again').onclick = stepBrand; return; }
      const hasCart = cartCount() > 0;
      app.innerHTML = `${pageHead(T('tiTitle'))}<div class="container wizard"><div class="card ti-result">
        <div class="ic">${I.swap}</div><div class="lbl">${esc(q.label)}</div>
        <div class="muted-lbl">${T('tiResult')}</div><div class="ti-price">${money(q.estimate)}</div>
        ${q.breakdown.length ? `<ul class="ti-break">${q.breakdown.map((b) => `<li><span>${T(`qs_${b.q}`)}: <b>${T(`a_${b.q}_${b.a}`)}</b></span><b class="num">-${b.pct}%</b></li>`).join('')}</ul>` : ''}
        <p class="ti-note">${I.shield}<span>${T('tiNote')}</span></p>
        ${hasCart ? `<button class="btn btn-primary btn-block" id="useTi">${I.basket}${T('tiUse')}</button>` : ''}
        <a class="btn ${hasCart ? 'btn-soft' : 'btn-primary'} btn-block" href="#/finder" id="shopTi" style="margin-top:10px">${I.spark}${T('tiShop')}</a>
        <button class="btn btn-soft btn-block" id="againTi" style="margin-top:10px">${T('retake')}</button></div></div>`;
      const save = () => { S.tradein = { model_id: st.model_id, answers: st.answers, estimate: q.estimate, label: q.label }; store.set('tradein', S.tradein); };
      if (hasCart) $('#useTi').onclick = () => { save(); toast(T('tiApplied')); location.hash = '#/cart'; };
      $('#shopTi').onclick = () => save(); // keep it: it will show in the cart later
      $('#againTi').onclick = () => { st.answers = {}; stepBrand(); };
    };
    stepBrand();
  }

  // ================= phone finder =================
  async function viewFinder() {
    const st = { budget: null, os: null, uses: [], storage: 0 };
    const B = [[0, 150000], [150000, 300000], [300000, 600000], [600000, 1000000], [1000000, 1500000], [1500000, 0], [0, 0]];
    const bLabel = ([min, max]) => (!min && !max ? T('fAny') : !min ? T('upTo', { x: fmt(max) }) : !max ? T('over', { x: fmt(min) }) : `${fmt(min)} – ${fmt(max)}`);
    const shell = (title, body, stepNo) => `${pageHead(T('finderTitle'))}<div class="container wizard">
      <div class="wz-progress"><i style="width:${stepNo * 25}%"></i></div><div class="wz-step">${esc(T('step', { x: stepNo, y: 4 }))}</div><h2 class="wz-q">${title}</h2>${body}</div>`;
    const s1 = () => {
      app.innerHTML = shell(T('fBudget'), `<p class="wz-sub">${T('finderSub')}</p><div class="wz-options list">${B.map((b, i) => `<button class="wz-opt" data-i="${i}">${esc(bLabel(b))} ${b[0] || b[1] ? `<small>${T('currency')}</small>` : ''}</button>`).join('')}</div>
        <form class="budget-custom" id="bc"><input class="input num" type="number" min="10000" step="5000" inputmode="numeric" name="max" placeholder="${esc(T('budgetCustom'))}"><button class="btn btn-primary">${T('next')}</button></form>`, 1);
      app.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => { st.budget = B[Number(b.dataset.i)]; s2(); });
      $('#bc').onsubmit = (e) => { e.preventDefault(); const v = Number(e.target.max.value); if (v > 0) { st.budget = [0, v]; s2(); } };
    };
    const s2 = () => {
      app.innerHTML = shell(T('fOs'), `<div class="wz-options">${[['ios', T('iphone')], ['android', T('android')], ['', T('fAny')]].map(([k, l]) => `<button class="wz-opt" data-v="${k}">${l}</button>`).join('')}</div><button class="btn btn-soft wz-back">${T('back')}</button>`, 2);
      app.querySelectorAll('[data-v]').forEach((b) => b.onclick = () => { st.os = b.dataset.v || null; s3(); });
      app.querySelector('.wz-back').onclick = s1;
    };
    const s3 = () => {
      const uses = ['camera', 'battery', 'gaming', 'social', 'basic'];
      app.innerHTML = shell(T('fUses'), `<div class="wz-options">${uses.map((u) => `<button class="wz-opt ${st.uses.includes(u) ? 'on' : ''}" data-u="${u}">${T(`use_${u}`)}</button>`).join('')}</div>
        <button class="btn btn-primary btn-block" id="n3" style="margin-top:14px">${T('next')}</button><button class="btn btn-soft wz-back">${T('back')}</button>`, 3);
      app.querySelectorAll('[data-u]').forEach((b) => b.onclick = () => { const u = b.dataset.u; st.uses = st.uses.includes(u) ? st.uses.filter((x) => x !== u) : [...st.uses, u]; b.classList.toggle('on'); });
      $('#n3').onclick = s4; app.querySelector('.wz-back').onclick = s2;
    };
    const s4 = () => {
      app.innerHTML = shell(T('fStorage'), `<div class="wz-options">${[[64, '64GB+'], [128, '128GB+'], [256, '256GB+'], [0, T('dontKnow')]].map(([v, l]) => `<button class="wz-opt" data-v="${v}">${l}</button>`).join('')}</div><button class="btn btn-soft wz-back">${T('back')}</button>`, 4);
      app.querySelectorAll('[data-v]').forEach((b) => b.onclick = () => { st.storage = Number(b.dataset.v); results(); });
      app.querySelector('.wz-back').onclick = s3;
    };
    const card = (r) => {
      productCache.set(r.product.id, r.product);
      return `<div class="card fd-card ${r.best ? 'best' : ''}">
        ${r.best ? `<span class="fd-badge">${I.star}${T('bestPick')}</span>` : r.best_value ? `<span class="fd-badge value">${T('bestValue')}</span>` : ''}
        <a href="#/product/${r.product.id}" class="fd-img"><img src="${img(r.product.image)}" alt=""></a>
        <div class="fd-body">
          <div class="nm">${esc(L(r.product, 'name'))}${r.variant ? ` <span class="vlabel">${esc(r.variant.label)}</span>` : ''}</div>
          ${money(r.price)}
          ${r.match != null ? `<div class="fd-match"><div class="bar"><i style="width:${r.match}%"></i></div><span>${esc(T('match', { x: r.match }))}</span></div>` : ''}
          <ul class="fd-reasons">${r.reasons.map((x) => `<li>${I.check}<span>${esc(T(`r_${x.code}`, { x: x.code === 'under_budget' ? `${fmt(x.x)} ${T('currency')}` : x.x }))}</span></li>`).join('')}</ul>
          <div class="fd-actions"><a class="btn btn-soft" href="#/product/${r.product.id}">${T('viewProduct')}</a><button class="btn btn-primary" data-fadd="${r.product.id}" data-fvar="${r.variant ? r.variant.id : ''}">${I.basket}${T('addToCart')}</button></div>
        </div></div>`;
    };
    const results = async () => {
      app.innerHTML = '<div class="spinner"></div>';
      const [min, max] = st.budget;
      const qs = new URLSearchParams({ min, max, os: st.os || '', uses: st.uses.join(','), storage: st.storage });
      const r = await api(`/finder?${qs}`).catch(() => ({ results: [], stretch: null }));
      app.innerHTML = `${pageHead(T('finderTitle'))}<div class="container wizard wide">
        ${r.results.length ? `<div class="fd-grid">${r.results.map(card).join('')}</div>`
          : `<div class="empty" style="padding:30px 10px 10px"><div class="ic sq">${I.search}</div><h3>${T('noMatch')}</h3></div>
             ${r.stretch ? `<p class="wz-sub" style="text-align:center">${esc(T('stretchHint', { x: `${fmt(r.stretch.over_by)} ${T('currency')}` }))}</p><div class="fd-grid">${card(r.stretch)}</div>` : ''}`}
        <button class="btn btn-soft btn-block" id="retake" style="margin-top:16px">${T('retake')}</button>
        ${S.settings.tradein_enabled === '1' ? `<a class="ti-banner" href="#/tradein" style="margin-top:12px">${I.swap}<span>${T('tiCartBanner')}</span>${I.chev}</a>` : ''}</div>`;
      $('#retake').onclick = () => { st.uses = []; s1(); };
      app.querySelectorAll('[data-fadd]').forEach((b) => b.onclick = () => {
        const res = [...r.results, r.stretch].filter(Boolean).find((x) => x.product.id === Number(b.dataset.fadd));
        addToCart(res.product, 1, res.variant || null);
      });
    };
    s1();
  }

  async function viewFaq() {
    app.innerHTML = `${pageHead(T('faq'))}<div class="container" style="max-width:760px;padding-top:18px" id="faqList"><div class="spinner"></div></div>`;
    const list = await api('/faqs').catch(() => []);
    $('#faqList').innerHTML = list.map((f) => `<details class="card faq"><summary>${esc(L(f, 'q'))}</summary><p>${esc(L(f, 'a'))}</p></details>`).join('')
      + `<div class="empty" style="padding:24px"><p>${T('whatsappAsk')}</p><a class="btn btn-primary" href="#/support">${I.headset}${T('support')}</a></div>`;
  }
  function viewMaintenance() {
    app.innerHTML = `<div class="empty" style="padding:90px 20px"><div class="ic">${I.clock}</div><h3>${T('maintenanceTitle')}</h3>
      <p>${esc(S.settings.maintenance_message || T('maintenanceSub'))}</p>
      ${S.settings.whatsapp ? `<a class="btn btn-primary" style="background:#25D366" target="_blank" rel="noopener" href="https://wa.me/${esc(String(S.settings.whatsapp).replace(/\D/g, ''))}">${I.whatsapp}${T('contactWhatsapp')}</a>` : ''}</div>`;
  }
  // Anonymous page-view counter for the admin "visitor analytics" page (no cookies).
  function track(path, productId) {
    try { fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: `Bearer ${S.token}` } : {}) }, body: JSON.stringify({ path, product_id: productId || undefined, src: campaignSource() || undefined }), keepalive: true }); } catch { /* ignore */ }
  }

  // ---------------- bottom tab bar (mobile, thumb zone) ----------------
  function renderTabbar(p0) {
    const n = cartCount();
    const tabs = [['#/', I.home, T('tabHome'), !p0], ['#', I.list, T('tabCats'), false, 'data-open-cats'],
      S.settings.repair_enabled === '1' ? ['#/repair', I.wrench, T('tabRepair'), ['repair', 'repairs', 'warranty'].includes(p0)] : ['#/finder', I.spark, T('finderTitle').split(' ')[0], p0 === 'finder'],
      ['#/cart', I.basket, T('tabCart'), p0 === 'cart', '', n], ['#/profile', I.user, T('tabMe'), ['profile', 'orders', 'order', 'addresses', 'quick', 'login'].includes(p0)]];
    $('#tabbar').innerHTML = tabs.map(([href, ic, label, on, attr, badge]) => `<a href="${href}" class="${on ? 'on' : ''}" ${attr || ''}>${ic}${badge ? `<b class="num">${badge}</b>` : ''}<span>${esc(label)}</span></a>`).join('');
  }

  // ---------------- router ----------------
  function route() {
    app.onclick = null;
    S.waContext = '';
    // No floating button where the customer is finishing a purchase — it would cover the main button.
    S.hideWa = ['cart', 'checkout', 'quick', 'login', 'register', 'reset', 'tradein', 'finder', 'repair'].includes(location.hash.replace(/^#\/?/, '').split(/[/?]/)[0]);
    renderWhatsApp();
    closePanels();
    const [pathPart, query] = location.hash.replace(/^#/, '').split('?');
    const parts = pathPart.split('/').filter(Boolean);
    const qs = new URLSearchParams(query || '');
    if (qs.get('ref')) store.set('ref', qs.get('ref'));
    document.querySelectorAll('#desktopNav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === (parts[0] || 'home')));
    window.scrollTo(0, 0);
    const [p0, p1] = parts;
    // product page: sticky buy bar instead of the tab bar; checkout/sign-in: neither
    document.body.classList.toggle('has-buybar', p0 === 'product');
    document.body.classList.toggle('no-tabbar', ['product', 'checkout', 'quick', 'login', 'register', 'reset'].includes(p0));
    $('#buybar').classList.toggle('hidden', p0 !== 'product');
    renderTabbar(p0);
    track(`/${parts.slice(0, p0 === 'product' || p0 === 'category' ? 2 : 1).join('/')}`, p0 === 'product' ? Number(p1) : null);
    const staff = S.user && S.user.role && S.user.role !== 'customer';
    if (S.settings.maintenance_mode === '1' && !staff && !['login', 'quick', 'faq'].includes(p0)) return viewMaintenance();
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
      case 'faq': return viewFaq();
      case 'tradein': return viewTradein(qs.get('from') === 'cart');
      case 'finder': return viewFinder();
      case 'repair': return viewRepair(qs.get('resume') === '1', qs.get('start') === '1');
      case 'repairs': return viewRepairs(p1);
      case 'warranty': return viewWarranty(p1);
      case 'compare': return viewCompare(qs.get('ids'));
      default: return viewHome();
    }
  }

  function captureSource() {
    const qs = new URLSearchParams(location.search || (location.hash.split('?')[1] || ''));
    const src = [qs.get('utm_source') || qs.get('src'), qs.get('utm_campaign')].filter(Boolean).join('_').replace(/[^\w\-.]/g, '').slice(0, 60);
    if (src) store.set('src', { v: src, t: Date.now() });
  }
  const campaignSource = () => { const s = store.get('src', null); return s && Date.now() - s.t < 30 * 864e5 ? s.v : ''; };

  // First visit: ask which language (the phone's language is highlighted).
  function askLanguage() {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'lang-gate';
      el.innerHTML = `<div class="lang-card" role="dialog" aria-modal="true" aria-label="Language">
        <div class="logo" style="justify-content:center;margin-bottom:6px"><span>${esc(S.settings.store_name || '')}</span><span class="dot"></span></div>
        <h2>زمانێک هەڵبژێرە<br><span>اختر اللغة · Choose your language</span></h2>
        ${[['ku', 'کوردی', 'سۆرانی'], ['ar', 'العربية', 'عربي'], ['en', 'English', 'English']].map(([k, l, sub]) =>
          `<button class="lang-opt ${S.lang === k ? 'suggested' : ''}" data-pick="${k}" lang="${k === 'ku' ? 'ckb' : k}" dir="${k === 'en' ? 'ltr' : 'rtl'}"><b>${l}</b><small>${sub}</small></button>`).join('')}
      </div>`;
      document.body.appendChild(el);
      document.body.style.overflow = 'hidden';
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-pick]'); if (!b) return;
        S.lang = b.dataset.pick; S.langChosen = true; store.set('lang', S.lang);
        el.remove(); document.body.style.overflow = '';
        resolve();
      });
    });
  }

  async function init() {
    captureSource();
    $('#year').textContent = new Date().getFullYear();
    applyLang();
    const [settings, cats] = await Promise.all([api('/settings').catch(() => ({})), api('/categories').catch(() => [])]);
    S.settings = settings; S.categories = cats;
    const name = settings.store_name || 'Store';
    document.title = name;
    $('#storeName').textContent = name;
    document.querySelectorAll('.js-store-name').forEach((e) => { e.textContent = name; });
    if (settings.store_address) {
      const f = document.createElement('div'); f.className = 'footer-addr';
      f.innerHTML = `${I.map}${safeUrl(settings.store_map_url) ? `<a href="${esc(settings.store_map_url)}" target="_blank" rel="noopener">${esc(settings.store_address)}</a>` : esc(settings.store_address)}`;
      document.querySelector('.footer .container').insertBefore(f, document.querySelector('.footer .container').lastElementChild);
    }
    if (settings.slogan) { const sl = document.createElement('div'); sl.className = 'footer-slogan'; sl.textContent = settings.slogan; document.querySelector('.footer .logo').after(sl); }
    const fl = document.createElement('div'); fl.className = 'footer-links'; fl.innerHTML = `<a href="#/faq">${T('faq')}</a> · <a href="#/support">${T('support')}</a>`;
    document.querySelector('.footer .container').insertBefore(fl, document.querySelector('.footer .container').lastElementChild);
    if (S.user && S.user.role !== 'customer') { try { const me = await api('/me'); S.adminPath = me.admin_path; S.user = me.user; } catch { /* signed out */ } }
    if (!S.langChosen) { await askLanguage(); applyLang(); }
    renderMenu();
    renderWhatsApp();
    window.addEventListener('hashchange', route);
    route();
  }
  init();
})();
