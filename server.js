import { createServer } from 'http';
import { getKey, insertActivation, getActivation, updateActivationSeen, banHwid, isHwidBanned } from './db.js';

const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.writeHead(204).end();
    if (req.method !== 'POST') return res.writeHead(405).end();

    if (req.url === '/verify') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { key, hwid } = JSON.parse(body);
                if (!key || !hwid) return json(res, { ok: false, error: 'Eksik parametre' });

                // HWID ban kontrol
                if (await isHwidBanned(hwid)) return json(res, { ok: false, error: 'HWID banlı' });

                const keyData = await getKey(key);
                if (!keyData) return json(res, { ok: false, error: 'Geçersiz key' });
                if (keyData.is_banned) return json(res, { ok: false, error: 'Key banlı' });
                if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) return json(res, { ok: false, error: 'Key süresi dolmuş' });

                const activation = await getActivation(keyData.id);
                console.log(`Verification: key=${key} hwid_sent=${hwid} hwid_db=${activation ? activation.hwid : 'N/A'}`);
                if (activation) {
                    if (activation.hwid !== hwid) {
                        return json(res, { ok: false, error: 'Bu key başka bilgisayarda kullanılıyor' });
                    }
                    await updateActivationSeen(activation.id, req.socket.remoteAddress);
                } else {
                    // İlk aktivasyon
                    await insertActivation(keyData.id, hwid, req.socket.remoteAddress);
                }

                const expiresAt = keyData.expires_at ? new Date(keyData.expires_at).toISOString() : null;
                json(res, { ok: true, expires_at: expiresAt });
            } catch (e) {
                console.error('Verify hatası:', e);
                json(res, { ok: false, error: 'Sunucu hatası' });
            }
        });
        return;
    }

    res.writeHead(404).end();
});

function json(res, data) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Verify API çalışıyor: http://localhost:${PORT}`));
