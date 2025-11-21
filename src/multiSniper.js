const { chromium } = require("playwright");
const chalk = require("chalk");
const fs = require("fs");
const { proxyConfig, getSiteName, siteKeys } = require("./config");
const { loadSettings } = require("./settings");
const { solveRecaptchaV2 } = require("./solver");
const { ensureSessionValid } = require("./sessionGuard");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Gunakan Wakda Map yang sama
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

async function startMultiSniper(selectedAccounts, targetSiteId) {
  console.clear();
  console.log(
    chalk.bgRed.white.bold(
      ` 🚀 MULTI-ACCOUNT SNIPER: ${selectedAccounts.length} PASUKAN `
    )
  );
  console.log(chalk.dim(`Target: ${getSiteName(targetSiteId)}`));

  const settings = loadSettings();
  const agents = []; // Array untuk menyimpan data setiap akun (Browser, Page, Token)

  // --- FASE 1: INISIALISASI PASUKAN ---
  console.log(
    chalk.cyan("\n🛠️  Mempersiapkan Pasukan... (Ini akan memakan memori)")
  );

  // Kita luncurkan browser secara paralel tapi dengan delay dikit biar gak CPU spike 100%
  for (const account of selectedAccounts) {
    console.log(chalk.yellow(`   👉 Menyiapkan Agen: ${account.email}...`));

    // Cek Sesi
    const sessionFile = `./session/${account.email}.json`;
    if (!fs.existsSync(sessionFile)) {
      console.log(chalk.red(`      ❌ Sesi tidak ada. Skip.`));
      continue;
    }

    // Setup Browser Context
    try {
      const cookies = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));
      const browser = await chromium.launch({
        headless: settings.headless, // Disarankan TRUE kalau akun banyak
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

      // Simpan ke array agen
      agents.push({
        account,
        browser,
        context,
        page,
        tokenUrl: null,
        csrfToken: null,
        preSolvedCaptcha: null,
        status: "INIT",
      });
    } catch (e) {
      console.log(chalk.red(`      ❌ Gagal launch browser: ${e.message}`));
    }
  }

  console.log(
    chalk.green(
      `\n✅ ${agents.length} Agen Siap Tempur. Melakukan Infiltrasi...`
    )
  );

  // --- FASE 2: INFILTRASI (AMBIL TOKEN URL & CSRF) ---
  // Kita jalankan paralel menggunakan Promise.all agar cepat
  await Promise.all(
    agents.map(async (agent) => {
      try {
        const { page, account } = agent;
        await page.goto("https://antrean.logammulia.com/antrean", {
          waitUntil: "domcontentloaded",
        });

        // Ambil Token URL
        await page.waitForSelector("select#site", { timeout: 20000 });
        await page.selectOption("select#site", targetSiteId);
        await page.waitForTimeout(500);
        agent.tokenUrl = await page.inputValue("input#t");

        // Ambil CSRF
        const c = await agent.context.cookies();
        const cc = c.find(
          (x) => x.name === "csrf_cookie_name" || x.name === "csrf_test_name"
        );
        if (cc) agent.csrfToken = cc.value;

        // Goto Target
        const targetUrl = `https://antrean.logammulia.com/antrean?site=${targetSiteId}&t=${agent.tokenUrl}`;
        await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

        agent.status = "READY";
        console.log(chalk.green(`   ✅ ${account.email}: READY`));
      } catch (e) {
        agent.status = "ERROR";
        console.log(
          chalk.red(
            `   ❌ ${agent.account.email}: Gagal Infiltrasi (${e.message})`
          )
        );
      }
    })
  );

  // --- FASE 3: WAITING & SYNCHRONIZATION ---
  // Kita pakai jam dari salah satu agen yang sukses sebagai referensi
  const validAgent = agents.find((a) => a.status === "READY");
  if (!validAgent) {
    console.log(chalk.bgRed(" SEMUA AGEN GAGAL. ABORTING. "));
    return;
  }

  // Parsing Waktu (Cuma butuh sekali dari 1 agen)
  const bodyText = await validAgent.page.innerText("body");
  const timeMatch = bodyText.match(/Pukul\s+(\d{2}:\d{2})/);
  let targetTime = new Date();
  let jamString = "UNKNOWN";

  if (timeMatch) {
    jamString = timeMatch[1];
    const [h, m] = jamString.split(":");
    targetTime.setHours(parseInt(h), parseInt(m), 0, 0);
    console.log(
      chalk.bgBlue.white.bold(
        `\n 📅 TARGET WAKTU: ${jamString} WIB (Semua Pasukan Sinkron) `
      )
    );
  } else {
    console.log(chalk.red("⚠️ Jam tidak detek. Manual +1 menit."));
    targetTime.setMinutes(targetTime.getMinutes() + 1);
    jamString = `${targetTime.getHours()}:${targetTime.getMinutes()}`;
  }

  // --- FASE 4: COUNTDOWN LOOP ---
  let lastHeartbeat = Date.now();
  let isCaptchaSolving = false;

  while (true) {
    const now = new Date();
    const diffSec = Math.floor((targetTime - now) / 1000);

    if (diffSec > 0) {
      process.stdout.write(
        `\r⏰ T - ${diffSec}s | Agen Aktif: ${
          agents.filter((a) => a.status === "READY").length
        } `
      );
    }

    // HEARTBEAT MASSAL (Setiap 60 detik)
    if (diffSec > 120 && Date.now() - lastHeartbeat > 60000) {
      console.log(chalk.cyan("\n💓 Heartbeat: Refreshing All Agents..."));
      await Promise.all(
        agents.map(async (agent) => {
          if (agent.status !== "READY") return;
          try {
            await agent.page.reload({ waitUntil: "domcontentloaded" });
            // Update CSRF
            const c = await agent.context.cookies();
            const cc = c.find((x) => x.name === "csrf_cookie_name");
            if (cc) agent.csrfToken = cc.value;
          } catch (e) {}
        })
      );
      lastHeartbeat = Date.now();
    }

    // PRE-SOLVE CAPTCHA MASSAL (Detik 50)
    if (diffSec <= 50 && diffSec > 0 && !isCaptchaSolving) {
      isCaptchaSolving = true;
      console.log(
        chalk.yellow("\n\n🧩 Memerintahkan Agen untuk Solve Captcha...")
      );

      // Kita solve captcha untuk setiap agen secara paralel
      // AWAS: Ini akan memakan saldo 2Captcha kamu!
      await Promise.all(
        agents.map(async (agent) => {
          if (agent.status !== "READY") return;
          try {
            agent.preSolvedCaptcha = await solveRecaptchaV2(
              agent.page.url(),
              siteKeys.antrean
            );
            process.stdout.write(chalk.green(".")); // Dot progress
          } catch (e) {
            process.stdout.write(chalk.red("x"));
          }
        })
      );
      console.log(chalk.green("\n✅ Captcha Phase Selesai."));
    }

    // --- THE FIRE COMMAND (Detik 0) ---
    if (diffSec <= 0) {
      console.log(
        chalk.magenta.bold("\n\n🔥🔥🔥 FIRE ALL BATTERIES!!! 🔥🔥🔥")
      );

      // Tentukan Wakda List
      let targetWakdaList = wakdaMap[targetSiteId] || ["1", "2", "3", "4", "5"];
      const formattedJam =
        jamString.length === 5 ? `${jamString}:00` : jamString;

      // KITA GUNAKAN PROMISE.ALL UNTUK MENEMBAK SEMUA AKUN BERSAMAAN
      const allAttacks = agents.map(async (agent) => {
        if (agent.status !== "READY") return;

        // Jika captcha gagal pre-solve, skip atau solve on fly (disini kita skip biar yg lain gak telat)
        if (!agent.preSolvedCaptcha) return;

        // Setiap agen menembak 3-5 wakda sekaligus
        const agentRequests = targetWakdaList.map((wakdaId) => {
          return agent.context.request
            .post("https://antrean.logammulia.com/antrean-ambil", {
              form: {
                csrf_test_name: agent.csrfToken,
                wakda: wakdaId,
                id_cabang: targetSiteId,
                jam_slot: formattedJam,
                waktu: "",
                token: agent.tokenUrl,
                "g-recaptcha-response": agent.preSolvedCaptcha,
              },
              headers: { Referer: agent.page.url() },
            })
            .then(async (res) => {
              const text = await res.text();
              if (
                res.status() === 200 &&
                !text.includes("penuh") &&
                !text.includes("Gagal")
              ) {
                console.log(
                  chalk.bgGreen.black(
                    ` 🏆 ${agent.account.email}: HIT WAKDA ${wakdaId}! `
                  )
                );
                // Screenshot bukti
                try {
                  await agent.page.goto(
                    "https://antrean.logammulia.com/riwayat"
                  );
                  await agent.page.screenshot({
                    path: `./screenshots/WIN_${agent.account.email}.png`,
                  });
                } catch (e) {}
              }
            })
            .catch(() => {});
        });

        await Promise.all(agentRequests);
      });

      await Promise.all(allAttacks);
      console.log(chalk.cyan("\n🏁 Serangan Selesai. Cek Screenshot."));
      break;
    }

    await delay(1000);
  }

  // Jangan tutup browser langsung, biarkan user liat dulu
  console.log("Menunggu 30 detik sebelum menutup...");
  await delay(30000);
  // for(const a of agents) await a.browser.close();
}

module.exports = { startMultiSniper };
