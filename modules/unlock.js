const axios = require('axios');
const { exec } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./sellvpn.db');

async function unlockssh(username, password, exp, iplimit, serverId) {
  console.log(`Unlock SSH account for ${username} with expiry ${exp} days, IP limit ${iplimit}, and password ${password}`);

  // Validasi username
if (!/^[a-z0-9-]+$/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }

  return new Promise((resolve) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err || !server) {
        console.error('❌ Error fetching server:', err?.message || 'server null');
        return resolve('❌ Server tidak ditemukan. Silakan coba lagi.');
      }

      const domain = server.domain;
      const param = `/vps/unlocksshvpn`;
      const web_URL = `http://${domain}${param}`; // Contoh: http://domainmu.com/vps/sshvpn
      const AUTH_TOKEN = server.auth;

      const curlCommand = `curl -sS --connect-timeout 1 --max-time 30 --fail -X PATCH "${web_URL}/${username}/pw" \
-H "Authorization: ${AUTH_TOKEN}" \
-H "accept: application/json"`;

      exec(curlCommand, (err, stdout, stderr) => {
  // 1) Curl error / exit code error
  if (err) {
    console.error("❌ Curl error:", err.message);
    if (stderr) console.error("🪵 stderr:", stderr);
    return resolve("❌ Gagal menghubungi server (curl error).");
  }

  // 2) Output kosong / whitespace
  const out = (stdout || "").trim();
  if (!out) {
    console.error("❌ Output kosong dari server.");
    if (stderr) console.error("🪵 stderr:", stderr);
    return resolve("❌ Respon server kosong / tidak valid.");
  }

  // 3) Cepat deteksi bukan JSON (opsional tapi bagus)
  if (!(out.startsWith("{") || out.startsWith("["))) {
    console.error("❌ Respon bukan JSON. Sample:", out.slice(0, 200));
    return resolve("❌ Format respon dari server tidak valid (bukan JSON).");
  }

  // 4) Parse JSON
  let d;
  try {
    d = JSON.parse(out);
  } catch (e) {
    console.error("❌ Gagal parsing JSON:", e.message);
    console.error("🪵 Output:", out.slice(0, 500));
    return resolve("❌ Format respon dari server tidak valid (JSON rusak).");
  }

  // 5) Validasi minimal schema
  if (!d || typeof d !== "object") {
    console.error("❌ JSON bukan object:", d);
    return resolve("❌ Respon server tidak valid.");
  }

  // 6) Error dari backend
  if (d?.meta?.code !== 200 || !d?.data) {
    console.error("❌ Respons error:", d);
    const errMsg =
      d?.message ||
      d?.meta?.message ||
      (typeof d === "string" ? d : JSON.stringify(d));
    return resolve(`❌ Respons error:\n${errMsg}`);
  }

  // 7) Sukses, baru lanjut
  const s = d.data;
        console.log("⚠️ FULL DATA:", JSON.stringify(d, null, 2));
        const msg = `✅ *Unlock SSH Account Success!*

🔄 *Akun berhasil dibuka*
────────────────────────────
👤 *Username*     : \`${s.username}\`
────────────────────────────

✨ Terima kasih telah memperpanjang layanan kami!
*© Telegram Bots - 2025*`;

        return resolve(msg);
      });
    });
  });
}
async function unlockvmess(username, exp, quota, limitip, serverId) {
  console.log(`Unlock VMess account for ${username} with expiry ${exp} days, quota ${quota} GB, limit IP ${limitip}`);

  // Validasi username
if (!/^[a-z0-9-]+$/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }

  return new Promise((resolve) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err || !server) {
        console.error('❌ Error fetching server:', err?.message || 'server null');
        return resolve('❌ Server tidak ditemukan. Silakan coba lagi.');
      }

      const domain = server.domain;
      const param = `/vps/unlockvmess`;
      const web_URL = `http://${domain}${param}`; // contoh: http://domain.com/vps/vmess
      const AUTH_TOKEN = server.auth;

      const curlCommand = `curl -sS --connect-timeout 1 --max-time 30 --fail -X PATCH "${web_URL}/${username}" \
-H "Authorization: ${AUTH_TOKEN}" \
-H "accept: application/json"`;

      exec(curlCommand, (err, stdout, stderr) => {
  // 1) Curl error / exit code error
  if (err) {
    console.error("❌ Curl error:", err.message);
    if (stderr) console.error("🪵 stderr:", stderr);
    return resolve("❌ Gagal menghubungi server (curl error).");
  }

  // 2) Output kosong / whitespace
  const out = (stdout || "").trim();
  if (!out) {
    console.error("❌ Output kosong dari server.");
    if (stderr) console.error("🪵 stderr:", stderr);
    return resolve("❌ Respon server kosong / tidak valid.");
  }

  // 3) Cepat deteksi bukan JSON (opsional tapi bagus)
  if (!(out.startsWith("{") || out.startsWith("["))) {
    console.error("❌ Respon bukan JSON. Sample:", out.slice(0, 200));
    return resolve("❌ Format respon dari server tidak valid (bukan JSON).");
  }

  // 4) Parse JSON
  let d;
  try {
    d = JSON.parse(out);
  } catch (e) {
    console.error("❌ Gagal parsing JSON:", e.message);
    console.error("🪵 Output:", out.slice(0, 500));
    return resolve("❌ Format respon dari server tidak valid (JSON rusak).");
  }

  // 5) Validasi minimal schema
  if (!d || typeof d !== "object") {
    console.error("❌ JSON bukan object:", d);
    return resolve("❌ Respon server tidak valid.");
  }

  // 6) Error dari backend
  if (d?.meta?.code !== 200 || !d?.data) {
    console.error("❌ Respons error:", d);
    const errMsg =
      d?.message ||
      d?.meta?.message ||
      (typeof d === "string" ? d : JSON.stringify(d));
    return resolve(`❌ Respons error:\n${errMsg}`);
  }

  // 7) Sukses, baru lanjut
  const s = d.data;
        console.log("⚠️ FULL DATA:", JSON.stringify(d, null, 2));
        const msg = `✅ *Unlock VMess Account Success!*

🔄 *Akun berhasil dibuka*
────────────────────────────
👤 *Username*    : \`${s.username}\`
────────────────────────────

✨ Terima kasih telah memperpanjang layanan kami!
*© Telegram Bots - 2025*`;

        return resolve(msg);
      });
    });
  });
}
async function unlockvless(username, exp, quota, limitip, serverId) {
  console.log(`Unlock VLESS account for ${username} with expiry ${exp} days, quota ${quota} GB, limit IP ${limitip}`);

  // Validasi username
if (!/^[a-z0-9-]+$/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }

  return new Promise((resolve) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err || !server) {
        console.error('❌ Error fetching server:', err?.message || 'server null');
        return resolve('❌ Server tidak ditemukan. Silakan coba lagi.');
      }

      const domain = server.domain;
      const param = `/vps/unlockvless`;
      const web_URL = `http://${domain}${param}`;        // Contoh: http://domain.com/vps/vless
      const AUTH_TOKEN = server.auth;

      const curlCommand = `curl -sS --connect-timeout 1 --max-time 30 --fail -X PATCH "${web_URL}/${username}" \
-H "Authorization: ${AUTH_TOKEN}" \
-H "accept: application/json"`;

      exec(curlCommand, (err, stdout, stderr) => {
  // 1) Curl error / exit code error
  if (err) {
    console.error("❌ Curl error:", err.message);
    if (stderr) console.error("🪵 stderr:", stderr);
    return resolve("❌ Gagal menghubungi server (curl error).");
  }

  // 2) Output kosong / whitespace
  const out = (stdout || "").trim();
  if (!out) {
    console.error("❌ Output kosong dari server.");
    if (stderr) console.error("🪵 stderr:", stderr);
    return resolve("❌ Respon server kosong / tidak valid.");
  }

  // 3) Cepat deteksi bukan JSON (opsional tapi bagus)
  if (!(out.startsWith("{") || out.startsWith("["))) {
    console.error("❌ Respon bukan JSON. Sample:", out.slice(0, 200));
    return resolve("❌ Format respon dari server tidak valid (bukan JSON).");
  }

  // 4) Parse JSON
  let d;
  try {
    d = JSON.parse(out);
  } catch (e) {
    console.error("❌ Gagal parsing JSON:", e.message);
    console.error("🪵 Output:", out.slice(0, 500));
    return resolve("❌ Format respon dari server tidak valid (JSON rusak).");
  }

  // 5) Validasi minimal schema
  if (!d || typeof d !== "object") {
    console.error("❌ JSON bukan object:", d);
    return resolve("❌ Respon server tidak valid.");
  }

  // 6) Error dari backend
  if (d?.meta?.code !== 200 || !d?.data) {
    console.error("❌ Respons error:", d);
    const errMsg =
      d?.message ||
      d?.meta?.message ||
      (typeof d === "string" ? d : JSON.stringify(d));
    return resolve(`❌ Respons error:\n${errMsg}`);
  }

  // 7) Sukses, baru lanjut
  const s = d.data;
        console.log("⚠️ FULL DATA:", JSON.stringify(d, null, 2));
        const msg = `✅ *Unlock VLESS Account Success!*

🔄 *Akun berhasil dibuka*
────────────────────────────
👤 *Username*    : \`${s.username}\`
────────────────────────────

✨ Terima kasih telah memperpanjang layanan kami!
*© Telegram Bots - 2025*`;

        return resolve(msg);
      });
    });
  });
}
async function unlocktrojan(username, exp, quota, limitip, serverId) {
  console.log(`Unlock TROJAN account for ${username} with expiry ${exp} days, quota ${quota} GB, limit IP ${limitip}`);

  // Validasi username
if (!/^[a-z0-9-]+$/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }

  return new Promise((resolve) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err || !server) {
        console.error('❌ Error fetching server:', err?.message || 'server null');
        return resolve('❌ Server tidak ditemukan. Silakan coba lagi.');
      }

      const domain = server.domain;
      const param = `/vps/unlocktrojan`;
      const web_URL = `http://${domain}${param}`;         // Contoh: http://domain.com/vps/trojan
      const AUTH_TOKEN = server.auth;

      const curlCommand = `curl -sS --connect-timeout 1 --max-time 30 --fail -X PATCH "${web_URL}/${username}" \
-H "Authorization: ${AUTH_TOKEN}" \
-H "accept: application/json"`;

      exec(curlCommand, (err, stdout, stderr) => {
  // 1) Curl error / exit code error
  if (err) {
    console.error("❌ Curl error:", err.message);
    if (stderr) console.error("🪵 stderr:", stderr);
    return resolve("❌ Gagal menghubungi server (curl error).");
  }

  // 2) Output kosong / whitespace
  const out = (stdout || "").trim();
  if (!out) {
    console.error("❌ Output kosong dari server.");
    if (stderr) console.error("🪵 stderr:", stderr);
    return resolve("❌ Respon server kosong / tidak valid.");
  }

  // 3) Cepat deteksi bukan JSON (opsional tapi bagus)
  if (!(out.startsWith("{") || out.startsWith("["))) {
    console.error("❌ Respon bukan JSON. Sample:", out.slice(0, 200));
    return resolve("❌ Format respon dari server tidak valid (bukan JSON).");
  }

  // 4) Parse JSON
  let d;
  try {
    d = JSON.parse(out);
  } catch (e) {
    console.error("❌ Gagal parsing JSON:", e.message);
    console.error("🪵 Output:", out.slice(0, 500));
    return resolve("❌ Format respon dari server tidak valid (JSON rusak).");
  }

  // 5) Validasi minimal schema
  if (!d || typeof d !== "object") {
    console.error("❌ JSON bukan object:", d);
    return resolve("❌ Respon server tidak valid.");
  }

  // 6) Error dari backend
  if (d?.meta?.code !== 200 || !d?.data) {
    console.error("❌ Respons error:", d);
    const errMsg =
      d?.message ||
      d?.meta?.message ||
      (typeof d === "string" ? d : JSON.stringify(d));
    return resolve(`❌ Respons error:\n${errMsg}`);
  }

  // 7) Sukses, baru lanjut
  const s = d.data;
        console.log("⚠️ FULL DATA:", JSON.stringify(d, null, 2));
        const msg = `✅ *Unlock TROJAN Account Success!*

🔄 *Akun berhasil dibuka*
────────────────────────────
👤 *Username*    : \`${s.username}\`
────────────────────────────

✨ Terima kasih telah memperpanjang layanan kami!
*© Telegram Bots - 2025*`;

        return resolve(msg);
      });
    });
  });
}
//create shadowsocks ga ada di potato
  async function unlockshadowsocks(username, exp, quota, limitip, serverId) {
    console.log(`Unlock Shadowsocks account for ${username} with expiry ${exp} days, quota ${quota} GB, limit IP ${limitip} on server ${serverId}`);
    
    // Validasi username
  if (!/^[a-z0-9-]+$/.test(username)) {
      return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
    }
  
    // Ambil domain dari database
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
        if (err) {
          console.error('Error fetching server:', err.message);
          return resolve('❌ Server tidak ditemukan. Silakan coba lagi.');
        }
  
        if (!server) return resolve('❌ Server tidak ditemukan. Silakan coba lagi.');
  
        const domain = server.domain;
        const auth = server.auth;
        const param = `:5888/renewshadowsocks?user=${username}&exp=${exp}&quota=${quota}&iplimit=${limitip}&auth=${auth}`;
        const url = `http://${domain}${param}`;
        axios.get(url)
          .then(response => {
            if (response.data.status === "success") {
              const shadowsocksData = response.data.data;
              const msg = `
  🌟 *RENEW SHADOWSOCKS PREMIUM* 🌟
  
  🔹 *Informasi Akun*
  ┌─────────────────────────────
  │ Username: \`${username}\`
  │ Kadaluarsa: \`${vmessData.exp}\`
  │ Kuota: \`${vmessData.quota}\`
  │ Batas IP: \`${shadowsocksData.limitip} IP\`
  └─────────────────────────────
  ✅ Akun ${username} berhasil diperbarui
  ✨ Selamat menggunakan layanan kami! ✨
  `;
           
                console.log('Shadowsocks account renewed successfully');
                return resolve(msg);
              } else {
                console.log('Error renewing Shadowsocks account');
                return resolve(`❌ Terjadi kesalahan: ${response.data.message}`);
              }
            })
          .catch(error => {
            console.error('Error saat memperbarui Shadowsocks:', error);
            return resolve('❌ Terjadi kesalahan saat memperbarui Shadowsocks. Silakan coba lagi nanti.');
          });
      });
    });
  }
  
  module.exports = { unlockshadowsocks, unlocktrojan, unlockvless, unlockvmess, unlockssh };
