module.exports = {
  apps: [
    {
      name: "sellvpn",                  // Nama aplikasi
      script: "app.js",                // File entry point
      cwd: "/root/BotVPN",              // Working directory
      instances: 1,                    // Hanya 1 process → fork mode
      exec_mode: "fork",               // WAJIB fork mode untuk server HTTP
      autorestart: true,               // Restart otomatis jika crash
      watch: false,                    // Tidak memantau perubahan file
      max_memory_restart: "500M",      // Restart jika memory > 500MB
      error_file: "/root/.pm2/logs/sellsc-error.log",  // Log error
      out_file: "/root/.pm2/logs/sellsc-out.log",      // Log standar
      log_date_format: "YYYY-MM-DD HH:mm:ss",         // Format waktu log
    }
  ]
};
