const { chromium } = require("playwright");
const chalk = require("chalk");
const fs = require("fs");
const { proxyConfig, secretMap, getSiteName, siteKeys } = require("./config");
const { solveRecaptchaV2 } = require("./solver");
const { loadSettings } = require("./settings");
const { ensureSessionValid } = require("./sessionGuard");

async function executeWarSingle(account, targetSiteId) {
  console.log(chalk.blue(`\n⚔️  MEMULAI PERANG: ${chalk.bold(account.email)}`));

  // 1. SESSION GUARD
  await ensureSessionValid(account);

  const sessionFile = `./session/${account.email}.json`;
  if (!fs.existsSync(sessionFile)) {
    console.log(chalk.red(`❌ Session hilang! Login dulu.`));
    return;
  }

  const settings = loadSettings();
  if (!fs.existsSync("./screenshots")) fs.mkdirSync("./screenshots");

  const cookies = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));
  const siteToken = secretMap[targetSiteId];
  const targetUrl = `https://antrean.logammulia.com/antrean?site=${targetSiteId}&t=${siteToken}`;

  const proxyStatus = settings.useProxy ? chalk.green("ON") : chalk.red("OFF");
  console.log(
    chalk.dim(
      `   Config: Headless [${settings.headless}] | Proxy [${proxyStatus}]`
    )
  );

  const browser = await chromium.launch({
    headless: settings.headless,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const contextOptions = {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
    // PENTING: Tambahkan extraHeaders agar terlihat seperti user asli
    extraHTTPHeaders: {
      Referer: "https://antrean.logammulia.com/users",
      Origin: "https://antrean.logammulia.com",
    },
  };

  if (settings.useProxy) contextOptions.proxy = proxyConfig;

  const context = await browser.newContext(contextOptions);
  await context.addCookies(cookies);
  const page = await context.newPage();

  console.time("⏱️ Durasi Eksekusi");

  try {
    // --- STEP PEMANASAN (WAJIB) ---
    console.log(chalk.cyan(`🔄 Pemanasan: Masuk ke Dashboard dulu...`));
    await page.goto("https://antrean.logammulia.com/users", { timeout: 30000 });

    // Validasi: Kalau malah ke login, berarti session mati
    if (page.url().includes("login"))
      throw new Error("Session Expired (Kick to Login)");

    // --- STEP EKSEKUSI TARGET ---
    console.log(chalk.yellow(`🚀 Meluncur ke ${getSiteName(targetSiteId)}...`));

    // Kita gunakan goto, karena header Referer sudah di-set di context, server akan mengira kita dari /users
    await page.goto(targetUrl, {
      timeout: 30000,
      waitUntil: "domcontentloaded",
    });

    // Cek lagi apakah ditendang ke home?
    if (
      page.url().includes("/home") ||
      page.url() === "https://antrean.logammulia.com/"
    ) {
      throw new Error("DITENDANG KE HOME! (Deep Link Protection Active)");
    }

    // 3. Cek Slot Waktu
    console.log(chalk.cyan("👀 Mencari slot waktu tersedia..."));
    await page
      .waitForSelector("select#wakda", { timeout: 5000 })
      .catch(() => null);

    const availableSlots = await page.evaluate(() => {
      const options = Array.from(
        document.querySelectorAll("select#wakda option")
      );
      return options
        .filter((opt) => !opt.disabled && opt.value !== "")
        .map((opt) => opt.value);
    });

    if (availableSlots.length === 0) {
      console.log(chalk.red("❌ TIDAK ADA SLOT! (Penuh/Belum Buka)"));
      await browser.close();
      return;
    }

    const targetSlot = availableSlots[0];
    console.log(chalk.greenBright(`✅ Slot Ditemukan! ID: ${targetSlot}.`));
    await page.selectOption("select#wakda", targetSlot);

    // 4. SOLVE CAPTCHA
    console.log(chalk.bgYellow.black(" 🧩 START SOLVING CAPTCHA "));
    const tokenCaptcha = await solveRecaptchaV2(page.url(), siteKeys.antrean);
    if (!tokenCaptcha) throw new Error("Gagal mendapatkan token Captcha");

    console.log(chalk.blue("💉 Inject Token..."));
    await page.evaluate((token) => {
      document.getElementById("g-recaptcha-response").innerHTML = token;
    }, tokenCaptcha);

    // 5. EKSEKUSI
    console.log(chalk.magenta("🔥 TEMBAK TOMBOL AMBIL..."));
    await Promise.all([
      page.waitForNavigation({ timeout: 60000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);

    const finalUrl = page.url();
    if (finalUrl.includes("success") || finalUrl.includes("tiket")) {
      console.log(chalk.green.bold("\n🎉🎉 SUCCESS! TIKET DIAMANKAN! 🎉🎉"));
      await page.screenshot({
        path: `./screenshots/SUCCESS_${account.email}_${Date.now()}.png`,
      });
    } else if (finalUrl.includes("antrean")) {
      const errorText = await page
        .locator(".alert")
        .textContent()
        .catch(() => "Unknown Error");
      console.log(chalk.red(`❌ Gagal: ${errorText.trim()}`));
      await page.screenshot({
        path: `./screenshots/FAILED_${account.email}.png`,
      });
    } else {
      console.log(chalk.yellow("⚠️ Status tidak diketahui."));
    }
  } catch (error) {
    console.error(chalk.red(`\n❌ EROR WAR: ${error.message}`));
    if (page)
      await page.screenshot({
        path: `./screenshots/error_war_${account.email}.png`,
      });
  } finally {
    console.timeEnd("⏱️ Durasi Eksekusi");
    if (browser) await browser.close();
  }
}

module.exports = { executeWarSingle };
