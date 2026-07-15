import Database from 'better-sqlite3';
import { existsSync } from 'fs';

const db = new Database('./data.db');
db.pragma('journal_mode = WAL');

export async function initDb() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key_string TEXT NOT NULL UNIQUE,
            created_by TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            expires_at TEXT NULL,
            max_uses INTEGER NOT NULL DEFAULT 1,
            is_banned INTEGER NOT NULL DEFAULT 0
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS activations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key_id INTEGER NOT NULL,
            hwid TEXT NOT NULL,
            activated_at TEXT NOT NULL DEFAULT (datetime('now')),
            last_seen TEXT NULL,
            ip TEXT NOT NULL DEFAULT '',
            FOREIGN KEY (key_id) REFERENCES keys(id) ON DELETE CASCADE
        )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_activations_hwid ON activations(hwid)');

    db.exec(`
        CREATE TABLE IF NOT EXISTS banned_hwids (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hwid TEXT NOT NULL UNIQUE,
            reason TEXT NOT NULL DEFAULT '',
            banned_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);

    console.log('✅ Veritabanı hazır (SQLite).');
}

export async function getKey(keyString) {
    return db.prepare('SELECT * FROM keys WHERE key_string = ?').get(keyString) || null;
}

export async function insertKey(key) {
    const expires = key.expires_at ? (typeof key.expires_at === 'object' ? key.expires_at.toISOString() : key.expires_at) : null;
    const r = db.prepare('INSERT INTO keys (key_string, created_by, expires_at, max_uses) VALUES (?, ?, ?, ?)').run(
        key.key_string, key.created_by, expires, key.max_uses
    );
    return r.lastInsertRowid;
}

export async function deleteKey(keyString) {
    const r = db.prepare('DELETE FROM keys WHERE key_string = ?').run(keyString);
    return r.changes > 0;
}

export async function getAllKeys() {
    return db.prepare('SELECT * FROM keys ORDER BY created_at DESC').all();
}

export async function getActiveKeyCount() {
    const r = db.prepare('SELECT COUNT(DISTINCT k.id) AS cnt FROM keys k INNER JOIN activations a ON k.id = a.key_id').get();
    return r.cnt;
}

export async function getActivation(keyId) {
    return db.prepare('SELECT * FROM activations WHERE key_id = ? LIMIT 1').get(keyId) || null;
}

export async function insertActivation(keyId, hwid, ip) {
    db.prepare('INSERT INTO activations (key_id, hwid, ip) VALUES (?, ?, ?)').run(keyId, hwid, ip);
}

export async function getKeyByHwid(hwid) {
    return db.prepare(
        'SELECT k.* FROM keys k INNER JOIN activations a ON k.id = a.key_id WHERE a.hwid = ? LIMIT 1'
    ).get(hwid) || null;
}

export async function banKey(keyString) {
    db.prepare('UPDATE keys SET is_banned = 1 WHERE key_string = ?').run(keyString);
}

export async function unbanKey(keyString) {
    db.prepare('UPDATE keys SET is_banned = 0 WHERE key_string = ?').run(keyString);
}

export async function isHwidBanned(hwid) {
    const r = db.prepare('SELECT COUNT(*) AS cnt FROM banned_hwids WHERE hwid = ?').get(hwid);
    return r.cnt > 0;
}

export async function banHwid(hwid, reason) {
    db.prepare('INSERT INTO banned_hwids (hwid, reason) VALUES (?, ?) ON CONFLICT(hwid) DO UPDATE SET reason = excluded.reason').run(hwid, reason);
}

export async function unbanHwid(hwid) {
    db.prepare('DELETE FROM banned_hwids WHERE hwid = ?').run(hwid);
}

export async function updateActivationHwid(id, hwid, ip) {
    db.prepare("UPDATE activations SET hwid = ?, last_seen = datetime('now'), ip = ? WHERE id = ?").run(hwid, ip, id);
}

export async function updateActivationSeen(id, ip) {
    db.prepare("UPDATE activations SET last_seen = datetime('now'), ip = ? WHERE id = ?").run(ip, id);
}
