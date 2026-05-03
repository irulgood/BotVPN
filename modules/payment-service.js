const axios = require('axios');
const fs = require('fs');
const path = require('path');

function createPaymentEngine(options) {
  const {
    db,
    bot,
    vars,
    logger,
    userState,
    isUserReseller,
    keyboardNomor,
    sendMainMenu,
    recordAccountTransaction,
    safeGroupSend,
    GROUP_ID,
    baseDir,
    services = {}
  } = options;

  const createServices = services.create || {};
  const renewServices = services.renew || {};
  const GROUP_SENDER = typeof safeGroupSend === 'function'
    ? safeGroupSend
    : async (text, extra = {}) => {
        const gid = String(GROUP_ID || '').trim();
        if (!gid || gid === 'undefined' || gid === 'null' || gid === '0') {
          logger.warn('Notif grup dilewati: GROUP_ID belum diset.');
          return false;
        }
        try {
          await bot.telegram.sendMessage(gid, text, extra);
          return true;
        } catch (error) {
          logger.error(`Notif grup gagal: ${error.message}`);
          return false;
        }
      };

  global.depositState = global.depositState || {};
  global.pendingDeposits = global.pendingDeposits || {};
  global.pendingServicePayments = global.pendingServicePayments || {};
  global.processedTransactions = global.processedTransactions || new Set();

  const lastDepositRequestByUser = new Map();
  const depositRequestIntervalMs = Math.max(Number(vars.DEPOSIT_REQUEST_INTERVAL_MS || 3000), 1000);
  const qrisHistoryIntervalMs = Math.max(Number(vars.QRIS_HISTORY_INTERVAL_MS || 15000), 10000);
  const qrisHistoryErrorIntervalMs = Math.max(Number(vars.QRIS_HISTORY_ERROR_INTERVAL_MS || 30000), qrisHistoryIntervalMs);
  const qrisHistory429CooldownMs = Math.max(Number(vars.QRIS_HISTORY_429_COOLDOWN_MS || 300000), 300000);
  const qrisHistoryCacheMs = Math.max(Number(vars.QRIS_HISTORY_CACHE_MS || 10000), 5000);
  const qrisLoopIntervalMs = Math.max(Number(vars.QRIS_STATUS_LOOP_MS || 5000), 3000);
  const qrisHistorySharedStateFile = path.join(baseDir || process.cwd(), '.qris-history-state.json');

  let qrisStatusCheckRunning = false;
  let lastOrkutHistoryCheckAt = 0;
  let lastOrkutHistoryResultsAt = 0;
  let lastOrkutHistoryResults = null;
  let last429LogAt = 0;
  let orkutHistoryErrorCount = 0;
  let intervalHandle = null;
  let lastGroupCooldownNoticeUntil = 0;
  const lastPendingNoMatchLogAt = new Map();

  async function notifyGroupAboutCooldown(blockedUntil = 0, pendingTopupCount = 0, pendingServiceCount = 0) {
    if (!blockedUntil) return;
    if (Number(lastGroupCooldownNoticeUntil || 0) >= Number(blockedUntil)) return;

    lastGroupCooldownNoticeUntil = Number(blockedUntil);
    const blockedUntilText = formatBlockedUntilWib(blockedUntil);
    const totalPending = Number(pendingTopupCount || 0) + Number(pendingServiceCount || 0);

    await GROUP_SENDER(
      `⚠️ <b>QRIS PROVIDER RATE LIMIT</b>
━━━━━━━━━━━━━━━━━━━━
` +
      `🕒 <b>Cooldown sampai:</b> ${blockedUntilText} WIB
` +
      `⏳ <b>Durasi cooldown:</b> 5 menit
` +
      `💰 <b>Pending top up:</b> ${pendingTopupCount}
` +
      `🧾 <b>Pending pembayaran layanan:</b> ${pendingServiceCount}
` +
      `📦 <b>Total pending:</b> ${totalPending}
` +
      `━━━━━━━━━━━━━━━━━━━━
` +
      `Bot akan menunda pengecekan pembayaran dan menolak pembuatan QRIS baru sampai cooldown selesai.`,
      { parse_mode: 'HTML' }
    );
  }

  function logNoMatch(key, message) {
    const now = Date.now();
    const last = Number(lastPendingNoMatchLogAt.get(key) || 0);
    if (now - last >= 30000) {
      lastPendingNoMatchLogAt.set(key, now);
      logger.info(message);
    }
  }

  function dbRunAsync(query, params = []) {
    return new Promise((resolve, reject) => {
      db.run(query, params, function(err) {
        if (err) return reject(err);
        resolve(this);
      });
    });
  }

  function dbGetAsync(query, params = []) {
    return new Promise((resolve, reject) => {
      db.get(query, params, (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
  }


  function ensurePaymentTables(callback) {
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS pending_deposits (
        unique_code TEXT PRIMARY KEY,
        user_id INTEGER,
        amount INTEGER,
        original_amount INTEGER,
        timestamp INTEGER,
        status TEXT,
        qr_message_id INTEGER,
        transaction_id TEXT
      )`, (err) => {
        if (err) logger.error(`Kesalahan membuat tabel pending_deposits: ${err.message}`);
      });

      db.run(`CREATE TABLE IF NOT EXISTS pending_service_payments (
        unique_code TEXT PRIMARY KEY,
        user_id INTEGER,
        amount INTEGER,
        original_amount INTEGER,
        action TEXT,
        service_type TEXT,
        server_id INTEGER,
        username TEXT,
        password TEXT,
        exp INTEGER,
        quota TEXT,
        iplimit TEXT,
        timestamp INTEGER,
        status TEXT,
        qr_message_id INTEGER,
        provider_ref TEXT
      )`, (err) => {
        if (err) logger.error(`Kesalahan membuat tabel pending_service_payments: ${err.message}`);
      });

      db.run(`ALTER TABLE pending_deposits ADD COLUMN transaction_id TEXT`, (err) => {
        if (err && !String(err.message || '').includes('duplicate column')) {
          logger.error(`Gagal menambahkan kolom transaction_id di pending_deposits: ${err.message}`);
        }
      });

      // Barrier supaya loadPendingRows tidak jalan sebelum CREATE/ALTER selesai.
      db.get('SELECT 1', [], () => {
        if (typeof callback === 'function') callback();
      });
    });
  }

  function getSharedHistoryState() {
    try {
      if (!fs.existsSync(qrisHistorySharedStateFile)) {
        return { lastFetchAt: 0, blockedUntil: 0, lastStatusCode: 0 };
      }
      const raw = fs.readFileSync(qrisHistorySharedStateFile, 'utf8');
      const parsed = JSON.parse(raw || '{}');
      return {
        lastFetchAt: Number(parsed.lastFetchAt || 0),
        blockedUntil: Number(parsed.blockedUntil || 0),
        lastStatusCode: Number(parsed.lastStatusCode || 0)
      };
    } catch (_) {
      return { lastFetchAt: 0, blockedUntil: 0, lastStatusCode: 0 };
    }
  }

  function setSharedHistoryState(patch = {}) {
    const current = getSharedHistoryState();
    const next = {
      lastFetchAt: Number(patch.lastFetchAt ?? current.lastFetchAt ?? 0),
      blockedUntil: Number(patch.blockedUntil ?? current.blockedUntil ?? 0),
      lastStatusCode: Number(patch.lastStatusCode ?? current.lastStatusCode ?? 0)
    };

    try {
      fs.writeFileSync(qrisHistorySharedStateFile, JSON.stringify(next, null, 2));
    } catch (error) {
      logger.warn(`[QRIS] Gagal update shared cooldown state: ${error.message}`);
    }

    return next;
  }

  function getActiveHistoryCooldownInfo() {
    const sharedState = getSharedHistoryState();
    const now = Date.now();
    const blockedUntil = Number(sharedState.blockedUntil || 0);
    const remainingMs = Math.max(0, blockedUntil - now);
    return {
      blockedUntil,
      remainingMs,
      isActive: remainingMs > 0
    };
  }

  function formatBlockedUntilWib(blockedUntil) {
    return new Date(blockedUntil).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  }

  async function guardNewOrkutQrisRequest(ctx, purposeLabel = 'transaksi QRIS') {
    if (vars.PAYMENT !== 'ORKUT') return true;

    const cooldownInfo = getActiveHistoryCooldownInfo();
    if (!cooldownInfo.isActive) return true;

    const waitMinutes = Math.max(1, Math.ceil(cooldownInfo.remainingMs / 60000));
    const blockedUntilText = formatBlockedUntilWib(cooldownInfo.blockedUntil);
    const alertText = `⚠️ Provider QRIS sedang rate limit. Coba lagi sekitar ${waitMinutes} menit lagi.`;
    const replyText =
      `⚠️ *Pembuatan ${purposeLabel} ditunda sementara karena provider QRIS sedang rate limit.*

` +
      `🕒 Coba lagi sekitar: *${blockedUntilText}* WIB
` +
      `⏳ Estimasi tunggu: *${waitMinutes} menit*

` +
      `Mohon jangan buat QRIS baru dulu sampai cooldown selesai.`;

    if (ctx?.answerCbQuery) {
      await ctx.answerCbQuery(alertText, { show_alert: true }).catch(() => {});
    }
    if (ctx?.reply) {
      await ctx.reply(replyText, { parse_mode: 'Markdown' }).catch(() => {});
    }
    return false;
  }

  async function notifyPendingUsersAboutCooldown(pendingEntries = [], pendingServiceEntries = [], blockedUntil = 0) {
    if (!blockedUntil) return;

    const blockedUntilText = formatBlockedUntilWib(blockedUntil);

    for (const [uniqueCode, deposit] of pendingEntries) {
      if (!deposit || deposit.status !== 'pending') continue;
      if (Number(deposit.cooldownNoticeBlockedUntil || 0) >= blockedUntil) continue;

      try {
        await bot.telegram.sendMessage(
          deposit.userId,
          `⏳ *Pengecekan QRIS top up sedang tertunda karena rate limit provider.*

` +
          `Pembayaran Anda *belum dianggap gagal*. Bot akan cek ulang otomatis setelah cooldown selesai.

` +
          `🕒 Estimasi lanjut cek: *${blockedUntilText}* WIB
` +
          `⚠️ Mohon jangan bayar ulang dan jangan buat QRIS baru untuk transaksi yang sama.`,
          { parse_mode: 'Markdown' }
        ).catch(() => {});
        deposit.cooldownNoticeBlockedUntil = blockedUntil;
      } catch (_) {}
    }

    for (const [uniqueCode, payment] of pendingServiceEntries) {
      if (!payment || payment.status !== 'pending') continue;
      if (Number(payment.cooldownNoticeBlockedUntil || 0) >= blockedUntil) continue;

      try {
        await bot.telegram.sendMessage(
          payment.userId,
          `⏳ *Pengecekan QRIS pembayaran layanan sedang tertunda karena rate limit provider.*

` +
          `Pembayaran Anda *belum dianggap gagal*. Bot akan cek ulang otomatis setelah cooldown selesai.

` +
          `🕒 Estimasi lanjut cek: *${blockedUntilText}* WIB
` +
          `⚠️ Mohon jangan bayar ulang dan jangan buat QRIS baru untuk transaksi yang sama.`,
          { parse_mode: 'Markdown' }
        ).catch(() => {});
        payment.cooldownNoticeBlockedUntil = blockedUntil;
      } catch (_) {}
    }
  }

  function normalizeMoney(value) {
    return Number(String(value ?? '').replace(/[^\d]/g, '')) || 0;
  }

  function getTransactionReferenceId(tx, fallback = '') {
    const direct = [
      tx?.reference_id,
      tx?.reference,
      tx?.transaction_id,
      tx?.trx_id,
      tx?.trxid,
      tx?.id,
      tx?.rrn,
      tx?.reff_id,
      tx?.invoice_id
    ].find(v => v !== undefined && v !== null && String(v).trim() !== '');

    if (direct) return String(direct).trim();

    const composite = [
      tx?.waktu,
      tx?.created_at,
      tx?.updated_at,
      tx?.kredit,
      tx?.amount,
      tx?.nominal,
      fallback
    ].filter(v => v !== undefined && v !== null && String(v).trim() !== '').join('-');

    return composite || fallback;
  }

  function buildHistoryMatchKey(tx) {
    return getTransactionReferenceId(tx, JSON.stringify({
      waktu: tx?.waktu || tx?.created_at || tx?.updated_at || '',
      kredit: tx?.kredit || tx?.amount || tx?.nominal || '',
      ket: tx?.keterangan || tx?.description || ''
    }));
  }

  function getServiceTypeLabel(type) {
    return type === 'zivudp' ? 'ZIV UDP' : String(type || '').toUpperCase();
  }

  async function tryDeleteTelegramMessage(chatId, messageId) {
    if (!chatId || !messageId) return;
    try {
      await bot.telegram.deleteMessage(chatId, messageId);
    } catch (_) {}
  }

  function findPendingDepositByUser(userId) {
    return Object.entries(global.pendingDeposits || {}).find(([, deposit]) => {
      return Number(deposit?.userId) === Number(userId) && deposit?.status === 'pending';
    }) || null;
  }

  function findPendingServicePaymentByUser(userId) {
    return Object.entries(global.pendingServicePayments || {}).find(([, payment]) => {
      return Number(payment?.userId) === Number(userId) && payment?.status === 'pending';
    }) || null;
  }

  function findAnyPendingQrisByUser(userId) {
    const depositPending = findPendingDepositByUser(userId);
    if (depositPending) return { kind: 'deposit', code: depositPending[0], data: depositPending[1] };
    const servicePending = findPendingServicePaymentByUser(userId);
    if (servicePending) return { kind: 'service', code: servicePending[0], data: servicePending[1] };
    return null;
  }

  async function debitUserBalanceSafely(userId, amount) {
    const result = await dbRunAsync(
      'UPDATE users SET saldo = saldo - ? WHERE user_id = ? AND saldo >= ?',
      [amount, userId, amount]
    );
    return result.changes > 0;
  }

  async function creditUserBalance(userId, amount) {
    await dbRunAsync('UPDATE users SET saldo = saldo + ? WHERE user_id = ?', [amount, userId]);
  }

  async function sendPaymentSuccessNotification(userId, deposit, currentBalance) {
    try {
      const adminFee = deposit.amount - deposit.originalAmount;
      await bot.telegram.sendMessage(
        userId,
        `✅ *Pembayaran Berhasil!*\n\n` +
        `💰 Jumlah Deposit: Rp ${deposit.originalAmount}\n` +
        `💰 Biaya Admin: Rp ${adminFee}\n` +
        `💰 Total Pembayaran: Rp ${deposit.amount}\n` +
        `💳 Saldo Sekarang: Rp ${currentBalance}`,
        { parse_mode: 'Markdown' }
      );
      return true;
    } catch (error) {
      logger.error(`Error sending payment notification: ${error.message}`);
      return false;
    }
  }

  async function executeServiceOrder(order) {
    const { action, type, username, password, exp, quota, iplimit, serverId, userId } = order;
    let msg = '❌ *Tipe layanan tidak dikenali.*';

    if (action === 'create' && typeof createServices[type] === 'function') {
      if (type === 'ssh' || type === 'zivudp') {
        msg = await createServices[type](username, password, exp, iplimit, serverId);
      } else {
        msg = await createServices[type](username, exp, quota, iplimit, serverId);
      }
    } else if (action === 'renew' && typeof renewServices[type] === 'function') {
      if (type === 'ssh' || type === 'zivudp') {
        msg = await renewServices[type](username, exp, iplimit, serverId);
      } else {
        msg = await renewServices[type](username, exp, quota, iplimit, serverId);
      }
    }

    msg = String(msg || '❌ *Proses layanan gagal.*');
    if (msg.includes('❌')) {
      return { ok: false, msg };
    }

    await recordAccountTransaction(userId, type);

    const maskedUsername = username && username.length > 1
      ? `${username.slice(0, 1)}${'x'.repeat(username.length - 1)}`
      : username;

    let userInfo = { first_name: String(userId), id: userId };
    try {
      userInfo = await bot.telegram.getChat(userId);
    } catch (_) {}

    const title = action === 'create' ? '📢 <b>Account Created</b>' : '♻️ <b>Account Renewed</b>';
    const expiryLabel = action === 'create' ? 'Expired' : 'New Expiry';

    await GROUP_SENDER(
      `${title}\n━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 <b>User:</b> ${(userInfo.first_name || userInfo.username || userId)} (${userId})\n` +
      `🧾 <b>Type:</b> ${getServiceTypeLabel(type)}\n` +
      `📛 <b>Username:</b> ${maskedUsername || '-'}\n` +
      `📆 <b>${expiryLabel}:</b> ${exp || '0'}\n` +
      `💾 <b>Quota:</b> ${quota || '0'}\n` +
      `🌐 <b>Server ID:</b> ${serverId}\n` +
      `━━━━━━━━━━━━━━━━━━━━`,
      { parse_mode: 'HTML' }
    );

    return { ok: true, msg };
  }


  function isOrkutRateLimitResponse(statusCode, data, err) {
    const msg = String(
      data?.message ||
      data?.error ||
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err?.message ||
      ''
    ).toLowerCase();
    return Number(statusCode) === 429 ||
      Number(statusCode) === 469 ||
      msg.includes('terlalu sering') ||
      msg.includes('rate limit') ||
      msg.includes('too many') ||
      msg.includes('limit');
  }

  async function activateOrkutHistoryCooldown(statusCode = 429, reason = 'rate limit') {
    const blockedUntil = Date.now() + qrisHistory429CooldownMs;
    const pendingTopupCount = Object.values(global.pendingDeposits || {}).filter(item => item && item.status === 'pending').length;
    const pendingServiceCount = Object.values(global.pendingServicePayments || {}).filter(item => item && item.status === 'pending').length;
    last429LogAt = Date.now();
    setSharedHistoryState({
      lastFetchAt: Date.now(),
      blockedUntil,
      lastStatusCode: Number(statusCode || 429)
    });
    logger.warn(
      `[QRIS] ORKUT history kena limit (${statusCode || 'unknown'}: ${reason}). Cooldown 5 menit aktif sampai ` +
      `${new Date(blockedUntil).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`
    );
    await notifyGroupAboutCooldown(blockedUntil, pendingTopupCount, pendingServiceCount);
    return blockedUntil;
  }

  async function fetchOrkutQrisHistory() {
    const now = Date.now();
    const sharedState = getSharedHistoryState();

    if (now < sharedState.blockedUntil) {
      const remainingMs = sharedState.blockedUntil - now;
      if (remainingMs > 0 && now - last429LogAt >= 30000) {
        last429LogAt = now;
        logger.warn(`[QRIS] ORKUT history masih cooldown ${Math.ceil(remainingMs / 1000)} detik lagi.`);
      }
      return null;
    }

    if (lastOrkutHistoryResults && (now - lastOrkutHistoryResultsAt) < qrisHistoryCacheMs) {
      return lastOrkutHistoryResults;
    }

    const cooldownMs = orkutHistoryErrorCount > 0
      ? qrisHistoryErrorIntervalMs * Math.min(orkutHistoryErrorCount, 3)
      : qrisHistoryIntervalMs;

    const effectiveLastFetchAt = Math.max(lastOrkutHistoryCheckAt, Number(sharedState.lastFetchAt || 0));
    if (now - effectiveLastFetchAt < cooldownMs) {
      return null;
    }

    lastOrkutHistoryCheckAt = now;
    setSharedHistoryState({ lastFetchAt: now });

    const payload = new URLSearchParams();
    payload.append('username', vars.AUTH_USERNAME_ORKUT);
    payload.append('token', vars.AUTH_TOKEN_ORKUT);
    payload.append('jenis', 'masuk');

    try {
      const res = await axios.post(
        'https://orkut.rajaserver.web.id/api/orkut/qris-history',
        payload.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json, text/plain, */*',
            'User-Agent': 'Mozilla/5.0 (compatible; BotVPN/1.0)'
          },
          timeout: 15000
        }
      );

      const data = res.data;
      if (!data?.success || !Array.isArray(data?.qris_history?.results)) {
        if (isOrkutRateLimitResponse(res.status, data)) {
          orkutHistoryErrorCount = Math.min(orkutHistoryErrorCount + 1, 5);
          await activateOrkutHistoryCooldown(res.status || 429, data?.message || 'response qris-history limit');
          return null;
        }
        throw new Error(`Response qris-history tidak valid${data?.message ? ': ' + data.message : ''}`);
      }

      orkutHistoryErrorCount = 0;
      lastOrkutHistoryResults = data.qris_history.results;
      lastOrkutHistoryResultsAt = Date.now();
      setSharedHistoryState({
        lastFetchAt: lastOrkutHistoryResultsAt,
        blockedUntil: 0,
        lastStatusCode: 200
      });
      return lastOrkutHistoryResults;
    } catch (err) {
      const statusCode = err.response?.status;
      orkutHistoryErrorCount = Math.min(orkutHistoryErrorCount + 1, 5);

      if (isOrkutRateLimitResponse(statusCode, err.response?.data, err)) {
        await activateOrkutHistoryCooldown(statusCode || 429, err.response?.data?.message || err.message || 'rate limit');
      } else {
        setSharedHistoryState({
          lastFetchAt: Date.now(),
          lastStatusCode: Number(statusCode || 0)
        });
        if (statusCode) logger.warn(`[QRIS] ORKUT history HTTP ${statusCode}, backoff ${orkutHistoryErrorCount}`);
        else logger.warn(`[QRIS] ORKUT history error: ${err.message}`);
      }

      return null;
    }
  }


  async function processMatchingPayment(deposit, matchingTransaction, uniqueCode) {
    const referenceId = getTransactionReferenceId(matchingTransaction, uniqueCode);
    const transactionKey = `${referenceId}_${deposit.originalAmount}`;

    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        db.get(
          'SELECT id FROM transactions WHERE reference_id = ? AND amount = ?',
          [referenceId, deposit.originalAmount],
          (err, row) => {
            if (err) {
              db.run('ROLLBACK');
              logger.error(`Error checking transaction: ${err.message}`);
              reject(err);
              return;
            }
            if (row) {
              db.run('ROLLBACK');
              logger.info(`Transaction ${transactionKey} already processed, skipping...`);
              resolve(false);
              return;
            }

            db.run(
              'UPDATE users SET saldo = saldo + ? WHERE user_id = ?',
              [deposit.originalAmount, deposit.userId],
              function(updateErr) {
                if (updateErr) {
                  db.run('ROLLBACK');
                  logger.error(`Error updating balance: ${updateErr.message}`);
                  reject(updateErr);
                  return;
                }

                db.run(
                  'INSERT INTO transactions (user_id, amount, type, reference_id, timestamp) VALUES (?, ?, ?, ?, ?)',
                  [deposit.userId, deposit.originalAmount, 'deposit', referenceId, Date.now()],
                  (insertErr) => {
                    if (insertErr) {
                      db.run('ROLLBACK');
                      logger.error(`Error recording transaction: ${insertErr.message}`);
                      reject(insertErr);
                      return;
                    }

                    db.get('SELECT saldo FROM users WHERE user_id = ?', [deposit.userId], async (balanceErr, user) => {
                      if (balanceErr) {
                        db.run('ROLLBACK');
                        logger.error(`Error getting updated balance: ${balanceErr.message}`);
                        reject(balanceErr);
                        return;
                      }

                      const notificationSent = await sendPaymentSuccessNotification(deposit.userId, deposit, user.saldo);
                      await tryDeleteTelegramMessage(deposit.userId, deposit.qrMessageId);

                      if (!notificationSent) {
                        db.run('ROLLBACK');
                        reject(new Error('Failed to send payment notification.'));
                        return;
                      }

                      try {
                        let userInfo;
                        try {
                          userInfo = await bot.telegram.getChat(deposit.userId);
                        } catch (_) {
                          userInfo = {};
                        }
                        const username = userInfo.username ? `@${userInfo.username}` : (userInfo.first_name || deposit.userId);
                        const userDisplay = userInfo.username ? `${username} (${deposit.userId})` : `${username}`;
                        await GROUP_SENDER(
                          `<blockquote>\n✅ <b>Top Up Berhasil</b>\n👤 User: ${userDisplay}\n💰 Nominal: <b>Rp ${deposit.originalAmount}</b>\n🏦 Saldo Sekarang: <b>Rp ${user.saldo}</b>\n🕒 Waktu: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n</blockquote>`,
                          { parse_mode: 'HTML' }
                        );
                      } catch (e) {
                        logger.error(`Gagal kirim notif top up ke grup: ${e.message}`);
                      }

                      try {
                        const receiptsDir = path.join(baseDir, 'receipts');
                        if (fs.existsSync(receiptsDir)) {
                          const files = fs.readdirSync(receiptsDir);
                          for (const file of files) {
                            fs.unlinkSync(path.join(receiptsDir, file));
                          }
                        }
                      } catch (e) {
                        logger.error(`Gagal menghapus file di receipts: ${e.message}`);
                      }

                      db.run('COMMIT');
                      global.processedTransactions.add(transactionKey);
                      delete global.pendingDeposits[uniqueCode];
                      db.run('DELETE FROM pending_deposits WHERE unique_code = ?', [uniqueCode]);
                      resolve(true);
                    });
                  }
                );
              }
            );
          }
        );
      });
    });
  }

  async function processMatchingServicePayment(servicePayment, matchingTransaction, uniqueCode) {
    const referenceId = getTransactionReferenceId(matchingTransaction, uniqueCode);
    const existing = await dbGetAsync(
      'SELECT id FROM transactions WHERE reference_id = ? AND type = ?',
      [referenceId, 'service_payment']
    ).catch(() => null);

    if (existing) {
      logger.info(`Service payment ${referenceId} sudah diproses, skip.`);
      return false;
    }

    await dbRunAsync(
      'INSERT INTO transactions (user_id, amount, type, reference_id, timestamp) VALUES (?, ?, ?, ?, ?)',
      [servicePayment.userId, servicePayment.originalAmount, 'service_payment', referenceId, Date.now()]
    );

    await tryDeleteTelegramMessage(servicePayment.userId, servicePayment.qrMessageId);

    try {
      const result = await executeServiceOrder({
        action: servicePayment.action,
        type: servicePayment.serviceType,
        serverId: servicePayment.serverId,
        username: servicePayment.username,
        password: servicePayment.password,
        exp: servicePayment.exp,
        quota: servicePayment.quota,
        iplimit: servicePayment.iplimit,
        userId: servicePayment.userId
      });

      if (!result.ok) {
        await creditUserBalance(servicePayment.userId, servicePayment.originalAmount);
        await dbRunAsync(
          'INSERT INTO transactions (user_id, amount, type, reference_id, timestamp) VALUES (?, ?, ?, ?, ?)',
          [servicePayment.userId, servicePayment.originalAmount, 'refund_service_qris', `refund-${referenceId}`, Date.now()]
        );
        await bot.telegram.sendMessage(
          servicePayment.userId,
          `⚠️ *Pembayaran QRIS sudah diterima, tetapi layanan gagal diproses.*\n` +
          `💰 Dana Rp ${servicePayment.originalAmount} sudah dikembalikan ke saldo Anda.\n\n${result.msg}`,
          { parse_mode: 'Markdown' }
        ).catch(() => {});
        return true;
      }

      await bot.telegram.sendMessage(
        servicePayment.userId,
        `✅ *Pembayaran QRIS diterima.*\n` +
        `🧾 Pesanan: *${servicePayment.action === 'create' ? 'Buat Akun' : 'Perpanjang Akun'} ${getServiceTypeLabel(servicePayment.serviceType)}*\n` +
        `💰 Nominal: *Rp ${servicePayment.originalAmount}*\n\n${result.msg}`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
      return true;
    } catch (error) {
      logger.error(`Service payment process error: ${error.message}`);
      await creditUserBalance(servicePayment.userId, servicePayment.originalAmount).catch(() => {});
      await bot.telegram.sendMessage(
        servicePayment.userId,
        `⚠️ *Pembayaran QRIS sudah diterima, tetapi terjadi kesalahan saat memproses layanan.*\n` +
        `💰 Dana Rp ${servicePayment.originalAmount} sudah dikembalikan ke saldo Anda.`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
      return true;
    }
  }

  async function handleDepositState(ctx, userId, data) {
    const reseller = await isUserReseller(userId);
    const statusReseller = reseller ? 'Reseller' : 'Bukan Reseller';
    const minDeposit = reseller ? 50000 : 1000;

    let currentAmount = global.depositState[userId]?.amount || '';

    if (data === 'delete') {
      currentAmount = currentAmount.slice(0, -1);
    } else if (data === 'send_main_menu') {
      delete global.depositState[userId];
      await ctx.answerCbQuery().catch(() => {});
      await sendMainMenu(ctx);
      return;
    } else if (data === 'confirm') {
      const amount = Number(currentAmount) || 0;
      if (amount === 0) {
        await ctx.answerCbQuery('⚠️ Jumlah tidak boleh kosong!', { show_alert: true }).catch(() => {});
        return;
      }
      if (amount < minDeposit) {
        await ctx.answerCbQuery(
          `⚠️ Jumlah minimal deposit untuk ${statusReseller} adalah Rp${minDeposit.toLocaleString()}!`,
          { show_alert: true }
        ).catch(() => {});
        return;
      }

      await processDeposit(ctx, currentAmount);
      return;
    } else {
      if (!/^\d$/.test(data)) {
        await ctx.answerCbQuery('⚠️ Input tidak valid!', { show_alert: true }).catch(() => {});
        return;
      }
      if (currentAmount.length >= 12) {
        await ctx.answerCbQuery('⚠️ Jumlah maksimal adalah 12 digit!', { show_alert: true }).catch(() => {});
        return;
      }
      currentAmount += data;
    }

    global.depositState[userId].amount = currentAmount;
    const newMessage = `💰 Silakan masukkan jumlah nominal saldo yang Anda ingin tambahkan ke akun Anda:\n\nJumlah saat ini: Rp${currentAmount || '0'}`;

    try {
      if (newMessage !== ctx.callbackQuery?.message?.text) {
        await ctx.editMessageText(newMessage, {
          reply_markup: { inline_keyboard: keyboardNomor() },
          parse_mode: 'HTML'
        });
      } else {
        await ctx.answerCbQuery().catch(() => {});
      }
    } catch (error) {
      await ctx.answerCbQuery().catch(() => {});
      logger.error(`Error editing deposit message: ${error.message}`);
    }
  }

  async function processServicePaymentRequest(ctx, order) {
    const userId = order.userId;
    const currentTime = Date.now();
    const lastRequestTime = lastDepositRequestByUser.get(userId) || 0;

    if (currentTime - lastRequestTime < depositRequestIntervalMs) {
      const waitSeconds = Math.max(1, Math.ceil((depositRequestIntervalMs - (currentTime - lastRequestTime)) / 1000));
      await ctx.answerCbQuery(`⚠️ Tunggu ${waitSeconds} detik dulu ya.`, { show_alert: true }).catch(() => {});
      return false;
    }

    const existingPending = findAnyPendingQrisByUser(userId);
    if (existingPending) {
      const cancelCallback = existingPending.kind === 'service'
        ? `batal_servicepay_${existingPending.code}`
        : `batal_topup_${existingPending.code}`;
      await ctx.answerCbQuery('⚠️ Masih ada pembayaran yang pending.', { show_alert: true }).catch(() => {});
      await ctx.reply(
        '⚠️ Selesaikan atau batalkan pembayaran QRIS yang masih pending terlebih dahulu.',
        {
          reply_markup: {
            inline_keyboard: [[{ text: '❌ Batalkan QRIS Pending', callback_data: cancelCallback }]]
          }
        }
      ).catch(() => {});
      return false;
    }

    if (!(await guardNewOrkutQrisRequest(ctx, 'QRIS pembayaran layanan'))) {
      return false;
    }

    lastDepositRequestByUser.set(userId, currentTime);

    const uniqueCode = `service-${order.action}-${order.type}-${userId}-${Date.now()}`;
    let finalAmount = Number(order.totalHarga);
    let adminFee = 0;

    try {
      let transactionId = null;
      let qrMessage = null;

      if (vars.PAYMENT === 'GOPAY') {
        const res = await axios.post(
          'https://api-gopay.sawargipay.cloud/qris/generate',
          { amount: finalAmount },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${vars.GOPAY_KEY}`
            },
            timeout: 15000
          }
        );

        if (!res.data?.success) throw new Error('Gagal create QRIS GOPAY');

        const data = res.data.data;
        transactionId = data.transaction_id;
        const qrUrl = data.qr_url;
        if (!qrUrl) throw new Error('QR URL kosong');

        const caption =
          `🧾 *Pembayaran ${order.action === 'create' ? 'Buat Akun' : 'Perpanjang Akun'}*\n\n` +
          `🧾 Tipe: *${getServiceTypeLabel(order.type)}*\n` +
          `👤 Username: \`${order.username}\`\n` +
          `🌐 Server ID: \`${order.serverId}\`\n` +
          `💰 Total: Rp ${finalAmount}\n` +
          `\n⏱️ Expired: 2 menit\n` +
          `⚠️ Transfer harus sama persis!\n\n` +
          `🔗 [Klik QRIS](${encodeURI(String(qrUrl).trim())})`;

        qrMessage = await ctx.reply(caption, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '❌ Batal', callback_data: `batal_servicepay_${uniqueCode}` }]]
          }
        });
      } else if (vars.PAYMENT === 'ORKUT') {
        const res = await axios.get(
          'https://orkut.rajaserver.web.id/api/qris',
          {
            params: {
              qris_string: vars.DATA_QRIS_ORKUT,
              amount: Number(order.totalHarga),
              format: 'json'
            },
            timeout: 15000
          }
        );

        const data = res.data;
        if (!data?.success) throw new Error('Gagal create QRIS ORKUT');

        finalAmount = Number(data.amount);
        adminFee = Number(data.random_add);
        transactionId = data.reference;
        if (!data.image_data || !data.image_data.includes('base64')) {
          throw new Error('QRIS image invalid');
        }

        const imageBuffer = Buffer.from(data.image_data.split(',')[1], 'base64');
        const caption =
          `🧾 *Pembayaran ${order.action === 'create' ? 'Buat Akun' : 'Perpanjang Akun'}*\n\n` +
          `🧾 Tipe: *${getServiceTypeLabel(order.type)}*\n` +
          `👤 Username: \`${order.username}\`\n` +
          `🌐 Server ID: \`${order.serverId}\`\n` +
          `💰 Total: Rp ${finalAmount}\n` +
          `- Harga layanan: Rp ${order.totalHarga}\n` +
          (adminFee > 0 ? `- Admin: Rp ${adminFee}\n` : '') +
          `\n⏱️ Expired: 2 menit\n` +
          `⚠️ Transfer harus sama persis!`;

        qrMessage = await ctx.replyWithPhoto(
          { source: imageBuffer },
          {
            caption,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[{ text: '❌ Batal', callback_data: `batal_servicepay_${uniqueCode}` }]]
            }
          }
        );
      } else {
        throw new Error('PAYMENT tidak valid');
      }

      global.pendingServicePayments[uniqueCode] = {
        amount: finalAmount,
        originalAmount: Number(order.totalHarga),
        userId: order.userId,
        action: order.action,
        serviceType: order.type,
        serverId: order.serverId,
        username: order.username,
        password: order.password || '',
        exp: order.exp,
        quota: order.quota,
        iplimit: order.iplimit,
        timestamp: Date.now(),
        status: 'pending',
        qrMessageId: qrMessage?.message_id,
        transactionId
      };

      await dbRunAsync(
        `INSERT INTO pending_service_payments (
          unique_code, user_id, amount, original_amount, action, service_type, server_id,
          username, password, exp, quota, iplimit, timestamp, status, qr_message_id, provider_ref
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uniqueCode,
          order.userId,
          finalAmount,
          Number(order.totalHarga),
          order.action,
          order.type,
          order.serverId,
          order.username,
          order.password || '',
          order.exp,
          order.quota,
          order.iplimit,
          Date.now(),
          'pending',
          qrMessage?.message_id,
          transactionId
        ]
      );

      delete userState[ctx.chat.id];
      try { await ctx.deleteMessage(); } catch (_) {}
      return true;
    } catch (error) {
      logger.error(`Service QRIS error: ${error.message}`);
      await ctx.reply(
        '❌ Gagal membuat QRIS pembayaran layanan, coba lagi nanti.\n⚠️ Detail: ' + error.message,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
      return false;
    }
  }

  async function processServicePaymentSelection(ctx, method) {
    const state = userState[ctx.chat.id];
    if (!state || state.step !== 'choose_payment_method') {
      await ctx.answerCbQuery('⚠️ Sesi pembayaran sudah tidak aktif.', { show_alert: true }).catch(() => {});
      return;
    }

    await ctx.answerCbQuery().catch(() => {});

    if (method === 'cancel') {
      delete userState[ctx.chat.id];
      await ctx.reply('❌ Pembayaran dibatalkan.', {
        reply_markup: { inline_keyboard: [[{ text: '🔙 Menu Utama', callback_data: 'send_main_menu' }]] }
      }).catch(() => {});
      return;
    }

    const order = {
      action: state.action,
      type: state.type,
      serverId: state.serverId,
      username: state.username,
      password: state.password,
      exp: state.exp,
      quota: state.quota,
      iplimit: state.iplimit,
      totalHarga: state.totalHarga,
      harga: state.harga,
      userId: ctx.from.id
    };

    if (method === 'saldo') {
      const debited = await debitUserBalanceSafely(order.userId, order.totalHarga);
      if (!debited) {
        await ctx.reply('❌ *Saldo Anda tidak mencukupi untuk melakukan transaksi ini.*', { parse_mode: 'Markdown' }).catch(() => {});
        return;
      }

      try {
        const result = await executeServiceOrder(order);
        if (!result.ok) {
          await creditUserBalance(order.userId, order.totalHarga);
          await ctx.reply(result.msg, { parse_mode: 'Markdown' }).catch(() => {});
          return;
        }

        delete userState[ctx.chat.id];
        await ctx.reply(result.msg, { parse_mode: 'Markdown' }).catch(() => {});
        return;
      } catch (error) {
        await creditUserBalance(order.userId, order.totalHarga).catch(() => {});
        logger.error(`Saldo service error: ${error.message}`);
        await ctx.reply('❌ *Terjadi kesalahan saat memproses layanan berbayar saldo.*', { parse_mode: 'Markdown' }).catch(() => {});
        return;
      }
    }

    if (method === 'qris') {
      await processServicePaymentRequest(ctx, order);
    }
  }

  async function cancelServicePayment(ctx, code) {
    if (!code) {
      await ctx.answerCbQuery('Kode tidak valid').catch(() => {});
      return;
    }

    const paymentData = global.pendingServicePayments?.[code];
    await ctx.answerCbQuery('Pembayaran layanan dibatalkan').catch(() => {});

    const chatId = paymentData?.userId || ctx.chat?.id || ctx.from?.id;
    await tryDeleteTelegramMessage(chatId, paymentData?.qrMessageId);

    try {
      await dbRunAsync('DELETE FROM pending_service_payments WHERE unique_code = ?', [code]);
    } catch (error) {
      logger.error(`Gagal delete pending_service_payments: ${error.message}`);
    }

    if (global.pendingServicePayments?.[code]) delete global.pendingServicePayments[code];

    const kb = { inline_keyboard: [[{ text: '🔙 Menu Utama', callback_data: 'send_main_menu' }]] };
    try {
      await ctx.editMessageText('❌ Pembayaran layanan dibatalkan.', { reply_markup: kb });
    } catch (_) {
      await ctx.reply('❌ Pembayaran layanan dibatalkan.', { reply_markup: kb }).catch(() => {});
    }
  }

  async function processDeposit(ctx, amount) {
    const userId = ctx.from.id;
    const currentTime = Date.now();
    const lastRequestTime = lastDepositRequestByUser.get(userId) || 0;

    if (currentTime - lastRequestTime < depositRequestIntervalMs) {
      const waitSeconds = Math.max(1, Math.ceil((depositRequestIntervalMs - (currentTime - lastRequestTime)) / 1000));
      await ctx.answerCbQuery(`⚠️ Tunggu ${waitSeconds} detik dulu ya.`, { show_alert: true }).catch(() => {});
      return;
    }

    const existingPending = findAnyPendingQrisByUser(userId);
    if (existingPending) {
      const cancelCallback = existingPending.kind === 'service'
        ? `batal_servicepay_${existingPending.code}`
        : `batal_topup_${existingPending.code}`;
      await ctx.answerCbQuery('⚠️ Anda masih punya pembayaran QRIS yang pending.', { show_alert: true }).catch(() => {});
      await ctx.reply(
        '⚠️ Selesaikan atau batalkan pembayaran QRIS yang masih pending terlebih dahulu.',
        {
          reply_markup: {
            inline_keyboard: [[{ text: '❌ Batalkan QRIS Pending', callback_data: cancelCallback }]]
          }
        }
      ).catch(() => {});
      return;
    }

    if (!(await guardNewOrkutQrisRequest(ctx, 'QRIS top up'))) {
      return;
    }

    lastDepositRequestByUser.set(userId, currentTime);

    const uniqueCode = `user-${userId}-${Date.now()}`;
    let finalAmount = Number(amount);
    let adminFee = 0;

    try {
      let transactionId = null;
      let qrMessage = null;

      if (vars.PAYMENT === 'GOPAY') {
        const res = await axios.post(
          'https://api-gopay.sawargipay.cloud/qris/generate',
          { amount: finalAmount },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${vars.GOPAY_KEY}`
            },
            timeout: 15000
          }
        );

        if (!res.data?.success) throw new Error('Gagal create QRIS GOPAY');

        const data = res.data.data;
        transactionId = data.transaction_id;
        const qrUrl = data.qr_url;
        if (!qrUrl) throw new Error('QR URL kosong');

        const caption =
          `📝 *Detail Pembayaran*\n\n` +
          `💰 Total: Rp ${finalAmount}\n` +
          `- Topup: Rp ${amount}\n` +
          `\n⏱️ Expired: 2 menit\n` +
          `⚠️ Transfer harus sama persis!\n\n` +
          `🔗 [Klik QRIS](${encodeURI(String(qrUrl).trim())})\n`;

        qrMessage = await ctx.reply(caption, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '❌ Batal', callback_data: `batal_topup_${uniqueCode}` }]]
          }
        });
      } else if (vars.PAYMENT === 'ORKUT') {
        const res = await axios.get(
          'https://orkut.rajaserver.web.id/api/qris',
          {
            params: {
              qris_string: vars.DATA_QRIS_ORKUT,
              amount: Number(amount),
              format: 'json'
            },
            timeout: 15000
          }
        );

        const data = res.data;
        if (!data?.success) throw new Error('Gagal create QRIS ORKUT');

        finalAmount = Number(data.amount);
        adminFee = Number(data.random_add);
        transactionId = data.reference;
        if (!data.image_data || !data.image_data.includes('base64')) {
          throw new Error('QRIS image invalid');
        }

        const imageBuffer = Buffer.from(data.image_data.split(',')[1], 'base64');
        const caption =
          `📝 *Detail Pembayaran*\n\n` +
          `💰 Total: Rp ${finalAmount}\n` +
          `- Topup: Rp ${amount}\n` +
          (adminFee > 0 ? `- Admin: Rp ${adminFee}\n` : '') +
          `\n⏱️ Expired: 2 menit\n` +
          `⚠️ Transfer harus sama persis!\n`;

        qrMessage = await ctx.replyWithPhoto(
          { source: imageBuffer },
          {
            caption,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[{ text: '❌ Batal', callback_data: `batal_topup_${uniqueCode}` }]]
            }
          }
        );
      } else {
        throw new Error('PAYMENT tidak valid');
      }

      global.pendingDeposits[uniqueCode] = {
        amount: finalAmount,
        originalAmount: Number(amount),
        userId,
        timestamp: Date.now(),
        status: 'pending',
        qrMessageId: qrMessage?.message_id,
        transactionId
      };

      db.run(
        `INSERT INTO pending_deposits
        (unique_code, user_id, amount, original_amount, timestamp, status, qr_message_id, transaction_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uniqueCode, userId, finalAmount, Number(amount), Date.now(), 'pending', qrMessage?.message_id, transactionId]
      );

      if (global.depositState?.[userId]) delete global.depositState[userId];
      try { await ctx.deleteMessage(); } catch (_) {}
    } catch (error) {
      logger.error(`Deposit error: ${error.message}`);
      if (global.depositState?.[userId]) {
        global.depositState[userId].action = 'request_amount';
        global.depositState[userId].amount = String(amount || '');
      }
      await ctx.reply(
        '❌ Gagal membuat QRIS, coba lagi nanti.\n⚠️ Detail: ' + error.message,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    }
  }

  async function checkQRISStatus() {
    if (qrisStatusCheckRunning) return;
    const hasPendingDeposits = Object.keys(global.pendingDeposits || {}).length > 0;
    const hasPendingServicePayments = Object.keys(global.pendingServicePayments || {}).length > 0;
    if (!hasPendingDeposits && !hasPendingServicePayments) return;

    qrisStatusCheckRunning = true;

    try {
      const now = Date.now();
      const pendingEntries = Object.entries(global.pendingDeposits || {}).filter(([, deposit]) => deposit?.status === 'pending');
      const pendingServiceEntries = Object.entries(global.pendingServicePayments || {}).filter(([, payment]) => payment?.status === 'pending');
      if (!pendingEntries.length && !pendingServiceEntries.length) return;

      let orkutHistoryResults = null;
      const usedHistoryKeys = new Set();
      let cooldownInfo = { isActive: false, blockedUntil: 0, remainingMs: 0 };

      if (vars.PAYMENT === 'ORKUT') {
        orkutHistoryResults = await fetchOrkutQrisHistory();

        cooldownInfo = getActiveHistoryCooldownInfo();
        if (cooldownInfo.isActive) {
          await notifyPendingUsersAboutCooldown(pendingEntries, pendingServiceEntries, cooldownInfo.blockedUntil);
        }

        if (!Array.isArray(orkutHistoryResults) || !orkutHistoryResults.length) {
          return;
        }
      }

      for (const [uniqueCode, deposit] of pendingEntries) {
        try {
          const maxAge = 2 * 60 * 1000;

          if (vars.PAYMENT === 'GOPAY') {
            if (now - deposit.timestamp > maxAge) {
              logger.warn(`EXPIRED ${uniqueCode}`);
              await tryDeleteTelegramMessage(deposit.userId, deposit.qrMessageId);
              await bot.telegram.sendMessage(
                deposit.userId,
                '⌛ QRIS topup sudah expired. Silakan buat topup baru.',
                { parse_mode: 'Markdown' }
              ).catch(() => {});
              delete global.pendingDeposits[uniqueCode];
              db.run('DELETE FROM pending_deposits WHERE unique_code = ?', [uniqueCode]);
              continue;
            }

            const res = await axios.post(
              'https://api-gopay.sawargipay.cloud/qris/status',
              { transaction_id: deposit.transactionId },
              {
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${vars.GOPAY_KEY}`
                },
                timeout: 15000
              }
            );

            const data = res.data?.data;
            if (!data) continue;
            if (data.transaction_status !== 'settlement') continue;

            const success = await processMatchingPayment(deposit, data, uniqueCode);
            if (success) {
              delete global.pendingDeposits[uniqueCode];
              db.run('DELETE FROM pending_deposits WHERE unique_code = ?', [uniqueCode]);
            }
            continue;
          }

          const targetAmount = normalizeMoney(deposit.amount);
          const match = orkutHistoryResults.find(tx => {
            const kredit = normalizeMoney(tx.kredit ?? tx.amount ?? tx.nominal);
            const status = String(tx.status || '').trim().toUpperCase();
            const txKey = buildHistoryMatchKey(tx);
            if (usedHistoryKeys.has(txKey)) return false;
            return kredit === targetAmount && ['IN', 'SUCCESS', 'PAID'].includes(status);
          });

          if (match) {
            usedHistoryKeys.add(buildHistoryMatchKey(match));
            const success = await processMatchingPayment(deposit, match, uniqueCode);
            if (success) {
              logger.info(`[QRIS] SUCCESS ${uniqueCode}`);
              delete global.pendingDeposits[uniqueCode];
              db.run('DELETE FROM pending_deposits WHERE unique_code = ?', [uniqueCode]);
            }
            continue;
          }

          if (cooldownInfo.isActive) {
            logger.info(`[QRIS] Pending ${uniqueCode} dipertahankan karena history masih cooldown.`);
            continue;
          }

          if (now - deposit.timestamp > maxAge) {
            logger.warn(`EXPIRED ${uniqueCode}`);
            await tryDeleteTelegramMessage(deposit.userId, deposit.qrMessageId);
            await bot.telegram.sendMessage(
              deposit.userId,
              '⌛ QRIS topup sudah expired. Silakan buat topup baru.',
              { parse_mode: 'Markdown' }
            ).catch(() => {});
            delete global.pendingDeposits[uniqueCode];
            db.run('DELETE FROM pending_deposits WHERE unique_code = ?', [uniqueCode]);
            continue;
          }

          logNoMatch(uniqueCode, `[QRIS] Belum match ${uniqueCode}`);
        } catch (error) {
          logger.error(`[QRIS] ERROR ${uniqueCode}: ${error.message}`);
        }
      }

      for (const [uniqueCode, servicePayment] of pendingServiceEntries) {
        try {
          const maxAge = 2 * 60 * 1000;

          if (vars.PAYMENT === 'GOPAY') {
            if (now - servicePayment.timestamp > maxAge) {
              logger.warn(`SERVICE PAYMENT EXPIRED ${uniqueCode}`);
              await tryDeleteTelegramMessage(servicePayment.userId, servicePayment.qrMessageId);
              await bot.telegram.sendMessage(
                servicePayment.userId,
                '⌛ QRIS pembayaran layanan sudah expired. Silakan buat pesanan baru.',
                { parse_mode: 'Markdown' }
              ).catch(() => {});
              delete global.pendingServicePayments[uniqueCode];
              db.run('DELETE FROM pending_service_payments WHERE unique_code = ?', [uniqueCode]);
              continue;
            }

            const res = await axios.post(
              'https://api-gopay.sawargipay.cloud/qris/status',
              { transaction_id: servicePayment.transactionId },
              {
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${vars.GOPAY_KEY}`
                },
                timeout: 15000
              }
            );

            const data = res.data?.data;
            if (!data || data.transaction_status !== 'settlement') continue;

            const success = await processMatchingServicePayment(servicePayment, data, uniqueCode);
            if (success) {
              delete global.pendingServicePayments[uniqueCode];
              db.run('DELETE FROM pending_service_payments WHERE unique_code = ?', [uniqueCode]);
            }
            continue;
          }

          const targetAmount = normalizeMoney(servicePayment.amount);
          const match = orkutHistoryResults.find(tx => {
            const kredit = normalizeMoney(tx.kredit ?? tx.amount ?? tx.nominal);
            const status = String(tx.status || '').trim().toUpperCase();
            const txKey = buildHistoryMatchKey(tx);
            if (usedHistoryKeys.has(txKey)) return false;
            return kredit === targetAmount && ['IN', 'SUCCESS', 'PAID'].includes(status);
          });

          if (match) {
            usedHistoryKeys.add(buildHistoryMatchKey(match));
            const success = await processMatchingServicePayment(servicePayment, match, uniqueCode);
            if (success) {
              delete global.pendingServicePayments[uniqueCode];
              db.run('DELETE FROM pending_service_payments WHERE unique_code = ?', [uniqueCode]);
            }
            continue;
          }

          if (cooldownInfo.isActive) {
            logger.info(`[QRIS] Pending service ${uniqueCode} dipertahankan karena history masih cooldown.`);
            continue;
          }

          if (now - servicePayment.timestamp > maxAge) {
            logger.warn(`SERVICE PAYMENT EXPIRED ${uniqueCode}`);
            await tryDeleteTelegramMessage(servicePayment.userId, servicePayment.qrMessageId);
            await bot.telegram.sendMessage(
              servicePayment.userId,
              '⌛ QRIS pembayaran layanan sudah expired. Silakan buat pesanan baru.',
              { parse_mode: 'Markdown' }
            ).catch(() => {});
            delete global.pendingServicePayments[uniqueCode];
            db.run('DELETE FROM pending_service_payments WHERE unique_code = ?', [uniqueCode]);
            continue;
          }

          logNoMatch(uniqueCode, `[QRIS] Belum match service ${uniqueCode}`);
        } catch (error) {
          logger.error(`[QRIS] SERVICE ERROR ${uniqueCode}: ${error.message}`);
        }
      }
    } finally {
      qrisStatusCheckRunning = false;
    }
  }

  function loadPendingRows() {
    db.all('SELECT * FROM pending_deposits WHERE status = "pending"', [], (err, rows) => {
      if (err) {
        logger.error(`Gagal load pending_deposits: ${err.message}`);
        return;
      }
      rows.forEach(row => {
        global.pendingDeposits[row.unique_code] = {
          amount: row.amount,
          originalAmount: row.original_amount,
          userId: row.user_id,
          timestamp: row.timestamp,
          status: row.status,
          qrMessageId: row.qr_message_id,
          transactionId: row.transaction_id
        };
      });
      logger.info(`Pending deposit loaded: ${Object.keys(global.pendingDeposits).length}`);
    });

    db.all('SELECT * FROM pending_service_payments WHERE status = "pending"', [], (err, rows) => {
      if (err) {
        logger.error(`Gagal load pending_service_payments: ${err.message}`);
        return;
      }
      rows.forEach(row => {
        global.pendingServicePayments[row.unique_code] = {
          amount: row.amount,
          originalAmount: row.original_amount,
          userId: row.user_id,
          action: row.action,
          serviceType: row.service_type,
          serverId: row.server_id,
          username: row.username,
          password: row.password,
          exp: row.exp,
          quota: row.quota,
          iplimit: row.iplimit,
          timestamp: row.timestamp,
          status: row.status,
          qrMessageId: row.qr_message_id,
          transactionId: row.provider_ref
        };
      });
      logger.info(`Pending service payment loaded: ${Object.keys(global.pendingServicePayments).length}`);
    });
  }

  function init() {
    ensurePaymentTables(() => {
      loadPendingRows();
      if (!intervalHandle) {
        intervalHandle = setInterval(checkQRISStatus, qrisLoopIntervalMs);
      }
    });
  }

  return {
    init,
    handleDepositState,
    processDeposit,
    processServicePaymentSelection,
    cancelServicePayment,
    checkQRISStatus,
    findAnyPendingQrisByUser
  };
}

module.exports = {
  createPaymentEngine
};
