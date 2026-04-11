#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import json
import time
import random
import logging
import subprocess
from typing import Optional, Tuple, Dict, Any, List

# =========================
# CONFIG (EDIT DI SINI)
# =========================

SOCKS_POOL = [
'aristore:1447@biznet.rajaserver.web.id:1080',
'aristore:1447@biznet2.rajaserver.web.id:1080',
]

SETTINGS = {
    "qris": "-",
    "web_payment_getway": "api.rajaserver.web.id",
    "apikey_paymet_getway": "-",
    "web_mutasi": "https://app.orderkuota.com/api/v2/qris/mutasi/-",
    "auth_username_mutasi": "-",
    "auth_token_mutasi": "-",
}

# WD endpoint + headers “signature” (PAKAI PUNYA KAMU)
WD_ENDPOINT = "https://app.orderkuota.com/api/v2/get"
WD_SIGNATURE = "6bac2218f360fe52025d44014dd18242aee87d944e3e8bdad1a8435c27fdeb74ba569fc69f4b984cf9e242fbe06cd5cdb5bbdca1a43ea883ee79025ca83b6257"

# Param device (ikut skrip kamu)
APP_REG_ID = "dzW47KqtQeWejrTm62g62K:APA91bEkwrdr00p6IKNjudPuh-CvG1By-gALybvw9GqyhjhVkBGc4TiXtqAlj9DUldL6-1lFphq6E2UPCZV4QcLxEFT0MEFBHdzesT2wzL9ChW--iIqqg0I"
PHONE_UUID = "dzW47KqtQeWejrTm62g62K"
PHONE_ANDROID_VERSION = "15"
APP_VERSION_CODE = "251231"
APP_VERSION_NAME = "99.99.99"
UI_MODE = "light"
PHONE_MODEL = "23108RN04Y"

# Min WD
MIN_WD = 1000

# Logging
LOG_FILE = os.path.join(os.path.dirname(__file__), "wdqris.log")


# =========================
# UTILS
# =========================

def setup_logger() -> logging.Logger:
    logger = logging.getLogger("wdqris")
    logger.setLevel(logging.INFO)

    fmt = logging.Formatter("%(asctime)s | %(levelname)s | %(message)s")
    fh = logging.FileHandler(LOG_FILE, encoding="utf-8")
    fh.setFormatter(fmt)
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)

    # avoid duplicate handlers
    if not logger.handlers:
        logger.addHandler(fh)
        logger.addHandler(sh)
    return logger


def format_idr(n: int) -> str:
    # 1234567 -> 1.234.567
    s = str(int(n))
    out = []
    while s:
        out.append(s[-3:])
        s = s[:-3]
    return ".".join(reversed(out))


def build_proxy_list() -> List[Optional[str]]:
    lst = list(SOCKS_POOL)
    random.shuffle(lst)
    lst.append(None)  # fallback NO PROXY
    return lst


def run_curl(cmd: List[str], timeout_sec: int = 30) -> Tuple[str, str, int]:
    """
    Return (stdout, stderr, returncode). Even if returncode != 0, stdout may contain JSON.
    """
    try:
        p = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout_sec,
            check=False,
            text=True,
        )
        return (p.stdout.strip(), p.stderr.strip(), p.returncode)
    except subprocess.TimeoutExpired:
        return ("", f"Timeout after {timeout_sec}s", 124)


def try_parse_json(s: str) -> Tuple[bool, Optional[Dict[str, Any]]]:
    try:
        return True, json.loads(s)
    except Exception:
        return False, None


def to_int_saldo(val: Any) -> int:
    # handle "12.345" or 12345 or None
    if val is None:
        return 0
    if isinstance(val, (int, float)):
        return int(val)
    txt = str(val).replace(".", "").strip()
    if not txt.isdigit():
        return 0
    return int(txt)


# =========================
# CORE
# =========================

def fetch_qris_history(logger: logging.Logger, proxy: Optional[str]) -> Dict[str, Any]:
    if not SETTINGS.get("web_mutasi"):
        raise RuntimeError("settings.web_mutasi kosong")
    if not SETTINGS.get("auth_username_mutasi") or not SETTINGS.get("auth_token_mutasi"):
        raise RuntimeError("Auth mutasi kosong (auth_username_mutasi/auth_token_mutasi)")

    cmd = [
        "curl", "--silent", "--compressed",
        "--connect-timeout", "10",
        "--max-time", "20",
    ]

    # socks: format user:pass@host:port OR host:port (curl supports both)
    if proxy:
        cmd += ["--socks5-hostname", proxy]

    cmd += [
        "-X", "POST", SETTINGS["web_mutasi"],
        "-H", "Content-Type: application/x-www-form-urlencoded",
        "-H", "Accept-Encoding: gzip",
        "-H", "User-Agent: okhttp/4.12.0",
        "--data-urlencode", f"auth_username={SETTINGS['auth_username_mutasi']}",
        "--data-urlencode", f"auth_token={SETTINGS['auth_token_mutasi']}",
        "--data-urlencode", "requests[qris_history][page]=1",
        "--data-urlencode", "requests[qris_history][jenis]=kredit",
    ]

    out, err, code = run_curl(cmd, timeout_sec=30)
    if not out:
        raise RuntimeError(f"History empty output (code={code}) err={err[:200]}")

    ok, data = try_parse_json(out)
    if not ok or data is None:
        raise RuntimeError(f"History bukan JSON: {out[:200]}")

    return data


