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
const { logWarHistory } = require("../utils/historyLogger"); // <--- IMPORT BARU

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DB_WAKDA_PATH = "./database/wakda.json";

// Helper: Simpan Log Data Mentah
function saveDebugData(label, data, ext = "html") {
  const logDir = "./logs/debug_dumps";
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const filename = `${label}_${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(logDir, filename), data);
  return filename;
}

const wakdaMapFallback = {
  6: ["1", "2", "3", "4", "5"],
  3: ["11", "12"],
  8: ["45", "32"],
  19: ["44"],
  16: ["49"],
  17: ["43"],
  20: ["47"],
  21: ["48"],
  23: ["46"],
  5: ["50"],
  24: ["51"],
  1: ["1", "2"],
  11: ["1", "2"],
  10: ["1", "2"],
};

async function startSniperAPI(account, targetSiteId) {
  console.clear();
  console.log(chalk.bgRed.white.bold(" 🚀 SNIPER API: DATA LOGGER EDITION "));
  console.log(
    chalk.dim(`Target: ${getSiteName(targetSiteId)} | Akun: ${account.email}`)
  );

  const startTime = Date.now(); // Timer mulai
  const timeOffset = await getTimeOffset();
  await ensureSessionValid(account);

  const sessionFile = `./session/${account.email}.json`;
  if (!fs.existsSync(sessionFile))
    return console.log(chalk.red("❌ Session hilang!"));

  const settings = loadSettings();
  const cookies = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));

  let targetWakdaList = null;
  try {
    if (fs.existsSync(DB_WAKDA_PATH)) {
      const dbData = JSON.parse(fs.readFileSync(DB_WAKDA_PATH, "utf-8"));
      if (
        Array.isArray(dbData[targetSiteId]) &&
        dbData[targetSiteId].length > 0
      ) {
        targetWakdaList = dbData[targetSiteId];
        console.log(chalk.green(`✅ Menggunakan ID Wakda Database.`));
      }
    }
  } catch (e) {}

  if (!targetWakdaList || targetWakdaList.length === 0) {
    targetWakdaList =
      wakdaMapFallback[targetSiteId] ||
      Array.from({ length: 50 }, (_, i) => String(i + 1));
  }
  console.log(chalk.cyan(`🎯 Target IDs: [${targetWakdaList.join(", ")}]`));

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
  let tokenUrl = "";
  let csrfToken = "";
  let preSolvedCaptcha = null;
  let isSolving = false;

  try {
    console.log(chalk.cyan("🔄 Masuk ke Dashboard..."));
    await page.goto("https://antrean.logammulia.com/antrean", {
      waitUntil: "domcontentloaded",
    });

    if (page.url().includes("login")) {
      await performEmergencyLogin(page, account);
    }

    try {
      await page.waitForSelector("select#site", { timeout: 15000 });
      await page.selectOption("select#site", targetSiteId);
      await page.waitForTimeout(500);
      tokenUrl = await page.inputValue("input#t");
    } catch (e) {
      console.log(chalk.red("❌ Gagal ambil token URL."));
      await browser.close();
      return;
    }

    if (!tokenUrl) throw new Error("Token URL kosong.");

    csrfToken = await getCsrfToken(page, context);
    console.log(chalk.green(`✅ CSRF Awal: ${csrfToken.substring(0, 10)}...`));

    targetUrl = `https://antrean.logammulia.com/antrean?site=${targetSiteId}&t=${tokenUrl}`;
    console.log(chalk.yellow(`🚀 Standby di URL Target...`));
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

    const bodyText = await page.innerText("body");
    const timeMatch = bodyText.match(/Pukul\s+(\d{2}:\d{2})/);
    let targetTime = new Date();
    let jamString = "UNKNOWN";

    if (timeMatch) {
      jamString = timeMatch[1];
      const [h, m] = jamString.split(":");
      targetTime.setHours(parseInt(h), parseInt(m), 0, 0);
      console.log(chalk.greenBright(`📅 Target Lock: ${jamString} WIB`));
    } else {
      console.log(chalk.red("⚠️ Jam tidak terdeteksi. Set manual: +1 menit."));
      targetTime.setMinutes(targetTime.getMinutes() + 1);
      jamString = `${targetTime
        .getHours()
        .toString()
        .padStart(2, "0")}:${targetTime
        .getMinutes()
        .toString()
        .padStart(2, "0")}`;
    }

    console.log(chalk.blue("\n⏳ COUNTDOWN..."));
    let lastHeartbeat = Date.now();

    while (true) {
      const now = new Date(Date.now() + timeOffset);
      const diffSec = Math.floor((targetTime - now) / 1000);
      const diffMs = targetTime - now;

      if (diffSec > 0) {
        process.stdout.write(
          `\r⏰ T - ${diffSec}s | Captcha: ${
            preSolvedCaptcha ? "✅" : isSolving ? "⏳" : "❌"
          }   `
        );
      }

      if (diffSec > 60 && Date.now() - lastHeartbeat > 30000) {
        try {
          await page.reload({ waitUntil: "domcontentloaded" });
          if (page.url().includes("login"))
            await performEmergencyLogin(page, account);
          csrfToken = await getCsrfToken(page, context);
        } catch (e) {}
        lastHeartbeat = Date.now();
      }

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

      // --- FIRE ---
      if (diffMs <= 200) {
        console.log(chalk.magenta.bold("\n\n🚀 GATLING GUN ACTIVATED !!!"));

        if (!preSolvedCaptcha)
          preSolvedCaptcha = await solveRecaptchaV2(
            page.url(),
            siteKeys.antrean
          );

        const burstCount = 5;
        const burstDelay = 100;
        const allPromises = [];

        // Kita butuh simpan status akhir untuk log
        let finalStatus = "FAIL";
        let finalWakda = "";
        let finalMsg = "Tidak ada hit positif";

        for (let i = 0; i < burstCount; i++) {
          console.log(chalk.yellow(`   🔥 BURST #${i + 1}...`));
          const wavePromises = targetWakdaList.map((wakdaId) => {
            return shootRequestAndRecord(
              page,
              csrfToken,
              wakdaId,
              targetSiteId,
              jamString,
              tokenUrl,
              preSolvedCaptcha
            );
          });
          allPromises.push(...wavePromises);
          await delay(burstDelay);
        }

        const results = await Promise.all(allPromises);
        const hit = results.find((r) => r.success);

        // Dump Sample
        if (results.length > 0)
          saveDebugData("LAST_RESP", results[0].body, "html");

        console.log(chalk.cyan("\n🏁 Validasi Visual..."));
        await page.goto(targetUrl, {
          waitUntil: "networkidle",
          timeout: 30000,
        });

        const isBarcodeVisible = await page.evaluate(
          () =>
            document.body.innerText.includes("Nomor Antrean") ||
            document.body.innerText.includes("Barcode")
        );
        await page.screenshot({
          path: `./screenshots/FINAL_${Date.now()}.png`,
        });

        if (isBarcodeVisible) {
          console.log(chalk.bgGreen.white.bold(" 🎉 JACKPOT VALID! 🎉 "));
          sendTelegramMsg(`🎉 <b>JACKPOT!</b>\nAkun: ${account.email}`);
          finalStatus = "SUCCESS";
          finalMsg = "Tiket Barcode Muncul";
          if (hit) finalWakda = hit.id;
        } else {
          console.log(chalk.red("❌ Gagal."));
          if (results.includes(true))
            finalMsg = "PHP (API 200 tapi Visual Gagal)";
          else finalMsg = "API Gagal / Penuh";
        }

        // --- CATAT KE FILE CSV ---
        const duration = Date.now() - startTime;
        logWarHistory({
          siteName: getSiteName(targetSiteId),
          email: account.email,
          wakda: finalWakda || targetWakdaList.join("|"),
          status: finalStatus,
          duration: duration,
          message: finalMsg,
        });
        console.log(
          chalk.gray(`   📝 History perang tercatat di history_log.csv`)
        );
        // -------------------------

        break;
      }
      await delay(50);
    }
  } catch (error) {
    console.error(chalk.red(`CRASH: ${error.message}`));
    // Catat Error juga
    logWarHistory({
      siteName: getSiteName(targetSiteId),
      email: account.email,
      wakda: "?",
      status: "ERROR",
      duration: 0,
      message: error.message,
    });
  } finally {
    console.log("Selesai.");
  }
}

