const fs = require("fs");
const chalk = require("chalk");
const { loginSingleAccount } = require("./auth"); // Kita pakai fungsi login yang sudah ada

// Batas aman sesi dianggap valid (dalam detik)
// Antam 3 menit (180s), kita set 150s (2.5 menit) biar aman
const SESSION_MAX_AGE_SECONDS = 150;

function getSessionAge(email) {
  const sessionFile = `./session/${email}.json`;
  if (!fs.existsSync(sessionFile)) return 99999; // Dianggap kadaluarsa kalau file gak ada

  const stats = fs.statSync(sessionFile);
  const lastModified = new Date(stats.mtime).getTime();
  const now = Date.now();

  return (now - lastModified) / 1000; // Return dalam detik
}

async function ensureSessionValid(account) {
  const age = getSessionAge(account.email);
  const timeLeft = 180 - age; // 180 detik = 3 menit

  console.log(
    chalk.dim(
      `   🕒 Umur Sesi: ${age.toFixed(
        0
      )} detik (Sisa waktu server: ~${timeLeft.toFixed(0)} detik)`
    )
  );

  if (age > SESSION_MAX_AGE_SECONDS) {
    console.log(
      chalk.yellow(
        `⚠️  Sesi sudah hampir habis (> 2.5 menit). Melakukan Refresh Sesi Otomatis...`
      )
    );

    // Hapus file lama biar bersih
    try {
      fs.unlinkSync(`./session/${account.email}.json`);
    } catch (e) {}

    // Login ulang (Headless true biar cepet dan gak ganggu)
    // Kita perlu passing parameter khusus agar loginSingleAccount tau ini refresh
    await loginSingleAccount(account, true);

    console.log(chalk.green(`♻️  Sesi berhasil diperbarui! Siap tempur.`));
  } else {
    console.log(chalk.green(`✅ Sesi masih segar. Lanjut!`));
  }
}

module.exports = { ensureSessionValid };
