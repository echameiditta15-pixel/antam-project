const { chromium } = require("playwright");
const chalk = require("chalk");
const fs = require("fs");
const { proxyConfig, getSiteName, siteKeys } = require("../../config/config");
const { loadSettings } = require("../data/settings");
const { solveRecaptchaV2 } = require("../utils/solver");
const { ensureSessionValid } = require("../auth/sessionGuard");
const { sendTelegramMsg } = require("../utils/telegram");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DB_WAKDA_PATH = "./database/wakda.json";

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
  console.log(
    chalk.bgRed.white.bold(" 🚀 SNIPER API: STRICT VALIDATION (ANTI-PHP) ")
  );
  console.log(
    chalk.dim(`Target: ${getSiteName(targetSiteId)} | Akun: ${account.email}`)
  );

  await ensureSessionValid(account);
  const sessionFile = `./session/${account.email}.json`;
  if (!fs.existsSync(sessionFile))
    return console.log(chalk.red("❌ Session hilang! Login dulu."));

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
        console.log(
          chalk.green(`✅ Menggunakan ID Wakda Terbaru dari Database.`)
        );
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

    console.log(chalk.blue("\n⏳ COUNTDOWN TO API LAUNCH..."));
    let lastHeartbeat = Date.now();

    while (true) {
      const now = new Date();
      const diffSec = Math.floor((targetTime - now) / 1000);

      if (diffSec > 0) {
        process.stdout.write(
          `\r⏰ T - ${diffSec}s | Captcha: ${
            preSolvedCaptcha ? "✅" : isSolving ? "⏳ Solving..." : "❌"
          } `
        );
      }

      // Heartbeat (30 detik)
      if (diffSec > 60 && Date.now() - lastHeartbeat > 30000) {
        try {
          await page.reload({ waitUntil: "domcontentloaded" });
          if (page.url().includes("login"))
            await performEmergencyLogin(page, account);
          csrfToken = await getCsrfToken(page, context);
        } catch (e) {}
        lastHeartbeat = Date.now();
      }

      // Pre-Solve Early Bird (100 Detik)
      if (diffSec <= 100 && diffSec > 0 && !preSolvedCaptcha && !isSolving) {
        isSolving = true;
        console.log(chalk.yellow("\n\n🧩 Pre-Solving Captcha (Early Bird)..."));
        solveRecaptchaV2(page.url(), siteKeys.antrean)
          .then((t) => {
            preSolvedCaptcha = t;
            console.log(chalk.green("\n✅ Captcha SIAP TEMPUR!"));
          })
          .catch((e) => {
            console.log(chalk.red("\n❌ Gagal solve, reset kunci."));
            isSolving = false;
          });
      }

      // --- FIRE ---
      if (diffSec <= 0) {
        console.log(chalk.magenta.bold("\n\n🚀 LAUNCHING API MISSILES!!!"));

        if (!preSolvedCaptcha) {
          console.log("⚠️ Darurat: Solving Captcha on-the-fly...");
          preSolvedCaptcha = await solveRecaptchaV2(
            page.url(),
            siteKeys.antrean
          );
        }

        const requests = [];

        for (const wakdaId of targetWakdaList) {
          const formattedJam =
            jamString.length === 5 ? `${jamString}:00` : jamString;

          const formData = {
            csrf_test_name: csrfToken,
            wakda: wakdaId,
            id_cabang: targetSiteId,
            jam_slot: formattedJam,
            waktu: "",
            token: tokenUrl,
            "g-recaptcha-response": preSolvedCaptcha,
          };

          requests.push(
            context.request
              .post("https://antrean.logammulia.com/antrean-ambil", {
                form: formData,
                headers: { Referer: targetUrl },
              })
              .then(async (response) => {
                const text = await response.text();
                // Cek Indikasi Sukses (API Level)
                if (
                  response.status() === 200 &&
                  !text.includes("penuh") &&
                  !text.includes("Gagal") &&
                  !text.includes("Habis") &&
                  !text.includes("Login") &&
                  !text.includes("Pengumuman") &&
                  !text.includes("Just a moment")
                ) {
                  console.log(
                    chalk.bgGreen.black(
                      ` ✅ HIT WAKDA ${wakdaId}: INDICATED SUCCESS! `
                    )
                  );
                  // JANGAN KIRIM NOTIF DULU! TUNGGU VALIDASI VISUAL!
                  return true;
                }
                return false;
              })
              .catch(() => false)
          );
        }

        console.log(
          chalk.yellow(`🔥 Sending ${requests.length} Concurrent Requests...`)
        );
        const results = await Promise.all(requests);

        // --- VALIDASI VISUAL (PENENTU KEBENARAN) ---
        console.log(chalk.cyan("\n🏁 Validasi: Refresh Halaman..."));
        await page.goto(targetUrl, {
          waitUntil: "networkidle",
          timeout: 30000,
        });

        // Cek Barcode / Nomor Antrean
        const isBarcodeVisible = await page.evaluate(
          () =>
            document.body.innerText.includes("Nomor Antrean") ||
            document.body.innerText.includes("Barcode") ||
            document.querySelector(".barcode-container") !== null
        );

        await page.screenshot({
          path: `./screenshots/BUKTI_TIKET_${Date.now()}.png`,
        });

        // HANYA JIKA BARCODE MUNCUL, KITA RAYAKAN
        if (isBarcodeVisible) {
          console.log(
            chalk.bgGreen.white.bold(" 🎉 JACKPOT! TIKET MUNCUL DI LAYAR! 🎉 ")
          );
          console.log(chalk.green("Cek folder screenshots!"));

          // BARU KIRIM TELEGRAM
          sendTelegramMsg(
            `🎉 <b>JACKPOT VALID!</b>\nAkun: ${account.email}\nTiket sudah diamankan.`
          );
        } else {
          // Kalau API bilang sukses tapi gak ada barcode = PHP
          if (results.includes(true)) {
            console.log(
              chalk.red(
                "❌ FALSE POSITIVE: API Tembus tapi Tiket Gak Muncul (PHP)."
              )
            );
          } else {
            console.log(chalk.red("❌ Gagal. Tidak ada tiket di layar."));
          }

          if (page.url().includes("/home"))
            console.log(chalk.yellow("⚠️ Info: Mental ke Home (Sesi habis)."));
        }

        break;
      }
      await delay(1000);
    }
  } catch (error) {
    console.error(chalk.red(`CRASH: ${error.message}`));
  } finally {
    console.log("Selesai.");
  }
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
