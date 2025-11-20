const fs = require("fs");
const inquirer = require("inquirer");
const chalk = require("chalk");

const SETTINGS_PATH = "./database/settings.json";

// 1. Load Settings
function loadSettings() {
  if (!fs.existsSync(SETTINGS_PATH)) {
    // Default settings jika file hilang
    const defaultSettings = {
      telegramToken: "",
      telegramChatId: "",
      checkInterval: 5,
      headless: true,
      useProxy: true,
    };
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(defaultSettings, null, 2));
  }
  return JSON.parse(fs.readFileSync(SETTINGS_PATH));
}

// 2. Save Settings
function saveSettings(data) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2));
}

// 3. Menu Interaktif Ubah Setting
async function manageSettings() {
  while (true) {
    const config = loadSettings();
    console.clear();
    console.log(chalk.blue("════ PENGATURAN BOT ════"));

    // Tampilkan status saat ini
    console.log(
      `1. Token Telegram  : ${
        config.telegramToken ? chalk.green("TERISI") : chalk.red("KOSONG")
      }`
    );
    console.log(
      `2. Chat ID         : ${
        config.telegramChatId
          ? chalk.green(config.telegramChatId)
          : chalk.red("KOSONG")
      }`
    );
    console.log(
      `3. Interval Monitor: ${chalk.yellow(config.checkInterval + " detik")}`
    );
    console.log(
      `4. Headless Mode   : ${
        config.headless
          ? chalk.green("ON (Tanpa Jendela)")
          : chalk.red("OFF (Muncul Browser)")
      }`
    );
    console.log(
      `5. Gunakan Proxy   : ${
        config.useProxy ? chalk.green("AKTIF") : chalk.red("NONAKTIF")
      }`
    );
    console.log(chalk.gray("────────────────────────"));
    console.log("0. Kembali");

    const answer = await inquirer.prompt([
      {
        type: "input",
        name: "choice",
        message: "Pilih nomor yang mau diedit:",
        validate: (val) =>
          ["0", "1", "2", "3", "4", "5"].includes(val) ? true : "Pilih 0-5",
      },
    ]);

    if (answer.choice === "0") break;

    // Logic Edit
    if (answer.choice === "1") {
      const input = await inquirer.prompt([
        { type: "input", name: "val", message: "Masukkan Token Bot Telegram:" },
      ]);
      config.telegramToken = input.val;
    } else if (answer.choice === "2") {
      const input = await inquirer.prompt([
        { type: "input", name: "val", message: "Masukkan Chat ID:" },
      ]);
      config.telegramChatId = input.val;
    } else if (answer.choice === "3") {
      const input = await inquirer.prompt([
        {
          type: "number",
          name: "val",
          message: "Masukkan Interval (detik):",
          default: 5,
        },
      ]);
      config.checkInterval = input.val;
    } else if (answer.choice === "4") {
      // Toggle Headless
      config.headless = !config.headless;
      console.log(
        chalk.yellow(`Headless mode diubah menjadi: ${config.headless}`)
      );
    } else if (answer.choice === "5") {
      // Toggle Proxy
      config.useProxy = !config.useProxy;
      console.log(chalk.yellow(`Proxy diubah menjadi: ${config.useProxy}`));
    }

    saveSettings(config);
    await new Promise((r) => setTimeout(r, 500)); // Delay dikit biar kerasa update
  }
}

module.exports = { loadSettings, manageSettings };
