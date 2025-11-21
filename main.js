const inquirer = require("inquirer");
const chalk = require("chalk");
const { drawHeader } = require("./src/ui");
const {
  addAccount,
  listAccounts,
  loadAccounts,
} = require("./src/accountManager");
const { loginAllAccounts } = require("./src/auth");
const { checkQuotaAll } = require("./src/war");
const { manageSettings, loadSettings } = require("./src/settings");
const { testProxy } = require("./src/proxyTester");
const { startAutoMonitor } = require("./src/autoMonitor");
const { startSniperMode } = require("./src/sniper");
const { startSniperAPI } = require("./src/sniperAPI");
const { scrapeWakdaIDs } = require("./src/wakdaScraper");
const { startMultiSniper } = require("./src/multiSniper"); // Pastikan file ini ada

async function main() {
  console.clear();

  // Load config terbaru
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
  console.log(chalk.white("3. SNIPER MODE (Single & Multi)"));
  console.log(chalk.white("4. Tambah Akun"));
  console.log(chalk.white("5. Cek & Hapus Akun"));
  console.log(chalk.white("6. Monitor Otomatis"));
  console.log(chalk.white("7. Pengaturan Bot"));
  console.log(chalk.magenta("8. Scrape Wakda ID (INTEL)"));
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
      await checkQuotaAll();
      await pause();
      break;

    case "3":
      // --- LOGIC WAR MODE ---
      const accountsWar = loadAccounts();
      if (accountsWar.length === 0) {
        console.log(chalk.red("⚠️  Belum ada akun! Tambah dulu."));
        await pause();
        break;
      }

      // 1. Pilih Strategi (Single vs Multi)
      const { strategy } = await inquirer.prompt([
        {
          type: "list",
          name: "strategy",
          message: "Pilih Strategi Perang:",
          choices: [
            {
              name: "🔫 Single Sniper (1 Akun - Presisi Tinggi)",
              value: "single",
            },
            {
              name: "💣 Multi-Account Cluster (Serangan Massal)",
              value: "multi",
            },
          ],
        },
      ]);

      if (strategy === "single") {
        // --- SINGLE SNIPER ---
        const { selectedAccountIndex } = await inquirer.prompt([
          {
            type: "list",
            name: "selectedAccountIndex",
            message: "Pilih Akun Sniper:",
            choices: accountsWar.map((acc, idx) => ({
              name: acc.email,
              value: idx,
            })),
          },
        ]);
        const sniperAccount = accountsWar[selectedAccountIndex];

        const { branchId } = await inquirer.prompt([
          {
            type: "input",
            name: "branchId",
            message: "Masukkan ID Cabang Target:",
            default: sniperAccount.branch || "6",
          },
        ]);

        const { mode } = await inquirer.prompt([
          {
            type: "list",
            name: "mode",
            message: "Pilih Metode Teknis:",
            choices: [
              {
                name: "Browser Sniper (Visual, Lebih Aman)",
                value: "browser",
              },
              {
                name: "API Hybrid (Experimental, Super Cepat)",
                value: "api",
              },
            ],
          },
        ]);

        if (mode === "browser") {
          await startSniperMode(sniperAccount, branchId);
        } else {
          await startSniperAPI(sniperAccount, branchId);
        }
      } else {
        // --- MULTI ACCOUNT ---
        const { selectedIndices } = await inquirer.prompt([
          {
            type: "checkbox",
            name: "selectedIndices",
            message: "Pilih Pasukan (Spasi untuk pilih):",
            choices: accountsWar.map((acc, idx) => ({
              name: `${acc.email} (${acc.branch})`,
              value: idx,
            })),
            validate: (a) => (a.length < 1 ? "Pilih minimal 1 akun" : true),
          },
        ]);

        const selectedAccounts = selectedIndices.map((idx) => accountsWar[idx]);

        const { branchIdMulti } = await inquirer.prompt([
          {
            type: "input",
            name: "branchIdMulti",
            message: "Masukkan ID Cabang Target (Serangan Bersama):",
            default: "6",
          },
        ]);

        await startMultiSniper(selectedAccounts, branchIdMulti);
      }

      await pause();
      break;

    case "4":
      await addAccount();
      break;

    case "5":
      console.clear();
      drawHeader("DAFTAR AKUN");
      listAccounts();
      await pause();
      break;

    case "6":
      await startAutoMonitor();
      await pause();
      break;

    case "7":
      await manageSettings();
      break;

    case "8":
      await scrapeWakdaIDs();
      await pause();
      break;

    case "t":
    case "T":
      await testProxy();
      await pause();
      break;

    case "0":
      console.log("Bye bye!");
      process.exit(0);
      break;

    default:
      console.log(chalk.red("❌ Menu tidak valid! Masukkan angka 0-8."));
      await pause();
      break;
  }

  main();
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