def withdraw_qris(logger: logging.Logger, proxy: Optional[str], amount: int) -> Dict[str, Any]:
    ts = str(int(time.time() * 1000))

    cmd = [
        "curl", "--silent", "--compressed",
        "--connect-timeout", "8",
        "--max-time", "20",
    ]

    if proxy:
        cmd += ["--socks5-hostname", proxy]

    cmd += [
        "-X", "POST", WD_ENDPOINT,
        "-H", f"signature: {WD_SIGNATURE}",
        "-H", f"timestamp: {ts}",
        "-H", "Content-Type: application/x-www-form-urlencoded",
        "-H", "Accept-Encoding: gzip",
        "-H", "User-Agent: okhttp/4.12.0",
        "--data-urlencode", f"request_time={ts}",
        "--data-urlencode", f"app_reg_id={APP_REG_ID}",
        "--data-urlencode", f"phone_android_version={PHONE_ANDROID_VERSION}",
        "--data-urlencode", f"app_version_code={APP_VERSION_CODE}",
        "--data-urlencode", f"phone_uuid={PHONE_UUID}",
        "--data-urlencode", f"auth_username={SETTINGS['auth_username_mutasi']}",
        "--data-urlencode", f"auth_token={SETTINGS['auth_token_mutasi']}",
        "--data-urlencode", f"requests[qris_withdraw][amount]={amount}",
        "--data-urlencode", f"app_version_name={APP_VERSION_NAME}",
        "--data-urlencode", f"ui_mode={UI_MODE}",
        "--data-urlencode", f"phone_model={PHONE_MODEL}",
    ]

    out, err, code = run_curl(cmd, timeout_sec=30)
    if not out:
        raise RuntimeError(f"WD empty output (code={code}) err={err[:200]}")

    ok, data = try_parse_json(out)
    if not ok or data is None:
        raise RuntimeError(f"WD bukan JSON: {out[:200]}")

    return data


def is_success_wd(res: Dict[str, Any]) -> Tuple[bool, str]:
    # lebih luas seperti skrip kamu
    q = (
        res.get("qris_withdraw")
        or (res.get("data") or {}).get("qris_withdraw")
        or (res.get("result") or {}).get("qris_withdraw")
        or res
    )

    if isinstance(q, dict):
        msg = q.get("message") or res.get("message") or ""
        ok = (
            q.get("success") is True
            or res.get("success") is True
            or res.get("status") == "success"
            or (res.get("meta") or {}).get("code") == 200
        )
        return ok, msg or ""
    return False, ""


def main():
    logger = setup_logger()
    logger.info("=== WD QRIS CRON START ===")

    proxy_list = build_proxy_list()

    # 1) Ambil history
    history = None
    history_proxy = None
    last_err = None

    for p in proxy_list:
        try:
            logger.info(f"[HISTORY] try via {'PROXY ' + p if p else 'NO_PROXY'}")
            history = fetch_qris_history(logger, p)
            history_proxy = p
            break
        except Exception as e:
            last_err = e
            logger.warning(f"[HISTORY] failed via {p or 'NO_PROXY'}: {e}")

    if history is None:
        logger.error(f"Gagal ambil history. Last error: {last_err}")
        sys.exit(2)

    latest = (((history.get("qris_history") or {}).get("results")) or [None])[0]
    saldo_asli = to_int_saldo((latest or {}).get("saldo_akhir"))

    # log transaksi terakhir
    jumlah = to_int_saldo((latest or {}).get("jumlah"))
    ket = (latest or {}).get("keterangan") or ""
    transaksi_log = f"Rp{format_idr(jumlah)} - {ket}" if (jumlah and ket) else "Tidak ada detail transaksi terakhir"

    logger.info(f"[SALDO] via {'PROXY' if history_proxy else 'NO_PROXY'} saldo_akhir=Rp{format_idr(saldo_asli)}")
    logger.info(f"[LAST_TX] {transaksi_log}")

    if saldo_asli < MIN_WD:
        logger.info(f"Saldo belum cukup untuk WD minimal Rp{format_idr(MIN_WD)}. STOP.")
        sys.exit(0)

    amount = (saldo_asli // 1000) * 1000
    if amount < MIN_WD:
        logger.info("Amount hasil pembulatan < MIN_WD. STOP.")
        sys.exit(0)

    # 2) WD
    wd_res = None
    wd_proxy = None
    last_wd_err = None

    for p in proxy_list:
        try:
            logger.info(f"[WD] try via {'PROXY ' + p if p else 'NO_PROXY'} amount=Rp{format_idr(amount)}")
            wd_res = withdraw_qris(logger, p, amount)
            wd_proxy = p
            break
        except Exception as e:
            last_wd_err = e
            logger.warning(f"[WD] failed via {p or 'NO_PROXY'}: {e}")

    if wd_res is None:
        logger.error(f"WD gagal semua proxy + no-proxy. Last error: {last_wd_err}")
        sys.exit(3)

    ok, msg = is_success_wd(wd_res)

    # simpan raw response ringkas ke log
    try:
        raw_str = json.dumps(wd_res, ensure_ascii=False)[:1200]
    except Exception:
        raw_str = str(wd_res)[:1200]

    if ok:
        logger.info(f"✅ WD BERHASIL DIMINTA | amount=Rp{format_idr(amount)} | via={'PROXY' if wd_proxy else 'NO_PROXY'} | msg={msg}")
        logger.info(f"[WD_RAW] {raw_str}")
        sys.exit(0)
    else:
        logger.error("❌ WD GAGAL (API response tidak success)")
        logger.error(f"amount=Rp{format_idr(amount)} saldo=Rp{format_idr(saldo_asli)} last_tx={transaksi_log}")
        logger.error(f"[WD_RAW] {raw_str}")
        sys.exit(4)


if __name__ == "__main__":
    main()
