# Stripe Progress

Progress bar bergaya pil dengan gradasi teal ke ungu, pola garis miring yang bergerak, kilau yang melintas, dan titik cahaya berdenyut di ujung progres. Dibuat dengan Tauri 2. UI-nya ditulis dengan HTML Canvas, sedangkan backend Rust hanya menjalankan window.

## Struktur

```
stripe_progress/
├── README.md
├── src/
│   └── index.html          # UI dan animasi progress bar
└── src-tauri/
    ├── Cargo.toml
    ├── build.rs
    ├── tauri.conf.json
    └── src/
        └── main.rs
```

## Prasyarat

- Rust (stable), install lewat [rustup](https://rustup.rs)
- Dependensi sistem untuk Tauri 2, lihat [panduan resmi Tauri](https://tauri.app/start/prerequisites/)
  - Windows: Microsoft C++ Build Tools dan WebView2 (biasanya sudah terpasang di Windows 10/11)
  - macOS: Xcode Command Line Tools
  - Linux: `webkit2gtk-4.1` dan paket pendukung lainnya

## Menjalankan

```bash
cargo install tauri-cli --version "^2" --locked
cargo tauri dev
```

Perintah di atas akan membuka window aplikasi dengan hot reload untuk folder `src/`.

## Build release

```bash
cargo tauri build
```

Build release membutuhkan ikon. Buat dari satu file PNG (minimal 1024×1024) dengan perintah:

```bash
cargo tauri icon path/ke/logo.png
```

Setelah itu, isi `bundle.icon` di `src-tauri/tauri.conf.json`, misalnya:

```json
"icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.icns", "icons/icon.ico"]
```

## Cara pakai

- Geser slider **Target** untuk mengubah progres. Bar akan bergerak halus menuju nilai target.
- **Reset** mengembalikan progres ke 0%.
- **Selesai** menaikkan progres ke 100%.

## Kustomisasi

Semua logika animasi ada di `src/index.html`, di dalam tag `<script>`:

- `cA` dan `cB` untuk warna awal dan akhir gradasi (RGB).
- `H` untuk tinggi bar dalam piksel.
- `sp` dan `sw` untuk jarak dan lebar pola garis.
- `t * 36` mengatur kecepatan pola garis, dan `t * 140` mengatur kecepatan kilau.
- `Math.exp(-dt * 5)` mengatur kehalusan transisi ke target.

## Catatan

- Font persentase memakai `system-ui`, jadi tampilannya mengikuti font bawaan OS.
- Content Security Policy dinonaktifkan (`"csp": null`) agar script inline berjalan. Untuk produksi, pertimbangkan untuk memindahkan script ke file terpisah dan mengatur CSP yang lebih ketat.
- Frontend tidak memakai framework dan tidak membutuhkan Node.js.
