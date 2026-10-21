# Slimora v2 (Tauri + React + Rust)

<p align="center">
  <strong>High-Performance Desktop Image Workspace & Batch Processing Engine</strong><br>
  Dibangun dengan <b>Tauri v2</b>, <b>React 19</b>, <b>Vite</b>, dan backend <b>Rust</b> multithreaded.
</p>

---

## 📋 Minimum System Requirements (Spesifikasi Minimum)

### 1. Spesifikasi Perangkat Keras (Hardware)
| Komponen | Spesifikasi Minimum | Rekomendasi |
| :--- | :--- | :--- |
| **Prosesor (CPU)** | Dual-Core 64-bit (Intel / AMD / ARM64) | Quad-Core atau lebih (untuk multithreading Rayon) |
| **Memori (RAM)** | 4 GB RAM | 8 GB RAM atau lebih *(kompilasi Rust & batch processing butuh memori yang cukup)* |
| **Penyimpanan (Storage)** | 2.5 GB ruang kosong | 5 GB+ *(untuk cache Cargo, node_modules, dan hasil build)* |
| **Layar (Display)** | Resolusi minimal 1280 × 720 px | 1920 × 1080 px atau lebih tinggi |

### 2. Sistem Operasi yang Didukung
* **Windows**: Windows 10 (64-bit) versi 1809+ atau Windows 11.
* **macOS**: macOS 10.15 (Catalina) atau lebih baru (Apple Silicon M-series & Intel).
* **Linux**: Ubuntu 20.04+, Debian 11+, Fedora 36+, Arch Linux, atau distro modern lainnya dengan glibc 2.31+.

---

## 🛠️ Prasyarat & Dependensi Sistem (System Dependencies)

Sebelum melakukan clone dan menjalankan proyek di perangkat baru, pastikan lingkungan pengembangan telah terinstal dependensi berikut:

### 1. Node.js & Package Manager
* **Node.js**: Minimal **v18.0.0** (Disarankan versi LTS terbaru, misal v20.x atau v22.x).
* **npm**: Minimal **v9.x** (Otomatis terinstal bersama Node.js).
* *Cek instalasi*:
  ```bash
  node -v
  npm -v
  ```

### 2. Rust Toolchain
* **Rust & Cargo**: Minimal versi **1.85.0** (Stable).
  > ⚠️ **Penting**: Proyek ini menggunakan `edition = "2024"`, sehingga membutuhkan compiler Rust minimal versi 1.85.0.
