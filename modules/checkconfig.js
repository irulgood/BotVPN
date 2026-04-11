const axios = require('axios');
const { exec } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./sellvpn.db');

async function checkconfigsshvpn(username, password, exp, iplimit, serverId) {
  console.log(`Check config SSH account for ${username}`);

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
      const web_URL = `http://${domain}/vps/checkconfigsshvpn/${username}`; // Contoh: http://domainmu.com/vps/checkconfigsshvpn/aristore
      const AUTH_TOKEN = server.auth;
      const LIMIT_IP = iplimit;

      const curlCommand = `curl -s -X GET "${web_URL}" \
-H "Authorization: ${AUTH_TOKEN}" \
-H "accept: application/json"`;

      exec(curlCommand, (_, stdout) => {
        let d;
        try {
          d = JSON.parse(stdout);
        } catch (e) {
          console.error('❌ Gagal parsing JSON:', e.message);
          console.error('🪵 Output:', stdout);
          return resolve('❌ Format respon dari server tidak valid.');
        }

        if (d?.meta?.code !== 200 || !d.data) {
          console.error('❌ Respons error:', d);
          const errMsg = d?.message || d?.meta?.message || JSON.stringify(d, null, 2);
          return resolve(`❌ Respons error:\n${errMsg}`);
        }

        const s = d.data;
        console.log("⚠️ FULL DATA:", JSON.stringify(d, null, 2));
        const msg = `✅ *SSH Account Created Successfully!*

*🔐 SSH Premium Details*
────────────────────────
📡 *SSH WS*    : \`${s.hostname}:80@${s.username}:${s.password}\`
🔒 *SSH SSL*   : \`${s.hostname}:443@${s.username}:${s.password}\`
📶 *SSH UDP*   : \`${s.hostname}:1-65535@${s.username}:${s.password}\`
🌐 *DNS SELOW* : \`ns-${s.hostname}:5300@${s.username}:${s.password}\`
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
• TLS         : \`${s.port.tls}\` z
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
\`

📥 *Download Config Ovpn*:
🔗 http://${s.hostname}:81/myvpn-config.zip

📥 *Download All Config UNLOCK SSH*:
🔗 http://ssl-${s.hostname}:81/config-Indonesia.zip

*© Telegram Bots - 2025*
✨ Terima kasih telah menggunakan layanan kami!
`;
        return resolve(msg);
      });
    });
  });
}
async function checkconfigvmess(username, exp, quota, iplimit, serverId) {
  console.log(`Check config VMess account for ${username}`);

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
      const web_URL = `http://${domain}/vps/checkconfigvmess/${username}`; // contoh: http://domain.com/vps/checkconfigvmess/aristore
      const AUTH_TOKEN = server.auth;
      const LIMIT_IP = iplimit;
      const KUOTA = quota;

  const curlCommand = `curl -s -X GET "${web_URL}" \
-H "Authorization: ${AUTH_TOKEN}" \
-H "accept: application/json"`;

      exec(curlCommand, (_, stdout) => {
        let d;
        try {
          d = JSON.parse(stdout);
        } catch (e) {
          console.error('❌ Gagal parsing JSON:', e.message);
          console.error('🪵 Output:', stdout);
          return resolve('❌ Format respon dari server tidak valid.');
        }

        if (d?.meta?.code !== 200 || !d.data) {
          console.error('❌ Respons error:', d);
          const errMsg = d?.message || d?.meta?.message || JSON.stringify(d, null, 2);
          return resolve(`❌ Respons error:\n${errMsg}`);
        }

        const s = d.data;
        console.log("⚠️ FULL DATA:", JSON.stringify(d, null, 2));
        const msg = `✅ *VMess Account Created Successfully!*

🔐 *Akun VMess Premium*
──────────────
👤 *Username*     : \`${s.username}\`
🌍 *Host*         : \`${s.hostname}\`
🏢 *ISP*          : \`${s.ISP}\`
🏙️ *City*         : \`${s.CITY}\`
🛡 *UUID*          : \`${s.uuid}\`
🧾 *Expired*      : \`${s.expired}\` 
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

*© Telegram Bots - 2025*
✨ Terima kasih telah menggunakan layanan kami!
`;

        return resolve(msg);
      });
    });
  });
}
async function checkconfigvless(username, exp, quota, iplimit, serverId) {
  console.log(`Check config VLESS account for ${username}`);

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
      const web_URL = `http://${domain}/vps/checkconfigvless/${username}`; // contoh: http://domain.com/vps/checkconfigvless/aristore
      const AUTH_TOKEN = server.auth;
      const LIMIT_IP = iplimit;
      const KUOTA = quota;

  const curlCommand = `curl -s -X GET "${web_URL}" \
-H "Authorization: ${AUTH_TOKEN}" \
-H "accept: application/json"`;

      exec(curlCommand, (_, stdout) => {
        let d;
        try {
          d = JSON.parse(stdout);
        } catch (e) {
          console.error('❌ Gagal parsing JSON:', e.message);
          console.error('🪵 Output:', stdout);
          return resolve('❌ Format respon dari server tidak valid.');
        }

        if (d?.meta?.code !== 200 || !d.data) {
          console.error('❌ Respons error:', d);
          const errMsg = d?.message || d?.meta?.message || JSON.stringify(d, null, 2);
          return resolve(`❌ Respons error:\n${errMsg}`);
        }

        const s = d.data;
        console.log("⚠️ FULL DATA:", JSON.stringify(d, null, 2));
        const msg = `✅ *VLESS Account Created Successfully!*

🔐 *Akun VLESS Premium*
──────────────
👤 *Username*     : \`${s.username}\`
🌍 *Host*         : \`${s.hostname}\`
🏢 *ISP*          : \`${s.ISP}\`
🏙️ *City*         : \`${s.CITY}\`
🛡 *UUID*         : \`${s.uuid}\`
📅 *Expired*      : \`${s.expired}\` 
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

*© Telegram Bots - 2025*
✨ Terima kasih telah menggunakan layanan kami!
`;

        return resolve(msg);
      });
    });
  });
}
async function checkconfigtrojan(username, exp, quota, iplimit, serverId) {
  console.log(`Check config TROJAN account for ${username}`);

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
      const web_URL = `http://${domain}/vps/checkconfigtrojan/${username}`; // contoh: http://domain.com/vps/checkconfigtrojan/aristore
      const AUTH_TOKEN = server.auth;
      const LIMIT_IP = iplimit;
      const KUOTA = quota;

  const curlCommand = `curl -s -X GET "${web_URL}" \
-H "Authorization: ${AUTH_TOKEN}" \
-H "accept: application/json"`;

      exec(curlCommand, (_, stdout) => {
        let d;
        try {
          d = JSON.parse(stdout);
        } catch (e) {
          console.error('❌ Gagal parsing JSON:', e.message);
          console.error('🪵 Output:', stdout);
          return resolve('❌ Format respon dari server tidak valid.');
        }

        if (d?.meta?.code !== 200 || !d.data) {
          console.error('❌ Respons error:', d);
          const errMsg = d?.message || d?.meta?.message || JSON.stringify(d, null, 2);
          return resolve(`❌ Respons error:\n${errMsg}`);
        }

        const s = d.data;
        console.log("⚠️ FULL DATA:", JSON.stringify(d, null, 2));
        const msg = `✅ *Trojan Account Created Successfully!*

🔐 *Akun TROJAN Premium*
──────────────
👤 *Username*     : \`${s.username}\`
🌍 *Host*         : \`${s.hostname}\`
🏢 *ISP*          : \`${s.ISP}\`
🏙️ *City*         : \`${s.CITY}\`
🔑 *Key*          : \`${s.uuid}\`
📅 *Expired*      : \`${s.expired}\` 
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

*© Telegram Bots - 2025*
✨ Terima kasih telah menggunakan layanan kami!
`;

        return resolve(msg);
      });
    });
  });
}
  
module.exports = { checkconfigtrojan, checkconfigvless, checkconfigvmess, checkconfigsshvpn };
