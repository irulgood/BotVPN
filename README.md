## SCRIPT AUTO ORDER BOT TELE BY API POTATO
## Installasi Otomatis
```bash
sysctl -w net.ipv6.conf.all.disable_ipv6=1 && sysctl -w net.ipv6.conf.default.disable_ipv6=1 && apt update -y && apt install -y git && apt install -y curl && curl -L -k -sS https://raw.githubusercontent.com/irulgood/BotVPN/main/start -o start && bash start sellvpn && [ $? -eq 0 ] && rm -f start
```
## UPDATE
```bash
curl --connect-timeout 1 --max-time 3 -sL https://raw.githubusercontent.com/irulgood/BotVPN/main/update.sh -o update.sh && chmod +x update.sh && bash update.sh
```
## Broadcast 
```apt install -y sqlite3 && wget -q https://raw.githubusercontent.com/irulgood/BotVpn/main/broadcast.sh && chmod +x broadcast.sh && ./broadcast.sh
```


<img src="./ss.png" alt="image" width="500"/>


## DUAL METHODE AUTO PAYMET

**1. GopayMerchat (Unofficial)**
- CEK PEMBAYARAN GOPAY
- Pembelian key: https://t.me/AutoGopayBot
- Web panel: https://gopay.sawargipay.cloud
- Harga Rp1.000 / Hari (bisa tanpa fee di qris)
```bash
AMBIL GOPAY_KEY
```

**2. Orderkuota (Unofficial)**

- DATA QRIS ORDER KUOTA AMBIL DI SINI
https://scanqr.org/

**Login Step 1**
```bash
curl -X POST "https://orkut.rajaserver.web.id/api/orkut/login" -d "username=08123456789&password=password123"
```

**Login Step 2**
```bash
curl -X POST "https://orkut.rajaserver.web.id/api/orkut/verify-otp" -d "username=08123456789&otp=123456"
```

**Cek Mutasi**
```bash
curl -X POST "https://orkut.rajaserver.web.id/api/orkut/qris-history" -d "username=08123456789&token=merchant_id:token_string&jenis=masuk"
```

**Tarik Saldo**
```bash
curl -X POST "https://orkut.rajaserver.web.id/api/orkut/qris-withdraw" -d "username=08123456789&token=merchant_id:token_string&amount=100000"
```

---

## TAMPILAN SC BotVPN POTATO 
<img src="./ss2.png" alt="image" width="300"/>

Owner : https://t.me/ARI_VPN_STORE

DONASI SCAN QIRS : 
<img src="https://rajaserver.web.id/qris.jpg" alt="image" width="300"/>
