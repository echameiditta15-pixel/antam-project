const { chromium } = require("playwright");
const chalk = require("chalk");
const fs = require("fs");
const Table = require("cli-table3"); // IMPORT LIBRARY TABEL
const { proxyConfig, getSiteName } = require("./config");
const { loadSettings } = require("./settings");
const { loadAccounts } = require("./accountManager");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DB_WAKDA_PATH = "./database/wakda.json";

async function scrapeWakdaIDs() {
  console.clear();
  console.log(
    chalk.bgCyan.black.bold(" 🕵️  INTELLIGENCE MODE: AUTO-SYNC WAKDA ")
  );
  console.log(
    chalk.dim("Mencari ID Database Slot (Wakda) dari setiap cabang...")
  );

  const accounts = loadAccounts();
  if (accounts.length === 0) {
    console.log(chalk.red("❌ Butuh minimal 1 akun untuk login."));
    return;
  }
  const botAccount = accounts[0];
  const sessionFile = `./session/${botAccount.email}.json`;

  if (!fs.existsSync(sessionFile)) {
    console.log(chalk.red("❌ Sesi hilang. Login dulu di Menu 1."));
    return;
  }

  // Setup Tabel (Header)
  const table = new Table({
    head: [
      chalk.white.bold("ID"),
      chalk.white.bold("CABANG"),
      chalk.white.bold("WAKDA ID TEMUAN"),
      chalk.white.bold("STATUS"),
    ],
    colWidths: [6, 30, 35, 15], // Lebar kolom diatur biar rapi
    wordWrap: true,
  });

  let wakdaDb = {};
  if (fs.existsSync(DB_WAKDA_PATH)) {
    try {
      wakdaDb = JSON.parse(fs.readFileSync(DB_WAKDA_PATH, "utf-8"));
    } catch (e) {
      wakdaDb = {};
    }
  }

  const settings = loadSettings();
  const cookies = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));

  const browser = await chromium.launch({
    headless: settings.headless,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const contextOptions = {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    extraHTTPHeaders: {
      Referer: "https://antrean.logammulia.com/users",
      Origin: "https://antrean.logammulia.com",
    },
  };
  if (settings.useProxy) contextOptions.proxy = proxyConfig;

  const context = await browser.newContext(contextOptions);
  await context.addCookies(cookies);
  const page = await context.newPage();

  try {
    console.log(chalk.cyan("🔄 Masuk ke Dashboard..."));
    await page.goto("https://antrean.logammulia.com/antrean", {
      waitUntil: "domcontentloaded",
    });

    if (page.url().includes("login")) {
      console.log(chalk.red("❌ Sesi Expired."));
      await browser.close();
      return;
    }

    console.log(chalk.yellow(`⏳ Mengambil list cabang...`));
    const options = await page.$$eval("select#site option", (opts) =>
      opts
        .map((o) => ({ id: o.value, text: o.innerText }))
        .filter((o) => o.id !== "")
    );

    console.log(
      chalk.green(
        `\n✅ Mulai Scanning ${options.length} Cabang (Mohon Tunggu)...\n`
      )
    );

    let updateCount = 0;

    for (const opt of options) {
      const siteId = opt.id;
      const siteName = getSiteName(siteId).replace("Butik Emas LM - ", "");

      // Tampilkan progress bar sederhana di terminal biar gak bosen
      process.stdout.write(
        chalk.yellow(`   Scanning [${siteId}] ${siteName}... `)
      );

      // 1. Ambil Token URL
      await page.selectOption("select#site", siteId);
      await page.waitForTimeout(200);
      const token = await page.inputValue("input#t");

      if (!token) {
        process.stdout.write(chalk.red("No Token\n"));
        table.push([siteId, siteName, "-", chalk.red("ERROR")]);
        continue;
      }

      const url = `https://antrean.logammulia.com/antrean?site=${siteId}&t=${token}`;

      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });

        if (!page.url().includes("site=")) {
          process.stdout.write(chalk.red("Redirected\n"));
          table.push([siteId, siteName, "-", chalk.red("BLOCKED")]);
          await page.goto("https://antrean.logammulia.com/antrean");
          continue;
        }

        // 2. SCRAPE WAKDA
        let wakdaIds = await page.evaluate(() => {
          const select = document.querySelector("select#wakda");
          if (!select) return null;
          return Array.from(select.options)
            .map((o) => o.value)
            .filter((v) => v !== "");
        });

        // Fallback Regex
        if (!wakdaIds || wakdaIds.length === 0) {
          const content = await page.content();
          const selectMatch = content.match(
            /<select[^>]*id="wakda"[^>]*>([\s\S]*?)<\/select>/
          );
          if (selectMatch && selectMatch[1]) {
            const regex = /value="(\d+)"/g;
            wakdaIds = [...selectMatch[1].matchAll(regex)]
              .map((m) => m[1])
              .filter((v) => v !== "");
          }
        }

        // 3. OLAH DATA UNTUK TABEL
        if (wakdaIds && wakdaIds.length > 0) {
          wakdaDb[siteId] = wakdaIds; // Update DB
          updateCount++;
          process.stdout.write(chalk.green("FOUND!\n"));

          // Masukkan ke tabel (Hijau)
          table.push([
            siteId,
            siteName,
            chalk.greenBright(JSON.stringify(wakdaIds)),
            chalk.green("UPDATED"),
          ]);
        } else {
          process.stdout.write(chalk.gray("Kosong\n"));

          // Masukkan ke tabel (Abu-abu)
          // Ambil data lama dari DB kalau ada
          const oldData = wakdaDb[siteId]
            ? JSON.stringify(wakdaDb[siteId])
            : "-";
          table.push([
            siteId,
            siteName,
            chalk.gray(oldData),
            chalk.gray("NO CHANGE"),
          ]);
        }
      } catch (e) {
        process.stdout.write(chalk.red("Timeout\n"));
        table.push([siteId, siteName, "-", chalk.red("TIMEOUT")]);
      }

      await delay(500);
    }

    // 4. TAMPILKAN TABEL FINAL
    console.log("\n" + table.toString());

    // 5. SIMPAN
    fs.writeFileSync(DB_WAKDA_PATH, JSON.stringify(wakdaDb, null, 2));
    console.log(
      chalk.bgGreen.black(
        ` \n✅ DATABASE SAVED! ${updateCount} data baru disimpan ke database/wakda.json \n`
      )
    );
  } catch (e) {
    console.log(chalk.red(`CRASH: ${e.message}`));
  } finally {
    await browser.close();
  }
}

module.exports = { scrapeWakdaIDs };
