const inquirer = require("inquirer");
const chalk = require("chalk");
const { drawHeader } = require("./src/ui");
const {
  addAccount,
  listAccounts,
  loadAccounts,
} = require("./src/accountManager");
const { executeWarSingle } = require("./src/warExecutor");
const { loginAllAccounts } = require("./src/auth");
const { checkQuotaAll } = require("./src/war");
const { manageSettings, loadSettings } = require("./src/settings");
const { testProxy } = require("./src/proxyTester");

async function main() {
  console.clear();

  // Load config terbaru setiap kali menu di-refresh
  const config = loadSettings();

  // Format status untuk Header
  const headlessStatus = config.headless ? chalk.green("ON") : chalk.red("OFF");
  const proxyStatus = config.useProxy
    ? chalk.green("AKTIF")
    : chalk.red("MATI");

  // 1. Tampilkan Header
  drawHeader("BOT ANTAM - PLAYWRIGHT FULL AUTO");
  console.log(
    chalk.dim(
      `Info: Headless [${headlessStatus}] | Proxy [${proxyStatus}] | Interval [${config.checkInterval}s]\n`
    )
  );

  // 2. Render Menu Manual
  console.log(chalk.white("1. Login Semua Akun"));
  console.log(chalk.white("2. Cek Kuota & Restok"));
  console.log(chalk.white("3. Test Perang Restok (Manual Trigger)")); // Sudah aktif
  console.log(chalk.white("4. Tambah Akun"));
  console.log(chalk.white("5. Cek & Hapus Akun"));
  console.log(chalk.white("6. Monitor Otomatis"));
  console.log(chalk.white("7. Pengaturan Bot"));
  console.log(chalk.white("T. Test Proxy"));
  console.log(chalk.gray("──────────────────────────────"));
  console.log(chalk.red("0. Keluar"));
  console.log(""); // Spasi kosong

  // 3. Input Prompt
  const answer = await inquirer.prompt([
    {
      type: "input",
      name: "menu",
      message: "Pilih menu:",
      validate: (val) => (val ? true : "Harap masukkan angka!"),
    },
  ]);

  // 4. Switch Case
  switch (answer.menu.trim()) {
    case "1":
      const accountsLogin = loadAccounts();
      if (accountsLogin.length === 0) {
        console.log(chalk.red("⚠️  Belum ada akun! Tambah dulu di menu 4."));
      } else {
        await loginAllAccounts(accountsLogin);
      }
      await pause();
      break;

    case "2":
      await checkQuotaAll(loadAccounts());
      await pause();
      break;

    case "3":
      // Ambil daftar akun
      const accountsWar = loadAccounts();
      if (accountsWar.length === 0) {
        console.log(chalk.red("⚠️  Belum ada akun! Tambah dulu."));
        await pause();
        break;
      }

      // Pilih Akun untuk War
      const { selectedAccountIndex } = await inquirer.prompt([
        {
          type: "list",
          name: "selectedAccountIndex",
          message: "Pilih Akun untuk Eksekusi War:",
          choices: accountsWar.map((acc, idx) => ({
            name: `${idx + 1}. ${acc.email} (${acc.branch})`,
            value: idx,
          })),
        },
      ]);

      const targetAccount = accountsWar[selectedAccountIndex];

      // Konfirmasi
      console.log(
        chalk.yellow(
          `\n⚠️  PERINGATAN: Bot akan mencoba mengambil antrean BENERAN untuk akun ${targetAccount.email}.`
        )
      );
      console.log(
        chalk.yellow(
          `   Pastikan jam operasional sudah buka atau ini hanya akan gagal/penuh.`
        )
      );

      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: "Lanjut Eksekusi?",
          default: false,
        },
      ]);

      if (confirm) {
        await executeWarSingle(targetAccount, targetAccount.branch);
      } else {
        console.log("Dibatalkan.");
      }

      await pause();
      break;

    case "4":
      await addAccount();
      // Tidak perlu pause agar langsung refresh list akun kalau mau lihat
      break;

    case "5":
      console.clear();
      drawHeader("DAFTAR AKUN");
      listAccounts();
      await pause();
      break;

    case "6":
      console.log(
        chalk.yellow(
          "Fitur Monitor akan menggunakan interval looping (Next Step)."
        )
      );
      await pause();
      break;

    case "7": // PENGATURAN
      await manageSettings();
      break;

    case "t": // TEST PROXY
    case "T":
      await testProxy();
      await pause();
      break;

    case "0":
      console.log("Bye bye!");
      process.exit(0);
      break;

    default:
      console.log(chalk.red("❌ Menu tidak valid! Masukkan angka 0-7."));
      await pause();
      break;
  }

  main(); // Loop kembali ke menu utama
}

async function pause() {
  const readline = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    readline.question(chalk.dim("\nTekan Enter untuk kembali..."), () => {
      readline.close();
      resolve();
    });
  });
}

main();
