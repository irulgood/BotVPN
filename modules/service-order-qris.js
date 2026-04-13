module.exports = function createServiceOrderModule(deps) {
  const {
    bot,
    db,
    axios,
    vars,
    logger,
    userState,
    safeReplyMessage,
    safeGroupSend,
    updateUserBalance,
    recordAccountTransaction,
    createssh,
    renewssh,
    AUTH_USER,
    AUTH_TOKEN,
    GOPAY_KEY,
  } = deps;

  async function safeSendToUser(userId, text, extra = {}) {
    try {
      return await bot.telegram.sendMessage(userId, text, extra);
    } catch (error) {
      logger.error(`SendMessage gagal ke ${userId}, fallback ke plain text: ${error.message}`);
      const fallback = { ...extra };
      delete fallback.parse_mode;
      try {
        return await bot.telegram.sendMessage(userId, text, fallback);
      } catch (err2) {
        logger.error(`Fallback sendMessage juga gagal ke ${userId}: ${err2.message}`);
        return null;
      }
    }
  }

  function formatOrderSummary(order) {
    const actionLabel = order.action === 'create' ? 'Buat Akun' : 'Perpanjang Akun';
    const typeLabel = String(order.type || '').toUpperCase();
    const usernameLine = order.username ? `👤 Password: ${order.username}\n` : '';
    const expLine = order.exp ? `📅 Masa aktif: ${order.exp} hari\n` : '';
    return `🧾 Detail Pesanan\n\n` +
      `🛠 Layanan: ${actionLabel} ${typeLabel}\n` +
      usernameLine +
      expLine +
      `🌐 Server ID: ${order.serverId}\n` +
      `💰 Total: Rp ${Number(order.totalHarga || 0).toLocaleString('id-ID')}`;
  }

  async function sendPaymentMethodPrompt(ctx, order) {
    userState[ctx.chat.id] = { ...order, step: `payment_method_${order.action}_${order.type}` };
    return safeReplyMessage(ctx, formatOrderSummary(order) + `\n\nPilih metode pembayaran:`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '💳 Bayar Saldo', callback_data: 'pay_balance' }],
          [{ text: '📷 Bayar QRIS', callback_data: 'pay_qris' }]
        ]
      },
      parse_mode: 'Markdown'
    });
  }

  async function deductUserBalance(userId, amount) {
    return new Promise((resolve, reject) => {
      db.run('UPDATE users SET saldo = saldo - ? WHERE user_id = ?', [amount, userId], function(err) {
        if (err) return reject(err);
        resolve(true);
      });
    });
  }

  async function executeServiceOrder(order, opts = {}) {
    const { chargeBalance = false, paymentSource = 'saldo' } = opts;
    const userId = order.userId;
    const action = order.action;
    const type = order.type;
    const username = order.username;
    const password = order.password;
    const exp = order.exp;
    const quota = order.quota;
    const iplimit = order.iplimit;
    const serverId = order.serverId;
    const totalHarga = Number(order.totalHarga || 0);
    let msg = '';

    try {
      if (action === 'create') {
        if (type === 'ssh') msg = await createssh(username, password, exp, iplimit, serverId);
      } else if (action === 'renew') {
        if (type === 'ssh') msg = await renewssh(username, password, exp, iplimit, serverId);
      }

      if (!msg || msg.includes('❌')) {
        if (paymentSource === 'qris' && totalHarga > 0) {
          await updateUserBalance(userId, totalHarga);
          await safeSendToUser(
            userId,
            `⚠️ Pembayaran QRIS berhasil, tetapi proses ${action} ${type} gagal. Dana Rp ${totalHarga.toLocaleString('id-ID')} sudah dimasukkan ke saldo Anda.\n\nDetail error:\n${msg || 'Unknown error'}`
          );
        }
        return { success: false, msg: msg || '❌ Transaksi gagal.' };
      }

      if (chargeBalance && totalHarga > 0) {
        await deductUserBalance(userId, totalHarga);
      }

      await recordAccountTransaction(userId, type);

      const maskedPassword = password && password.length > 1
        ? `${password.slice(0, 1)}${'x'.repeat(password.length - 1)}`
        : (password || '-');

      await safeGroupSend(
        `${action === 'create' ? '📢' : '♻️'} <b>${action === 'create' ? 'Account Created' : 'Account Renewed'}</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 <b>User:</b> ${userId}\n` +
        `🧾 <b>Type:</b> ${String(type).toUpperCase()}\n` +
        `📛 <b>Password:</b> ${maskedPassword}\n` +
        `📆 <b>Expired:</b> ${exp || '0'}\n` +
        `🌐 <b>Server ID:</b> ${serverId}\n` +
        `💳 <b>Metode:</b> ${paymentSource.toUpperCase()}\n` +
        `━━━━━━━━━━━━━━━━━━━━`,
        { parse_mode: 'HTML' }
      );

      await safeSendToUser(userId, msg, { parse_mode: 'Markdown' });
      return { success: true, msg };
    } catch (error) {
      logger.error(`executeServiceOrder error: ${error.message}`);
      if (paymentSource === 'qris' && totalHarga > 0) {
        await updateUserBalance(userId, totalHarga).catch(() => {});
        await safeSendToUser(
          userId,
          `⚠️ Pembayaran QRIS berhasil, tetapi proses order gagal total. Dana Rp ${totalHarga.toLocaleString('id-ID')} dimasukkan ke saldo Anda.`
        );
      }
      return { success: false, msg: `❌ ${error.message}` };
    }
  }

  async function createServiceOrderQRIS(ctx, order, runtime = {}) {
    const { lastRequestRef, requestInterval = 1000, removePendingByPrefix } = runtime;
    const currentTime = Date.now();

    if (lastRequestRef && currentTime - lastRequestRef.value < requestInterval) {
      await safeReplyMessage(ctx, '⚠️ Terlalu banyak request, tunggu dulu ya.');
      return;
    }
    if (lastRequestRef) lastRequestRef.value = currentTime;

    const userId = ctx.from.id;
    const uniqueCode = `order-${userId}-${Date.now()}`;
    let finalAmount = Number(order.totalHarga);
    let adminFee = 0;

    try {
      if (typeof removePendingByPrefix === 'function') {
        await removePendingByPrefix(userId, 'order-');
      }

      let transactionId = null;
      let qrMessage = null;

      if (vars.PAYMENT === 'GOPAY') {
        const res = await axios.post(
          'https://api-gopay.sawargipay.cloud/qris/generate',
          { amount: finalAmount },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${GOPAY_KEY}`
            },
            timeout: 15000
          }
        );
        if (!res.data?.success) throw new Error('Gagal create QRIS GOPAY');
        const data = res.data.data;
        transactionId = data.transaction_id;
        const safeQrUrl = encodeURI(String(data.qr_url || '').trim());
        const caption = formatOrderSummary(order) +
          `\n\n💰 Total bayar: Rp ${finalAmount.toLocaleString('id-ID')}\n⏱️ Expired: 10 menit\n⚠️ Transfer harus sama persis!\n\n🔗 Klik QRIS: ${safeQrUrl}`;
        qrMessage = await safeReplyMessage(ctx, caption, {
          reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: `batal_topup_${uniqueCode}` }]] },
          parse_mode: 'Markdown'
        });
      } else if (vars.PAYMENT === 'ORKUT') {
        const res = await axios.get('https://orkut.rajaserver.web.id/api/qris', {
          params: { qris_string: vars.DATA_QRIS_ORKUT, amount: Number(order.totalHarga), format: 'json' },
          timeout: 15000
        });
        const data = res.data;
        if (!data || !data.success) throw new Error('Gagal create QRIS ORKUT');
        finalAmount = Number(data.amount);
        adminFee = Number(data.random_add);
        transactionId = data.reference;
        const base64Data = String(data.image_data || '').split(',')[1];
        if (!base64Data) throw new Error('QRIS image invalid');
        const imageBuffer = Buffer.from(base64Data, 'base64');
        const caption = formatOrderSummary(order) + `\n\n💰 Total bayar: Rp ${finalAmount.toLocaleString('id-ID')}\n` +
          (adminFee > 0 ? `🧾 Biaya admin: Rp ${adminFee.toLocaleString('id-ID')}\n` : '') +
          `⏱️ Expired: 10 menit\n⚠️ Transfer harus sama persis!`;
        qrMessage = await ctx.replyWithPhoto({ source: imageBuffer }, {
          caption,
          reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: `batal_topup_${uniqueCode}` }]] }
        });
      } else {
        throw new Error('PAYMENT tidak valid');
      }

      if (!global.pendingDeposits) global.pendingDeposits = {};
      global.pendingDeposits[uniqueCode] = {
        amount: finalAmount,
        originalAmount: Number(order.totalHarga),
        userId,
        timestamp: Date.now(),
        status: 'pending',
        qrMessageId: qrMessage?.message_id,
        transactionId,
        purpose: 'service_order',
        payload: JSON.stringify(order)
      };

      db.run(
        `INSERT INTO pending_deposits
        (unique_code, user_id, amount, original_amount, timestamp, status, qr_message_id, purpose, payload, transaction_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uniqueCode,
          userId,
          finalAmount,
          Number(order.totalHarga),
          Date.now(),
          'pending',
          qrMessage?.message_id,
          'service_order',
          JSON.stringify(order),
          transactionId
        ]
      );

      delete userState[ctx.chat.id];
      try { await ctx.deleteMessage(); } catch {}
    } catch (error) {
      logger.error(`QRIS order error: ${error.message}`);
      await safeReplyMessage(ctx, `❌ Gagal membuat QRIS order.\n⚠️ Detail: ${error.message}`);
    }
  }

  return {
    sendPaymentMethodPrompt,
    createServiceOrderQRIS,
    executeServiceOrder,
    safeSendToUser
  };
};
