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

  const ST = { pending: 'قيد الانتظار', preparing: 'قيد التجهيز', shipping: 'في الطريق', delivered: 'تم التوصيل', cancelled: 'ملغي' };
  const ERR = { usd_price_too_high: 'سعر الدولار غير منطقي (أكثر من 50,000$) — تأكد أنك كتبته بالدولار وليس بالدينار', usd_rate_missing: 'حدد سعر صرف الدولار من الإعدادات أولاً', invalid_city: 'مدينة غير موجودة في قائمة التوصيل', wrong_2fa_code: 'رمز التحقق غير صحيح', login_expired: 'انتهت المهلة، سجّل الدخول من جديد', already_enabled: 'التحقق بخطوتين مفعّل مسبقاً', wrong_credentials: 'الرقم أو كلمة المرور خطأ', forbidden: 'هذا الحساب ليس مديراً', invalid_input: 'يرجى ملء الحقول المطلوبة', too_many_attempts: 'محاولات كثيرة، حاول لاحقاً', order_cancelled: 'لا يمكن تغيير طلب ملغي', cannot_demote_self: 'لا يمكنك إزالة صلاحيتك', file_too_large: 'الصورة أكبر من 5MB', invalid_file: 'ملف غير صالح' };

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
        if (r.user.role !== 'admin') return showLogin(ERR.forbidden);
        token = r.token;
        localStorage.setItem('token', JSON.stringify(r.token)); localStorage.setItem('user', JSON.stringify(r.user));
        location.hash = '#/dashboard'; render();
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
  const NAV = [['dashboard', '📊 الرئيسية'], ['orders', '📦 الطلبات'], ['products', '📱 المنتجات'], ['categories', '🗂️ الأقسام'], ['banners', '🖼️ البانرات'], ['users', '👥 الزبائن'], ['settings', '⚙️ الإعدادات'], ['security', '🔒 الأمان والنسخ']];
  function layout(active, title, actions = '') {
    document.querySelectorAll('.modal-bg').forEach((m) => m.remove()); // close any open dialog when changing page
    root.innerHTML = `<div class="adm">
      <aside class="adm-side"><div class="logo"><span>لوحة التحكم</span><span class="dot"></span></div>
        <nav>${NAV.map(([k, l]) => `<a href="#/${k}" class="${k === active ? 'active' : ''}">${l}</a>`).join('')}</nav>
        <div class="bottom"><a href="/" target="_blank">🛒 فتح المتجر</a><button id="lo">↩ تسجيل الخروج</button></div></aside>
      <div style="flex:1;min-width:0">
        <div class="adm-mobile-nav">${NAV.map(([k, l]) => `<a href="#/${k}" class="${k === active ? 'active' : ''}">${l}</a>`).join('')}</div>
        <div class="adm-main"><div class="adm-top"><h1>${title}</h1><div class="toolbar">${actions}</div></div><div id="content"><div class="spinner"></div></div></div>
      </div></div>`;
    $('#lo').onclick = () => { api('/auth/logout', { method: 'POST' }).catch(() => {}); localStorage.removeItem('token'); localStorage.removeItem('user'); token = null; showLogin(); };
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
          <div>${o.high_value ? '<span class="pill" style="background:#FFF4E5;color:#D97706">💰 قيمة عالية — اتصل للتأكيد</span> ' : ''}${o.phone_cancelled ? `<span class="pill" style="background:var(--red-soft);color:var(--red)">⚠️ ${o.phone_cancelled} طلب ملغي سابقاً</span> ` : ''}${o.customer_blocked ? '<span class="pill" style="background:var(--ink);color:#fff">🚫 محظور</span>' : ''}</div></td>
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
  const catName = (id) => { const c = catsCache.find((x) => x.id === id); if (!c) return '—'; const p = catsCache.find((x) => x.id === c.parent_id); return p ? `${p.name_ku} › ${c.name_ku}` : c.name_ku; };
  const catOptions = (sel, allowTopOnly = false) => catsCache.filter((c) => !allowTopOnly || !c.parent_id)
    .map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.parent_id ? '— ' + catName(c.id) : c.name_ku)}</option>`).join('');

  async function products() {
    settingsCache = await api('/admin/settings').catch(() => ({}));
    const c = layout('products', 'المنتجات', `<input class="input" id="pq" placeholder="بحث..."><button class="btn btn-primary" id="addP">+ منتج جديد</button>`);
    catsCache = await api('/admin/categories');
    const load = async () => {
      const list = await api(`/admin/products?q=${encodeURIComponent($('#pq').value)}`);
      c.innerHTML = `<div class="card panel"><table class="t"><thead><tr><th></th><th>الاسم</th><th>القسم</th><th>السعر</th><th>المخزون</th><th>المبيعات</th><th>الحالة</th><th></th></tr></thead><tbody>
        ${list.map((p) => `<tr>
          <td><img src="${safeImg(p.image)}"></td>
          <td><b>${esc(p.name_ku)}</b><br><span class="muted">${esc(p.name_en || '')}</span>
            <div>${p.featured ? '<span class="pill">مميز</span> ' : ''}${p.flash_sale ? '<span class="pill" style="background:var(--red-soft);color:var(--red)">تخفيض سريع</span> ' : ''}${p.trending ? '<span class="pill" style="background:#EEF0F4;color:var(--ink)">رائج</span>' : ''}</div></td>
          <td>${esc(catName(p.category_id))}</td>
          <td class="num">${p.has_variants ? '<span class="muted">من </span>' : ''}<b>${fmt(p.price)}</b>${p.old_price ? `<br><s class="muted">${fmt(p.old_price)}</s>` : ''}${p.has_variants ? `<br><span class="muted">${p.variants.length} أنواع</span>` : ''}${p.usd_priced ? `<br><span class="pill" style="background:#E6F7EF;color:var(--green)">$${fmt(p.has_variants ? Math.min(...p.variants.map((v) => v.price_usd || Infinity)) : p.price_usd)}</span>` : ''}</td>
          <td class="num" style="font-weight:800;color:${p.stock === 0 ? 'var(--red)' : p.stock <= 3 ? '#D97706' : 'inherit'}">${p.stock}</td>
          <td class="num">${p.sold}</td>
          <td>${p.active ? '<span class="st delivered">ظاهر</span>' : '<span class="st cancelled">مخفي</span>'}</td>
          <td><div class="row-actions"><button class="sm-btn" data-edit="${p.id}">تعديل</button><button class="sm-btn danger" data-del="${p.id}">حذف</button></div></td>
        </tr>`).join('')}</tbody></table></div>`;
      c.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => productForm(list.find((p) => p.id === Number(b.dataset.edit)), load));
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
        <div class="field"><label>عدد المبيعات (يظهر للزبون)</label><input class="input num" type="number" min="0" name="sold" value="${p.sold ?? 0}"></div>
        <div class="field full"><label>الأنواع (السعة / اللون) — اختياري. إذا أضفت أنواعاً، السعر والمخزون يؤخذان منها</label>
          <div id="variants"></div><button type="button" class="sm-btn" id="addVar">+ إضافة نوع</button></div>
        ${imgField('image', p.image, 'الصورة الرئيسية')}
        <div class="field full"><label>صور إضافية</label><label class="sm-btn" style="cursor:pointer;display:inline-block">+ إضافة صور<input type="file" accept="image/*" multiple hidden id="galUp"></label><div class="gallery-list" id="gal"></div></div>
        ${langFields('desc', p, 'الوصف', true)}
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
        box.innerHTML = variants.length ? `<table class="t var-table"><thead><tr><th>النوع (مثل 256GB · أسود)</th><th>السعر</th><th>السعر القديم</th><th>المخزون</th><th></th></tr></thead><tbody>${variants.map((v, i) => `<tr>
          <td><input class="input sm" dir="ltr" data-v="${i}" data-k="label" value="${esc(v.label || '')}"></td>
          <td><input class="input sm num" type="number" min="0" step="any" data-v="${i}" data-k="price" value="${v.price ?? ''}"></td>
          <td><input class="input sm num" type="number" min="0" step="any" data-v="${i}" data-k="old_price" value="${v.old_price ?? ''}"></td>
          <td><input class="input sm num" type="number" min="0" data-v="${i}" data-k="stock" value="${v.stock ?? 0}"></td>
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
      c.innerHTML = `<div class="card panel"><table class="t"><thead><tr><th>#</th><th>الاسم</th><th>الموبايل</th><th>الطلبات</th><th>المحفظة (د.ع)</th><th>كود الدعوة</th><th>الصلاحية</th><th>الحظر</th><th>تاريخ التسجيل</th></tr></thead><tbody>
        ${list.map((u) => `<tr><td class="num">${u.id}</td><td><b>${esc(u.name)}</b></td><td class="num"><a href="tel:${esc(u.phone)}">${esc(u.phone)}</a></td><td class="num">${u.orders}${u.cancelled ? `<br><span style="color:var(--red);font-size:12px">${u.cancelled} ملغي</span>` : ''}</td>
          <td><div class="row-actions"><input class="input sm num" style="width:110px;height:36px" type="number" min="0" value="${u.wallet}" data-wallet="${u.id}"><button class="sm-btn primary" data-save-wallet="${u.id}">حفظ</button></div></td>
          <td class="num">${esc(u.referral_code)}</td>
          <td><select class="input sm" data-role="${u.id}"><option value="customer" ${u.role === 'customer' ? 'selected' : ''}>زبون</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>مدير</option></select></td>
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
      c.querySelectorAll('[data-role]').forEach((s) => s.onchange = async () => {
        if (s.value === 'admin' && !confirm('منح صلاحية المدير لهذا المستخدم؟')) { load(); return; }
        try { await api(`/admin/users/${s.dataset.role}`, { method: 'PUT', body: { role: s.value } }); toast('تم الحفظ'); } catch (e) { toast(e.message); load(); }
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
      $('#zones').innerHTML = `<table class="t var-table"><thead><tr><th>المدينة</th><th>أجور التوصيل (د.ع)</th><th></th></tr></thead><tbody>${zones.map((z, i) => `<tr>
        <td><input class="input sm" data-z="${i}" data-k="name" value="${esc(z.name)}"></td>
        <td><input class="input sm num" type="number" min="0" data-z="${i}" data-k="fee" value="${z.fee ?? 0}"></td>
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
      body.delivery_zones = JSON.stringify(zones.filter((z) => String(z.name).trim()).map((z) => ({ name: String(z.name).trim(), fee: Number(z.fee) || 0 })));
      const rateChanged = String(body.usd_rate || '') !== String(s.usd_rate || '') || String(body.usd_round) !== String(s.usd_round || '250');
      if (rateChanged && body.usd_rate && !confirm(`سيتم تحديث أسعار كل المنتجات المسعّرة بالدولار حسب ${fmt(body.usd_rate)} د.ع. متابعة؟`)) return;
      try { Object.assign(s, await api('/admin/settings', { method: 'PUT', body })); toast(rateChanged ? 'تم الحفظ وتحديث الأسعار' : 'تم الحفظ'); } catch (err) { toast(err.message); }
    };
  }

  // ---------- security: 2FA, backups, activity log ----------
  async function security() {
    const c = layout('security', 'الأمان والنسخ الاحتياطي');
    const [me, backups, log] = await Promise.all([api('/me'), api('/admin/backups'), api('/admin/log')]);
    const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);
    const ACTIONS = { usd_reprice: 'تحديث الأسعار حسب الدولار', order_status: 'تغيير حالة طلب', product_create: 'إضافة منتج', product_update: 'تعديل منتج', product_delete: 'حذف منتج', category_create: 'إضافة قسم', category_delete: 'حذف قسم', banner_delete: 'حذف بانر', user_update: 'تعديل زبون', settings_update: 'تعديل الإعدادات', backup_download: 'تنزيل نسخة احتياطية', '2fa_enabled': 'تفعيل التحقق بخطوتين', '2fa_disabled': 'إيقاف التحقق بخطوتين' };
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

  // ---------- router ----------
  const ROUTES = { dashboard, orders, products, categories, banners, users, settings, security };
  async function render() {
    if (!token) return showLogin();
    const key = (location.hash.replace(/^#\/?/, '').split(/[/?]/)[0]) || 'dashboard';
    try { await (ROUTES[key] || dashboard)(); } catch (e) { if (e.code !== 'unauthorized' && e.code !== 'forbidden') toast(e.message); }
  }
  window.addEventListener('hashchange', render);
  render();
})();
