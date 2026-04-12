// FINAL QRIS FIX (FOLLOW REF LOGIC)

const fs = require('fs');
const axios = require('axios');

const vars = JSON.parse(fs.readFileSync('./.vars.json', 'utf8'));

const AUTH_USER = vars.AUTH_USERNAME_ORKUT;
const AUTH_TOKEN = vars.AUTH_TOKEN_ORKUT;

// === CHECKER QRIS (SAMA PERSIS LOGIKA REF) ===
async function checkQRIS(deposits) {
  for (const deposit of deposits) {
    try {
      const params = new URLSearchParams();
      params.append('username', AUTH_USER);
      params.append('token', AUTH_TOKEN);
      params.append('jenis', 'masuk');

      const res = await axios.post(
        'https://orkut.rajaserver.web.id/api/orkut/qris-history',
        params,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': '*/*'
          },
          timeout: 15000
        }
      );

      const data = res.data;

      // IKUT REFERENSI: kalau tidak valid → cuma log
      if (!data?.success || !data.qris_history?.results) {
        console.log("[QRIS] Response tidak valid");
        continue;
      }

      const list = data.qris_history.results;

      const normalize = v => Number(String(v || '').replace(/[^\d]/g, '')) || 0;
      const targetAmount = normalize(deposit.amount);

      const match = list.find(tx => {
        const kredit = normalize(tx.kredit);
        const status = String(tx.status || '').toUpperCase();
        return kredit === targetAmount && status === 'IN';
      });

      if (!match) {
        console.log("[QRIS] Belum match");
        continue;
      }

      console.log("[QRIS] MATCH");

      if (deposit.purpose === "deposit") {
        console.log("TOPUP SUCCESS");
      } else if (deposit.purpose === "order") {
        console.log("PROCESS ORDER");
      }

    } catch (err) {
      console.log("[QRIS] ERROR:", err.message);
    }
  }
}

module.exports = { checkQRIS };
