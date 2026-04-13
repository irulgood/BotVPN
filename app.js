const axios = require('axios');
const qris = require('./qris');

/*
|--------------------------------------------------------------------------
| CONFIG
|--------------------------------------------------------------------------
| Samakan value di bawah ini dengan logic top up lama kamu
*/
const API_BASE_URL = process.env.API_BASE_URL || 'https://api.example.com';
const API_KEY = process.env.API_KEY || 'ISI_API_KEY_KAMU';
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || '628xxxx';

/*
|--------------------------------------------------------------------------
| HELPER
|--------------------------------------------------------------------------
*/
function parseAmount(value) {
    const amount = parseInt(String(value || '').replace(/[^\d]/g, ''), 10);
    return Number.isFinite(amount) ? amount : 0;
}

function buildHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
    };
}

async function topupRequest(userId, amount) {
    try {
        const payload = {
            user_id: userId,
            amount,
            type: 'topup'
        };

        const response = await axios.post(`${API_BASE_URL}/transaction`, payload, {
            headers: buildHeaders(),
            timeout: 30000
        });

        return {
            success: true,
            message: response.data?.message || 'Top up berhasil diproses',
            data: response.data
        };
    } catch (error) {
        console.error('[TOPUP ERROR]', error.response?.data || error.message);
        return {
            success: false,
            message: error.response?.data?.message || 'Top up gagal diproses'
        };
    }
}

/*
|--------------------------------------------------------------------------
| COMMAND HANDLER
|--------------------------------------------------------------------------
| Ganti handler ini sesuai base bot kamu.
| Sudah dipisah:
| - topup tetap di app.js
| - createqris / renewqris di qris.js
*/
async function handleCommand({ command, args, sender, reply }) {
    switch (command) {
        case 'topup': {
            const amount = parseAmount(args[0]);

            if (!amount || amount < 1000) {
                return reply('Contoh: .topup 10000');
            }

            const result = await topupRequest(sender, amount);
            return reply(result.message);
        }

        case 'createqris': {
            const amount = parseAmount(args[0]);

            if (!amount || amount < 1000) {
                return reply('Contoh: .createqris 10000');
            }

            const result = await qris.createQRIS(sender, amount, {
                apiBaseUrl: API_BASE_URL,
                apiKey: API_KEY
            });

            if (!result.success) {
                return reply(result.message);
            }

            const qrText =
                `✅ ${result.message}\n` +
                `💰 Nominal: ${amount}\n` +
                `${result.data?.expiredAt ? `⏰ Expired: ${result.data.expiredAt}\n` : ''}` +
                `${result.data?.qrString ? `📌 QR String: ${result.data.qrString}\n` : ''}` +
                `${result.data?.qrImage ? `🖼️ QR Image: ${result.data.qrImage}` : ''}`;

            return reply(qrText.trim());
        }

        case 'renewqris': {
            const amount = parseAmount(args[0]);

            if (!amount || amount < 1000) {
                return reply('Contoh: .renewqris 10000');
            }

            const result = await qris.renewQRIS(sender, amount, {
                apiBaseUrl: API_BASE_URL,
                apiKey: API_KEY
            });

            if (!result.success) {
                return reply(result.message);
            }

            const qrText =
                `✅ ${result.message}\n` +
                `💰 Nominal: ${amount}\n` +
                `${result.data?.expiredAt ? `⏰ Expired: ${result.data.expiredAt}\n` : ''}` +
                `${result.data?.qrString ? `📌 QR String: ${result.data.qrString}\n` : ''}` +
                `${result.data?.qrImage ? `🖼️ QR Image: ${result.data.qrImage}` : ''}`;

            return reply(qrText.trim());
        }

        default:
            return reply('Command tidak dikenal');
    }
}

/*
|--------------------------------------------------------------------------
| EXAMPLE RUNNER
|--------------------------------------------------------------------------
| Hapus bagian ini kalau app.js kamu sudah punya handler sendiri.
*/
async function demo() {
    const fakeReply = (msg) => console.log('[BOT REPLY]', msg);

    // contoh pemakaian:
    // await handleCommand({ command: 'topup', args: ['10000'], sender: '6281234567890', reply: fakeReply });
    // await handleCommand({ command: 'createqris', args: ['15000'], sender: '6281234567890', reply: fakeReply });
    // await handleCommand({ command: 'renewqris', args: ['20000'], sender: '6281234567890', reply: fakeReply });

    return fakeReply('Edit app.js ini lalu sambungkan ke handler bot kamu.');
}

if (require.main === module) {
    demo();
}

module.exports = {
    handleCommand,
    topupRequest
};
