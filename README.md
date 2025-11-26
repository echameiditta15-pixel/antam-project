# Otomatisasi Web dengan Antam 🤖

[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://www.javascript.com/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Playwright](https://img.shields.io/badge/Playwright-45BA47?style=for-the-badge&logo=playwright&logoColor=white)](https://playwright.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

Proyek ini adalah kerangka kerja otomatisasi web yang dibangun dengan Node.js, Playwright, dan Playwright Extra. Tujuan utamanya adalah untuk menyediakan platform yang fleksibel dan mudah diperluas untuk berbagai tugas otomatisasi web, mulai dari scraping data hingga pengujian otomatis.

## 📋 Daftar Isi

- [Fitur Utama](#fitur-utama-)
- [Tech Stack](#tech-stack-)
- [Prasyarat](#prasyarat-)
- [Instalasi](#instalasi-)
- [Penggunaan](#penggunaan-)
- [Struktur Proyek](#struktur-proyek-)
- [Konfigurasi](#konfigurasi-)
- [Cara Berkontribusi](#cara-berkontribusi-)
- [Roadmap](#roadmap-)
- [Lisensi](#lisensi-)
- [Kontak](#kontak-)

## ✨ Fitur Utama

- **🔑 Modul Autentikasi**: Menangani otentikasi pengguna dengan fungsi `auth.js` dan perlindungan sesi menggunakan `sessionGuard.js`
- **🎯 Otomatisasi Web Tingkat Lanjut**: Memanfaatkan Playwright dan Playwright Extra untuk berinteraksi dengan situs web secara terprogram
- **🧩 Arsitektur Modular**: Struktur `src` memisahkan kode menjadi modul yang terdefinisi dengan baik untuk memudahkan pemeliharaan
- **⚙️ Konfigurasi Fleksibel**: File `config/config.js` memungkinkan konfigurasi mudah dari berbagai pengaturan proyek
- **🛡️ Session Guard**: Proteksi dan manajemen sesi pengguna yang aman
- **📊 Auto Monitor**: Pemantauan otomatis untuk tracking aktivitas

## 🛠️ Tech Stack

- **JavaScript** - Bahasa pemrograman utama
- **Node.js** - Runtime environment
- **Playwright** - Framework untuk otomatisasi browser
- **Playwright Extra** - Plugin tambahan untuk Playwright

## 📦 Prasyarat

Sebelum memulai, pastikan Anda telah menginstal:

- [Node.js](https://nodejs.org/) (v14 atau lebih tinggi)
- npm (biasanya sudah termasuk dengan Node.js)
- Git

## 🚀 Instalasi

1. **Clone repositori**
   ```bash
   git clone https://github.com/NvlFR/antam-project
   ```

2. **Masuk ke direktori proyek**
   ```bash
   cd antam-project
   ```

3. **Install dependensi**
   ```bash
   npm install
   ```

4. **Konfigurasi proyek**
   
   Salin file konfigurasi contoh (jika ada) dan sesuaikan dengan kebutuhan Anda:
   ```bash
   cp config/config.example.js config/config.js
   ```
   
   Edit `config/config.js` sesuai dengan environment Anda.

## 💻 Penggunaan

### Menjalankan Proyek

```bash
npm start
```

### Mode Development

```bash
npm run dev
```

### Menjalankan Tes (jika tersedia)

```bash
npm test
```

## 📁 Struktur Proyek

```
antam-project/
├── src/
│   ├── auth/
│   │   ├── auth.js
│   │   └── sessionGuard.js
│   ├── core/
│   │   └── ...
│   └── ...
├── config/
│   └── config.js
├── package.json
├── README.md
└── LICENSE
```

## ⚙️ Konfigurasi

File `config/config.js` berisi berbagai pengaturan yang dapat disesuaikan:

```javascript
// Contoh konfigurasi
module.exports = {
  browser: {
    headless: true,
    slowMo: 0
  },
  auth: {
    timeout: 30000
  }
  // ... konfigurasi lainnya
}
```

## 🤝 Cara Berkontribusi

Kontribusi sangat diterima! Berikut langkah-langkahnya:

1. **Fork repositori ini**

2. **Buat branch untuk fitur Anda**
   ```bash
   git checkout -b feature/nama-fitur
   ```

3. **Commit perubahan Anda**
   ```bash
   git commit -m "feat: Tambahkan fitur baru"
   ```

4. **Push ke branch**
   ```bash
   git push origin feature/nama-fitur
   ```

5. **Buat Pull Request**

### Pedoman Kontribusi

- Pastikan kode Anda mengikuti style guide yang ada
- Tulis pesan commit yang jelas dan deskriptif
- Update dokumentasi jika diperlukan
- Tambahkan test untuk fitur baru

## 🗺️ Roadmap

- [ ] Menambahkan dokumentasi API yang lebih lengkap
- [ ] Implementasi sistem logging yang lebih baik
- [ ] Menambahkan unit tests
- [ ] Support untuk multiple browser
- [ ] Dashboard monitoring

## 📄 Lisensi

Proyek ini dilisensikan di bawah **MIT License**.

```
MIT License

Copyright (c) 2024 Noval Faturrahman

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Lihat file [LICENSE](LICENSE) untuk detail lengkapnya.

## 📧 Kontak

**Noval Faturrahman**

- GitHub: [@NvlFR](https://github.com/NvlFR)
- Project Link: [https://github.com/NvlFR/antam-project](https://github.com/NvlFR/antam-project)

---

<div align="center">
  
**⭐ Jika proyek ini bermanfaat, jangan lupa berikan star! ⭐**

Made with ❤️ by Noval Faturrahman

</div>
