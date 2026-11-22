// Optimise uploaded photos: auto-rotate, strip metadata (EXIF / GPS), resize, convert to WebP.
// Also writes a 1200×630 JPEG used as the link-preview image on WhatsApp / Facebook / Telegram.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const MAX_SIDE = 1400;

async function processUpload(srcPath, uploadDir) {
  const base = path.basename(srcPath).replace(/\.[^.]+$/, '');
  const webpName = `${base}.webp`;
  try {
    await sharp(srcPath, { animated: false })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(path.join(uploadDir, webpName));
    await sharp(srcPath, { animated: false })
      .rotate()
      .resize({ width: 1200, height: 630, fit: 'contain', background: '#ffffff' })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(path.join(uploadDir, `${base}-og.jpg`));
  } finally {
    fs.unlink(srcPath, () => {});
  }
  return `/uploads/${webpName}`;
}

// "/uploads/abc.webp" → "/uploads/abc-og.jpg" when that preview exists.
function ogImageFor(url, uploadDir) {
  const m = /^\/uploads\/([a-f0-9]+)\.webp$/.exec(String(url || ''));
  if (m && fs.existsSync(path.join(uploadDir, `${m[1]}-og.jpg`))) return `/uploads/${m[1]}-og.jpg`;
  return /\.(jpe?g|png|webp)$/i.test(String(url || '')) ? url : null;
}

module.exports = { processUpload, ogImageFor };
