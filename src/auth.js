const { chromium } = require("playwright");
const fs = require("fs");
const chalk = require("chalk");
const { proxyConfig, siteKeys } = require("./config");
const { solveRecaptchaV2 } = require("./solver");
const { loadSettings } = require("./settings");

// Pastikan folder session & screenshots ada
if (!fs.existsSync("./session")) {
  fs.mkdirSync("./session");
}
if (!fs.existsSync("./screenshots")) {
  fs.mkdirSync("./screenshots");
}

// PERBAIKAN 1: Tambah parameter isRefresh (default false)
async function loginSingleAccount(account, isRefresh = false) {
  const sessionFile = `./session/${account.email}.json`;
  const settings = loadSettings(); // Load setting terbaru

  // PERBAIKAN 2: Log hanya muncul jika BUKAN refresh otomatis (biar gak spam log)
  if (!isRefresh) {
    console.log(chalk.cyan(`[${account.email}] Inisialisasi Browser...`));
    const proxyStatus = settings.useProxy
      ? chalk.green("ON")
      : chalk.red("OFF");
    console.log(
      chalk.dim(
        `   Mode: Headless [${settings.headless}] | Proxy [${proxyStatus}]`
      )
    );
  }

  const browser = await chromium.launch({
    headless: settings.headless,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  // LOGIC PROXY: Hanya pasang proxy jika setting aktif
  const contextOptions = {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
  };

  if (settings.useProxy) {
    contextOptions.proxy = proxyConfig;
  }

  const context = await browser.newContext(contextOptions);
  let page = null; // Deklarasi di luar try agar bisa diakses catch

  try {
    page = await context.newPage();

    if (!isRefresh)
      console.log(chalk.cyan(`[${account.email}] Mengakses Halaman Login...`));

    // 1. Buka Halaman
    await page.goto("https://antrean.logammulia.com/login", { timeout: 60000 });

    // 2. Isi Form
    if (!isRefresh)
      console.log(
        chalk.cyan(`[${account.email}] Mengisi Username & Password...`)
      );
    await page.fill("#username", account.email);
    await page.fill("#password", account.password);

    // Centang Remember Me
    if (await page.isVisible("#customCheckb1")) {
      await page.check("#customCheckb1");
    }

    // 3. Handle Captcha
    if (!isRefresh)
      console.log(chalk.yellow(`[${account.email}] Solving Captcha...`));
    const token = await solveRecaptchaV2(page.url(), siteKeys.login);

    // Inject Token
    await page.evaluate((token) => {
      document.getElementById("g-recaptcha-response").innerHTML = token;
    }, token);

    // 4. Klik Login
    if (!isRefresh) console.log(chalk.blue(`[${account.email}] Klik Login...`));

    await Promise.all([
      page.waitForNavigation({ timeout: 60000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);

    // 5. Validasi Login
    if (
      page.url().includes("/users") ||
      (await page.isVisible('a[href*="logout"]'))
    ) {
      const cookies = await context.cookies();

      // PERBAIKAN 3: Hapus file lama (jika ada) agar Timestamp file terupdate
      // Ini penting agar sessionGuard tau kalau sesinya baru diperbarui
      if (fs.existsSync(sessionFile)) {
        try {
          fs.unlinkSync(sessionFile);
        } catch (e) {}
      }

      fs.writeFileSync(sessionFile, JSON.stringify(cookies, null, 2));

      if (!isRefresh)
        console.log(
          chalk.green(`[${account.email}] ✅ LOGIN SUKSES! Sesi tersimpan.`)
        );
    } else {
      // Cek Error Alert
      const errorMsg = await page
        .textContent(".alert")
        .catch(() => "Unknown Error");

      // Cek apakah balik ke login karena captcha salah/expired
      if (page.url().includes("/login")) {
        throw new Error(
          `Login Gagal (Mungkin Captcha/Pass Salah). Pesan: ${errorMsg.trim()}`
        );
      }

      throw new Error(`Unknown Login State. URL: ${page.url()}`);
    }
  } catch (error) {
    // Error log tetap ditampilkan meski mode refresh
    console.log(chalk.red(`[${account.email}] ❌ Gagal: ${error.message}`));

    // Screenshot hanya jika page berhasil dibuat
    if (page) {
      try {
        await page.screenshot({
          path: `./screenshots/error_login_${account.email}.png`,
        });
        if (!isRefresh)
          console.log(chalk.dim(`   📸 Screenshot error tersimpan.`));
      } catch (e) {
        // Ignore error screenshot
      }
    }
  } finally {
    if (browser) await browser.close();
  }
}

async function loginAllAccounts(accounts) {
  console.log(chalk.blue("\n════ LOGIN SEMUA AKUN ════"));
  for (const acc of accounts) {
    await loginSingleAccount(acc);
  }
  console.log(chalk.blue("════ SELESAI ════"));
}

module.exports = { loginAllAccounts, loginSingleAccount }; // Export loginSingleAccount juga
