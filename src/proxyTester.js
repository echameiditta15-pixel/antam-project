const { chromium } = require("playwright");
const chalk = require("chalk");
const { proxyConfig } = require("./config");

async function testProxy() {
  console.clear();
  console.log(chalk.blue("════ TEST KONEKSI PROXY ════"));
  console.log(chalk.dim(`Server: ${proxyConfig.server}`));
  console.log(chalk.dim(`User  : ${proxyConfig.username}`));
  console.log(chalk.yellow("\n⏳ Sedang menghubungkan ke jaringan proxy..."));

  const browser = await chromium.launch({
    headless: true,
  });

  try {
    // Buka context dengan Proxy
    const context = await browser.newContext({
      proxy: proxyConfig,
    });

    const page = await context.newPage();
    const start = Date.now();

    // Akses IP Checker
    await page.goto("https://api.ipify.org?format=json", { timeout: 30000 });
    const content = await page.content();
    const jsonText = await page.innerText("body"); // Ambil text JSON
    const data = JSON.parse(jsonText);

    const ping = Date.now() - start;

    console.log(chalk.green("\n✅ KONEKSI BERHASIL!"));
    console.log(`🌍 IP Terdeteksi : ${chalk.bold.green(data.ip)}`);
    console.log(`⚡ Latency       : ${ping} ms`);

    // Optional: Cek lokasi IP (Geolokasi kasar)
    // Bisa tambah request ke ip-api.com kalau mau lebih detail
  } catch (error) {
    console.log(chalk.red("\n❌ KONEKSI GAGAL!"));
    console.log(chalk.red(`Error: ${error.message}`));
    console.log(
      chalk.yellow("Tips: Cek kuota proxy atau pastikan IP Whitelist aman.")
    );
  } finally {
    await browser.close();
  }
}

module.exports = { testProxy };
