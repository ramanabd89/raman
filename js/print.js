// Print pages: print button + QR codes (no inline scripts, so the strict CSP stays on).
(function () {
  document.querySelectorAll('[data-print]').forEach(function (b) { b.addEventListener('click', function () { window.print(); }); });
  function drawQr() {
    if (!window.qrcode) return;
    document.querySelectorAll('[data-qr]').forEach(function (el) {
      try { var q = window.qrcode(0, 'M'); q.addData(el.getAttribute('data-qr')); q.make(); el.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2 }); } catch (e) { /* the link is printed under it anyway */ }
    });
  }
  if (document.readyState === 'complete') drawQr(); else window.addEventListener('load', drawQr);
})();