* *Instalasi*: Kunjungi [rustup.rs](https://rustup.rs) atau jalankan:
  ```bash
  # Windows (via PowerShell / installer resmi) atau Unix:
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```
* *Cek instalasi*:
  ```bash
  rustc --version
  cargo --version
  ```

### 3. C++ Build Tools & Webview (Per-Sistem Operasi)

#### 🪟 Windows
1. **Microsoft C++ Build Tools**:
   - Unduh dari [Visual Studio Installer](https://visualstudio.microsoft.com/visual-cpp-build-tools/).
   - Pilih workload **"Desktop development with C++"** (*Pengembangan desktop dengan C++*).
2. **Microsoft Edge WebView2**:
   - Sudah terpasang secara bawaan di Windows 10 & 11. Jika belum ada, pasang [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

#### 🐧 Linux (Debian / Ubuntu)
Jalankan perintah berikut untuk menginstal pustaka dependensi Tauri dan WebKit:
```bash
sudo apt update
sudo apt install -y \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf
```
*(Untuk distro lain seperti Fedora atau Arch, sesuaikan nama paket dengan panduan resmi [Tauri Linux Prerequisites](https://tauri.app/start/prerequisites/#linux)).*

#### 🍎 macOS
Pasang Xcode Command Line Tools:
```bash
xcode-select --install
```

---

## 📦 Dependensi Proyek (Project Libraries)

Seluruh dependensi di bawah ini akan diunduh secara otomatis saat proses setup, terkunci melalui `package-lock.json` dan `Cargo.lock`:

### Frontend (npm)
| Library | Versi | Fungsi |
| :--- | :--- | :--- |
| `react` & `react-dom` | `^19.1.0` | UI framework inti |
| `@tauri-apps/api` | `^2.x` | Jembatan komunikasi IPC antara web view dan backend Rust |
| `@tauri-apps/plugin-opener` | `^2.x` | Plugin membuka URL / folder di file explorer bawaan OS |
| `vite` | `^8.0.16` | Frontend bundler & dev server berkecepatan tinggi |
| `@tauri-apps/cli` | `^2.x` | CLI untuk dev, build, dan packaging Tauri |

### Backend Engine (Rust Crates)
| Crate | Versi | Fungsi |
| :--- | :--- | :--- |
| `tauri` | `2.x` | Desktop runtime framework (Windowing, Event, IPC) |
| `rayon` | `1.x` | Parallel computing & multithreading untuk proses gambar massal |
| `image` | `0.25` | Engine format gambar (JPEG, PNG, WebP, AVIF) |
| `fast_image_resize` | `6.1` | Algoritma resize gambar ultra-cepat dengan optimasi SIMD |
| `zune-heic` | `0.5` | Decoder native format gambar Apple/modern HEIC & HEIF |
| `webp` | `0.3` | Encoder & decoder format WebP efisiensi tinggi |
| `rfd` | `0.17` | Dialog pemilihan file dan folder native OS |
| `walkdir` | `2.x` | Penelusuran folder rekursif dengan performa tinggi |
| `serde` & `serde_json` | `1.x` | Serialisasi / deserialisasi data konfigurasi dan progres |
| `anyhow` | `1.x` | Manajemen error komprehensif pada operasi I/O |

---

## 🚀 Panduan Menjalankan Aplikasi di Perangkat Baru

### 1. Clone Repositori
```bash
git clone git@github.com:tiyo1922/slimora-v2.git
cd slimora-v2
```
*(Atau via HTTPS jika belum konfigurasi SSH key: `git clone https://github.com/tiyo1922/slimora-v2.git`)*

### 2. Instal Dependensi Frontend
```bash
npm install
```

### 3. Jalankan dalam Mode Pengembangan (Dev Mode)
```bash
npm run tauri dev
```
> **Catatan Run Pertama**: Saat pertama kali dijalankan, Cargo akan mengunduh dan mengompilasi semua crate Rust yang terdaftar di `Cargo.lock`. Proses kompilasi awal membutuhkan koneksi internet aktif dan waktu sekitar 1–3 menit tergantung spesifikasi CPU Anda. Run berikutnya akan berjalan instan.

### 4. Build Installer / Executable untuk Produksi
```bash
npm run tauri build
```
File installer siap pakai akan berada di:
* **Windows**: `src-tauri/target/release/bundle/nsis/` atau `bundle/msi/`
* **Linux**: `src-tauri/target/release/bundle/deb/` atau `bundle/appimage/`
* **macOS**: `src-tauri/target/release/bundle/dmg/`

---

## 📁 Struktur Direktori

```
slimora-v2/
├── public/                 # Aset statis (SVG icons, logo, banner)
├── src/                    # Frontend React
│   ├── App.jsx             # Antarmuka utama aplikasi
│   ├── StripeProgress.jsx  # Indikator progres animasi custom
│   ├── Icons.jsx           # Set ikon SVG reaktif
│   └── App.css             # Styling CSS
├── src-tauri/              # Backend Rust (Tauri 2)
│   ├── src/
│   │   ├── lib.rs          # Handler perintah Tauri & IPC
│   │   ├── processor.rs    # Engine utama konversi, kompresi, & copy folder
│   │   └── main.rs         # Titik masuk aplikasi desktop
│   ├── Cargo.toml          # Definisi crate & dependensi Rust
│   ├── Cargo.lock          # Kunci versi pasti dependensi Rust
│   └── tauri.conf.json     # Konfigurasi jendela & packaging Tauri
├── package.json            # Dependensi & skrip Node.js
├── vite.config.js          # Konfigurasi bundler Vite
└── README.md               # Dokumentasi proyek
```

---

## 📄 Lisensi
Hak Cipta © 2026 Slimora. Dikelola oleh [@tiyo1922](https://github.com/tiyo1922).
