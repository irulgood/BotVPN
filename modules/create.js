const axios = require('axios');
const { exec } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./sellvpn.db');
async function createssh(username, password, exp, iplimit, serverId) {
  console.log(`Creating SSH account for ${username} with expiry ${exp} days, IP limit ${iplimit}, and password ${password}`);

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
      const param = `/vps/sshvpn`;
      const web_URL = `http://${domain}${param}`; // misalnya: http://idnusastb.domain.web.id/vps/sshvpn
      const AUTH_TOKEN = server.auth;
      const days = exp;
      const KUOTA = "0"; // jika perlu di-hardcode, bisa diubah jadi parameter juga
      const LIMIT_IP = iplimit;

      const curlCommand = `curl -sS --connect-timeout 1 --max-time 30 -X POST "${web_URL}" \
-H "Authorization: ${AUTH_TOKEN}" \
-H "Content-Type: application/json" \
-H "Accept: application/json" \
-d '{"expired":${days},"kuota":"${KUOTA}","limitip":"${LIMIT_IP}","password":"${password}","username":"${username}"}'`;

      exec(curlCommand, (err, stdout, stderr) => {
  // 1) Curl error / exit code error
  if (err) {
    console.error("❌ Curl error:", err.message);
    if (stderr) console.error("🪵 stderr:", stderr);
    return resolve("❌ Respon Server Error:", stderr);
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
// ======= MULAI LOGIKA UPDATE total_create_akun =======
if (exp >= 1 && exp <= 135) {
  db.run(
    'UPDATE Server SET total_create_akun = total_create_akun + 1 WHERE id = ?',
    [serverId],
    (err) => {
      if (err) {
        console.error('⚠️ Gagal update total_create_akun:', err.message);
      } else {
        console.log(`✅ total_create_akun diperbarui untuk serverId ${serverId} dengan exp ${exp}`);
      }
    }
  );
} else {
  console.log(`⚠️ Exp ${exp} hari tidak dicatat (kurang dari 30 atau lebih dari 135)`);
}
// ======= SELESAI LOGIKA UPDATE =======

        const msg = `✅ *SSH Account Created Successfully!*

*🔐 SSH Premium Details*
────────────────────────
📡 *SSH WS*    : \`${s.hostname}:80@${s.username}:${s.password}\`
🔒 *SSH SSL*   : \`${s.hostname}:443@${s.username}:${s.password}\`
📶 *SSH UDP*   : \`${s.hostname}:1-65535@${s.username}:${s.password}\`
🌐 *SSH SLOWDNS* : \`ns-${s.hostname}:5300@${s.username}:${s.password}\`
────────────────────────
🌍 *Host*         : \`${s.hostname}\`
🏢 *ISP*          : \`${s.ISP}\`
🏙️ *City*         : \`${s.CITY}\`
👤 *Username*     : \`${s.username}\`
🔑 *Password*     : \`${s.password}\`
🗝️ *Public Key*   : \`${s.pubkey ? s.pubkey : "-"}\`
📅 *Expiry Date*  : \`${s.exp}\`
⏰ *Expiry Time*  : \`${s.time}\`
📌 *IP Limit*     : \`${LIMIT_IP}\`
────────────────────────
🛠 *Ports*:
• TLS         : \`${s.port.tls}\`
• Non-TLS     : \`${s.port.none}\`
• OVPN TCP    : \`${s.port.ovpntcp}\`
• OVPN UDP    : \`${s.port.ovpnudp}\`
• SSH OHP     : \`${s.port.sshohp}\`
• UDP Custom  : \`${s.port.udpcustom}\`
────────────────────────
🧩 *Payload WS*:
\`\`\`
GET / HTTP/1.1
Host: ${s.hostname}
Connection: Upgrade
User-Agent: [ua]
Upgrade: websocket
\`\`\`

🧩 *Payload Enhanced*:
\`\`\`
PATCH / HTTP/1.1
Host: ${s.hostname}
Host: bug.com
Connection: Upgrade
User-Agent: [ua]
Upgrade: websocket
\`\`\`

📥 *Download All Config UNLOCK SSH*:
🔗 https://drive.google.com/drive/folders/1Yfg-r6c4RRAjcJX613G8w7I\\_UbTXlcS9

📘 *TUTORIAL GANTI SSH*
📂 Google Drive:
https://drive.google.com/file/d/1tFbQjfjoc79xAWW0sgYXPwGLIb6mxFa0/view?usp=drivesdk

📘 *TUTORIAL BUAT CONFIG MODE SSH*
📂 Google Drive:
https://drive.google.com/file/d/1tFbQjfjoc79xAWW0sgYXPwGLIb6mxFa0/view?usp=drivesdk

📌 *Langkah Singkat:*
1️⃣ Buka link di atas  
2️⃣ Ikuti panduan di dalam video
3️⃣ Selesai & Connect 🚀  

📥 *Download Config Ovpn*:
🔗 http://${s.hostname}:81/myvpn-config.zip

📥 *GRUP TESTIMOINI & BERBAGI BUG*:
🔗 https://t.me/irul\\_tunell

*© Telegram Bots - 2026*
✨ Terima kasih telah menggunakan layanan kami!
`;
        return resolve(msg);
      });
    });
  });
}
async function createvmess(username, exp, quota, limitip, serverId) {
  console.log(`Creating VMess account for ${username} with expiry ${exp} days, quota ${quota} GB, IP limit ${limitip}`);

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
      const param = `/vps/vmessall`;
      const web_URL = `http://${domain}${param}`; // contoh: http://idnusastb.domain.web.id/vps/vmess
      const AUTH_TOKEN = server.auth;
      const days = exp;
      const KUOTA = quota;
      const LIMIT_IP = limitip;

      const curlCommand = `curl -sS --connect-timeout 1 --max-time 30 -X POST "${web_URL}" \
-H "Authorization: ${AUTH_TOKEN}" \
-H "Content-Type: application/json" \
-H "Accept: application/json" \
-d '{"expired":${days},"kuota":"${KUOTA}","limitip":"${LIMIT_IP}","username":"${username}"}'`;

      exec(curlCommand, (err, stdout, stderr) => {
  // 1) Curl error / exit code error
  if (err) {
    console.error("❌ Curl error:", err.message);
    if (stderr) console.error("🪵 stderr:", stderr);
    return resolve("❌ Respon Server Error:", stderr);
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
// ======= MULAI LOGIKA UPDATE total_create_akun =======
if (exp >= 1 && exp <= 135) {
  db.run(
    'UPDATE Server SET total_create_akun = total_create_akun + 1 WHERE id = ?',
    [serverId],
    (err) => {
      if (err) {
        console.error('⚠️ Gagal update total_create_akun:', err.message);
      } else {
        console.log(`✅ total_create_akun diperbarui untuk serverId ${serverId} dengan exp ${exp}`);
      }
    }
  );
} else {
  console.log(`⚠️ Exp ${exp} hari tidak dicatat (kurang dari 30 atau lebih dari 135)`);
}
// ======= SELESAI LOGIKA UPDATE =======

        const msg = `✅ *VMess Account Created Successfully!*

🔐 *Akun VMess Premium*
──────────────
👤 *Username*     : \`${s.username}\`
🌍 *Host Default* : \`${s.hostname}\`
🌍 *Host SSL*     : \`ssl-${s.hostname}\`
🏢 *ISP*          : \`${s.ISP}\`
🏙️ *City*         : \`${s.CITY}\`
🛡 *UUID*          : \`${s.uuid}\`
🧾 *Expired*      : \`${s.expired}\` (${s.time})
📦 *Quota*        : \`${KUOTA === "0" ? "Unlimited" : KUOTA} GB\`
🔢 *IP Limit*     : \`${LIMIT_IP === "0" ? "Unlimited" : LIMIT_IP} IP\`
──────────────
📡 *Ports*:
- TLS         : ${s.port.tls}
- Non TLS     : ${s.port.none}
- Any Port    : ${s.port.any}
──────────────
📶 *Path*:
- WS          : ${s.path.stn} | ${s.path.multi}
- gRPC        : ${s.path.grpc}
- Upgrade     : ${s.path.up}
──────────────
🔗 *VMess Links*:
- TLS         : \`${s.link.tls}\`
──────────────
- Non TLS     : \`${s.link.none}\`
──────────────
- gRPC        : \`${s.link.grpc}\`
──────────────
- Up TLS      : \`${s.link.uptls}\`
──────────────
- Up Non-TLS  : \`${s.link.upntls}\`
──────────────
⚙️ *Settings*:
- AlterId     : \`0\`
- Security    : \`auto\`
- Network     : \`ws, grpc, upgrade\`

📘 *TUTORIAL BUAT CONFIG MODE VMESS VLESS TROJAN*
📂 Google Drive:
https://drive.google.com/file/d/1SmgoAUjTf9tt297deVkn6cd7ZOuha62a/view?usp=sharing

📌 *Langkah Singkat:*
1️⃣ Buka link di atas  
2️⃣ Ikuti panduan di dalam video
3️⃣ Selesai & Connect 🚀  

📥 *GRUP TESTIMOINI & BERBAGI BUG*:
🔗 https://t.me/irul\\_tunell

*© Telegram Bots - 2026*
✨ Terima kasih telah menggunakan layanan kami!
`;

        return resolve(msg);
      });
    });
  });
}

