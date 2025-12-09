const ntpClient = require("ntp-client");
const chalk = require("chalk");
const util = require("util");

const getNtpTime = util.promisify(ntpClient.getNetworkTime);

async function getTimeOffset() {
  console.log(chalk.cyan("⏳ Sinkronisasi Waktu NTP..."));
  try {
    const server = "pool.ntp.org";
    const date = await getNtpTime(server, 123);

    const now = new Date();
    const ntpTime = date;
    const offset = ntpTime.getTime() - now.getTime();

    // Jika offset positif = Laptop telat (harus ditambah)
    // Jika offset negatif = Laptop kecepetan (harus dikurang)

    const status = offset > 0 ? "Telat" : "Kecepetan";
    console.log(
      chalk.green(
        `✅ NTP Sync: Laptop kamu ${status} ${Math.abs(
          offset
        )}ms dari Server Global.`
      )
    );

    return offset; // Return milisecond
  } catch (error) {
    console.log(chalk.yellow("⚠️ Gagal Sync NTP, pakai waktu lokal."));
    return 0;
  }
}

module.exports = { getTimeOffset };
