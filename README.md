# Slimora v2 (Tauri + React + Rust)

Slimora v2 adalah aplikasi desktop image workspace & batch processing berkecepatan tinggi yang dibangun dengan **Tauri v2**, **React 19**, **Vite**, dan engine pemroses gambar berbasis **Rust** multithreaded (Rayon, fast_image_resize, zune-heic, webp).

---

## 🛠️ Prasyarat Perangkat (Prerequisites)

Untuk menjalankan atau mem-build aplikasi ini di perangkat baru, pastikan perangkat tersebut telah menginstal:

1. **Node.js** (versi 18.x atau lebih baru)
   - Cek versi: `node -v` dan `npm -v`
   - Unduh di: [nodejs.org](https://nodejs.org)

2. **Rust & Cargo** (versi 1.85+ / stable)
   - Cek versi: `rustc --version` dan `cargo --version`
   - Instalasi lewat: [rustup.rs](https://rustup.rs)

3. **C++ Build Tools & OS Dependencies**:
   - **Windows**: Microsoft C++ Build Tools (dari *Visual Studio Installer*, pilih workload *"Desktop development with C++"*) dan WebView2 runtime (sudah bawaan di Windows 10 & 11).
   - **Linux**: Dependensi standar Tauri:
     ```bash
     sudo apt update && sudo apt install -y build-essential libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
     ```
   - **macOS**: Xcode Command Line Tools (`xcode-select --install`).

---

## 🚀 Cara Menjalankan di Perangkat Baru

Setelah meng-clone repositori ini:

```bash
# 1. Masuk ke folder proyek
cd slimora-v2

# 2. Instal dependensi frontend (Node.js)
npm install

# 3. Jalankan aplikasi dalam mode pengembangan (Dev Mode)
npm run tauri dev
```

> **Catatan**: Pertama kali menjalankan `npm run tauri dev`, Cargo akan otomatis mengunduh dan mengompilasi dependensi Rust (seperti `image`, `rayon`, `fast_image_resize`, `zune-heic`). Proses ini memerlukan koneksi internet aktif beberapa menit di awal.

---

## 📦 Build Installer / Executable Produksi

Untuk menghasilkan file executable (`.exe` di Windows, `.deb`/`.AppImage` di Linux, atau `.dmg` di macOS):

```bash
npm run tauri build
```

Hasil build akan otomatis tersedia di direktori `src-tauri/target/release/bundle/`.

---

## 📂 Struktur Proyek

```
slimora-v2/
├── public/                 # Aset statis & ikon SVG
├── src/                    # Frontend UI (React + CSS)
│   ├── App.jsx             # Komponen utama UI
│   ├── StripeProgress.jsx  # Indikator progres animasi
│   └── Icons.jsx           # Komponen SVG Icons
├── src-tauri/              # Backend Rust (Tauri 2)
│   ├── Cargo.toml          # Dependensi Rust (image, rayon, zune-heic, dll)
│   ├── Cargo.lock          # Versi dependensi terkunci
│   ├── tauri.conf.json     # Konfigurasi jendela & build Tauri
│   └── src/
│       ├── lib.rs          # Tauri command handlers
│       └── processor.rs    # Core image processing & copy engine
├── package.json            # Skrip & dependensi npm
└── vite.config.js          # Konfigurasi Vite
```