async function createvless(username, exp, quota, limitip, serverId) {
  console.log(`Creating VLESS account for ${username} with expiry ${exp} days, quota ${quota} GB, limit IP ${limitip}`);

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
      const param = `/vps/vlessall`;
      const web_URL = `http://${domain}${param}`; // Contoh: http://domainmu.com/vps/vless
      const AUTH_TOKEN = server.auth;
      const days = exp;
      const KUOTA = quota;
      const LIMIT_IP = limitip;

      const curlCommand = `curl -sS --connect-timeout 1 --max-time 30 -X POST "${web_URL}" \
-H "Authorization: ${AUTH_TOKEN}" \
-H "Content-Type: application/json" \
-H "Accept: application/json" \
-d '{"expired":${days},"kuota":"${KUOTA}","limitip":"${LIMIT_IP}","username":"${username}"}'`;

      exec(curlCommand, (err, stdout, stderr) => {
  // 1) Curl error / exit code error
  if (err) {
    console.error("❌ Curl error:", err.message);
    if (stderr) console.error("🪵 stderr:", stderr);
    return resolve("❌ Respon Server Error:", stderr);
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
// ======= MULAI LOGIKA UPDATE total_create_akun =======
if (exp >= 1 && exp <= 135) {
  db.run(
    'UPDATE Server SET total_create_akun = total_create_akun + 1 WHERE id = ?',
    [serverId],
    (err) => {
      if (err) {
        console.error('⚠️ Gagal update total_create_akun:', err.message);
      } else {
        console.log(`✅ total_create_akun diperbarui untuk serverId ${serverId} dengan exp ${exp}`);
      }
    }
  );
} else {
  console.log(`⚠️ Exp ${exp} hari tidak dicatat (kurang dari 30 atau lebih dari 135)`);
}
// ======= SELESAI LOGIKA UPDATE =======

        const msg = `✅ *VLESS Account Created Successfully!*

🔐 *Akun VLESS Premium*
──────────────
👤 *Username*     : \`${s.username}\`
🌍 *Host Default* : \`${s.hostname}\`
🌍 *Host SSL*     : \`ssl-${s.hostname}\`
🏢 *ISP*          : \`${s.ISP}\`
🏙️ *City*         : \`${s.CITY}\`
🛡 *UUID*         : \`${s.uuid}\`
📅 *Expired*      : \`${s.expired}\` (${s.time})
📦 *Quota*        : \`${KUOTA === "0" ? "Unlimited" : KUOTA} GB\`
🔢 *IP Limit*     : \`${LIMIT_IP === "0" ? "Unlimited" : LIMIT_IP} IP\`
──────────────
📡 *Ports*:
- TLS         : ${s.port.tls}
- Non TLS     : ${s.port.none}
- Any Port    : ${s.port.any}
──────────────
📶 *Path*:
- WS          : ${s.path.stn} | ${s.path.multi}
- gRPC        : ${s.path.grpc}
- Upgrade     : ${s.path.up}
──────────────
🔗 *VLESS Links*:
- TLS         : \`${s.link.tls}\`
──────────────
- Non TLS     : \`${s.link.none}\`
──────────────
- gRPC        : \`${s.link.grpc}\`
──────────────
- Up TLS      : \`${s.link.uptls}\`
──────────────
- Up Non-TLS  : \`${s.link.upntls}\`
──────────────
⚙️ *Settings*:
- Security    : \`auto\`
- Network     : \`ws, grpc, upgrade\`

📘 *TUTORIAL BUAT CONFIG MODE VMESS VLESS TROJAN*
📂 Google Drive:
https://drive.google.com/file/d/1SmgoAUjTf9tt297deVkn6cd7ZOuha62a/view?usp=sharing

📌 *Langkah Singkat:*
1️⃣ Buka link di atas  
2️⃣ Ikuti panduan di dalam video
3️⃣ Selesai & Connect 🚀  

📥 *GRUP TESTIMOINI & BERBAGI BUG*:
🔗 https://t.me/irul\\_tunell

*© Telegram Bots - 2026*
✨ Terima kasih telah menggunakan layanan kami!
`;

        return resolve(msg);
      });
    });
  });
}
async function createtrojan(username, exp, quota, limitip, serverId) {
  console.log(`Creating Trojan account for ${username} with expiry ${exp} days, quota ${quota} GB, limit IP ${limitip}`);

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
      const param = `/vps/trojanall`;
      const web_URL = `http://${domain}${param}`; // contoh: http://domainmu.com/vps/trojan
      const AUTH_TOKEN = server.auth;
      const days = exp;
      const KUOTA = quota;
      const LIMIT_IP = limitip;

      const curlCommand = `curl -sS --connect-timeout 1 --max-time 30 -X POST "${web_URL}" \
-H "Authorization: ${AUTH_TOKEN}" \
-H "Content-Type: application/json" \
-H "Accept: application/json" \
-d '{"expired":${days},"kuota":"${KUOTA}","limitip":"${LIMIT_IP}","username":"${username}"}'`;

      exec(curlCommand, (err, stdout, stderr) => {
  // 1) Curl error / exit code error
  if (err) {
    console.error("❌ Curl error:", err.message);
    if (stderr) console.error("🪵 stderr:", stderr);
    return resolve("❌ Respon Server Error:", stderr);
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
// ======= MULAI LOGIKA UPDATE total_create_akun =======
if (exp >= 1 && exp <= 135) {
  db.run(
    'UPDATE Server SET total_create_akun = total_create_akun + 1 WHERE id = ?',
    [serverId],
    (err) => {
      if (err) {
        console.error('⚠️ Gagal update total_create_akun:', err.message);
      } else {
        console.log(`✅ total_create_akun diperbarui untuk serverId ${serverId} dengan exp ${exp}`);
      }
    }
  );
} else {
  console.log(`⚠️ Exp ${exp} hari tidak dicatat (kurang dari 30 atau lebih dari 135)`);
}
// ======= SELESAI LOGIKA UPDATE =======

        const msg = `✅ *Trojan Account Created Successfully!*

🔐 *Akun TROJAN Premium*
──────────────
👤 *Username*     : \`${s.username}\`
🌍 *Host Default* : \`${s.hostname}\`
🌍 *Host SSL*     : \`ssl-${s.hostname}\`
🏢 *ISP*          : \`${s.ISP}\`
🏙️ *City*         : \`${s.CITY}\`
🔑 *Key*          : \`${s.uuid}\`
📅 *Expired*      : \`${s.expired}\` (${s.time})
📦 *Quota*        : \`${KUOTA === "0" ? "Unlimited" : KUOTA} GB\`
🔢 *IP Limit*     : \`${LIMIT_IP === "0" ? "Unlimited" : LIMIT_IP} IP\`
──────────────
📡 *Ports*:
- TLS         : ${s.port.tls}
- Non TLS     : ${s.port.none}
- Any Port    : ${s.port.any}
──────────────
📶 *Path*:
- WS          : ${s.path.stn} | ${s.path.multi}
- gRPC        : ${s.path.grpc}
- Upgrade     : ${s.path.up}
──────────────
🔗 *Trojan Links*:
- TLS         : \`${s.link.tls}\`
──────────────
- gRPC        : \`${s.link.grpc}\`
──────────────
- Up TLS      : \`${s.link.uptls}\`
──────────────
⚙️ *Settings*:
- Security    : \`auto\`
- Network     : \`ws, grpc, upgrade\`

📘 *TUTORIAL BUAT CONFIG MODE VMESS VLESS TROJAN*
📂 Google Drive:
https://drive.google.com/file/d/1SmgoAUjTf9tt297deVkn6cd7ZOuha62a/view?usp=sharing

📌 *Langkah Singkat:*
1️⃣ Buka link di atas  
2️⃣ Ikuti panduan di dalam video
3️⃣ Selesai & Connect 🚀  

📥 *GRUP TESTIMOINI & BERBAGI BUG*:
🔗 https://t.me/irul\\_tunell

*© Telegram Bots - 2026*
✨ Terima kasih telah menggunakan layanan kami!
`;

        return resolve(msg);
      });
    });
  });
}


