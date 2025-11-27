const fs = require("fs");
const path = require("path");
const chalk = require("chalk");

const LOG_FILE = "history_log.csv";

function initLog() {
  if (!fs.existsSync(LOG_FILE)) {
    // Buat Header CSV kalau file belum ada
    const header =
      "TIMESTAMP,TANGGAL,JAM_WAR,CABANG,AKUN,WAKDA_ID,STATUS,DURASI_MS,PESAN_SERVER\n";
    fs.writeFileSync(LOG_FILE, header);
  }
}

function logWarHistory(data) {
  try {
    initLog();

    const now = new Date();
    const dateStr = now.toLocaleDateString("id-ID");
    const timeStr = now.toLocaleTimeString("id-ID");

    // Bersihkan pesan dari koma/enter biar gak ngerusak CSV
    const cleanMsg = data.message
      ? data.message.replace(/,/g, " ").replace(/\n/g, " ")
      : "-";

    const row = [
      now.toISOString(),
      dateStr,
      timeStr,
      data.siteName,
      data.email,
      data.wakda,
      data.status, // SUCCESS / FAIL / ERROR
      data.duration, // Berapa milidetik prosesnya
      cleanMsg,
    ].join(",");

    fs.appendFileSync(LOG_FILE, row + "\n");
    // console.log(chalk.gray(`   📝 History dicatat ke ${LOG_FILE}`));
  } catch (e) {
    console.log(chalk.red("Gagal catat history: " + e.message));
  }
}

module.exports = { logWarHistory };
