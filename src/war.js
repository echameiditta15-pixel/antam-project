const { chromium } = require("playwright");
const chalk = require("chalk");
const Table = require("cli-table3");
const fs = require("fs");
const { proxyConfig, getSiteName } = require("./config");
const { loadSettings } = require("./settings");
const { loadAccounts } = require("./accountManager");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function checkQuotaAll() {
  console.clear();
  console.log(
    chalk.blue(
      `\n[${new Date().toLocaleTimeString()}] 🔎 Pengecekan Kuota (Mode Stealth & Delay)...`
    )
  );

  // 1. Cek Akun & Session
  const accounts = loadAccounts();
  if (accounts.length === 0) {
    console.log(chalk.red("❌ Tidak ada akun tersimpan! Tambah akun dulu."));
    return;
  }

  const botAccount = accounts[0];
  const sessionFile = `./session/${botAccount.email}.json`;
  if (!fs.existsSync(sessionFile)) {
    console.log(
      chalk.red(`❌ Sesi akun ${botAccount.email} tidak ditemukan. Login dulu!`)
    );
    return;
  }

  if (!fs.existsSync("./screenshots")) fs.mkdirSync("./screenshots");

  const table = new Table({
    head: ["NO", "CABANG", "STATUS", "SLOT"],
    colWidths: [5, 30, 20, 40],
  });

  const settings = loadSettings();
  const cookies = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));
  console.log(
    chalk.dim(`   Akun: ${botAccount.email} | Headless: ${settings.headless}`)
  );

  // 2. Launch Browser
  const browser = await chromium.launch({
    headless: settings.headless,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const contextOptions = {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
  };

  if (settings.useProxy) contextOptions.proxy = proxyConfig;

  const context = await browser.newContext(contextOptions);
  await context.addCookies(cookies);
  const page = await context.newPage();

  try {
    // 3. NAVIGASI MANUSIA
    console.log(chalk.cyan("🔄 Masuk ke Dashboard..."));
    await page.goto("https://antrean.logammulia.com/users", {
      timeout: 30000,
      waitUntil: "domcontentloaded",
    });

    if (page.url().includes("login")) {
      console.log(chalk.red("❌ Sesi Expired! Silakan login ulang."));
      await browser.close();
      return;
    }

    console.log(chalk.cyan("👆 Klik menu Antrean..."));
    try {
      await page.click('a[href*="/antrean"]');
    } catch (e) {
      await page.goto("https://antrean.logammulia.com/antrean");
    }

    try {
      await page.waitForSelector("select#site", {
        state: "visible",
        timeout: 20000,
      });
    } catch (e) {
      console.log(chalk.red("❌ Gagal masuk halaman antrean."));
      await browser.close();
      return;
    }

    // 4. EXTRACT TOKEN LIVE
    console.log(chalk.cyan("🔓 Extracting Token..."));
    const siteOptions = await page.$$eval("select#site option", (options) =>
      options
        .map((o) => ({ value: o.value, text: o.innerText }))
        .filter((o) => o.value !== "")
    );

    const liveSecretMap = {};
    for (const site of siteOptions) {
      await page.selectOption("select#site", site.value);
      await page.waitForTimeout(100);
      const token = await page.inputValue("input#t");
      if (token) liveSecretMap[site.value] = token;
    }
    console.log(
      chalk.green(`✅ ${Object.keys(liveSecretMap).length} Token didapat.`)
    );

    // 5. LOOPING CHECK
    const targetSiteIds = Object.keys(liveSecretMap);
    let no = 1;

    for (const siteId of targetSiteIds) {
      const siteName = getSiteName(siteId);
      const token = liveSecretMap[siteId];
      const url = `https://antrean.logammulia.com/antrean?site=${siteId}&t=${token}`;

      process.stdout.write(chalk.yellow(`⏳ ${siteName}... `));

      try {
        await page.goto(url, { timeout: 20000, waitUntil: "domcontentloaded" });

        // --- DETEKSI TURNSTILE / CLOUDFLARE ---
        if (
          (await page.title()) === "Just a moment..." ||
          (await page.locator('iframe[src*="turnstile"]').count()) > 0
        ) {
          process.stdout.write(chalk.magenta("TURNSTILE! "));
          await page.waitForTimeout(5000); // Tunggu 5 detik biar lolos sendiri
          if ((await page.title()) === "Just a moment...") {
            process.stdout.write(chalk.red("BLOCKED\n"));
            table.push([no++, siteName, chalk.red("CF BLOCK"), "-"]);
            continue;
          }
        }

        // --- VALIDASI REDIRECT ---
        if (page.url().includes("/home") || page.url().includes("/users")) {
          process.stdout.write(chalk.red("REDIRECTED\n"));
          table.push([no++, siteName, chalk.red("REDIRECT"), "-"]);
          // Kalau kena redirect, kita harus 'refresh' status dengan balik ke /antrean dulu
          await page.goto("https://antrean.logammulia.com/antrean");
          continue;
        }

        // --- SCRAPE DATA ---
        const slotData = await page.evaluate(() => {
          const select = document.querySelector("select#wakda");
          const bodyText = document.body.innerText;
          if (!select) {
            if (bodyText.includes("Penuh") || bodyText.includes("Habis"))
              return "FULL";
            if (bodyText.includes("Tutup") || bodyText.includes("Jadwal"))
              return "CLOSED";
            return "UNKNOWN";
          }
          return Array.from(select.options)
            .filter((o) => o.value !== "")
            .map((o) => ({ text: o.innerText.trim(), disabled: o.disabled }));
        });

        let statusDisplay = "",
          slotDisplay = "";
        if (slotData === "FULL") {
          statusDisplay = chalk.red("PENUH");
          slotDisplay = "-";
        } else if (slotData === "CLOSED") {
          statusDisplay = chalk.red("TUTUP");
          slotDisplay = "-";
        } else if (Array.isArray(slotData)) {
          const available = slotData.filter((s) => !s.disabled);
          if (available.length > 0) {
            statusDisplay = chalk.greenBright("✅ ADA KUOTA");
            slotDisplay = available.map((s) => s.text).join(", ");
          } else {
            statusDisplay = chalk.red("HABIS");
            slotDisplay = "-";
          }
        } else {
          statusDisplay = chalk.yellow("UNKNOWN");
          slotDisplay = "?";
        }

        table.push([no++, siteName, statusDisplay, slotDisplay]);
        process.stdout.write(chalk.green("OK\n"));
      } catch (e) {
        process.stdout.write(chalk.red("Timeout\n"));
        table.push([no++, siteName, chalk.red("TIMEOUT"), "-"]);
      }

      // --- DELAY DINAMIS ---
      // Random antara 2-4 detik
      const pauseTime = Math.floor(Math.random() * 2000) + 2000;

      // Istirahat panjang setiap 5 request biar gak dikira robot gila
      if (no % 5 === 0) {
        process.stdout.write(chalk.cyan("   (Cooling down 10s...)\n"));
        await delay(10000);
      } else {
        await delay(pauseTime);
      }
    }
  } catch (err) {
    console.log(chalk.red(`\n❌ Fatal Error: ${err.message}`));
  } finally {
    if (browser) await browser.close();
    console.log(table.toString());
  }
}

module.exports = { checkQuotaAll };
