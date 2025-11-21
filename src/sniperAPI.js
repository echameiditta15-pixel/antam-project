const { chromium } = require("playwright");
const chalk = require("chalk");
const fs = require("fs");
const { proxyConfig, getSiteName, siteKeys } = require("./config");
const { loadSettings } = require("./settings");
const { solveRecaptchaV2 } = require("./solver");
const { ensureSessionValid } = require("./sessionGuard");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// DATABASE WAKDA
const wakdaMap = {
  6: ["1", "2", "3", "4", "5"],
  3: ["11", "12"],
  8: ["45", "32"],
  19: ["44"],
  16: ["49"],
  17: ["43"],
  20: ["47"],
  21: ["48"],
  23: ["46"],
  1: ["1", "2"],
  11: ["1", "2"],
  10: ["1", "2"],
};

async function startSniperAPI(account, targetSiteId) {
  console.clear();
  console.log(chalk.bgRed.white.bold(" 🚀 SNIPER API: BARCODE CHECK MODE "));
  console.log(
    chalk.dim(`Target: ${getSiteName(targetSiteId)} | Akun: ${account.email}`)
  );

  await ensureSessionValid(account);
  const sessionFile = `./session/${account.email}.json`;
  if (!fs.existsSync(sessionFile))
    return console.log(chalk.red("❌ Session hilang! Login dulu."));

  const settings = loadSettings();
  const cookies = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));

  // Tentukan Target Wakda
  let targetWakdaList = wakdaMap[targetSiteId];
  if (!targetWakdaList) {
    console.log(
      chalk.yellow(
        `⚠️ ID Wakda belum dipetakan. Menggunakan mode BRUTE FORCE (1-50).`
      )
    );
    targetWakdaList = Array.from({ length: 50 }, (_, i) => String(i + 1));
  }
  console.log(
    chalk.cyan(`🎯 Peluru Wakda Siap: [${targetWakdaList.join(", ")}]`)
  );

  // Browser VISIBLE (Headless: False) agar bisa screenshot barcode
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

  try {
    // --- STEP 1: INFILTRASI ---
    console.log(chalk.cyan("🔄 Masuk ke Dashboard..."));
    await page.goto("https://antrean.logammulia.com/antrean", {
      waitUntil: "domcontentloaded",
    });

    if (page.url().includes("login")) {
      console.log(chalk.red("⚠️ Terdeteksi Logout. Login ulang..."));
      await performEmergencyLogin(page, account);
    }

    // Ambil Token URL
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

    // Ambil CSRF
    csrfToken = await getCsrfToken(page, context);
    console.log(chalk.green(`✅ CSRF Awal: ${csrfToken.substring(0, 10)}...`));

    targetUrl = `https://antrean.logammulia.com/antrean?site=${targetSiteId}&t=${tokenUrl}`;
    console.log(chalk.yellow(`🚀 Standby di URL Target...`));
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

    // --- STEP 2: PARSING WAKTU ---
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

    // --- STEP 3: WAITING ---
    console.log(chalk.blue("\n⏳ COUNTDOWN TO API LAUNCH..."));
    let lastHeartbeat = Date.now();

    while (true) {
      const now = new Date();
      const diffSec = Math.floor((targetTime - now) / 1000);

      if (diffSec > 0) {
        process.stdout.write(
          `\r⏰ T - ${diffSec}s | Captcha: ${preSolvedCaptcha ? "✅" : "❌"} `
        );
      }

      // Heartbeat
      if (diffSec > 60 && Date.now() - lastHeartbeat > 50000) {
        console.log(chalk.cyan("\n💓 Heartbeat: Refreshing Session..."));
        try {
          await page.reload({ waitUntil: "domcontentloaded" });
          if (page.url().includes("login")) {
            await performEmergencyLogin(page, account);
            await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
          }
          csrfToken = await getCsrfToken(page, context);
        } catch (e) {}
        lastHeartbeat = Date.now();
      }

      // Pre-Solve Captcha
      if (diffSec <= 45 && diffSec > 0 && !preSolvedCaptcha) {
        console.log(chalk.yellow("\n🧩 Pre-Solving Captcha..."));
        solveRecaptchaV2(page.url(), siteKeys.antrean).then((t) => {
          preSolvedCaptcha = t;
          console.log(chalk.green("\n✅ Captcha Ready!"));
        });
      }

      // --- THE KILL SHOT (Detik 0) ---
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
                if (
                  response.status() === 200 &&
                  !text.includes("penuh") &&
                  !text.includes("Gagal") &&
                  !text.includes("Habis")
                ) {
                  console.log(
                    chalk.bgGreen.black(
                      ` ✅ HIT WAKDA ${wakdaId}: SUCCESS (API)! `
                    )
                  );
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

        // --- UPDATE VALIDASI BARU (ALA TEMANMU) ---
        console.log(
          chalk.cyan("\n🏁 Validasi: Refresh Halaman untuk Cek Barcode...")
        );

        // Cukup Refresh halaman butik (targetUrl)
        // Gunakan wait networkidle agar gambar barcode sempat loading
        await page.goto(targetUrl, {
          waitUntil: "networkidle",
          timeout: 30000,
        });

        // Cek Indikator Sukses Visual
        const isFormGone = await page.evaluate(
          () => !document.querySelector("select#wakda")
        );
        const isBarcodeVisible = await page.evaluate(
          () =>
            document.body.innerText.includes("Nomor Antrean") ||
            document.body.innerText.includes("Barcode")
        );

        // Screenshot Bukti
        await page.screenshot({
          path: `./screenshots/BUKTI_TIKET_${Date.now()}.png`,
        });

        if (results.includes(true) || isFormGone || isBarcodeVisible) {
          console.log(
            chalk.bgGreen.white.bold(
              " 🎉🎉 JACKPOT! TIKET MUNCUL DI LAYAR! 🎉🎉 "
            )
          );
          console.log(
            chalk.green("Cek folder screenshots untuk bukti Barcode!")
          );
        } else {
          console.log(
            chalk.red("❌ Gagal. Masih muncul form pendaftaran (Penuh).")
          );
        }

        break; // Selesai perang
      }
      await delay(1000);
    }
  } catch (error) {
    console.error(chalk.red(`CRASH: ${error.message}`));
  } finally {
    console.log("Selesai.");
    // Biarkan browser terbuka agar kamu bisa melihat barcodenya langsung
  }
}

// Helper: Ambil CSRF
async function getCsrfToken(page, context) {
  const currentCookies = await context.cookies();
  const csrfCookie = currentCookies.find(
    (c) => c.name === "csrf_cookie_name" || c.name === "csrf_test_name"
  );
  if (csrfCookie) return csrfCookie.value;
  return await page.inputValue('input[name="csrf_test_name"]').catch(() => "");
}

// Helper: Login Darurat
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
