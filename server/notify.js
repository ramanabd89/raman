// Instant notifications to the store owner via a Telegram bot.
// Set TELEGRAM_BOT_TOKEN (from @BotFather) and TELEGRAM_CHAT_ID (your chat or group id).
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;
const enabled = !!(TOKEN && CHAT);

const escHtml = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

async function notify(html) {
  if (!enabled) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT, text: html, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    if (!res.ok) console.error('Telegram notify failed:', res.status, (await res.text()).slice(0, 200));
  } catch (e) {
    console.error('Telegram notify failed:', e.message);
  }
}

const fmt = (n) => Number(n || 0).toLocaleString('en-US');

function orderMessage(order, items, { highValue, publicUrl } = {}) {
  const lines = items.map((i) => `• ${escHtml(i.name)}${i.variant_label ? ` (${escHtml(i.variant_label)})` : ''} × ${i.qty} = ${fmt(i.price * i.qty)}`);
  return [
    `🛒 <b>طلب جديد #${order.id}</b>${highValue ? '\n⚠️ <b>طلب بقيمة عالية — اتصل بالزبون للتأكيد</b>' : ''}`,
    '',
    `👤 ${escHtml(order.customer_name)}`,
    `📞 ${escHtml(order.phone)}`,
    `📍 ${escHtml(order.city)} — ${escHtml(order.address)}`,
    order.note ? `📝 ${escHtml(order.note)}` : null,
    '',
    ...lines,
    '',
    `🚚 التوصيل: ${fmt(order.delivery_fee)}`,
    order.wallet_used ? `👛 من المحفظة: -${fmt(order.wallet_used)}` : null,
    `💰 <b>المطلوب: ${fmt(order.total)} د.ع</b>`,
    publicUrl ? `\n${escHtml(publicUrl)}/admin/#/orders` : null,
  ].filter((l) => l !== null).join('\n');
}

module.exports = { notify, orderMessage, escHtml, enabled };
