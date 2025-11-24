// --- UPGRADE: PAKE PLAYWRIGHT-EXTRA ---
const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth")();
chromium.use(stealth);

const fs = require("fs");
const chalk = require("chalk");
const { proxyConfig, siteKeys } = require("../../config/config");
const { solveRecaptchaV2 } = require("../utils/solver");
const { loadSettings } = require("../data/settings");

if (!fs.existsSync("./session")) fs.mkdirSync("./session");
if (!fs.existsSync("./screenshots")) fs.mkdirSync("./screenshots");

async function loginSingleAccount(account, isRefresh = false) {
  const sessionFile = `./session/${account.email}.json`;
  const settings = loadSettings();

  if (!isRefresh) {
    console.log(
      chalk.cyan(`[${account.email}] Inisialisasi Browser (Stealth)...`)
    );
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
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });

  const contextOptions = {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1366, height: 768 },
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
  };

  if (settings.useProxy) {
    contextOptions.proxy = proxyConfig;
  }

  const context = await browser.newContext(contextOptions);
  let page = null;

  try {
    page = await context.newPage();

    // Anti-Detection
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    if (!isRefresh)
      console.log(chalk.cyan(`[${account.email}] Mengakses Halaman Login...`));

    await page.goto("https://antrean.logammulia.com/login", {
      timeout: 60000,
      waitUntil: "domcontentloaded",
    });

    // --- ZONE 1: SMART CLOUDFLARE BYPASS ---
    const title = await page.title();
    const isBlocked =
      title.includes("Just a moment") || title.includes("Bot Verification");

    if (isBlocked) {
      if (!isRefresh)
        console.log(chalk.yellow(`⚠️ Terhadang Verifikasi. Mencoba Bypass...`));

      // Cek iframes (ReCaptcha Checkbox)
      try {
        const frameElement = await page.waitForSelector(
          'iframe[src*="recaptcha"]',
          { timeout: 5000 }
        );
        if (frameElement) {
          if (!isRefresh)
            console.log(chalk.blue("🤖 Klik checkbox 'I am not a robot'..."));
          const frame = await frameElement.contentFrame();
          await frame.click(".recaptcha-checkbox-border");
          await page.waitForTimeout(2000);
        }
      } catch (e) {
        // Ignore kalau gak ada checkbox (mungkin turnstile putar sendiri)
      }

      // Tunggu masuk login asli
      try {
        await page.waitForSelector("#username", { timeout: 30000 });
        if (!isRefresh) console.log(chalk.green("✅ Lolos Cloudflare!"));
      } catch (e) {
        await page.screenshot({
          path: `./screenshots/stuck_cloudflare_${account.email}.png`,
        });
        throw new Error(
          "Gagal menembus Cloudflare (IP Kotor/Headless Terdeteksi)."
        );
      }
    }

    // 2. Isi Form
    if (!isRefresh)
      console.log(chalk.cyan(`[${account.email}] Mengisi Form...`));
    await page.fill("#username", account.email);
    await page.fill("#password", account.password);

    if (await page.isVisible("#customCheckb1")) {
      await page.check("#customCheckb1");
    }

    // 3. Handle Captcha
    if (!isRefresh)
      console.log(chalk.yellow(`[${account.email}] Solving Captcha...`));
    const tokenLogin = await solveRecaptchaV2(page.url(), siteKeys.login);

    await page.evaluate((token) => {
      document.getElementById("g-recaptcha-response").innerHTML = token;
    }, tokenLogin);

    // 4. Klik Login
    if (!isRefresh)
      console.log(chalk.blue(`[${account.email}] Submit Login...`));

    await Promise.all([
      page.waitForNavigation({ timeout: 60000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);

    // --- [REDIRECT HANDLER] ---
    const currentUrl = page.url();
    if (
      currentUrl.includes("/home") ||
      currentUrl === "https://antrean.logammulia.com/"
    ) {
      if (!isRefresh)
        console.log(
          chalk.yellow(`   ⚠️ Redirected ke Home. Memaksa masuk Dashboard...`)
        );
      try {
        await page.goto("https://antrean.logammulia.com/users", {
          waitUntil: "domcontentloaded",
        });
      } catch (e) {}
    }

    // 5. Validasi Akhir
    const isDashboard = page.url().includes("/users");
    const hasLogout = await page.isVisible('a[href*="logout"]');

    if (isDashboard || hasLogout) {
      const cookies = await context.cookies();
      if (fs.existsSync(sessionFile))
        try {
          fs.unlinkSync(sessionFile);
        } catch (e) {}
      fs.writeFileSync(sessionFile, JSON.stringify(cookies, null, 2));

      if (!isRefresh)
        console.log(chalk.green(`[${account.email}] ✅ LOGIN SUKSES!`));
    } else {
      const errorAlert = await page
        .locator(".alert")
        .textContent()
        .catch(() => "");
      if (page.url().includes("/login")) {
        throw new Error(
          `Login Ditolak: ${errorAlert.trim() || "Mungkin Captcha Expired"}`
        );
      }
      await page.screenshot({
        path: `./screenshots/unknown_state_${account.email}.png`,
      });
      throw new Error(`Gagal Validasi Sesi. URL Akhir: ${page.url()}`);
    }
  } catch (error) {
    console.log(chalk.red(`[${account.email}] ❌ Gagal: ${error.message}`));
    if (page)
      try {
        await page.screenshot({
          path: `./screenshots/error_login_${account.email}.png`,
        });
      } catch (e) {}
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

module.exports = { loginAllAccounts, loginSingleAccount };
