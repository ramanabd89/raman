// Daily SQLite backups into DATA_DIR/backups (keeps the newest BACKUP_KEEP files, default 14).
const fs = require('fs');
const path = require('path');
const { db, DATA_DIR } = require('./db');

const DIR = path.join(DATA_DIR, 'backups');
const KEEP = parseInt(process.env.BACKUP_KEEP || '14', 10);

function snapshot(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) fs.unlinkSync(file);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`); // consistent copy while the app keeps running
  return file;
}

function dailyBackup() {
  try {
    const name = `store-${new Date().toISOString().slice(0, 10)}.db`;
    snapshot(path.join(DIR, name));
    const files = fs.readdirSync(DIR).filter((f) => /^store-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
    for (const f of files.slice(0, Math.max(0, files.length - KEEP))) fs.unlinkSync(path.join(DIR, f));
    console.log(`Backup written: ${name}`);
  } catch (e) {
    console.error('Backup failed:', e.message);
  }
}

function startBackups() {
  dailyBackup();
  setInterval(dailyBackup, 24 * 3600 * 1000).unref();
}

function listBackups() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter((f) => f.endsWith('.db')).sort().reverse()
    .map((f) => ({ name: f, size: fs.statSync(path.join(DIR, f)).size }));
}

module.exports = { startBackups, snapshot, listBackups, DIR };
