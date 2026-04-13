const axios = require('axios');

function buildHeaders(apiKey) {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
    };
}

async function sendQrisTransaction(userId, amount, type, config = {}) {
    const apiBaseUrl = config.apiBaseUrl || process.env.API_BASE_URL || 'https://api.example.com';
    const apiKey = config.apiKey || process.env.API_KEY || 'ISI_API_KEY_KAMU';

    try {
        const payload = {
            user_id: userId,
            amount,
            type
        };

        const response = await axios.post(`${apiBaseUrl}/transaction`, payload, {
            headers: buildHeaders(apiKey),
            timeout: 30000
        });

        const data = response.data || {};

        return {
            success: true,
            message: data.message || `${type} berhasil`,
            data: {
                raw: data,
                qrString: data.qr_string || data.qrString || null,
                qrImage: data.qr_image || data.qrImage || null,
                expiredAt: data.expired_at || data.expiredAt || null
            }
        };
    } catch (error) {
        console.error(`[${type.toUpperCase()} ERROR]`, error.response?.data || error.message);

        return {
            success: false,
            message: error.response?.data?.message || `Gagal ${type}`
        };
    }
}

async function createQRIS(userId, amount, config = {}) {
    return sendQrisTransaction(userId, amount, 'create_qris', config);
}

async function renewQRIS(userId, amount, config = {}) {
    return sendQrisTransaction(userId, amount, 'renew_qris', config);
}

module.exports = {
    createQRIS,
    renewQRIS
};