//create shadowsocks ga ada di potato
async function createshadowsocks(username, exp, quota, limitip, serverId) {
  console.log(`Creating Shadowsocks account for ${username} with expiry ${exp} days, quota ${quota} GB, limit IP ${limitip} on server ${serverId}`);
  
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
      const param = `:5888/createshadowsocks?user=${username}&exp=${exp}&quota=${quota}&iplimit=${limitip}&auth=${auth}`;
      const url = `http://${domain}${param}`;
      axios.get(url)
        .then(response => {
          if (response.data.status === "success") {
            const shadowsocksData = response.data.data;
            const msg = `
🌟 *AKUN SHADOWSOCKS PREMIUM* 🌟

🔹 *Informasi Akun*
┌─────────────────────
│ *Username* : \`${shadowsocksData.username}\`
│ *Domain*   : \`${shadowsocksData.domain}\`
│ *NS*       : \`${shadowsocksData.ns_domain}\`
│ *Port TLS* : \`443\`
│ *Port HTTP*: \`80\`
│ *Alter ID* : \`0\`
│ *Security* : \`Auto\`
│ *Network*  : \`Websocket (WS)\`
│ *Path*     : \`/shadowsocks\`
│ *Path GRPC*: \`shadowsocks-grpc\`
└─────────────────────
🔐 *URL SHADOWSOCKS TLS*
\`\`\`
${shadowsocksData.ss_link_ws}
\`\`\`
🔒 *URL SHADOWSOCKS GRPC*
\`\`\`
${shadowsocksData.ss_link_grpc}
\`\`\`
🔒 *PUBKEY*
\`\`\`
${shadowsocksData.pubkey}
\`\`\`
┌─────────────────────
│ Expiry: \`${shadowsocksData.expired}\`
│ Quota: \`${shadowsocksData.quota === '0 GB' ? 'Unlimited' : shadowsocksData.quota}\`
│ IP Limit: \`${shadowsocksData.ip_limit === '0' ? 'Unlimited' : shadowsocksData.ip_limit} IP\`
└─────────────────────
Save Account Link: [Save Account](https://${shadowsocksData.domain}:81/shadowsocks-${shadowsocksData.username}.txt)
✨ Selamat menggunakan layanan kami! ✨
`;
              console.log('Shadowsocks account created successfully');
              return resolve(msg);
            } else {
              console.log('Error creating Shadowsocks account');
              return resolve(`❌ Terjadi kesalahan: ${response.data.message}`);
            }
          })
        .catch(error => {
          console.error('Error saat membuat Shadowsocks:', error);
          return resolve('❌ Terjadi kesalahan saat membuat Shadowsocks. Silakan coba lagi nanti.');
        });
    });
  });
}



