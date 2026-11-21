// One-time verification codes (OTP) sent by SMS or WhatsApp.
//
// Provider is chosen with SMS_PROVIDER:
//   console  — (default) prints the code to the server log. For development only.
//   twilio   — SMS via Twilio: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM (or TWILIO_MESSAGING_SERVICE_SID)
//   whatsapp — WhatsApp Cloud API (Meta): WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE (an approved
//              "authentication" template), WHATSAPP_TEMPLATE_LANG (default "en")
const crypto = require('crypto');
const { db } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS otp_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0,
  ip TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes(phone, purpose);
`);

const PROVIDER = (process.env.SMS_PROVIDER || 'console').toLowerCase();
const IS_PROD = process.env.NODE_ENV === 'production';
const CODE_TTL_MS = 5 * 60 * 1000;
const RESEND_AFTER_MS = 60 * 1000;
const MAX_PER_PHONE_HOUR = 5;
const MAX_PER_IP_HOUR = 20;
const MAX_ATTEMPTS = 5;
const PURPOSES = ['register', 'reset', 'change_phone'];
// Only send to these country prefixes (protects against SMS-pumping fraud on international numbers).
const ALLOWED_PREFIXES = (process.env.OTP_ALLOWED_PREFIXES || '+964').split(',').map((x) => x.trim()).filter(Boolean);

if (PROVIDER === 'console' && IS_PROD) {
  console.warn('WARNING: SMS_PROVIDER=console in production — verification codes are only printed to this log, customers will not receive them.');
}

class OtpError extends Error { constructor(code, extra = {}) { super(code); this.code = code; Object.assign(this, extra); } }

// Iraqi local numbers (07xx xxx xxxx) → +9647xxxxxxxxx; other formats are kept international.
function toE164(phone) {
  let p = String(phone).replace(/[^\d+]/g, '');
  if (p.startsWith('00')) p = '+' + p.slice(2);
  if (p.startsWith('+')) return p;
  if (p.startsWith('964')) return '+' + p;
  if (p.startsWith('0')) return '+964' + p.slice(1);
  return '+' + p;
}

const hashCode = (code, salt) => crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');

const MESSAGES = {
  ku: (c, s) => `${c} کۆدی پشتڕاستکردنەوەی ${s}یە. بۆ کەس مەینێرە.`,
  ar: (c, s) => `${c} هو رمز التحقق الخاص بك في ${s}. لا تشاركه مع أحد.`,
  en: (c, s) => `${c} is your ${s} verification code. Do not share it.`,
};

async function deliver(phone, code, lang, storeName) {
  const to = toE164(phone);
  const text = (MESSAGES[lang] || MESSAGES.ku)(code, storeName || 'Store');

  if (PROVIDER === 'twilio') {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const body = new URLSearchParams({ To: to, Body: text });
    if (process.env.TWILIO_MESSAGING_SERVICE_SID) body.set('MessagingServiceSid', process.env.TWILIO_MESSAGING_SERVICE_SID);
    else body.set('From', process.env.TWILIO_FROM || '');
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return;
  }

  if (PROVIDER === 'whatsapp') {
    const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(process.env.WHATSAPP_PHONE_NUMBER_ID)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to.replace('+', ''),
        type: 'template',
        template: {
          name: process.env.WHATSAPP_TEMPLATE,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'en' },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: code }] },
            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
          ],
        },
      }),
    });
    if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return;
  }

  console.log(`[OTP] ${to}: ${text}`);
}

/** Create and send a code. Returns { resend_in, expires_in, dev_code? }. */
async function sendOtp({ phone, purpose, ip, lang, storeName }) {
  if (!PURPOSES.includes(purpose)) throw new OtpError('invalid_input');
  const e164 = toE164(phone);
  if (!ALLOWED_PREFIXES.some((pre) => e164.startsWith(pre)) || !/^\+\d{10,15}$/.test(e164)) throw new OtpError('phone_not_allowed');
  const now = Date.now();
  db.prepare('DELETE FROM otp_codes WHERE created_at < ?').run(now - 24 * 3600 * 1000);

  const last = db.prepare('SELECT created_at FROM otp_codes WHERE phone = ? ORDER BY id DESC LIMIT 1').get(phone);
  if (last && now - last.created_at < RESEND_AFTER_MS) {
    throw new OtpError('otp_wait', { retry_in: Math.ceil((RESEND_AFTER_MS - (now - last.created_at)) / 1000) });
  }
  const perPhone = db.prepare('SELECT COUNT(*) n FROM otp_codes WHERE phone = ? AND created_at > ?').get(phone, now - 3600 * 1000).n;
  const perIp = db.prepare('SELECT COUNT(*) n FROM otp_codes WHERE ip = ? AND created_at > ?').get(ip || '', now - 3600 * 1000).n;
  if (perPhone >= MAX_PER_PHONE_HOUR || perIp >= MAX_PER_IP_HOUR) throw new OtpError('too_many_attempts');

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const salt = crypto.randomBytes(8).toString('hex');
  // Only the newest code for a phone+purpose is valid.
  db.prepare('UPDATE otp_codes SET used = 1 WHERE phone = ? AND purpose = ? AND used = 0').run(phone, purpose);
  const id = Number(db.prepare('INSERT INTO otp_codes(phone, purpose, code_hash, salt, ip, expires_at, created_at) VALUES(?,?,?,?,?,?,?)')
    .run(phone, purpose, hashCode(code, salt), salt, ip || '', now + CODE_TTL_MS, now).lastInsertRowid);

  try {
    await deliver(phone, code, lang, storeName);
  } catch (e) {
    console.error('OTP delivery failed:', e.message);
    db.prepare('DELETE FROM otp_codes WHERE id = ?').run(id);
    throw new OtpError('otp_send_failed');
  }
  const out = { resend_in: RESEND_AFTER_MS / 1000, expires_in: CODE_TTL_MS / 1000 };
  if (PROVIDER === 'console' && !IS_PROD) out.dev_code = code;
  return out;
}

/** Check a code; consumes it on success. Throws OtpError otherwise. */
function verifyOtp({ phone, purpose, code }) {
  const row = db.prepare('SELECT * FROM otp_codes WHERE phone = ? AND purpose = ? AND used = 0 ORDER BY id DESC LIMIT 1').get(phone, purpose);
  if (!row || row.expires_at < Date.now()) throw new OtpError('otp_expired');
  if (row.attempts >= MAX_ATTEMPTS) throw new OtpError('otp_expired');
  const given = Buffer.from(hashCode(String(code || '').replace(/\D/g, ''), row.salt), 'hex');
  const real = Buffer.from(row.code_hash, 'hex');
  if (!crypto.timingSafeEqual(given, real)) {
    db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    throw new OtpError('otp_invalid', { attempts_left: Math.max(0, MAX_ATTEMPTS - row.attempts - 1) });
  }
  db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(row.id);
}

module.exports = { sendOtp, verifyOtp, OtpError, toE164, PROVIDER };
