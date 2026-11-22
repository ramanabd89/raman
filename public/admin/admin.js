/* Admin panel — vanilla JS. Uses the same session token as the storefront. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const root = $('#root');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const safeImg = (u) => esc(/^(https?:\/\/|\/)/i.test(String(u || '')) ? u : '/img/placeholder.svg');
  const getTok = () => { try { return JSON.parse(localStorage.getItem('token')); } catch { return null; } };
  let token = getTok();

  const TI_ST = { pending: 'بانتظار الفحص', accepted: 'مقبول', adjusted: 'تم تعديل السعر', rejected: 'مرفوض (الزبون احتفظ بجهازه)', cancelled: 'ملغي' };
  const TI_Q = { screen: ['الشاشة', { perfect: 'سليمة', scratches: 'خدوش خفيفة', cracked: 'مكسورة' }], body: ['الهيكل', { perfect: 'مثل الجديد', scratches: 'خدوش', damaged: 'ضربات/ظهر مكسور' }],
    battery: ['البطارية', { good: '85%+', ok: '80–84%', weak: 'أقل من 80%' }], works: ['يشتغل كله؟', { yes: 'نعم', no: 'بيه عطل' }], box: ['الكرتونة والشاحن', { yes: 'موجود', no: 'غير موجود' }] };
  const ROLES = { admin: 'المالك (كل الصلاحيات)', manager: 'مدير', orders: 'موظف طلبات', products: 'موظف منتجات ومخزن' };
  const SRC = { tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook', snapchat: 'Snapchat', friend: 'صديق', influencer: 'مؤثر', google: 'Google', store: 'من المحل', other: 'غير ذلك', unknown: 'لم يُحدد' };
  const ST = { pending: 'قيد الانتظار', preparing: 'قيد التجهيز', shipping: 'في الطريق', delivered: 'تم التوصيل', cancelled: 'ملغي' };
  const ERR = { tradein_model: 'الموديل غير متوفر',  coupon_exists: 'هذا الكود موجود مسبقاً',  usd_price_too_high: 'سعر الدولار غير منطقي (أكثر من 50,000$) — تأكد أنك كتبته بالدولار وليس بالدينار', usd_rate_missing: 'حدد سعر صرف الدولار من الإعدادات أولاً', invalid_city: 'مدينة غير موجودة في قائمة التوصيل', wrong_2fa_code: 'رمز التحقق غير صحيح', login_expired: 'انتهت المهلة، سجّل الدخول من جديد', already_enabled: 'التحقق بخطوتين مفعّل مسبقاً', wrong_credentials: 'الرقم أو كلمة المرور خطأ', forbidden: 'هذا الحساب ليس مديراً', invalid_input: 'يرجى ملء الحقول المطلوبة', too_many_attempts: 'محاولات كثيرة، حاول لاحقاً', order_cancelled: 'لا يمكن تغيير طلب ملغي', cannot_demote_self: 'لا يمكنك إزالة صلاحيتك', file_too_large: 'الصورة أكبر من 5MB', invalid_file: 'ملف غير صالح' };

  async function api(path, opts = {}) {
    const headers = {};
    if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`/api${path}`, { method: opts.method || 'GET', headers, body: opts.body instanceof FormData ? opts.body : opts.body ? JSON.stringify(opts.body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) { if (path !== '/auth/login') { showLogin(ERR[data.error] || ''); } }
    if (!res.ok) { const e = new Error(ERR[data.error] || data.error || 'خطأ'); e.code = data.error; throw e; }
    return data;
  }
  let tt;
  function toast(m) { const el = $('#toast'); el.textContent = m; el.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('show'), 2200); }

  async function upload(file) {
    const fd = new FormData(); fd.append('file', file);
    return (await api('/admin/upload', { method: 'POST', body: fd })).url;
  }

  // ---------- login ----------
  function showLogin(msg = '') {
    root.innerHTML = `<div class="container"><form class="card form-card" id="lf" style="margin-top:60px">
      <div class="auth-title"><div class="logo"><span>لوحة التحكم</span><span class="dot"></span></div><p>سجّل الدخول بحساب المدير</p></div>
      ${msg ? `<div class="err">${esc(msg)}</div>` : ''}
      <div class="field"><label>رقم الموبايل</label><input class="input num" name="phone" required style="text-align:start"></div>
      <div class="field"><label>كلمة المرور</label><input class="input" type="password" name="password" required></div>
      <button class="btn btn-primary btn-block">دخول</button>
      <div class="switch-link"><a href="/">← العودة للمتجر</a></div></form></div>`;
    $('#lf').onsubmit = async (e) => {
      e.preventDefault();
      try {
        let r = await api('/auth/login', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
        if (r.need_2fa) r = await askTwoFactor(r.ticket);
        if (!r) return;
        if (r.user.role === 'customer') return showLogin(ERR.forbidden);
        token = r.token;
        localStorage.setItem('token', JSON.stringify(r.token)); localStorage.setItem('user', JSON.stringify(r.user));
        ME = null; location.hash = '#/dashboard'; render();
      } catch (err) { showLogin(err.message); }
    };
  }

  function askTwoFactor(ticket) {
    return new Promise((resolve) => {
      root.innerHTML = `<div class="container"><form class="card form-card" id="tf" style="margin-top:60px">
        <div class="auth-title"><div class="logo"><span>التحقق بخطوتين</span><span class="dot"></span></div><p>اكتب الرمز من تطبيق Authenticator</p></div>
        <div id="tfErr"></div>
        <div class="field"><input class="input num otp-input" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required placeholder="••••••"></div>
        <button class="btn btn-primary btn-block">تأكيد</button></form></div>`;
      const f = $('#tf'); f.code.focus();
      f.onsubmit = async (e) => {
        e.preventDefault();
        try { resolve(await api('/auth/login/2fa', { method: 'POST', body: { ticket, code: f.code.value } })); }
        catch (err) { $('#tfErr').innerHTML = `<div class="err">${esc(err.message)}</div>`; if (err.code === 'login_expired') setTimeout(() => { showLogin(); resolve(null); }, 1500); }
      };
    });
  }

  // ---------- layout ----------
  // [route, label, section] grouped like the menu. Each staff role only sees its sections.
  const NAV = [
    ['الرئيسية', [['dashboard', '📊 لوحة المعلومات', 'dashboard'], ['analytics', '👁️ تحليل الزوار', 'analytics']]],
    ['المبيعات والطلبات', [['orders', '📦 الطلبات', 'orders'], ['users', '👥 الزبائن', 'customers'], ['carts', '🛒 السلات المتروكة', 'carts'], ['tradein', '🔄 تبديل الأجهزة', 'tradein'], ['coupons', '🏷️ الكوبونات', 'coupons'], ['expenses', '💸 المصاريف والأرباح', 'expenses']]],
    ['المخزن والمنتجات', [['products', '📱 المنتجات', 'products'], ['bulk', '💱 تغيير الأسعار بالجملة', 'products'], ['categories', '🗂️ الأقسام', 'catalog'], ['presets', '📐 قوالب الأنواع والسعات', 'products'], ['tags', '🔖 ملصقات المنتجات', 'catalog'], ['stock', '📋 حركة المخزن', 'stock']]],
    ['الموقع', [['banners', '🖼️ البانرات', 'banners'], ['faqs', '❓ الأسئلة الشائعة', 'faqs'], ['settings', '⚙️ الإعدادات', 'admin_only']]],
    ['الأمان', [['staff', '🧑‍💼 مدراء النظام', 'admin_only'], ['security', '🔒 الأمان والنسخ', 'all']]],
  ];
  let ME = null;
  const allowed = (sec) => sec === 'all' || (ME && (ME.sections === '*' || (Array.isArray(ME.sections) && ME.sections.includes(sec))));
  const isOwner = () => ME && ME.sections === '*';
  const navItems = () => NAV.flatMap(([, items]) => items).filter(([, , sec]) => allowed(sec));
  function layout(active, title, actions = '') {
    document.querySelectorAll('.modal-bg').forEach((m) => m.remove()); // close any open dialog when changing page
    root.innerHTML = `<div class="adm">
      <aside class="adm-side"><div class="logo"><span>لوحة التحكم</span><span class="dot"></span></div>
        <nav>${NAV.map(([group, items]) => { const vis = items.filter(([, , sec]) => allowed(sec)); return vis.length ? `<div class="nav-group">${group}</div>${vis.map(([k, l]) => `<a href="#/${k}" class="${k === active ? 'active' : ''}">${l}</a>`).join('')}` : ''; }).join('')}</nav>
        <div class="bottom"><a href="/" target="_blank">🛒 فتح المتجر</a><button id="lo">↩ تسجيل الخروج</button></div></aside>
      <div style="flex:1;min-width:0">
        <div class="adm-mobile-nav">${navItems().map(([k, l]) => `<a href="#/${k}" class="${k === active ? 'active' : ''}">${l}</a>`).join('')}</div>
        <div class="adm-main"><div class="adm-top"><h1>${title}</h1><div class="toolbar">${actions}</div></div><div id="content"><div class="spinner"></div></div></div>
      </div></div>`;
    $('#lo').onclick = () => { api('/auth/logout', { method: 'POST' }).catch(() => {}); localStorage.removeItem('token'); localStorage.removeItem('user'); token = null; ME = null; showLogin(); };
    return $('#content');
  }

  function modal(title, bodyHtml, onMount) {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal"><h2>${title}<button class="close-btn" data-x>✕</button></h2>${bodyHtml}</div>`;
    document.body.appendChild(bg);
    const close = () => bg.remove();
    bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-x]')) close(); });
    onMount && onMount(bg.querySelector('.modal'), close);
    return close;
  }

  function imgField(name, value, label = 'الصورة') {
    return `<div class="field full"><label>${label}</label><div class="img-field">
      <img src="${safeImg(value)}" data-preview="${name}"><input class="input" dir="ltr" name="${name}" value="${esc(value || '')}" placeholder="/uploads/... أو رابط">
      <label class="sm-btn primary" style="cursor:pointer">رفع<input type="file" accept="image/*" hidden data-upload="${name}"></label></div></div>`;
  }
  function bindUploads(m) {
    m.querySelectorAll('[data-upload]').forEach((inp) => inp.addEventListener('change', async () => {
      if (!inp.files[0]) return;
      try {
        const url = await upload(inp.files[0]);
        const n = inp.dataset.upload;
        m.querySelector(`[name="${n}"]`).value = url;
        const pv = m.querySelector(`[data-preview="${n}"]`); if (pv) pv.src = url;
      } catch (e) { toast(e.message); }
    }));
    m.querySelectorAll('.img-field input.input').forEach((i) => i.addEventListener('input', () => { const pv = m.querySelector(`[data-preview="${i.name}"]`); if (pv) pv.src = i.value; }));
  }

  // ---------- dashboard ----------
  async function dashboard() {
    const c = layout('dashboard', 'الرئيسية');
    const s = await api('/admin/stats');
    const W = {
      default_password: ['🔴', 'كلمة مرور المدير هي الافتراضية admin123', 'غيّرها فوراً من المتجر: الملف الشخصي ← تغيير الرقم والاسم.', '/#/edit-profile'],
      no_2fa: ['🔴', 'التحقق بخطوتين غير مفعّل لحسابك', 'فعّله من صفحة الأمان — يحمي المتجر حتى لو سُرقت كلمة المرور.', '#/security'],
      sms_console: ['🟠', 'رسائل التحقق في وضع التجربة', 'الرمز يظهر على الشاشة ولا يصل للزبون. اربط واتساب أو SMS (راجع README).', ''],
      no_telegram: ['🟠', 'إشعارات الطلبات على تيليجرام غير مفعّلة', 'لن تعرف بالطلب الجديد إلا إذا فتحت اللوحة (راجع README: TELEGRAM_BOT_TOKEN).', ''],
    };
    const warnHtml = (s.warnings || []).length ? `<div class="card panel warn-box"><h3>قبل الافتتاح — يحتاج انتباهك</h3>${s.warnings.map((w) => { const [ic, t, d, link] = W[w] || ['⚠️', w, '', '']; return `<div class="warn-row"><span>${ic}</span><div><b>${t}</b><div class="muted">${d}</div></div>${link ? `<a class="sm-btn primary" href="${link}">إصلاح</a>` : ''}</div>`; }).join('')}</div>` : '';
    c.innerHTML = warnHtml + `
      <div class="kpis">
        <div class="card kpi"><div class="lbl">المبيعات (طلبات مُسلّمة)</div><div class="val num">${fmt(s.revenue)} <small>د.ع</small></div></div>
        <div class="card kpi"><div class="lbl">كل الطلبات</div><div class="val num">${s.orders}</div></div>
        <div class="card kpi"><div class="lbl">بانتظار المراجعة</div><div class="val num" style="color:var(--brand)">${s.pending}</div></div>
        <div class="card kpi"><div class="lbl">طلبات اليوم</div><div class="val num">${s.today}</div></div>
        <div class="card kpi"><div class="lbl">الزبائن</div><div class="val num">${s.customers}</div></div>
        <div class="card kpi"><div class="lbl">المنتجات</div><div class="val num">${s.products}</div></div>
      </div>
      <div class="two">
        <div class="card panel"><h3>آخر الطلبات</h3>${ordersTable(s.recent, false)}</div>
        <div>
          <div class="card panel"><h3>⚠️ مخزون قليل</h3>${s.low_stock.length ? `<table class="t">${s.low_stock.map((p) => `<tr><td>${esc(p.name_ku)}</td><td class="num" style="color:${p.stock ? '#D97706' : 'var(--red)'};font-weight:800">${p.stock}</td></tr>`).join('')}</table>` : '<p class="muted">لا يوجد</p>'}</div>
          <div class="card panel"><h3>📣 من وين يجون الزبائن؟</h3>${s.sources.length ? `<table class="t"><thead><tr><th>المصدر</th><th>طلبات</th><th>مبيعات مُسلّمة</th></tr></thead>${s.sources.map((x) => `<tr><td>${esc(SRC[x.source] || x.source)}</td><td class="num">${x.orders}</td><td class="num">${fmt(x.revenue)}</td></tr>`).join('')}</table>` : '<p class="muted">لا توجد طلبات بعد</p>'}
            ${s.utm.length ? `<h3 style="margin-top:14px;font-size:15px">روابط الحملات</h3><table class="t">${s.utm.map((x) => `<tr><td class="num">${esc(x.utm)}</td><td class="num">${x.orders}</td></tr>`).join('')}</table>` : ''}</div>
          <div class="card panel"><h3>🔥 الأكثر مبيعاً</h3><table class="t">${s.top.map((p) => `<tr><td>${esc(p.name_ku)}</td><td class="num">${p.sold}</td></tr>`).join('')}</table></div>
        </div>
      </div>`;
    bindOrderTable(c, dashboard);
  }

  // ---------- orders ----------
  function ordersTable(list, full = true) {
    if (!list.length) return '<p class="muted">لا توجد طلبات</p>';
    return `<table class="t"><thead><tr><th>#</th><th>الزبون</th><th>المدينة</th>${full ? '<th>المنتجات</th>' : ''}<th>المجموع</th><th>التاريخ</th><th>الحالة</th><th></th></tr></thead><tbody>
      ${list.map((o) => `<tr>
        <td class="num"><b>${o.id}</b></td>
        <td>${esc(o.customer_name)}<br><a class="num muted" href="tel:${esc(o.phone)}">${esc(o.phone)}</a>
          <div>${o.high_value ? '<span class="pill" style="background:#FFF4E5;color:#D97706">💰 قيمة عالية — اتصل للتأكيد</span> ' : ''}${o.phone_cancelled ? `<span class="pill" style="background:var(--red-soft);color:var(--red)">⚠️ ${o.phone_cancelled} طلب ملغي سابقاً</span> ` : ''}${o.customer_blocked ? '<span class="pill" style="background:var(--ink);color:#fff">🚫 محظور</span>' : ''}${o.coupon_code ? ` <span class="pill" style="background:#F1ECFE;color:#8B5CF6">🏷️ ${esc(o.coupon_code)}</span>` : ''}${o.tradein ? ` <span class="pill" style="background:#E6F7EF;color:#15803D">🔄 تبديل ${esc(o.tradein.label)}${o.tradein.status === 'pending' ? ' — افحص عند التسليم' : ''}</span>` : ''}${o.source || o.utm ? ` <span class="pill" style="background:#EEF0F4;color:var(--ink-2)">📣 ${esc([SRC[o.source] || o.source, o.utm].filter(Boolean).join(' · '))}</span>` : ''}</div></td>
        <td>${esc(o.city)}</td>
        ${full ? `<td class="order-items">${(o.items || []).map((i) => `${esc(i.name)}${i.variant_label ? ` (${esc(i.variant_label)})` : ''} × ${i.qty}`).join('<br>')}</td>` : ''}
        <td class="num"><b>${fmt(o.total)}</b></td>
        <td class="num muted" style="white-space:nowrap">${esc(o.created_at.slice(0, 16))}</td>
        <td><select class="input sm" data-status="${o.id}" ${o.status === 'cancelled' ? 'disabled' : ''}>${Object.entries(ST).map(([k, l]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
        <td><button class="sm-btn" data-view-order="${o.id}">تفاصيل</button></td>
      </tr>`).join('')}</tbody></table>`;
  }
  let lastOrders = [];
  function bindOrderTable(c, reload) {
    c.querySelectorAll('[data-status]').forEach((sel) => sel.addEventListener('change', async () => {
      if (sel.value === 'cancelled' && !confirm('إلغاء الطلب سيُرجع المخزون ورصيد المحفظة. متابعة؟')) { reload(); return; }
      try { await api(`/admin/orders/${sel.dataset.status}`, { method: 'PUT', body: { status: sel.value } }); toast('تم تحديث الحالة'); reload(); }
      catch (e) { toast(e.message); reload(); }
    }));
    c.querySelectorAll('[data-view-order]').forEach((b) => b.addEventListener('click', async () => {
      const all = await api('/admin/orders');
      const o = all.find((x) => x.id === Number(b.dataset.viewOrder)); if (!o) return;
      modal(`طلب #${o.id} — ${ST[o.status]}`, `
        <table class="t">
          <tr><td>الزبون</td><td><b>${esc(o.customer_name)}</b></td></tr>
          <tr><td>الموبايل</td><td class="num"><a href="tel:${esc(o.phone)}">${esc(o.phone)}</a> · <a target="_blank" href="https://wa.me/${esc(String(o.phone).replace(/\D/g, '').replace(/^0/, '964'))}">واتساب</a></td></tr>
          <tr><td>العنوان</td><td>${esc(o.city)} — ${esc(o.address)}</td></tr>
          ${o.note ? `<tr><td>ملاحظة</td><td>${esc(o.note)}</td></tr>` : ''}
        </table>
        <h3 style="margin:16px 0 8px">المنتجات</h3>
        <table class="t">${o.items.map((i) => `<tr><td><img src="${safeImg(i.image)}"></td><td>${esc(i.name)}${i.variant_label ? `<br><span class="muted">${esc(i.variant_label)}</span>` : ''}</td><td class="num">${fmt(i.price)} × ${i.qty}</td><td class="num"><b>${fmt(i.price * i.qty)}</b></td></tr>`).join('')}</table>
        <table class="t" style="margin-top:10px">
          <tr><td>المنتجات</td><td class="num">${fmt(o.subtotal)}</td></tr>
          <tr><td>التوصيل</td><td class="num">${fmt(o.delivery_fee)}</td></tr>
          ${o.discount ? `<tr><td>كوبون ${esc(o.coupon_code)}</td><td class="num">-${fmt(o.discount)}</td></tr>` : ''}
          ${o.tradein ? `<tr><td>🔄 تبديل ${esc(o.tradein.label)} <span class="muted">(${esc(TI_ST[o.tradein.status] || o.tradein.status)})</span></td><td class="num">-${fmt(o.tradein_credit)}</td></tr>` : ''}
          ${o.wallet_used ? `<tr><td>من المحفظة</td><td class="num">-${fmt(o.wallet_used)}</td></tr>` : ''}
          <tr><td><b>المطلوب من الزبون</b></td><td class="num"><b>${fmt(o.total)} د.ع</b></td></tr>
        </table>`);
    }));
  }
  async function orders() {
    const qs = new URLSearchParams(location.hash.split('?')[1] || '');
    const c = layout('orders', 'الطلبات', `
      <select class="input sm" id="fs"><option value="">كل الحالات</option>${Object.entries(ST).map(([k, l]) => `<option value="${k}" ${qs.get('status') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <input class="input" id="fq" placeholder="بحث بالاسم أو الرقم" value="${esc(qs.get('q') || '')}">`);
    const load = async () => {
      const p = new URLSearchParams({ status: $('#fs').value, q: $('#fq').value });
      lastOrders = await api(`/admin/orders?${p}`);
      c.innerHTML = `<div class="card panel">${ordersTable(lastOrders)}</div>`;
      bindOrderTable(c, load);
    };
    $('#fs').onchange = load;
    let deb; $('#fq').oninput = () => { clearTimeout(deb); deb = setTimeout(load, 300); };
    load();
  }

  // ---------- products ----------
  let catsCache = [];
  let settingsCache = {};
  let productsCache = [];
  let tagsCache = [];
  const catName = (id) => { const c = catsCache.find((x) => x.id === id); if (!c) return '—'; const p = catsCache.find((x) => x.id === c.parent_id); return p ? `${p.name_ku} › ${c.name_ku}` : c.name_ku; };
  const catOptions = (sel, allowTopOnly = false) => catsCache.filter((c) => !allowTopOnly || !c.parent_id)
    .map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.parent_id ? '— ' + catName(c.id) : c.name_ku)}</option>`).join('');

  async function products() {
    settingsCache = await api('/admin/settings').catch(() => ({}));
    const c = layout('products', 'المنتجات', `<input class="input" id="pq" placeholder="بحث..."><button class="btn btn-primary" id="addP">+ منتج جديد</button>`);
    catsCache = await api('/admin/categories');
    tagsCache = await api('/admin/tags').catch(() => []);
    if (!productsCache.length) productsCache = await api('/admin/products').catch(() => []);
    const load = async () => {
      const list = await api(`/admin/products?q=${encodeURIComponent($('#pq').value)}`);
      c.innerHTML = `<div class="card panel"><table class="t"><thead><tr><th></th><th>الاسم</th><th>القسم</th><th>السعر</th><th>المخزون</th><th>المبيعات</th><th>الحالة</th><th></th></tr></thead><tbody>
        ${list.map((p) => `<tr>
          <td><img src="${safeImg(p.image)}"></td>
          <td><b>${esc(p.name_ku)}</b><br><span class="muted">${esc(p.name_en || '')}</span>
            <div>${p.featured ? '<span class="pill">مميز</span> ' : ''}${p.flash_sale ? '<span class="pill" style="background:var(--red-soft);color:var(--red)">تخفيض سريع</span> ' : ''}${p.trending ? '<span class="pill" style="background:#EEF0F4;color:var(--ink)">رائج</span>' : ''}${p.low_margin ? ' <span class="pill" style="background:var(--red-soft);color:var(--red)" title="الربح أقل من الحد الأدنى بالإعدادات">⚠️ ربح قليل</span>' : ''}${p.cost_price == null && !(p.variants || []).some((v) => v.cost_price != null) ? ' <span class="pill" style="background:#FFF4E5;color:#D97706" title="بدون سعر الشراء ما ينحسب الربح">بدون سعر شراء</span>' : ''}</div></td>
          <td>${esc(catName(p.category_id))}</td>
          <td class="num">${p.has_variants ? '<span class="muted">من </span>' : ''}<b>${fmt(p.price)}</b>${p.old_price ? `<br><s class="muted">${fmt(p.old_price)}</s>` : ''}${p.has_variants ? `<br><span class="muted">${p.variants.length} أنواع</span>` : ''}${p.usd_priced ? `<br><span class="pill" style="background:#E6F7EF;color:var(--green)">$${fmt(p.has_variants ? Math.min(...p.variants.map((v) => v.price_usd || Infinity)) : p.price_usd)}</span>` : ''}</td>
          <td class="num" style="font-weight:800;color:${p.stock === 0 ? 'var(--red)' : p.stock <= 3 ? '#D97706' : 'inherit'}">${p.stock}<br><button class="sm-btn" data-restock="${p.id}" style="margin-top:4px;font-size:12px">+ إضافة</button></td>
          <td class="num">${p.sold}</td>
          <td>${p.active ? '<span class="st delivered">ظاهر</span>' : '<span class="st cancelled">مخفي</span>'}</td>
          <td><div class="row-actions"><button class="sm-btn" data-edit="${p.id}">تعديل</button><button class="sm-btn danger" data-del="${p.id}">حذف</button></div></td>
        </tr>`).join('')}</tbody></table></div>`;
      productsCache = list;
      c.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => productForm(list.find((p) => p.id === Number(b.dataset.edit)), load));
      c.querySelectorAll('[data-restock]').forEach((b) => b.onclick = () => restockForm(list.find((p) => p.id === Number(b.dataset.restock)), load));
      c.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
        if (!confirm('حذف المنتج نهائياً؟')) return;
        await api(`/admin/products/${b.dataset.del}`, { method: 'DELETE' }); toast('تم الحذف'); load();
      });
    };
    $('#addP').onclick = () => productForm(null, load);
    let deb; $('#pq').oninput = () => { clearTimeout(deb); deb = setTimeout(load, 300); };
    load();
  }

  function langFields(prefix, p, label, textarea = false) {
    const f = (l) => textarea ? `<textarea class="input" name="${prefix}_${l}" data-lang-field="${prefix}" data-l="${l}" ${l !== 'ku' ? 'style="display:none"' : ''}>${esc(p[`${prefix}_${l}`] || '')}</textarea>`
      : `<input class="input" name="${prefix}_${l}" data-lang-field="${prefix}" data-l="${l}" value="${esc(p[`${prefix}_${l}`] || '')}" ${l !== 'ku' ? 'style="display:none"' : ''} ${l === 'ku' && prefix === 'name' ? 'required' : ''}>`;
    return `<div class="field full"><label>${label}</label>
      <div class="tabs-lang" data-lang-tabs="${prefix}"><button type="button" class="active" data-l="ku">کوردی</button><button type="button" data-l="ar">عربي</button><button type="button" data-l="en">English</button></div>
      ${f('ku')}${f('ar')}${f('en')}</div>`;
  }
  function bindLangTabs(m) {
    m.querySelectorAll('[data-lang-tabs]').forEach((tabs) => tabs.addEventListener('click', (e) => {
      const b = e.target.closest('[data-l]'); if (!b) return;
      tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      m.querySelectorAll(`[data-lang-field="${tabs.dataset.langTabs}"]`).forEach((i) => { i.style.display = i.dataset.l === b.dataset.l ? '' : 'none'; });
    }));
  }

  function productForm(p, done) {
    const isNew = !p; p = p || { active: true, stock: 10, images: [] };
    let gallery = [...(p.images || [])];
    modal(isNew ? 'منتج جديد' : 'تعديل المنتج', `<form id="pf">
      <div class="fgrid">
        ${langFields('name', p, 'اسم المنتج *')}
        <div class="field"><label>القسم</label><select class="input" name="category_id"><option value="">—</option>${catOptions(p.category_id)}</select></div>
        <div class="field"><label>الماركة</label><input class="input" name="brand" value="${esc(p.brand || '')}" placeholder="Apple, Samsung..."></div>
        <div class="field full"><label class="usd-toggle"><input type="checkbox" name="usd_priced" ${p.usd_priced ? 'checked' : ''}> 💵 السعر بالدولار — يتحدث تلقائياً مع سعر الصرف ${Number(settingsCache.usd_rate) ? `(${fmt(settingsCache.usd_rate)} د.ع لكل $)` : '<b style="color:var(--red)">(حدد سعر الصرف من الإعدادات أولاً)</b>'}</label></div>
        <div class="field"><label data-cur-label="السعر">السعر (د.ع) *</label><input class="input num" type="number" min="0" step="any" name="price" value="${p.usd_priced ? (p.price_usd ?? '') : (p.price ?? '')}" required><div class="muted usd-hint" data-hint="price"></div></div>
        <div class="field"><label data-cur-label="السعر القديم (للخصم)">السعر القديم (للخصم)</label><input class="input num" type="number" min="0" step="any" name="old_price" value="${p.usd_priced ? (p.old_price_usd ?? '') : (p.old_price ?? '')}"><div class="muted usd-hint" data-hint="old_price"></div></div>
        <div class="field"><label>المخزون</label><input class="input num" type="number" min="0" name="stock" value="${p.stock ?? 0}"></div>
        <div class="field"><label>سعر الشراء (د.ع) — سري، لحساب الربح</label><input class="input num" type="number" min="0" name="cost_price" value="${p.cost_price ?? ''}" placeholder="اختياري"><div class="muted usd-hint" id="marginHint"></div></div>
        <div class="field"><label>عدد المبيعات</label><div class="input num" style="display:flex;align-items:center;background:#F2F3F6" title="ينحسب تلقائياً من الطلبات">${p.sold ?? 0} <span class="muted" style="margin-inline-start:8px;font-size:13px">(تلقائي من الطلبات)</span></div></div>
        <div class="field full"><label>الأنواع (السعة / اللون) — اختياري. إذا أضفت أنواعاً، السعر والمخزون يؤخذان منها</label>
          <div id="variants"></div><button type="button" class="sm-btn" id="addVar">+ إضافة نوع</button> <button type="button" class="sm-btn primary" id="genVar">⚡ توليد من القوالب</button><div id="genBox"></div></div>
        ${imgField('image', p.image, 'الصورة الرئيسية')}
        <div class="field full"><label>صور إضافية</label><label class="sm-btn" style="cursor:pointer;display:inline-block">+ إضافة صور<input type="file" accept="image/*" multiple hidden id="galUp"></label><div class="gallery-list" id="gal"></div></div>
        ${langFields('desc', p, 'الوصف', true)}
        <div class="field full finder-box"><label>✨ بيانات «ساعدني أختار موبايل» — للموبايلات فقط (اتركها فارغة للإكسسوارات)</label>
          <div class="fgrid3">
            <div><span class="attr-lbl">النظام</span><select class="input sm" data-attr="os"><option value="">ليس موبايل</option><option value="ios" ${p.attrs?.os === 'ios' ? 'selected' : ''}>iOS (آيفون)</option><option value="android" ${p.attrs?.os === 'android' ? 'selected' : ''}>Android</option></select></div>
            <div><span class="attr-lbl">الفئة</span><select class="input sm" data-attr="tier">${[['flagship', 'فئة عليا (رائد)'], ['upper', 'فوق المتوسط'], ['mid', 'متوسط'], ['entry', 'اقتصادي']].map(([k, l]) => `<option value="${k}" ${(p.attrs?.tier || 'mid') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
            ${[['ram', 'الرام GB'], ['storage', 'المساحة GB'], ['battery', 'البطارية mAh'], ['camera', 'الكاميرا MP'], ['screen', 'الشاشة إنش'], ['charging', 'الشحن W']].map(([k, l]) => `<div><span class="attr-lbl">${l}</span><input class="input sm num" type="number" step="any" min="0" data-attr="${k}" value="${p.attrs?.[k] ?? ''}"></div>`).join('')}
            <label class="g5"><input type="checkbox" data-attr="g5" ${p.attrs?.g5 ? 'checked' : ''}> 5G</label>
          </div></div>
        <div class="field full"><label>📋 المواصفات (تظهر كجدول بصفحة المنتج)</label><div id="specs"></div><button type="button" class="sm-btn" id="addSpec">+ إضافة مواصفة</button>
          <span class="muted" style="font-size:12px;margin-inline-start:8px">مثل: الذاكرة 256GB · الرام 8GB · البطارية 4500mAh · الضمان سنة</span></div>
        ${tagsCache.length ? `<div class="field full"><label>🔖 الملصقات</label><div class="toggles">${tagsCache.map((t) => `<label><input type="checkbox" data-tag="${t.id}" ${(p.tag_ids || []).includes(t.id) ? 'checked' : ''}> <span class="pill" style="background:${esc(t.color)}22;color:${esc(t.color)}">${esc(t.name_ku)}</span></label>`).join('')}</div></div>` : ''}
        <div class="field full"><label>🛍️ "يشترونها سوية" — اختر حتى 4 منتجات (إذا تركته فارغاً، يُختار تلقائياً من مشتريات الزبائن)</label>
          <input class="input" id="bundleSearch" placeholder="ابحث عن منتج..." style="height:40px;margin-bottom:6px"><div class="bundle-box" id="bundleBox"></div></div>
      </div>
      <div class="toggles">
        <label><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> ظاهر في المتجر</label>
        <label><input type="checkbox" name="featured" ${p.featured ? 'checked' : ''}> ⭐ مميز</label>
        <label><input type="checkbox" name="trending" ${p.trending ? 'checked' : ''}> 🔥 رائج</label>
        <label><input type="checkbox" name="flash_sale" ${p.flash_sale ? 'checked' : ''}> ⚡ تخفيض سريع</label>
      </div>
      <button class="btn btn-primary btn-block">حفظ</button></form>`, (m, close) => {
      bindUploads(m); bindLangTabs(m);
      let variants = (p.variants || []).map((v) => (p.usd_priced ? { ...v, price: v.price_usd, old_price: v.old_price_usd } : { ...v }));
      const isUsd = () => m.querySelector('[name=usd_priced]').checked;
      const rate = Number(settingsCache.usd_rate) || 0;
      const step = Math.max(1, Number(settingsCache.usd_round) || 250);
      const toIqd = (usd) => (Number(usd) ? Math.round((Number(usd) * rate) / step) * step : 0);
      const refreshCur = () => {
        const usd = isUsd();
        m.querySelectorAll('[data-cur-label]').forEach((l) => { l.textContent = `${l.dataset.curLabel} (${usd ? '$' : 'د.ع'})${l.dataset.curLabel === 'السعر' ? ' *' : ''}`; });
        m.querySelectorAll('[data-hint]').forEach((h) => { const v = m.querySelector(`[name=${h.dataset.hint}]`).value; h.textContent = usd && rate && Number(v) ? `= ${fmt(toIqd(v))} د.ع` : ''; });
        const th = m.querySelectorAll('.var-table th');
        if (th.length) { th[1].textContent = `السعر (${usd ? '$' : 'د.ع'})`; th[2].textContent = `السعر القديم (${usd ? '$' : 'د.ع'})`; }
      };
      // Switching currency converts the numbers already typed, so a dinar price is never read as dollars.
      const conv = (v, toUsd) => { const n = Number(v); if (!n) return v; return toUsd ? Math.round((n / rate) * 100) / 100 : toIqd(n); };
      m.querySelector('[name=usd_priced]').onchange = (e) => {
        if (e.target.checked && !rate) { e.target.checked = false; return toast(ERR.usd_rate_missing); }
        const toUsd = e.target.checked;
        ['price', 'old_price'].forEach((n) => { const el = m.querySelector(`[name=${n}]`); el.value = conv(el.value, toUsd); });
        variants.forEach((v) => { v.price = conv(v.price, toUsd); v.old_price = conv(v.old_price, toUsd); });
        drawVars();
      };
      ['price', 'old_price'].forEach((n) => m.querySelector(`[name=${n}]`).addEventListener('input', refreshCur));
      const drawVars = () => {
        const box = m.querySelector('#variants');
        box.innerHTML = variants.length ? `<table class="t var-table"><thead><tr><th>النوع (مثل 256GB · أسود)</th><th>السعر</th><th>السعر القديم</th><th>المخزون</th><th>سعر الشراء</th><th></th></tr></thead><tbody>${variants.map((v, i) => `<tr>
          <td><input class="input sm" dir="ltr" data-v="${i}" data-k="label" value="${esc(v.label || '')}"></td>
          <td><input class="input sm num" type="number" min="0" step="any" data-v="${i}" data-k="price" value="${v.price ?? ''}"></td>
          <td><input class="input sm num" type="number" min="0" step="any" data-v="${i}" data-k="old_price" value="${v.old_price ?? ''}"></td>
          <td><input class="input sm num" type="number" min="0" data-v="${i}" data-k="stock" value="${v.stock ?? 0}"></td>
          <td><input class="input sm num" type="number" min="0" data-v="${i}" data-k="cost_price" value="${v.cost_price ?? ''}" placeholder="د.ع"></td>
          <td><button type="button" class="sm-btn danger" data-rmv="${i}">×</button></td></tr>`).join('')}</tbody></table>` : '';
        box.querySelectorAll('[data-v]').forEach((inp) => inp.oninput = () => { variants[inp.dataset.v][inp.dataset.k] = inp.value; });
        box.querySelectorAll('[data-rmv]').forEach((b) => b.onclick = () => { variants.splice(Number(b.dataset.rmv), 1); drawVars(); });
        const hasV = variants.length > 0;
        ['price', 'old_price', 'stock'].forEach((n) => { const el = m.querySelector(`[name=${n}]`); el.disabled = hasV; el.closest('.field').style.opacity = hasV ? .45 : 1; });
        m.querySelector('[name=price]').required = !hasV;
        refreshCur();
      };
      drawVars();
      m.querySelector('#addVar').onclick = () => { variants.push({ label: '', price: '', old_price: '', stock: 0 }); drawVars(); };
      // Generate variants from presets: every combination of the ticked values ("256GB · Black" …)
      m.querySelector('#genVar').onclick = () => {
        let presets = []; try { presets = JSON.parse(settingsCache.variant_presets || '[]'); } catch { presets = []; }
        if (!presets.length) return toast('أضف قوالب من صفحة «قوالب الأنواع والسعات» أولاً');
        const box = m.querySelector('#genBox');
        box.innerHTML = `<div class="gen-box">${presets.map((g, gi) => `<div><b>${esc(g.name)}</b><div class="toggles" style="margin:6px 0 10px">${g.values.map((v) => `<label><input type="checkbox" data-g="${gi}" value="${esc(v)}"> ${esc(v)}</label>`).join('')}</div></div>`).join('')}
          <button type="button" class="sm-btn primary" id="genGo">إضافة الأنواع</button></div>`;
        box.querySelector('#genGo').onclick = () => {
          const picked = presets.map((g, gi) => [...box.querySelectorAll(`[data-g="${gi}"]:checked`)].map((x) => x.value)).filter((a) => a.length);
          if (!picked.length) return toast('اختر قيمة واحدة على الأقل');
          const combos = picked.reduce((acc, vals) => acc.flatMap((a) => vals.map((v) => (a ? `${a} · ${v}` : v))), ['']);
          const basePrice = m.querySelector('[name=price]').value;
          for (const label of combos) if (!variants.some((v) => v.label === label)) variants.push({ label, price: basePrice, old_price: '', stock: 0, cost_price: '' });
          box.innerHTML = ''; drawVars();
        };
      };
      // Specs editor
      let specs = (p.specs || []).map((x) => ({ ...x }));
      const drawSpecs = () => {
        m.querySelector('#specs').innerHTML = specs.length ? `<table class="t var-table">${specs.map((x, i) => `<tr>
          <td><input class="input sm" data-s="${i}" data-k="k" value="${esc(x.k)}" placeholder="الذاكرة"></td>
          <td><input class="input sm" data-s="${i}" data-k="v" value="${esc(x.v)}" placeholder="256GB" dir="auto"></td>
          <td><button type="button" class="sm-btn danger" data-rms="${i}">×</button></td></tr>`).join('')}</table>` : '';
        m.querySelectorAll('[data-s]').forEach((inp) => inp.oninput = () => { specs[inp.dataset.s][inp.dataset.k] = inp.value; });
        m.querySelectorAll('[data-rms]').forEach((b) => b.onclick = () => { specs.splice(Number(b.dataset.rms), 1); drawSpecs(); });
      };
      drawSpecs();
      m.querySelector('#addSpec').onclick = () => { specs.push({ k: '', v: '' }); drawSpecs(); };
      // Bought-together picker
      let bundle = [...(p.bundle_ids || [])];
      const drawBundle = () => {
        const q = m.querySelector('#bundleSearch').value.trim().toLowerCase();
        const list = productsCache.filter((x) => x.id !== p.id && (bundle.includes(x.id) || !q || `${x.name_ku} ${x.name_en || ''} ${x.brand || ''}`.toLowerCase().includes(q))).slice(0, 40);
        m.querySelector('#bundleBox').innerHTML = list.map((x) => `<label class="${bundle.includes(x.id) ? 'on' : ''}"><input type="checkbox" data-b="${x.id}" ${bundle.includes(x.id) ? 'checked' : ''}><img src="${safeImg(x.image)}"><span>${esc(x.name_ku)}</span></label>`).join('');
        m.querySelectorAll('[data-b]').forEach((cb) => cb.onchange = () => {
          const id = Number(cb.dataset.b);
          if (cb.checked) { if (bundle.length >= 4) { cb.checked = false; return toast('4 منتجات كحد أقصى'); } bundle.push(id); } else bundle = bundle.filter((x) => x !== id);
          drawBundle();
        });
      };
      drawBundle();
      m.querySelector('#bundleSearch').oninput = drawBundle;
      // Live margin hint
      const minProfit = Number(settingsCache.min_profit) || 0;
      const marginHint = () => {
        const cost = Number(m.querySelector('[name=cost_price]').value); const el = m.querySelector('[name=price]');
        const price = isUsd() ? toIqd(el.value) : Number(el.value);
        const h = m.querySelector('#marginHint');
        if (!cost || !price || variants.length) { h.textContent = ''; return; }
        const profit = price - cost;
        h.textContent = `الربح: ${fmt(profit)} د.ع (${Math.round((profit / price) * 100)}%)${profit < minProfit ? ' ⚠️ أقل من الحد الأدنى' : ''}`;
        h.style.color = profit < minProfit ? 'var(--red)' : 'var(--green)';
      };
      ['cost_price', 'price'].forEach((n) => m.querySelector(`[name=${n}]`).addEventListener('input', marginHint));
      marginHint();
      const drawGal = () => {
        m.querySelector('#gal').innerHTML = gallery.map((g, i) => `<span><img src="${safeImg(g)}"><button type="button" data-rmg="${i}">×</button></span>`).join('');
        m.querySelectorAll('[data-rmg]').forEach((b) => b.onclick = () => { gallery.splice(Number(b.dataset.rmg), 1); drawGal(); });
      };
      drawGal();
      m.querySelector('#galUp').onchange = async (e) => {
        for (const f of e.target.files) { try { gallery.push(await upload(f)); } catch (err) { toast(err.message); } }
        drawGal();
      };
      m.querySelector('#pf').onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const body = Object.fromEntries(fd);
        ['active', 'featured', 'trending', 'flash_sale', 'usd_priced'].forEach((k) => { body[k] = fd.has(k); });
        body.images = gallery;
        body.variants = variants.filter((v) => String(v.label).trim() && Number(v.price) > 0);
        body.specs = specs.filter((x) => String(x.k).trim() && String(x.v).trim());
        body.bundle_ids = bundle;
        body.tag_ids = [...m.querySelectorAll('[data-tag]:checked')].map((x) => Number(x.dataset.tag));
        body.attrs = Object.fromEntries([...m.querySelectorAll('[data-attr]')].map((el) => [el.dataset.attr, el.type === 'checkbox' ? el.checked : el.value]));
        if (variants.length && !body.variants.length) return toast('أكمل اسم وسعر كل نوع');
        if (body.variants.length) body.price = Math.min(...body.variants.map((v) => Number(v.price)));
        try {
          await api(isNew ? '/admin/products' : `/admin/products/${p.id}`, { method: isNew ? 'POST' : 'PUT', body });
          toast('تم الحفظ'); close(); done();
        } catch (err) { toast(err.message); }
      };
    });
  }

  // ---------- categories ----------
  async function categories() {
    const c = layout('categories', 'الأقسام', '<button class="btn btn-primary" id="addC">+ قسم جديد</button>');
    const load = async () => {
      catsCache = await api('/admin/categories');
      const tops = catsCache.filter((x) => !x.parent_id);
      c.innerHTML = `<div class="card panel"><table class="t"><thead><tr><th></th><th>کوردی</th><th>عربي</th><th>English</th><th>الترتيب</th><th></th></tr></thead><tbody>
        ${tops.map((t) => [t, ...catsCache.filter((s) => s.parent_id === t.id)].map((x) => `<tr>
          <td>${x.parent_id ? '' : `<img src="${safeImg(x.image)}">`}</td>
          <td>${x.parent_id ? '<span class="muted">└ </span>' : '<b>'}${esc(x.name_ku)}${x.parent_id ? '' : '</b>'}</td>
          <td>${esc(x.name_ar || '')}</td><td>${esc(x.name_en || '')}</td><td class="num">${x.sort}</td>
          <td><div class="row-actions"><button class="sm-btn" data-edit="${x.id}">تعديل</button><button class="sm-btn danger" data-del="${x.id}">حذف</button></div></td>
        </tr>`).join('')).join('')}</tbody></table></div>`;
      c.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => catForm(catsCache.find((x) => x.id === Number(b.dataset.edit)), load));
      c.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
        if (!confirm('حذف القسم؟ (الأقسام الفرعية ستُحذف أيضاً، والمنتجات ستبقى بدون قسم)')) return;
        await api(`/admin/categories/${b.dataset.del}`, { method: 'DELETE' }); toast('تم الحذف'); load();
      });
    };
    $('#addC').onclick = () => catForm(null, load);
    load();
  }
  function catForm(cat, done) {
    const isNew = !cat; cat = cat || { sort: 0 };
    modal(isNew ? 'قسم جديد' : 'تعديل القسم', `<form id="cf"><div class="fgrid">
      <div class="field"><label>الاسم کوردی *</label><input class="input" name="name_ku" value="${esc(cat.name_ku || '')}" required></div>
      <div class="field"><label>الاسم عربي</label><input class="input" name="name_ar" value="${esc(cat.name_ar || '')}"></div>
      <div class="field"><label>English</label><input class="input" name="name_en" value="${esc(cat.name_en || '')}"></div>
      <div class="field"><label>الترتيب</label><input class="input num" type="number" name="sort" value="${cat.sort}"></div>
      <div class="field full"><label>قسم رئيسي (اتركه فارغاً إذا كان هذا قسماً رئيسياً)</label><select class="input" name="parent_id"><option value="">— قسم رئيسي —</option>${catsCache.filter((x) => !x.parent_id && x.id !== cat.id).map((x) => `<option value="${x.id}" ${x.id === cat.parent_id ? 'selected' : ''}>${esc(x.name_ku)}</option>`).join('')}</select></div>
      ${imgField('image', cat.image)}
    </div><button class="btn btn-primary btn-block">حفظ</button></form>`, (m, close) => {
      bindUploads(m);
      m.querySelector('#cf').onsubmit = async (e) => {
        e.preventDefault();
        try { await api(isNew ? '/admin/categories' : `/admin/categories/${cat.id}`, { method: isNew ? 'POST' : 'PUT', body: Object.fromEntries(new FormData(e.target)) }); toast('تم الحفظ'); close(); done(); }
        catch (err) { toast(err.message); }
      };
    });
  }

  // ---------- banners ----------
  async function banners() {
    const c = layout('banners', 'البانرات', '<button class="btn btn-primary" id="addB">+ بانر جديد</button>');
    const load = async () => {
      const list = await api('/admin/banners');
      c.innerHTML = `<div class="card panel"><table class="t"><thead><tr><th></th><th>العنوان</th><th>الرابط</th><th>الترتيب</th><th>الحالة</th><th></th></tr></thead><tbody>
        ${list.map((b) => `<tr><td><img src="${safeImg(b.image)}" style="width:120px;height:48px"></td><td><b>${esc(b.title_ku || '')}</b><br><span class="muted">${esc(b.title_ar || '')}</span></td><td class="num muted">${esc(b.link || '')}</td><td class="num">${b.sort}</td>
          <td>${b.active ? '<span class="st delivered">ظاهر</span>' : '<span class="st cancelled">مخفي</span>'}</td>
          <td><div class="row-actions"><button class="sm-btn" data-edit="${b.id}">تعديل</button><button class="sm-btn danger" data-del="${b.id}">حذف</button></div></td></tr>`).join('')}</tbody></table></div>`;
      c.querySelectorAll('[data-edit]').forEach((x) => x.onclick = () => bannerForm(list.find((b) => b.id === Number(x.dataset.edit)), load));
      c.querySelectorAll('[data-del]').forEach((x) => x.onclick = async () => { if (!confirm('حذف البانر؟')) return; await api(`/admin/banners/${x.dataset.del}`, { method: 'DELETE' }); load(); });
    };
    $('#addB').onclick = () => bannerForm(null, load);
    load();
  }
  function bannerForm(b, done) {
    const isNew = !b; b = b || { active: 1, sort: 0 };
    modal(isNew ? 'بانر جديد' : 'تعديل البانر', `<form id="bf"><div class="fgrid">
      ${imgField('image', b.image, 'صورة البانر (يفضل 900×360)')}
      ${langFields('tag', b, 'الوسم الصغير (مثل: جديد)')}
      ${langFields('title', b, 'العنوان')}
      ${langFields('subtitle', b, 'العنوان الفرعي')}
      <div class="field"><label>الرابط عند الضغط</label><input class="input num" name="link" value="${esc(b.link || '')}" placeholder="#/category/1" style="text-align:start"></div>
      <div class="field"><label>الترتيب</label><input class="input num" type="number" name="sort" value="${b.sort}"></div>
    </div><div class="toggles"><label><input type="checkbox" name="active" ${b.active ? 'checked' : ''}> ظاهر</label></div>
    <button class="btn btn-primary btn-block">حفظ</button></form>`, (m, close) => {
      bindUploads(m); bindLangTabs(m);
      m.querySelector('#bf').onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target); const body = Object.fromEntries(fd); body.active = fd.has('active');
        try { await api(isNew ? '/admin/banners' : `/admin/banners/${b.id}`, { method: isNew ? 'POST' : 'PUT', body }); toast('تم الحفظ'); close(); done(); }
        catch (err) { toast(err.message); }
      };
    });
  }

  // ---------- users ----------
  async function users() {
    const c = layout('users', 'الزبائن', '<input class="input" id="uq" placeholder="بحث بالاسم أو الرقم">');
    const load = async () => {
      const list = await api(`/admin/users?q=${encodeURIComponent($('#uq').value)}`);
      c.innerHTML = `<div class="card panel"><table class="t"><thead><tr><th>#</th><th>الاسم</th><th>الموبايل</th><th>الطلبات</th><th>المحفظة (د.ع)</th><th>كود الدعوة</th><th>الحظر</th><th>تاريخ التسجيل</th></tr></thead><tbody>
        ${list.map((u) => `<tr><td class="num">${u.id}</td><td><b>${esc(u.name)}</b>${u.role !== 'customer' ? ` <span class="pill">${esc(ROLES[u.role] || u.role)}</span>` : ''}</td><td class="num"><a href="tel:${esc(u.phone)}">${esc(u.phone)}</a></td><td class="num">${u.orders}${u.cancelled ? `<br><span style="color:var(--red);font-size:12px">${u.cancelled} ملغي</span>` : ''}</td>
          <td><div class="row-actions"><input class="input sm num" style="width:110px;height:36px" type="number" min="0" value="${u.wallet}" data-wallet="${u.id}"><button class="sm-btn primary" data-save-wallet="${u.id}">حفظ</button></div></td>
          <td class="num">${esc(u.referral_code)}</td>
          <td>${u.blocked ? `<span class="st cancelled" title="${esc(u.block_reason || '')}">محظور</span><br><button class="sm-btn" data-unblock="${u.id}" style="margin-top:4px">فك الحظر</button>` : `<button class="sm-btn danger" data-block="${u.id}">حظر</button>`}</td>
          <td class="num muted">${esc(u.created_at.slice(0, 10))}</td></tr>`).join('')}</tbody></table></div>`;
      c.querySelectorAll('[data-save-wallet]').forEach((b) => b.onclick = async () => {
        try { await api(`/admin/users/${b.dataset.saveWallet}`, { method: 'PUT', body: { wallet: c.querySelector(`[data-wallet="${b.dataset.saveWallet}"]`).value } }); toast('تم الحفظ'); } catch (e) { toast(e.message); }
      });
      c.querySelectorAll('[data-block]').forEach((b) => b.onclick = async () => {
        const reason = prompt('سبب الحظر (مثلاً: رفض الاستلام 3 مرات). المحظور لا يستطيع إرسال طلبات:');
        if (reason === null) return;
        try { await api(`/admin/users/${b.dataset.block}`, { method: 'PUT', body: { blocked: true, block_reason: reason } }); toast('تم الحظر'); load(); } catch (e) { toast(e.message); }
      });
      c.querySelectorAll('[data-unblock]').forEach((b) => b.onclick = async () => {
        try { await api(`/admin/users/${b.dataset.unblock}`, { method: 'PUT', body: { blocked: false } }); toast('تم فك الحظر'); load(); } catch (e) { toast(e.message); }
      });
    };
    let deb; $('#uq').oninput = () => { clearTimeout(deb); deb = setTimeout(load, 300); };
    load();
  }

  // ---------- settings ----------
  async function settings() {
    const c = layout('settings', 'الإعدادات');
    const s = await api('/admin/settings');
    const toLocal = (iso) => { const d = new Date(iso); if (isNaN(d)) return ''; const off = d.getTimezoneOffset(); return new Date(d - off * 60000).toISOString().slice(0, 16); };
    const F = (k, label, type = 'text', extra = '') => `<div class="field"><label>${label}</label><input class="input ${type === 'number' ? 'num' : ''}" type="${type}" name="${k}" value="${esc(s[k] || '')}" ${extra}></div>`;
    c.innerHTML = `<form class="card panel" id="sf" style="max-width:820px"><div class="fgrid">
      ${F('store_name', 'اسم المتجر')}
      ${F('support_phone', 'رقم الدعم')}
      ${F('store_address', '📍 عنوان المحل (يظهر للزبائن — يبني الثقة)', 'text', 'placeholder="أربيل — شارع 60، مقابل..."')}
      ${F('store_map_url', 'رابط الموقع على خرائط Google')}
      ${F('exchange_days', 'مدة التبديل بالأيام (0 = لا تظهر)', 'number')}
      ${F('warranty_text', 'نص الضمان (مثل: ضمان سنة من الوكيل)')}
      ${F('slogan', 'شعار المتجر (جملة قصيرة تحت الاسم)')}
      ${F('seo_description', 'وصف المتجر لمحركات البحث ومعاينة الروابط')}
      <div class="field"><label>عرض الأسعار</label><select class="input" name="price_display"><option value="iqd" ${s.price_display !== 'both' ? 'selected' : ''}>بالدينار فقط</option><option value="both" ${s.price_display === 'both' ? 'selected' : ''}>الدينار + تقريبي بالدولار</option></select></div>
      ${F('min_profit', '⚠️ أقل ربح مقبول لكل قطعة (د.ع) — تحذير إذا السعر قريب من سعر الشراء', 'number')}
      ${F('cashback_percent', '🎁 نقاط/كاش باك: نسبة ترجع لمحفظة الزبون بعد التوصيل (%) — 0 للإيقاف', 'number', 'min="0" max="50" step="0.5"')}
      <div class="field full maint"><label><input type="checkbox" name="maintenance_mode" value="1" ${s.maintenance_mode === '1' ? 'checked' : ''}> 🛠️ وضع الصيانة — المتجر يتوقف عن استقبال الطلبات ويظهر للزبائن رسالة</label>
        <input class="input" name="maintenance_message" value="${esc(s.maintenance_message || '')}" placeholder="نرجع قريباً — نحدّث المتجر"></div>
      ${F('delivery_fee', 'أجور التوصيل الافتراضية (د.ع)', 'number')}
      ${F('free_delivery_over', 'توصيل مجاني للطلبات فوق (د.ع) — 0 للإلغاء', 'number')}
      ${F('referral_reward', 'مكافأة الدعوة (د.ع)', 'number')}
      ${F('max_pending_orders', 'أقصى عدد طلبات «قيد الانتظار» لكل زبون (0 = بلا حد)', 'number')}
      ${F('confirm_over', 'تنبيه «اتصل للتأكيد» للطلبات فوق (د.ع)', 'number')}
      <div class="field"><label>نهاية التخفيضات السريعة</label><input class="input" type="datetime-local" name="flash_sale_end" value="${toLocal(s.flash_sale_end)}"></div>
      <div class="field full"><label>🚚 مناطق التوصيل وأجورها</label><div id="zones"></div><button type="button" class="sm-btn" id="addZone">+ إضافة مدينة</button></div>
      <div class="field"><label>💵 سعر صرف الدولار (دينار لكل 1$) — تغييره يحدّث أسعار المنتجات المسعّرة بالدولار</label><input class="input num" type="number" min="0" name="usd_rate" value="${esc(s.usd_rate || '')}" placeholder="مثلاً 1480"></div>
      <div class="field"><label>تقريب الأسعار المحوّلة لأقرب (د.ع)</label><select class="input" name="usd_round">${[250, 500, 1000, 5000].map((n) => `<option value="${n}" ${Number(s.usd_round || 250) === n ? 'selected' : ''}>${fmt(n)}</option>`).join('')}</select></div>
      <div class="field full"><label>كلمات البحث الرائجة (افصل بفاصلة ,)</label><input class="input" name="search_tags" value="${esc(s.search_tags || '')}"></div>
      ${F('whatsapp', 'واتساب (رقم دولي بدون +، مثل 9647501234567)')}
      ${F('instagram', 'رابط انستغرام')}
      ${F('facebook', 'رابط فيسبوك')}
      ${F('tiktok', 'رابط تيك توك')}
    </div><button class="btn btn-primary">حفظ الإعدادات</button></form>`;
    let zones = [];
    try { zones = JSON.parse(s.delivery_zones || '[]'); } catch { zones = []; }
    const drawZones = () => {
      $('#zones').innerHTML = `<table class="t var-table"><thead><tr><th>المدينة</th><th>أجور التوصيل (د.ع)</th><th>مدة التوصيل</th><th></th></tr></thead><tbody>${zones.map((z, i) => `<tr>
        <td><input class="input sm" data-z="${i}" data-k="name" value="${esc(z.name)}"></td>
        <td><input class="input sm num" type="number" min="0" data-z="${i}" data-k="fee" value="${z.fee ?? 0}"></td>
        <td><input class="input sm" data-z="${i}" data-k="eta" value="${esc(z.eta || '')}" placeholder="24 ساعة"></td>
        <td><button type="button" class="sm-btn danger" data-rmz="${i}">×</button></td></tr>`).join('')}</tbody></table>`;
      $('#zones').querySelectorAll('[data-z]').forEach((inp) => inp.oninput = () => { zones[inp.dataset.z][inp.dataset.k] = inp.value; });
      $('#zones').querySelectorAll('[data-rmz]').forEach((b) => b.onclick = () => { zones.splice(Number(b.dataset.rmz), 1); drawZones(); });
    };
    drawZones();
    $('#addZone').onclick = () => { zones.push({ name: '', fee: Number(s.delivery_fee || 0) }); drawZones(); };
    $('#sf').onsubmit = async (e) => {
      e.preventDefault();
      const all = Object.fromEntries(new FormData(e.target));
      const body = Object.fromEntries(Object.entries(all).filter(([k]) => /^[a-z_]+$/.test(k)));
      body.flash_sale_end = body.flash_sale_end ? new Date(body.flash_sale_end).toISOString() : '';
      body.delivery_zones = JSON.stringify(zones.filter((z) => String(z.name).trim()).map((z) => ({ name: String(z.name).trim(), fee: Number(z.fee) || 0, eta: String(z.eta || '').trim() })));
      body.maintenance_mode = e.target.maintenance_mode.checked ? '1' : '0';
      const rateChanged = String(body.usd_rate || '') !== String(s.usd_rate || '') || String(body.usd_round) !== String(s.usd_round || '250');
      if (rateChanged && body.usd_rate && !confirm(`سيتم تحديث أسعار كل المنتجات المسعّرة بالدولار حسب ${fmt(body.usd_rate)} د.ع. متابعة؟`)) return;
      try { Object.assign(s, await api('/admin/settings', { method: 'PUT', body })); toast(rateChanged ? 'تم الحفظ وتحديث الأسعار' : 'تم الحفظ'); } catch (err) { toast(err.message); }
    };
  }

  // ---------- coupons ----------
  async function coupons() {
    const c = layout('coupons', 'الكوبونات وأكواد المؤثرين', '<button class="btn btn-primary" id="addCp">+ كوبون جديد</button>');
    const load = async () => {
      const list = await api('/admin/coupons');
      const origin = location.origin;
      c.innerHTML = `<div class="card panel" style="background:#FFFBF7;border:2px solid #FBE2D3"><b>💡 فكرة:</b> أعطِ كل مؤثر كوداً باسمه (مثل ALI10) ورابطاً خاصاً
        <code class="num">${esc(origin)}/?src=ali</code> — وتشوف هنا كم طلب ومبيعات جاب كل واحد، فتدفع للي يبيع فعلاً.</div>
        <div class="card panel">${list.length ? `<table class="t"><thead><tr><th>الكود</th><th>لمن</th><th>الخصم</th><th>الشروط</th><th>الاستخدام</th><th>طلبات</th><th>مبيعات مُسلّمة</th><th>خصم مُعطى</th><th>الحالة</th><th></th></tr></thead><tbody>
        ${list.map((x) => `<tr>
          <td class="num"><b>${esc(x.code)}</b></td><td>${esc(x.owner || '—')}</td>
          <td class="num">${x.type === 'percent' ? `${x.value}%${x.max_discount ? `<br><span class="muted">حد ${fmt(x.max_discount)}</span>` : ''}` : `${fmt(x.value)} د.ع`}</td>
          <td class="muted" style="font-size:12px">${x.min_order ? `طلب ≥ ${fmt(x.min_order)}<br>` : ''}${x.once_per_customer ? 'مرة لكل زبون' : 'متكرر'}${x.expires_at ? `<br>ينتهي ${esc(x.expires_at.slice(0, 10))}` : ''}</td>
          <td class="num">${x.uses}${x.max_uses ? ` / ${x.max_uses}` : ''}</td>
          <td class="num"><b>${x.orders}</b></td><td class="num"><b>${fmt(x.revenue)}</b></td><td class="num muted">${fmt(x.discount_given)}</td>
          <td>${x.active ? '<span class="st delivered">فعّال</span>' : '<span class="st cancelled">موقوف</span>'}</td>
          <td><div class="row-actions"><button class="sm-btn" data-edit="${x.id}">تعديل</button><button class="sm-btn danger" data-del="${x.id}">حذف</button></div></td></tr>`).join('')}
        </tbody></table>` : '<p class="muted">لا توجد كوبونات بعد</p>'}</div>`;
      c.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => couponForm(list.find((x) => x.id === Number(b.dataset.edit)), load));
      c.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (!confirm('حذف الكوبون؟ (الطلبات السابقة تبقى)')) return; await api(`/admin/coupons/${b.dataset.del}`, { method: 'DELETE' }); load(); });
    };
    $('#addCp').onclick = () => couponForm(null, load);
    load();
  }
  function couponForm(cp, done) {
    const isNew = !cp; cp = cp || { type: 'percent', value: 10, once_per_customer: 1, active: 1, min_order: 0 };
    modal(isNew ? 'كوبون جديد' : 'تعديل الكوبون', `<form id="cpf"><div class="fgrid">
      <div class="field"><label>الكود (حروف إنجليزية وأرقام) *</label><input class="input num" dir="ltr" name="code" value="${esc(cp.code || '')}" required pattern="[A-Za-z0-9_-]{3,30}" style="text-transform:uppercase" placeholder="ALI10"></div>
      <div class="field"><label>لمن؟ (اسم المؤثر أو الحملة)</label><input class="input" name="owner" value="${esc(cp.owner || '')}" placeholder="علي — تيك توك"></div>
      <div class="field"><label>نوع الخصم</label><select class="input" name="type"><option value="percent" ${cp.type === 'percent' ? 'selected' : ''}>نسبة %</option><option value="fixed" ${cp.type === 'fixed' ? 'selected' : ''}>مبلغ ثابت (د.ع)</option></select></div>
      <div class="field"><label>قيمة الخصم *</label><input class="input num" type="number" min="1" name="value" value="${cp.value ?? ''}" required></div>
      <div class="field"><label>أقصى خصم (د.ع) — للنسبة فقط</label><input class="input num" type="number" min="0" name="max_discount" value="${cp.max_discount ?? ''}" placeholder="بلا حد"></div>
      <div class="field"><label>أقل مبلغ طلب (د.ع)</label><input class="input num" type="number" min="0" name="min_order" value="${cp.min_order ?? 0}"></div>
      <div class="field"><label>عدد الاستخدامات الكلي</label><input class="input num" type="number" min="1" name="max_uses" value="${cp.max_uses ?? ''}" placeholder="بلا حد"></div>
      <div class="field"><label>تاريخ الانتهاء</label><input class="input" type="date" name="expires_at" value="${esc((cp.expires_at || '').slice(0, 10))}"></div>
    </div><div class="toggles">
      <label><input type="checkbox" name="once_per_customer" ${cp.once_per_customer ? 'checked' : ''}> مرة واحدة لكل زبون</label>
      <label><input type="checkbox" name="active" ${cp.active ? 'checked' : ''}> فعّال</label>
    </div><button class="btn btn-primary btn-block">حفظ</button></form>`, (m, close) => {
      m.querySelector('#cpf').onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target); const body = Object.fromEntries(fd);
        body.once_per_customer = fd.has('once_per_customer'); body.active = fd.has('active');
        if (body.expires_at) body.expires_at = `${body.expires_at}T23:59:59`;
        try { await api(isNew ? '/admin/coupons' : `/admin/coupons/${cp.id}`, { method: isNew ? 'POST' : 'PUT', body }); toast('تم الحفظ'); close(); done(); }
        catch (err) { toast(err.message); }
      };
    });
  }

  // ---------- security: 2FA, backups, activity log ----------
  async function security() {
    const c = layout('security', 'الأمان والنسخ الاحتياطي');
    const [me, backups, log] = await Promise.all([api('/me'), isOwner() ? api('/admin/backups') : [], isOwner() ? api('/admin/log') : []]);
    const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);
    const ACTIONS = { tradein_model: 'تعديل سعر موديل تبديل', tradein_rules: 'نسب خصم التبديل', tradein_review: 'فحص جهاز تبديل', stock_adjust: 'تعديل المخزن', expense_add: 'إضافة مصروف', expense_delete: 'حذف مصروف', bulk_price: 'تغيير أسعار بالجملة', variant_presets: 'قوالب الأنواع', staff_role: 'تغيير صلاحية موظف', coupon_create: 'إضافة كوبون', coupon_update: 'تعديل كوبون', coupon_delete: 'حذف كوبون', usd_reprice: 'تحديث الأسعار حسب الدولار', order_status: 'تغيير حالة طلب', product_create: 'إضافة منتج', product_update: 'تعديل منتج', product_delete: 'حذف منتج', category_create: 'إضافة قسم', category_delete: 'حذف قسم', banner_delete: 'حذف بانر', user_update: 'تعديل زبون', settings_update: 'تعديل الإعدادات', backup_download: 'تنزيل نسخة احتياطية', '2fa_enabled': 'تفعيل التحقق بخطوتين', '2fa_disabled': 'إيقاف التحقق بخطوتين' };
    c.innerHTML = `
      <div class="card panel" id="tfaPanel"><h3>🔐 التحقق بخطوتين لحسابك</h3>
        ${me.user.totp_enabled ? `<p><span class="st delivered">مفعّل ✓</span> عند الدخول يُطلب رمز من تطبيق Authenticator.</p>
          <details><summary class="muted" style="cursor:pointer">إيقاف التحقق بخطوتين</summary><form id="tfaOff" class="toolbar" style="margin-top:10px">
          <input class="input" type="password" name="password" placeholder="كلمة المرور" required><input class="input num" name="code" placeholder="الرمز" maxlength="6" required><button class="sm-btn danger">إيقاف</button></form></details>`
        : `<p class="muted">بعد التفعيل، الدخول للوحة يحتاج كلمة المرور + رمز يتغير كل 30 ثانية من تطبيق على موبايلك (Google Authenticator أو Microsoft Authenticator).</p><button class="btn btn-primary" id="tfaStart">تفعيل</button><div id="tfaSetup"></div>`}
      </div>
      <div class="card panel"><h3>💾 النسخ الاحتياطي</h3>
        <p class="muted">نسخة تلقائية كل يوم (آخر 14 يوماً) على نفس السيرفر. نزّل نسخة على جهازك أسبوعياً على الأقل — إذا تعطّل السيرفر تبقى النسخة عندك.</p>
        <button class="btn btn-primary" data-dl="now">⬇ تنزيل نسخة الآن</button>
        <table class="t" style="margin-top:12px">${backups.map((b) => `<tr><td class="num">${esc(b.name)}</td><td class="num muted">${fmtSize(b.size)}</td><td><button class="sm-btn" data-dl="${esc(b.name)}">تنزيل</button></td></tr>`).join('') || '<tr><td class="muted">لا توجد نسخ بعد</td></tr>'}</table>
      </div>
      <div class="card panel"><h3>📜 سجل عمليات المدراء</h3>
        <table class="t"><thead><tr><th>الوقت</th><th>المدير</th><th>العملية</th><th>التفاصيل</th></tr></thead><tbody>
        ${log.map((l) => `<tr><td class="num muted" style="white-space:nowrap">${esc(l.created_at)}</td><td>${esc(l.user_name)}</td><td>${esc(ACTIONS[l.action] || l.action)}</td><td class="num muted" style="font-size:12px;max-width:420px;word-break:break-word">${esc(l.details)}</td></tr>`).join('') || '<tr><td class="muted">لا يوجد</td></tr>'}
        </tbody></table>
      </div>`;
    c.querySelectorAll('[data-dl]').forEach((b) => b.onclick = async () => {
      b.disabled = true;
      try {
        const res = await fetch(`/api/admin/backups/download?name=${encodeURIComponent(b.dataset.dl)}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('فشل التنزيل');
        const name = (res.headers.get('content-disposition') || '').match(/filename="?([^"]+)"?/)?.[1] || 'store-backup.db';
        const a = document.createElement('a'); a.href = URL.createObjectURL(await res.blob()); a.download = name; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      } catch (e) { toast(e.message); }
      b.disabled = false;
    });
    const start = $('#tfaStart');
    if (start) start.onclick = async () => {
      const r = await api('/me/2fa/setup', { method: 'POST' });
      $('#tfaSetup').innerHTML = `<ol class="tfa-steps">
          <li>نزّل تطبيق <b>Google Authenticator</b> أو <b>Microsoft Authenticator</b> على موبايلك.</li>
          <li>امسح الرمز، أو إذا كنت على نفس الموبايل اضغط <a class="sm-btn primary" href="${esc(r.otpauth)}">فتح في التطبيق</a>، أو اكتب المفتاح يدوياً:
            <div id="qr" style="margin:10px 0"></div><code class="num secret">${esc(r.secret.replace(/(.{4})/g, '$1 ').trim())}</code></li>
          <li>اكتب الرمز الظاهر في التطبيق:</li></ol>
        <form id="tfaOn" class="toolbar"><input class="input num otp-input" name="code" inputmode="numeric" maxlength="6" required placeholder="••••••" style="max-width:220px"><button class="btn btn-primary">تأكيد وتفعيل</button></form>`;
      try { if (window.qrcode) { const q = window.qrcode(0, 'M'); q.addData(r.otpauth); q.make(); $('#qr').innerHTML = q.createSvgTag({ cellSize: 5, margin: 2 }); } } catch { /* QR optional */ }
      $('#tfaOn').onsubmit = async (e) => {
        e.preventDefault();
        try { await api('/me/2fa/enable', { method: 'POST', body: { code: e.target.code.value } }); toast('تم تفعيل التحقق بخطوتين'); security(); } catch (err) { toast(err.message); }
      };
      start.remove();
    };
    const off = $('#tfaOff');
    if (off) off.onsubmit = async (e) => {
      e.preventDefault();
      try { await api('/me/2fa/disable', { method: 'POST', body: Object.fromEntries(new FormData(off)) }); toast('تم الإيقاف'); security(); } catch (err) { toast(err.message); }
    };
  }

  // ---------- trade-in ----------
  async function tradein() {
    const tab = (location.hash.split('?t=')[1] || 'requests');
    const c = layout('tradein', 'تبديل الأجهزة', `<div class="tabs-lang">${[['requests', 'الطلبات'], ['prices', 'أسعار الموديلات'], ['rules', 'نسب الخصم']].map(([k, l]) => `<a href="#/tradein?t=${k}"><button class="${tab === k ? 'active' : ''}">${l}</button></a>`).join('')}</div>`);
    if (tab === 'prices') return tradeinPrices(c);
    if (tab === 'rules') return tradeinRules(c);
    const list = await api('/admin/tradeins');
    c.innerHTML = `<div class="card panel" style="background:#F3FBF7;border:2px solid #BFE8D4">💡 عند التسليم افحص الجهاز القديم: إذا مطابق اضغط <b>قبول</b>، إذا حالته أقل غيّر السعر (المبلغ المطلوب من الزبون يتحدث تلقائياً)، وإذا الزبون غيّر رأيه اضغط <b>رفض</b>.</div>
      <div class="card panel">${list.length ? `<table class="t"><thead><tr><th>#</th><th>الطلب</th><th>الجهاز</th><th>حالته حسب الزبون</th><th>التقدير</th><th>الحالة</th><th></th></tr></thead>${list.map((t) => `<tr>
        <td class="num">${t.id}</td>
        <td>${t.order_id ? `<b class="num">#${t.order_id}</b><br><span class="muted">${esc(t.customer_name || '')} · <a class="num" href="tel:${esc(t.phone || '')}">${esc(t.phone || '')}</a></span>` : '—'}</td>
        <td><b>${esc(t.label)}</b>${t.imei ? `<br><span class="muted num">IMEI ${esc(t.imei)}</span>` : ''}${t.note ? `<br><span class="muted">${esc(t.note)}</span>` : ''}</td>
        <td class="order-items">${Object.entries(t.answers).map(([q, a]) => `${esc((TI_Q[q] || [q])[0])}: <b>${esc((TI_Q[q] || [0, {}])[1][a] || a)}</b>`).join('<br>')}</td>
        <td class="num"><b>${fmt(t.estimate)}</b>${t.final_value != null && t.final_value !== t.estimate ? `<br><span style="color:var(--brand)">النهائي ${fmt(t.final_value)}</span>` : ''}</td>
        <td><span class="st ${t.status === 'pending' ? 'pending' : t.status === 'rejected' || t.status === 'cancelled' ? 'cancelled' : 'delivered'}">${esc(TI_ST[t.status] || t.status)}</span></td>
        <td>${t.status === 'pending' ? `<div class="row-actions"><button class="sm-btn primary" data-ti="${t.id}" data-act="accepted">قبول</button><button class="sm-btn" data-ti="${t.id}" data-act="adjusted">تعديل السعر</button><button class="sm-btn danger" data-ti="${t.id}" data-act="rejected">رفض</button></div>` : ''}</td></tr>`).join('')}</table>` : '<p class="muted">لا توجد طلبات تبديل بعد</p>'}</div>`;
    c.querySelectorAll('[data-ti]').forEach((b) => b.onclick = () => {
      const t = list.find((x) => x.id === Number(b.dataset.ti)); const act = b.dataset.act;
      modal(`${act === 'accepted' ? 'قبول' : act === 'adjusted' ? 'تعديل سعر' : 'رفض'} — ${esc(t.label)}`, `<form id="tif">
        ${act === 'adjusted' ? `<div class="field"><label>السعر النهائي بعد الفحص (د.ع) — التقدير كان ${fmt(t.estimate)}</label><input class="input num" type="number" min="0" name="final_value" required value="${t.estimate}"></div>` : ''}
        ${act !== 'rejected' ? `<div class="field"><label>IMEI الجهاز (اكتب *#06# بالجهاز)</label><input class="input num" name="imei" dir="ltr" maxlength="20"></div>` : ''}
        <div class="field"><label>ملاحظة</label><input class="input" name="note" placeholder="${act === 'rejected' ? 'سبب الرفض' : 'خدش بالظهر، البطارية 82%...'}"></div>
        <p class="muted">${act === 'rejected' ? 'الزبون يحتفظ بجهازه ويدفع المبلغ كامل.' : 'المبلغ المطلوب من الزبون يتحدث تلقائياً.'}</p>
        <button class="btn btn-primary btn-block">تأكيد</button></form>`, (m, close) => {
        m.querySelector('#tif').onsubmit = async (e) => {
          e.preventDefault();
          try { const r = await api(`/admin/tradeins/${t.id}`, { method: 'PUT', body: { status: act, ...Object.fromEntries(new FormData(e.target)) } }); toast(`تم — قيمة الجهاز ${fmt(r.final_value)} د.ع`); close(); tradein(); }
          catch (err) { toast(err.message); }
        };
      });
    });
  }
  async function tradeinPrices(c) {
    const list = await api('/admin/tradein-models');
    c.innerHTML = `<div class="card panel warn-box">⚠️ الأسعار الحالية <b>تجريبية</b> — حدّثها حسب سعر السوق للجهاز المستعمل بحالة ممتازة. الخصومات تنطبق عليها تلقائياً حسب أجوبة الزبون.</div>
      <div class="card panel"><table class="t var-table"><thead><tr><th>الماركة</th><th>الموديل</th><th>السعة GB</th><th>السعر بحالة ممتازة (د.ع)</th><th>ظاهر</th><th></th></tr></thead><tbody>
      ${list.map((x) => `<tr data-row="${x.id}"><td><input class="input sm" name="brand" value="${esc(x.brand)}"></td><td><input class="input sm" name="model" value="${esc(x.model)}"></td>
        <td><input class="input sm num" type="number" name="storage_gb" value="${x.storage_gb}" style="width:90px"></td><td><input class="input sm num" type="number" name="base_price" value="${x.base_price}"></td>
        <td><input type="checkbox" name="active" ${x.active ? 'checked' : ''}></td><td><div class="row-actions"><button class="sm-btn primary" data-save="${x.id}">حفظ</button><button class="sm-btn danger" data-del="${x.id}">×</button></div></td></tr>`).join('')}
      <tr data-row="new"><td><input class="input sm" name="brand" placeholder="Apple"></td><td><input class="input sm" name="model" placeholder="iPhone 16"></td><td><input class="input sm num" type="number" name="storage_gb" placeholder="128" style="width:90px"></td>
        <td><input class="input sm num" type="number" name="base_price" placeholder="900000"></td><td><input type="checkbox" name="active" checked></td><td><button class="sm-btn primary" data-save="new">+ إضافة</button></td></tr>
      </tbody></table></div>`;
    const rowBody = (id) => { const r = c.querySelector(`[data-row="${id}"]`); return { brand: r.querySelector('[name=brand]').value, model: r.querySelector('[name=model]').value, storage_gb: r.querySelector('[name=storage_gb]').value, base_price: r.querySelector('[name=base_price]').value, active: r.querySelector('[name=active]').checked }; };
    c.querySelectorAll('[data-save]').forEach((b) => b.onclick = async () => {
      const id = b.dataset.save;
      try { await api(id === 'new' ? '/admin/tradein-models' : `/admin/tradein-models/${id}`, { method: id === 'new' ? 'POST' : 'PUT', body: rowBody(id) }); toast('تم الحفظ'); if (id === 'new') tradeinPrices(c); } catch (e) { toast(e.message); }
    });
    c.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (!confirm('حذف الموديل؟')) return; await api(`/admin/tradein-models/${b.dataset.del}`, { method: 'DELETE' }); tradeinPrices(c); });
  }
  async function tradeinRules(c) {
    const st = await api('/admin/settings');
    let rules = {}; try { rules = JSON.parse(st.tradein_rules || '{}'); } catch { rules = {}; }
    c.innerHTML = `<form class="card panel" id="trf" style="max-width:720px">
      <div class="toggles"><label><input type="checkbox" name="enabled" ${st.tradein_enabled === '1' ? 'checked' : ''}> تفعيل «بدّل جهازك القديم» بالمتجر</label></div>
      <p class="muted">النسبة تنخصم من سعر الموديل حسب جواب الزبون. المجموع الأقصى 80%، والنتيجة تتقرّب لأقرب 5,000 د.ع للأسفل.</p>
      ${Object.entries(TI_Q).map(([q, [label, opts]]) => `<div class="field"><label>${label}</label><div class="fgrid3">${Object.entries(opts).map(([o, ol]) => `<div><span class="muted" style="font-size:12.5px">${ol}</span><div class="pct"><input class="input sm num" type="number" min="0" max="90" step="0.5" data-q="${q}" data-o="${o}" value="${rules[q]?.[o] ?? 0}"><b>%</b></div></div>`).join('')}</div></div>`).join('')}
      <button class="btn btn-primary">حفظ</button></form>`;
    $('#trf').onsubmit = async (e) => {
      e.preventDefault();
      const out = {};
      c.querySelectorAll('[data-q]').forEach((i) => { (out[i.dataset.q] = out[i.dataset.q] || {})[i.dataset.o] = Number(i.value) || 0; });
      try { await api('/admin/tradein-rules', { method: 'PUT', body: { rules: out, enabled: e.target.enabled.checked } }); toast('تم الحفظ'); } catch (err) { toast(err.message); }
    };
  }

  // ---------- quick restock ----------
  function restockForm(p, done) {
    modal(`المخزن — ${esc(p.name_ku)}`, `<form id="rs">
      ${p.has_variants ? `<div class="field"><label>النوع</label><select class="input" name="variant_id">${p.variants.map((v) => `<option value="${v.id}">${esc(v.label)} — الموجود ${v.stock}</option>`).join('')}</select></div>` : `<p class="muted">الموجود حالياً: <b>${p.stock}</b></p>`}
      <div class="fgrid"><div class="field"><label>الكمية (+ إضافة / − نقص)</label><input class="input num" type="number" name="delta" required placeholder="10"></div>
      <div class="field"><label>السبب</label><select class="input" name="reason"><option value="restock">بضاعة جديدة</option><option value="return">مرتجع</option><option value="damage">تالف</option><option value="correction">تصحيح جرد</option></select></div></div>
      <div class="field"><label>ملاحظة</label><input class="input" name="note" placeholder="اسم المورد، رقم الفاتورة..."></div>
      <button class="btn btn-primary btn-block">حفظ</button></form>`, (m, close) => {
      m.querySelector('#rs').onsubmit = async (e) => {
        e.preventDefault();
        try { await api('/admin/stock/adjust', { method: 'POST', body: { product_id: p.id, ...Object.fromEntries(new FormData(e.target)) } }); toast('تم تحديث المخزن'); close(); done(); }
        catch (err) { toast(err.message); }
      };
    });
  }

  // ---------- abandoned carts ----------
  async function carts() {
    const c = layout('carts', 'السلات المتروكة');
    const list = await api('/admin/carts');
    const age = (h) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} دقيقة` : h < 48 ? `${Math.round(h)} ساعة` : `${Math.round(h / 24)} يوم`);
    const total = list.reduce((a, x) => a + x.value, 0);
    c.innerHTML = `<div class="kpis"><div class="card kpi"><div class="lbl">سلات متروكة</div><div class="val num">${list.length}</div></div>
      <div class="card kpi"><div class="lbl">قيمتها</div><div class="val num">${fmt(total)} <small>د.ع</small></div></div></div>
      <div class="card panel" style="background:#FFFBF7;border:2px solid #FBE2D3">💡 زبائن أضافوا منتجات ولم يكملوا الطلب. رسالة واتساب لطيفة بعد ساعة إلى يوم ترجع جزء كبير منهم.</div>
      <div class="card panel">${list.length ? `<table class="t"><thead><tr><th>الزبون</th><th>المنتجات</th><th>القيمة</th><th>منذ</th><th></th></tr></thead><tbody>
      ${list.map((x) => {
        const names = x.items.filter((i) => i.available).map((i) => `${i.name_ku}${i.variant_label ? ` (${i.variant_label})` : ''}`);
        const msg = `مرحبا ${x.name} 👋\nلاحظنا تركت بالسلة: ${names.join('، ')}.\nإذا عندك أي سؤال نحن بالخدمة، وتقدر تكمل طلبك من هنا: ${location.origin}/#/cart`;
        const wa = `https://wa.me/${String(x.phone).replace(/\D/g, '').replace(/^0/, '964')}?text=${encodeURIComponent(msg)}`;
        return `<tr><td><b>${esc(x.name)}</b><br><a class="num muted" href="tel:${esc(x.phone)}">${esc(x.phone)}</a></td>
          <td class="order-items">${x.items.map((i) => i.available ? `${esc(i.name_ku)}${i.variant_label ? ` (${esc(i.variant_label)})` : ''} × ${i.qty}` : '<s>منتج محذوف</s>').join('<br>')}</td>
          <td class="num"><b>${fmt(x.value)}</b></td><td class="muted">${age(x.hours)}</td>
          <td><a class="sm-btn primary" style="background:#25D366" target="_blank" rel="noopener" href="${esc(wa)}" data-remind="${x.user_id}">واتساب</a>${x.reminded_at ? `<div class="muted" style="font-size:11px;margin-top:4px">ذُكّر ${esc(x.reminded_at.slice(0, 16))}</div>` : ''}</td></tr>`;
      }).join('')}</tbody></table>` : '<p class="muted">لا توجد سلات متروكة 👌</p>'}</div>`;
    c.querySelectorAll('[data-remind]').forEach((a) => a.addEventListener('click', () => { api(`/admin/carts/${a.dataset.remind}/reminded`, { method: 'POST' }).catch(() => {}); }));
  }

  // ---------- expenses & profit ----------
  const EXP_CATS = { rent: 'إيجار', salaries: 'رواتب', ads: 'إعلانات', delivery: 'توصيل', utilities: 'كهرباء وإنترنت', stock_purchase: 'شراء بضاعة', other: 'أخرى' };
  async function expenses() {
    const month = (location.hash.split('?m=')[1] || new Date().toISOString().slice(0, 7)).slice(0, 7);
    const c = layout('expenses', 'المصاريف والأرباح', `<input class="input" type="month" id="em" value="${esc(month)}" style="min-width:160px"><button class="btn btn-primary" id="addEx">+ مصروف</button>`);
    const [list, profit] = await Promise.all([api(`/admin/expenses?month=${month}`), api('/admin/profit?months=6')]);
    const cur = profit.find((x) => x.month === month) || profit[0];
    c.innerHTML = `<div class="kpis">
        <div class="card kpi"><div class="lbl">مبيعات المنتجات (مُسلّمة)</div><div class="val num">${fmt(cur.sales)} <small>د.ع</small></div></div>
        <div class="card kpi"><div class="lbl">سعر شراء البضاعة</div><div class="val num">${fmt(cur.cogs)} <small>د.ع</small></div></div>
        <div class="card kpi"><div class="lbl">المصاريف</div><div class="val num">${fmt(cur.expenses)} <small>د.ع</small></div></div>
        <div class="card kpi"><div class="lbl">صافي الربح</div><div class="val num" style="color:${cur.net >= 0 ? 'var(--green)' : 'var(--red)'}">${fmt(cur.net)} <small>د.ع</small></div></div></div>
      ${cur.missing_cost ? `<div class="card panel warn-box">⚠️ ${cur.missing_cost} قطعة مباعة هذا الشهر بدون «سعر شراء» — الربح الحقيقي أقل من الظاهر. أضف سعر الشراء بالمنتجات.</div>` : ''}
      <div class="two"><div class="card panel"><h3>مصاريف ${esc(month)}</h3>${list.length ? `<table class="t"><thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>ملاحظة</th><th></th></tr></thead>
        ${list.map((x) => `<tr><td class="num">${esc(x.date)}</td><td>${esc(EXP_CATS[x.category] || x.category)}</td><td class="num"><b>${fmt(x.amount)}</b></td><td class="muted">${esc(x.note || '')}</td><td><button class="sm-btn danger" data-del="${x.id}">×</button></td></tr>`).join('')}</table>` : '<p class="muted">لا توجد مصاريف لهذا الشهر</p>'}</div>
      <div class="card panel"><h3>آخر 6 أشهر</h3><table class="t"><thead><tr><th>الشهر</th><th>طلبات</th><th>مبيعات</th><th>صافي</th></tr></thead>
        ${profit.map((x) => `<tr><td class="num"><a href="#/expenses?m=${x.month}">${x.month}</a></td><td class="num">${x.orders}</td><td class="num">${fmt(x.sales)}</td><td class="num" style="color:${x.net >= 0 ? 'var(--green)' : 'var(--red)'};font-weight:800">${fmt(x.net)}</td></tr>`).join('')}</table>
        <p class="muted" style="font-size:12px">صافي الربح = مبيعات المنتجات − سعر الشراء − رصيد المحفظة المستخدم − المصاريف. أجور التوصيل غير محسوبة (تروح لشركة التوصيل).</p></div></div>`;
    $('#em').onchange = () => { location.hash = `#/expenses?m=${$('#em').value}`; };
    c.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (!confirm('حذف المصروف؟')) return; await api(`/admin/expenses/${b.dataset.del}`, { method: 'DELETE' }); expenses(); });
    $('#addEx').onclick = () => modal('مصروف جديد', `<form id="exf"><div class="fgrid">
        <div class="field"><label>التاريخ</label><input class="input" type="date" name="date" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="field"><label>النوع</label><select class="input" name="category">${Object.entries(EXP_CATS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
        <div class="field"><label>المبلغ (د.ع) *</label><input class="input num" type="number" min="1" name="amount" required></div>
        <div class="field"><label>ملاحظة</label><input class="input" name="note"></div></div><button class="btn btn-primary btn-block">حفظ</button></form>`, (m, close) => {
      m.querySelector('#exf').onsubmit = async (e) => { e.preventDefault(); try { await api('/admin/expenses', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); close(); expenses(); } catch (err) { toast(err.message); } };
    });
  }

  // ---------- bulk price change ----------
  async function bulk() {
    const c = layout('bulk', 'تغيير الأسعار بالجملة');
    catsCache = await api('/admin/categories');
    const brands = [...new Set((await api('/admin/products')).map((p) => p.brand).filter(Boolean))].sort();
    c.innerHTML = `<form class="card panel" id="bf" style="max-width:820px"><div class="fgrid">
      <div class="field"><label>القسم</label><select class="input" name="category_id"><option value="">كل الأقسام</option>${catOptions(null)}</select></div>
      <div class="field"><label>الماركة</label><select class="input" name="brand"><option value="">كل الماركات</option>${brands.map((b) => `<option>${esc(b)}</option>`).join('')}</select></div>
      <div class="field"><label>طريقة التغيير</label><select class="input" name="mode"><option value="percent">نسبة %</option><option value="amount">مبلغ ثابت (د.ع)</option></select></div>
      <div class="field"><label>القيمة (موجب = زيادة، سالب = تخفيض)</label><input class="input num" type="number" step="any" name="value" required placeholder="مثلاً 5 أو -10"></div>
      <div class="field"><label>تقريب لأقرب</label><select class="input" name="round">${[250, 500, 1000, 5000].map((n) => `<option value="${n}">${fmt(n)} د.ع</option>`).join('')}</select></div>
    </div><button class="btn btn-soft" type="submit">👁️ معاينة</button> <button class="btn btn-primary" type="button" id="apply" disabled>تطبيق</button></form><div id="prev"></div>`;
    const body = () => { const b = Object.fromEntries(new FormData($('#bf'))); return b; };
    $('#bf').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await api('/admin/bulk-price', { method: 'POST', body: { ...body(), preview: true } });
        $('#prev').innerHTML = `<div class="card panel"><h3>سيتغير ${r.count} سعر${r.skipped_usd ? ` (تم تجاهل ${r.skipped_usd} منتج مسعّر بالدولار — استخدم النسبة لها)` : ''}</h3>
          <table class="t"><thead><tr><th>المنتج</th><th>الحالي</th><th>الجديد</th></tr></thead>${r.changes.map((x) => `<tr><td>${esc(x.name)}</td><td class="num">${x.usd ? '$' : ''}${fmt(x.from)}</td><td class="num"><b>${x.usd ? '$' : ''}${fmt(x.to)}</b></td></tr>`).join('')}</table></div>`;
        $('#apply').disabled = !r.count;
      } catch (err) { toast(err.message); }
    };
    $('#apply').onclick = async () => {
      if (!confirm('تطبيق تغيير الأسعار؟')) return;
      try { const r = await api('/admin/bulk-price', { method: 'POST', body: body() }); toast(`تم تحديث ${r.count} سعر`); $('#prev').innerHTML = ''; $('#apply').disabled = true; } catch (err) { toast(err.message); }
    };
  }

  // ---------- variant presets ----------
  async function presets() {
    const c = layout('presets', 'قوالب الأنواع والسعات');
    const st = await api('/admin/settings');
    let groups = []; try { groups = JSON.parse(st.variant_presets || '[]'); } catch { groups = []; }
    const draw = () => {
      c.innerHTML = `<div class="card panel" style="background:#FFFBF7;border:2px solid #FBE2D3">💡 جهّز السعات والألوان مرة وحدة، وبعدها بنموذج المنتج اضغط «⚡ توليد من القوالب» وتنضاف كل التركيبات (مثل 256GB · أسود) بضغطة.</div>
        <div class="card panel" style="max-width:820px">${groups.map((g, i) => `<div class="field"><label>اسم القالب</label>
          <div class="toolbar"><input class="input" data-gn="${i}" value="${esc(g.name)}" style="max-width:220px"><input class="input" data-gv="${i}" value="${esc(g.values.join(', '))}" style="flex:1" placeholder="القيم مفصولة بفاصلة"><button class="sm-btn danger" data-rmg="${i}">×</button></div></div>`).join('')}
          <button class="sm-btn" id="addG">+ قالب جديد</button><br><br><button class="btn btn-primary" id="saveG">حفظ</button></div>`;
      c.querySelectorAll('[data-gn]').forEach((i) => i.oninput = () => { groups[i.dataset.gn].name = i.value; });
      c.querySelectorAll('[data-gv]').forEach((i) => i.oninput = () => { groups[i.dataset.gv].values = i.value.split(',').map((x) => x.trim()).filter(Boolean); });
      c.querySelectorAll('[data-rmg]').forEach((b) => b.onclick = () => { groups.splice(Number(b.dataset.rmg), 1); draw(); });
      $('#addG').onclick = () => { groups.push({ name: '', values: [] }); draw(); };
      $('#saveG').onclick = async () => { try { groups = await api('/admin/variant-presets', { method: 'PUT', body: { presets: groups } }); settingsCache.variant_presets = JSON.stringify(groups); toast('تم الحفظ'); draw(); } catch (e) { toast(e.message); } };
    };
    draw();
  }

  // ---------- product tags ----------
  async function tags() {
    const c = layout('tags', 'ملصقات المنتجات', '<button class="btn btn-primary" id="addT">+ ملصق جديد</button>');
    const load = async () => {
      const list = await api('/admin/tags');
      c.innerHTML = `<div class="card panel" style="background:#FFFBF7;border:2px solid #FBE2D3">💡 ملصقات تظهر على المنتج، مثل «وصل حديثاً»، «ضمان وكالة»، «مستعمل كالجديد». اختارها من نموذج المنتج.</div>
        <div class="card panel">${list.length ? `<table class="t"><thead><tr><th>الملصق</th><th>عربي</th><th>English</th><th>منتجات</th><th></th></tr></thead>${list.map((t) => `<tr>
          <td><span class="pill" style="background:${esc(t.color)}22;color:${esc(t.color)}">${esc(t.name_ku)}</span></td><td>${esc(t.name_ar || '')}</td><td>${esc(t.name_en || '')}</td><td class="num">${t.products}</td>
          <td><div class="row-actions"><button class="sm-btn" data-edit="${t.id}">تعديل</button><button class="sm-btn danger" data-del="${t.id}">حذف</button></div></td></tr>`).join('')}</table>` : '<p class="muted">لا توجد ملصقات</p>'}</div>`;
      c.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => tagForm(list.find((t) => t.id === Number(b.dataset.edit)), load));
      c.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (!confirm('حذف الملصق؟')) return; await api(`/admin/tags/${b.dataset.del}`, { method: 'DELETE' }); load(); });
    };
    $('#addT').onclick = () => tagForm(null, load);
    load();
  }
  function tagForm(t, done) {
    const isNew = !t; t = t || { color: '#8B5CF6' };
    modal(isNew ? 'ملصق جديد' : 'تعديل الملصق', `<form id="tf2"><div class="fgrid">
      <div class="field"><label>کوردی *</label><input class="input" name="name_ku" value="${esc(t.name_ku || '')}" required></div>
      <div class="field"><label>عربي</label><input class="input" name="name_ar" value="${esc(t.name_ar || '')}"></div>
      <div class="field"><label>English</label><input class="input" name="name_en" value="${esc(t.name_en || '')}"></div>
      <div class="field"><label>اللون</label><input class="input" type="color" name="color" value="${esc(t.color)}" style="padding:4px"></div>
    </div><button class="btn btn-primary btn-block">حفظ</button></form>`, (m, close) => {
      m.querySelector('#tf2').onsubmit = async (e) => { e.preventDefault(); try { await api(isNew ? '/admin/tags' : `/admin/tags/${t.id}`, { method: isNew ? 'POST' : 'PUT', body: Object.fromEntries(new FormData(e.target)) }); close(); done(); } catch (err) { toast(err.message); } };
    });
  }

  // ---------- stock movements ----------
  const REASONS = { order: '🛒 طلب', cancel: '↩️ إلغاء طلب', admin_edit: '✏️ تعديل المنتج', restock: '📦 بضاعة جديدة', return: '↩️ مرتجع', damage: '💥 تالف', correction: '🔧 تصحيح جرد', initial: '🆕 مخزون أولي' };
  async function stock() {
    const c = layout('stock', 'حركة المخزن');
    const list = await api('/admin/stock');
    c.innerHTML = `<div class="card panel">${list.length ? `<table class="t"><thead><tr><th>الوقت</th><th>المنتج</th><th>التغيير</th><th>بعده</th><th>السبب</th><th>بواسطة</th></tr></thead>${list.map((x) => `<tr>
      <td class="num muted" style="white-space:nowrap">${esc(x.created_at.slice(0, 16))}</td>
      <td>${esc(x.product_name || '—')}${x.variant_label ? ` <span class="muted">(${esc(x.variant_label)})</span>` : ''}</td>
      <td class="num" style="font-weight:800;color:${x.delta > 0 ? 'var(--green)' : 'var(--red)'}">${x.delta > 0 ? '+' : ''}${x.delta}</td>
      <td class="num">${x.stock_after ?? ''}</td><td>${esc(REASONS[x.reason] || x.reason)}${x.ref ? ` <span class="muted">${esc(x.ref)}</span>` : ''}</td><td class="muted">${esc(x.user_name || '')}</td></tr>`).join('')}</table>` : '<p class="muted">لا توجد حركة بعد</p>'}</div>`;
  }

  // ---------- visitor analytics ----------
  async function analytics() {
    const days = Number((location.hash.split('?d=')[1] || '30')) || 30;
    const c = layout('analytics', 'تحليل الزوار', `<select class="input sm" id="ad">${[7, 30, 90].map((d) => `<option value="${d}" ${d === days ? 'selected' : ''}>آخر ${d} يوم</option>`).join('')}</select>`);
    const a = await api(`/admin/analytics?days=${days}`);
    const max = Math.max(1, ...a.daily.map((d) => d.visitors));
    c.innerHTML = `<div class="kpis">
        <div class="card kpi"><div class="lbl">زوار</div><div class="val num">${fmt(a.totals.visitors)}</div></div>
        <div class="card kpi"><div class="lbl">مشاهدات صفحات</div><div class="val num">${fmt(a.totals.views)}</div></div>
        <div class="card kpi"><div class="lbl">طلبات</div><div class="val num">${fmt(a.totals.orders)}</div></div>
        <div class="card kpi"><div class="lbl">نسبة التحويل</div><div class="val num">${a.totals.conversion}%</div></div></div>
      <div class="card panel"><h3>الزوار يومياً</h3>${a.daily.length ? `<div class="bars">${a.daily.map((d) => `<div class="bar" title="${d.day}: ${d.visitors} زائر، ${d.orders} طلب"><i style="height:${Math.round((d.visitors / max) * 100)}%"></i>${d.orders ? `<b>${d.orders}</b>` : ''}<span>${d.day.slice(8)}</span></div>`).join('')}</div><p class="muted" style="font-size:12px">الرقم فوق العمود = عدد الطلبات بذاك اليوم</p>` : '<p class="muted">لا توجد زيارات بعد</p>'}</div>
      <div class="two"><div class="card panel"><h3>أكثر المنتجات مشاهدة</h3>${a.top_products.length ? `<table class="t"><thead><tr><th>المنتج</th><th>زوار</th><th>مبيع</th><th>تحويل</th></tr></thead>${a.top_products.map((p) => `<tr><td>${esc(p.name)}</td><td class="num">${p.visitors}</td><td class="num">${p.sold}</td><td class="num">${p.visitors ? Math.round((p.sold / p.visitors) * 100) : 0}%</td></tr>`).join('')}</table><p class="muted" style="font-size:12px">منتج مشاهداته عالية ومبيعه قليل؟ راجع سعره وصوره.</p>` : '<p class="muted">—</p>'}</div>
      <div><div class="card panel"><h3>مصادر الزيارات</h3><table class="t">${a.sources.map((x) => `<tr><td class="num">${esc(x.src === 'direct' ? 'مباشر' : x.src)}</td><td class="num">${x.visitors}</td></tr>`).join('') || '<tr><td class="muted">—</td></tr>'}</table></div>
      <div class="card panel"><h3>الصفحات</h3><table class="t">${a.pages.map((x) => `<tr><td class="num">${esc(x.path || '/')}</td><td class="num">${x.views}</td></tr>`).join('') || '<tr><td class="muted">—</td></tr>'}</table></div></div></div>
      <p class="muted" style="font-size:12px">بدون كوكيز وبدون أطراف خارجية. الروبوتات ومعاينات الروابط والموظفين ما ينحسبون.</p>`;
    $('#ad').onchange = () => { location.hash = `#/analytics?d=${$('#ad').value}`; };
  }

  // ---------- staff ----------
  async function staff() {
    const c = layout('staff', 'مدراء النظام', '<button class="btn btn-primary" id="addS">+ إضافة موظف</button>');
    const list = await api('/admin/staff');
    c.innerHTML = `<div class="card panel" style="background:#FFFBF7;border:2px solid #FBE2D3">💡 كل موظف يشوف بس الأقسام اللي تخص شغله. الموظف لازم يسجّل بالمتجر أولاً، بعدها تضيفه هنا برقمه. أنصح كل موظف يفعّل التحقق بخطوتين.
        <ul style="margin:8px 0 0;line-height:1.9"><li><b>مدير:</b> كل شي عدا الإعدادات والموظفين والنسخ الاحتياطي</li><li><b>موظف طلبات:</b> الطلبات، الزبائن، السلات المتروكة</li><li><b>موظف منتجات ومخزن:</b> المنتجات، الأقسام، حركة المخزن</li></ul></div>
      <div class="card panel"><table class="t"><thead><tr><th>الاسم</th><th>الموبايل</th><th>الصلاحية</th><th>تحقق بخطوتين</th><th></th></tr></thead>${list.map((u) => `<tr>
        <td><b>${esc(u.name)}</b></td><td class="num">${esc(u.phone)}</td>
        <td>${u.id === ME.user.id ? `<span class="pill">${esc(ROLES[u.role])}</span> (أنت)` : `<select class="input sm" data-role="${u.id}">${Object.entries(ROLES).map(([k, l]) => `<option value="${k}" ${k === u.role ? 'selected' : ''}>${l}</option>`).join('')}<option value="customer">— إزالة من الموظفين —</option></select>`}</td>
        <td>${u.totp_enabled ? '<span class="st delivered">مفعّل</span>' : '<span class="st pending">غير مفعّل</span>'}</td><td></td></tr>`).join('')}</table></div>`;
    c.querySelectorAll('[data-role]').forEach((sel) => sel.onchange = async () => {
      if (!confirm(sel.value === 'customer' ? 'إزالة هذا الموظف؟' : `تغيير الصلاحية إلى «${ROLES[sel.value]}»؟`)) return staff();
      try { await api(`/admin/staff/${sel.dataset.role}`, { method: 'PUT', body: { role: sel.value } }); toast('تم الحفظ'); staff(); } catch (e) { toast(e.message); staff(); }
    });
    $('#addS').onclick = () => modal('إضافة موظف', `<form id="sf2"><div class="field"><label>رقم موبايل الموظف (لازم يكون مسجّل بالمتجر)</label><input class="input num" name="phone" required style="text-align:start"></div>
      <div class="field"><label>الصلاحية</label><select class="input" name="role">${Object.entries(ROLES).filter(([k]) => k !== 'admin').map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}<option value="admin">${ROLES.admin}</option></select></div>
      <button class="btn btn-primary btn-block">إضافة</button></form>`, (m, close) => {
      m.querySelector('#sf2').onsubmit = async (e) => { e.preventDefault(); try { await api('/admin/staff', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); close(); toast('تمت الإضافة'); staff(); } catch (err) { toast(err.code === 'phone_not_found' ? 'هذا الرقم غير مسجل بالمتجر' : err.message); } };
    });
  }

  // ---------- FAQ ----------
  async function faqs() {
    const c = layout('faqs', 'الأسئلة الشائعة', '<button class="btn btn-primary" id="addF">+ سؤال</button>');
    const load = async () => {
      const list = await api('/admin/faqs');
      c.innerHTML = `<div class="card panel">${list.length ? `<table class="t"><thead><tr><th>السؤال</th><th>الجواب</th><th>الترتيب</th><th></th></tr></thead>${list.map((f) => `<tr>
        <td><b>${esc(f.q_ku)}</b><br><span class="muted">${esc(f.q_ar || '')}</span></td><td class="muted" style="max-width:380px">${esc(f.a_ku)}</td><td class="num">${f.sort}</td>
        <td><div class="row-actions"><button class="sm-btn" data-edit="${f.id}">تعديل</button><button class="sm-btn danger" data-del="${f.id}">حذف</button></div></td></tr>`).join('')}</table>` : '<p class="muted">لا توجد أسئلة</p>'}</div>`;
      c.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => faqForm(list.find((f) => f.id === Number(b.dataset.edit)), load));
      c.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (!confirm('حذف السؤال؟')) return; await api(`/admin/faqs/${b.dataset.del}`, { method: 'DELETE' }); load(); });
    };
    $('#addF').onclick = () => faqForm(null, load);
    load();
  }
  function faqForm(f, done) {
    const isNew = !f; f = f || { sort: 0, active: 1 };
    modal(isNew ? 'سؤال جديد' : 'تعديل السؤال', `<form id="ff"><div class="fgrid">${langFields('q', f, 'السؤال *')}${langFields('a', f, 'الجواب *', true)}
      <div class="field"><label>الترتيب</label><input class="input num" type="number" name="sort" value="${f.sort}"></div></div>
      <div class="toggles"><label><input type="checkbox" name="active" ${f.active ? 'checked' : ''}> ظاهر</label></div><button class="btn btn-primary btn-block">حفظ</button></form>`, (m, close) => {
      bindLangTabs(m);
      m.querySelector('[name=q_ku]').required = true; m.querySelector('[name=a_ku]').required = true;
      m.querySelector('#ff').onsubmit = async (e) => {
        e.preventDefault(); const fd = new FormData(e.target); const body = Object.fromEntries(fd); body.active = fd.has('active');
        try { await api(isNew ? '/admin/faqs' : `/admin/faqs/${f.id}`, { method: isNew ? 'POST' : 'PUT', body }); close(); done(); } catch (err) { toast(err.message); }
      };
    });
  }

  // ---------- router ----------
  const ROUTES = { tradein, dashboard, orders, products, categories, banners, coupons, users, settings, security, carts, expenses, bulk, presets, tags, stock, analytics, staff, faqs };
  async function render() {
    if (!token) return showLogin();
    if (!ME) { try { ME = await api('/me'); } catch { return; } if (ME.user.role === 'customer') return showLogin(ERR.forbidden); }
    let key = (location.hash.replace(/^#\/?/, '').split(/[/?]/)[0]) || 'dashboard';
    const item = NAV.flatMap(([, items]) => items).find(([k]) => k === key);
    if (!item || !allowed(item[2])) key = (navItems()[0] || ['security'])[0]; // a page this role may open
    try { await (ROUTES[key] || dashboard)(); } catch (e) { if (e.code !== 'unauthorized' && e.code !== 'forbidden') toast(e.message); }
  }
  window.addEventListener('hashchange', render);
  render();
})();