async function createzivudp(username, password, exp, iplimit, serverId) {
  console.log(`Creating ZIV UDP account for ${username} with expiry ${exp} days`);

  if (!/^[a-z0-9-]+$/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf kecil, angka, atau tanda strip tanpa spasi.';
  }

  if (!password || password.length < 3 || /[^a-zA-Z0-9]/.test(password)) {
    return '❌ Password tidak valid. Gunakan minimal 3 karakter tanpa spasi atau karakter khusus.';
  }

  return new Promise((resolve) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err || !server) return resolve('❌ Server tidak ditemukan. Silakan coba lagi.');

      const web_URL = `http://${server.domain}/vps/sshvpn`;
      const AUTH_TOKEN = server.auth;
      const LIMIT_IP = iplimit;
      const curlCommand = `curl -sS --connect-timeout 1 --max-time 30 -X POST "${web_URL}" \
-H "Authorization: ${AUTH_TOKEN}" \
-H "Content-Type: application/json" \
-H "Accept: application/json" \
-d '{"expired":${exp},"kuota":"0","limitip":"${LIMIT_IP}","password":"${password}","username":"${username}"}'`;

      exec(curlCommand, (err, stdout, stderr) => {
        if (err) return resolve('❌ Gagal menghubungi server.');
        const out = (stdout || '').trim();
        if (!out) return resolve('❌ Respon server kosong / tidak valid.');
        if (!(out.startsWith('{') || out.startsWith('['))) return resolve('❌ Format respon dari server tidak valid (bukan JSON).');
        let d;
        try { d = JSON.parse(out); } catch (e) { return resolve('❌ Format respon dari server tidak valid (JSON rusak).'); }
        if (d?.meta?.code !== 200 || !d?.data) {
          const errMsg = d?.message || d?.meta?.message || JSON.stringify(d);
          return resolve(`❌ Respons error:
${errMsg}`);
        }
        const s = d.data;
        if (exp >= 1 && exp <= 135) {
          db.run('UPDATE Server SET total_create_akun = total_create_akun + 1 WHERE id = ?', [serverId], () => {});
        }
        const msg = `🔑 *Account ZIVPN UDP*
────────────────────────
📡 *Host*         : \`${s.hostname || server.domain}\`
🔑 *Password*     : \`${s.username || username}\`
📅 *Expiry Date*  : \`${s.exp || `${exp} Hari`}\`
⏰ *Expiry Time*  : \`${s.time || '-'}\`

📘 *TUTORIAL PASANG ZIVPN*
📂 Google Drive:
https://drive.google.com/file/d/1K8_sMpU6Fo14A_ahhEmhTwzh7aNf1rwc/view?usp=drivesdk
────────────────────────
📥 *GRUP TESTIMOINI & BERBAGI BUG*:
🔗 https://t.me/irul\\_tunell

*© Telegram Bots - 2026*
✨ Terima kasih telah menggunakan layanan kami!
`;
        return resolve(msg);
      });
    });
  });
}

module.exports = { createssh, createvmess, createvless, createtrojan, createshadowsocks, createzivudp }; 




