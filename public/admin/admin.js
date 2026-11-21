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
  const ERR = { wrong_credentials: 'الرقم أو كلمة المرور خطأ', forbidden: 'هذا الحساب ليس مديراً', invalid_input: 'يرجى ملء الحقول المطلوبة', too_many_attempts: 'محاولات كثيرة، حاول لاحقاً', order_cancelled: 'لا يمكن تغيير طلب ملغي', cannot_demote_self: 'لا يمكنك إزالة صلاحيتك', file_too_large: 'الصورة أكبر من 5MB', invalid_file: 'ملف غير صالح' };

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
        const r = await api('/auth/login', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
        if (r.user.role !== 'admin') return showLogin(ERR.forbidden);
        token = r.token;
        localStorage.setItem('token', JSON.stringify(r.token)); localStorage.setItem('user', JSON.stringify(r.user));
        location.hash = '#/dashboard'; render();
      } catch (err) { showLogin(err.message); }
    };
  }

  // ---------- layout ----------
  const NAV = [['dashboard', '📊 الرئيسية'], ['orders', '📦 الطلبات'], ['products', '📱 المنتجات'], ['categories', '🗂️ الأقسام'], ['banners', '🖼️ البانرات'], ['users', '👥 الزبائن'], ['settings', '⚙️ الإعدادات']];
  function layout(active, title, actions = '') {
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
    c.innerHTML = `
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
        <td>${esc(o.customer_name)}<br><a class="num muted" href="tel:${esc(o.phone)}">${esc(o.phone)}</a></td>
        <td>${esc(o.city)}</td>
        ${full ? `<td class="order-items">${(o.items || []).map((i) => `${esc(i.name)} × ${i.qty}`).join('<br>')}</td>` : ''}
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
        <table class="t">${o.items.map((i) => `<tr><td><img src="${safeImg(i.image)}"></td><td>${esc(i.name)}</td><td class="num">${fmt(i.price)} × ${i.qty}</td><td class="num"><b>${fmt(i.price * i.qty)}</b></td></tr>`).join('')}</table>
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
  const catName = (id) => { const c = catsCache.find((x) => x.id === id); if (!c) return '—'; const p = catsCache.find((x) => x.id === c.parent_id); return p ? `${p.name_ku} › ${c.name_ku}` : c.name_ku; };
  const catOptions = (sel, allowTopOnly = false) => catsCache.filter((c) => !allowTopOnly || !c.parent_id)
    .map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.parent_id ? '— ' + catName(c.id) : c.name_ku)}</option>`).join('');

  async function products() {
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
          <td class="num"><b>${fmt(p.price)}</b>${p.old_price ? `<br><s class="muted">${fmt(p.old_price)}</s>` : ''}</td>
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
        <div class="field"><label>السعر (د.ع) *</label><input class="input num" type="number" min="0" name="price" value="${p.price ?? ''}" required></div>
        <div class="field"><label>السعر القديم (للخصم)</label><input class="input num" type="number" min="0" name="old_price" value="${p.old_price ?? ''}"></div>
        <div class="field"><label>المخزون</label><input class="input num" type="number" min="0" name="stock" value="${p.stock ?? 0}"></div>
        <div class="field"><label>عدد المبيعات (يظهر للزبون)</label><input class="input num" type="number" min="0" name="sold" value="${p.sold ?? 0}"></div>
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
        ['active', 'featured', 'trending', 'flash_sale'].forEach((k) => { body[k] = fd.has(k); });
        body.images = gallery;
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
      c.innerHTML = `<div class="card panel"><table class="t"><thead><tr><th>#</th><th>الاسم</th><th>الموبايل</th><th>الطلبات</th><th>المحفظة (د.ع)</th><th>كود الدعوة</th><th>الصلاحية</th><th>تاريخ التسجيل</th></tr></thead><tbody>
        ${list.map((u) => `<tr><td class="num">${u.id}</td><td><b>${esc(u.name)}</b></td><td class="num"><a href="tel:${esc(u.phone)}">${esc(u.phone)}</a></td><td class="num">${u.orders}</td>
          <td><div class="row-actions"><input class="input sm num" style="width:110px;height:36px" type="number" min="0" value="${u.wallet}" data-wallet="${u.id}"><button class="sm-btn primary" data-save-wallet="${u.id}">حفظ</button></div></td>
          <td class="num">${esc(u.referral_code)}</td>
          <td><select class="input sm" data-role="${u.id}"><option value="customer" ${u.role === 'customer' ? 'selected' : ''}>زبون</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>مدير</option></select></td>
          <td class="num muted">${esc(u.created_at.slice(0, 10))}</td></tr>`).join('')}</tbody></table></div>`;
      c.querySelectorAll('[data-save-wallet]').forEach((b) => b.onclick = async () => {
        try { await api(`/admin/users/${b.dataset.saveWallet}`, { method: 'PUT', body: { wallet: c.querySelector(`[data-wallet="${b.dataset.saveWallet}"]`).value } }); toast('تم الحفظ'); } catch (e) { toast(e.message); }
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
      ${F('delivery_fee', 'أجور التوصيل (د.ع)', 'number')}
      ${F('free_delivery_over', 'توصيل مجاني للطلبات فوق (د.ع) — 0 للإلغاء', 'number')}
      ${F('referral_reward', 'مكافأة الدعوة (د.ع)', 'number')}
      <div class="field"><label>نهاية التخفيضات السريعة</label><input class="input" type="datetime-local" name="flash_sale_end" value="${toLocal(s.flash_sale_end)}"></div>
      <div class="field full"><label>المدن (افصل بفاصلة ,)</label><input class="input" name="cities" value="${esc(s.cities || '')}"></div>
      <div class="field full"><label>كلمات البحث الرائجة (افصل بفاصلة ,)</label><input class="input" name="search_tags" value="${esc(s.search_tags || '')}"></div>
      ${F('whatsapp', 'واتساب (رقم دولي بدون +، مثل 9647501234567)')}
      ${F('instagram', 'رابط انستغرام')}
      ${F('facebook', 'رابط فيسبوك')}
      ${F('tiktok', 'رابط تيك توك')}
    </div><button class="btn btn-primary">حفظ الإعدادات</button></form>`;
    $('#sf').onsubmit = async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target));
      body.flash_sale_end = body.flash_sale_end ? new Date(body.flash_sale_end).toISOString() : '';
      try { await api('/admin/settings', { method: 'PUT', body }); toast('تم الحفظ'); } catch (err) { toast(err.message); }
    };
  }

  // ---------- router ----------
  const ROUTES = { dashboard, orders, products, categories, banners, users, settings };
  async function render() {
    if (!token) return showLogin();
    const key = (location.hash.replace(/^#\/?/, '').split(/[/?]/)[0]) || 'dashboard';
    try { await (ROUTES[key] || dashboard)(); } catch (e) { if (e.code !== 'unauthorized' && e.code !== 'forbidden') toast(e.message); }
  }
  window.addEventListener('hashchange', render);
  render();
})();
