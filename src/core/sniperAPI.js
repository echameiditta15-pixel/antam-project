const { chromium } = require("playwright");
const chalk = require("chalk");
const fs = require("fs");
const path = require("path");
const { proxyConfig, getSiteName, siteKeys } = require("../../config/config");
const { loadSettings } = require("../data/settings");
const { solveRecaptchaV2 } = require("../utils/solver");
const { ensureSessionValid } = require("../auth/sessionGuard");
const { sendTelegramMsg } = require("../utils/telegram");
const { getTimeOffset } = require("../utils/ntp");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DB_WAKDA_PATH = "./database/wakda.json";

async function startSniperAPI(account, targetSiteId) {
  console.clear();
  console.log(chalk.bgRed.white.bold(" 🚀 SNIPER: TURBO CLICKER MODE "));
  console.log(
    chalk.dim(`Target: ${getSiteName(targetSiteId)} | Akun: ${account.email}`)
  );

  const timeOffset = await getTimeOffset();
  await ensureSessionValid(account);

  const sessionFile = `./session/${account.email}.json`;
  if (!fs.existsSync(sessionFile))
    return console.log(chalk.red("❌ Session hilang!"));

  const settings = loadSettings();
  const cookies = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));

  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const contextOptions = {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
    extraHTTPHeaders: {
      Referer: "https://antrean.logammulia.com/antrean",
      Origin: "https://antrean.logammulia.com",
    },
  };
  if (settings.useProxy) contextOptions.proxy = proxyConfig;

  const context = await browser.newContext(contextOptions);
  await context.addCookies(cookies);
  const page = await context.newPage();

  let targetUrl = "";
  let preSolvedCaptcha = null;
  let isSolving = false;

  try {
    console.log(chalk.cyan("🔄 Masuk ke Dashboard..."));
    await page.goto("https://antrean.logammulia.com/antrean", {
      waitUntil: "domcontentloaded",
    });

    if (page.url().includes("login"))
      await performEmergencyLogin(page, account);

    console.log(chalk.yellow("🕵️ Masuk Halaman Cabang..."));
    try {
      await page.waitForSelector("select#site", { timeout: 15000 });
      await page.selectOption("select#site", targetSiteId);
      await page.waitForTimeout(500);
      const tokenUrl = await page.inputValue("input#t");
      targetUrl = `https://antrean.logammulia.com/antrean?site=${targetSiteId}&t=${tokenUrl}`;
      await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    } catch (e) {
      console.log(chalk.red("❌ Gagal Infiltrasi."));
      await browser.close();
      return;
    }

    // --- PARSING WAKTU ---
    const bodyText = await page.innerText("body");
    const timeMatch = bodyText.match(/Pukul\s+(\d{2}:\d{2})/);
    let targetTime = new Date();

    if (timeMatch) {
      const [h, m] = timeMatch[1].split(":");
      targetTime.setHours(parseInt(h), parseInt(m), 0, 0);
      console.log(chalk.greenBright(`📅 Target Lock: ${timeMatch[1]} WIB`));
    } else {
      console.log(chalk.red("⚠️ Jam manual +1 menit."));
      targetTime.setMinutes(targetTime.getMinutes() + 1);
    }

    console.log(chalk.blue("\n⏳ COUNTDOWN..."));
    let lastHeartbeat = Date.now();

    while (true) {
      const now = new Date(Date.now() + timeOffset);
      const diffSec = Math.floor((targetTime - now) / 1000);
      const diffMs = targetTime - now;

      if (diffSec > 0)
        process.stdout.write(
          `\r⏰ T - ${diffSec}s | Captcha: ${preSolvedCaptcha ? "✅" : "❌"}   `
        );

      // Heartbeat
      if (diffSec > 60 && Date.now() - lastHeartbeat > 30000) {
        try {
          await page.reload({ waitUntil: "domcontentloaded" });
        } catch (e) {}
        lastHeartbeat = Date.now();
      }

      // Pre-Solve
      if (diffSec <= 100 && diffSec > 0 && !preSolvedCaptcha && !isSolving) {
        isSolving = true;
        console.log(chalk.yellow("\n\n🧩 Pre-Solving Captcha..."));
        solveRecaptchaV2(page.url(), siteKeys.antrean)
          .then((t) => {
            preSolvedCaptcha = t;
            console.log(chalk.green("\n✅ Captcha Ready!"));
          })
          .catch((e) => {
            isSolving = false;
          });
      }

      // --- FASE PERSIAPAN FINAL (T-2 Detik) ---
      // Kita refresh halaman di detik -2 agar dropdown muncul
      if (diffMs <= 2000 && diffMs > 0) {
        console.log(chalk.yellow("\n🔄 Final Refresh..."));
        await page.reload({ waitUntil: "domcontentloaded" });
      }

      // --- THE KILL SHOT (T-0 Detik) ---
      if (diffMs <= 0) {
        console.log(chalk.magenta.bold("\n\n🔥 FIRE !!!"));

        if (!preSolvedCaptcha)
          preSolvedCaptcha = await solveRecaptchaV2(
            page.url(),
            siteKeys.antrean
          );

        // 1. Pilih Slot (Cepat)
        const slotFound = await page.evaluate(() => {
          const s = document.querySelector("select#wakda");
          if (!s) return null;
          const opts = Array.from(s.options).filter(
            (o) => !o.disabled && o.value !== ""
          );
          return opts.length > 0 ? opts[0].value : null;
        });

        if (slotFound) {
          console.log(chalk.green(`✅ Slot: ${slotFound}`));
          await page.selectOption("select#wakda", slotFound);

          // 2. Inject Captcha
          await page.evaluate((t) => {
            document.getElementById("g-recaptcha-response").innerHTML = t;
          }, preSolvedCaptcha);

          // 3. KLIK SUBMIT (Native Click)
          console.log(chalk.magenta("🖱️ CLICKING BUTTON..."));
          await page.click('button[type="submit"]');

          // Tunggu Hasil
          try {
            await page.waitForNavigation({ timeout: 10000 });
          } catch (e) {}

          // Cek Sukses
          if (page.url().includes("success") || page.url().includes("tiket")) {
            console.log(chalk.bgGreen.white(" 🎉 JACKPOT! 🎉 "));
            sendTelegramMsg(`🎉 <b>JACKPOT!</b> Akun: ${account.email}`);
            await page.screenshot({
              path: `./screenshots/WIN_${Date.now()}.png`,
            });
          } else {
            console.log(chalk.red("❌ Gagal."));
            await page.screenshot({
              path: `./screenshots/FAIL_${Date.now()}.png`,
            });
          }
        } else {
          console.log(chalk.red("❌ Slot belum muncul/penuh."));
        }
        break;
      }
      await delay(50);
    }
  } catch (error) {
    console.error(chalk.red(`CRASH: ${error.message}`));
  } finally {
    console.log("Selesai.");
  }
}

// ... (Helper functions login darurat copy dari sebelumnya) ...
async function performEmergencyLogin(page, account) {
  // ... (sama seperti sebelumnya)
  try {
    await page.waitForSelector("#username", { timeout: 5000 });
    await page.fill("#username", account.email);
    await page.fill("#password", account.password);
    const t = await solveRecaptchaV2(page.url(), siteKeys.login);
    await page.evaluate((tk) => {
      document.getElementById("g-recaptcha-response").innerHTML = tk;
    }, t);
    await page.click('button[type="submit"]');
    await page.waitForNavigation();
    console.log(chalk.green("✅ Re-Login Berhasil."));
  } catch (e) {
    console.log(chalk.red("❌ Gagal Re-Login Darurat: " + e.message));
  }
}

module.exports = { startSniperAPI };