// ... (Fungsi Helper lain tetap sama: shootRequestAndRecord, getCsrf, performLogin) ...
// Pastikan fungsi shootRequestAndRecord juga ada di file ini (copy dari sebelumnya)

async function shootRequestAndRecord(
  page,
  csrf,
  wakda,
  branch,
  jam,
  token,
  captcha
) {
  return await page.evaluate(
    async (data) => {
      try {
        const formData = new URLSearchParams();
        formData.append("csrf_test_name", data.csrf);
        formData.append("wakda", data.wakda);
        formData.append("id_cabang", data.branch);
        formData.append("jam_slot", data.jam);
        formData.append("waktu", "");
        formData.append("token", data.token);
        formData.append("g-recaptcha-response", data.captcha);

        const response = await fetch(
          "https://antrean.logammulia.com/antrean-ambil",
          {
            method: "POST",
            body: formData,
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
          }
        );
        const text = await response.text();
        const isSuccess =
          response.status === 200 &&
          !text.includes("penuh") &&
          !text.includes("Gagal") &&
          !text.includes("Habis") &&
          !text.includes("Login");
        return {
          success: isSuccess,
          id: data.wakda,
          body: text,
          status: response.status,
        };
      } catch (e) {
        return { success: false, id: data.wakda, body: e.message, status: 0 };
      }
    },
    { csrf, wakda, branch, jam, token, captcha }
  );
}

async function getCsrfToken(page, context) {
  const currentCookies = await context.cookies();
  const csrfCookie = currentCookies.find(
    (c) => c.name === "csrf_cookie_name" || c.name === "csrf_test_name"
  );
  if (csrfCookie) return csrfCookie.value;
  return await page.inputValue('input[name="csrf_test_name"]').catch(() => "");
}

async function performEmergencyLogin(page, account) {
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
