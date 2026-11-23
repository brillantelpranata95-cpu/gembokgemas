# GembokGemas — Authenticator 2FA untuk Chrome

GembokGemas adalah ekstensi Chrome untuk menyimpan akun TOTP/HOTP dan membuat kode 2FA
sepenuhnya offline. Secret disimpan dalam brankas terenkripsi dengan kata sandi utama,
dan akun dapat diimpor dari Google Authenticator melalui QR ekspor resminya.

Seluruh antarmuka memakai bahasa visual desktop 90-an: title bar, tombol bevel,
pola checker, ticker berjalan, dan doodle CD / floppy / kaset. Palet biru/pink
serta neobrutalisme tetap dipertahankan, dengan biru sebagai warna struktur dan
pink sebagai aksen. Semua aset dibuat lokal.

> **Penting — tidak ada koneksi atau sinkronisasi langsung dengan Google Authenticator.**
> Google Authenticator tidak menyediakan API publik, server sync pihak ketiga, atau cara
> bagi aplikasi lain untuk membaca brankas di ponsel. Satu-satunya cara resmi memindahkan
> akun adalah **Transfer accounts → Export accounts** di aplikasi Google Authenticator,
> lalu memindai/mengunggah QR yang dihasilkan. Impor ini bersifat **salinan satu arah**:
> akun baru yang ditambahkan ke ponsel setelahnya tidak otomatis muncul di GembokGemas.
> Ekspor ulang QR jika ingin memindahkan akun tambahan.

## Fitur

- TOTP (SHA1/SHA256/SHA512, 6–8 digit, periode 1–3600 detik) dan HOTP.
- Impor QR ekspor Google Authenticator multi-QR (`otpauth-migration://`).
- Impor tautan standar `otpauth://` dan input manual Base32.
- Empat metode impor: kamera, unggah gambar/screenshot, tempel tautan, dan manual.
- Deteksi duplikat terhadap akun yang sudah tersimpan.
- Brankas lokal terenkripsi AES-256-GCM.
- Sesi terbuka sampai Chrome ditutup; kunci manual, ganti kata sandi utama, dan reset brankas.
- Ekspor/impor cadangan terenkripsi.
- Popup untuk menyalin kode dengan sekali klik.
- Isi kode TOTP langsung ke kolom verifikasi tab aktif lewat tombol **Isi** di
  popup. Akses hanya diberikan sementara saat popup dipakai, tanpa izin host
  permanen.
- Tema desktop 90-an dengan title bar, ticker, tombol bevel, pola checker, dan
  doodle CD / floppy / kaset / CRT.
- Ringan: CSS tanpa lapisan tema ganda. Decoder QR (257 KB), parser impor, dan
  pengisi OTP baru dimuat saat fitur terkait benar-benar dipakai.
- Tanpa server, tanpa analytics, dan tanpa permintaan jaringan.

## Nuansa 90-an

GembokGemas sengaja terasa seperti aplikasi desktop kecil dari era Windows 95–98:
jendela biru dengan title bar bergaris, tombol cembung, label kuning bertuliskan
**BARU** dan **100% OFFLINE**, ticker statis di bawah header, serta pola checker
biru/pink sebagai latar. Fungsi diutamakan daripada tampilan: seluruh doodle
dekoratif dan animasi tema dihapus supaya markup dan stylesheet tetap ringan,
sedangkan title bar, bevel, checker, dan bayangan keras dipertahankan.

Detail yang dipakai:

- **Warna:** ink `#2a2140`, paper `#fff4fb`, biru `#7fc8ff`, pink `#ff92c8`,
  pink-deep `#e63a8e`, lilac `#c9b6ff`, mint `#a9f0d8`, lemon `#ffe58a`.
  Biru dipakai untuk struktur utama, pink untuk aksen dan status.
- **Bentuk:** border tebal, bayangan keras tanpa blur, sudut kecil, dan garis putus-putus
  ala kotak dialog lama. Tidak ada elemen scrapbook atau stiker miring.
- **Tipografi sistem:** Trebuchet MS untuk teks, Arial Black untuk judul, dan Lucida
  Console untuk label kecil serta kode. Tidak ada web font atau permintaan jaringan.
- **Nada bicara:** semua label, tombol, dan pesan pakai gaya ngobrol jadul yang
  lucu (“bip bip, beres!”, “sabar, ya…”). Kata kerja tombol tetap jelas, jadi
  fungsinya nggak berubah.
- **Easter egg teks:** “Est. 199X”, “Best viewed in 800×600”, dan “100% OFFLINE” di
  header, footer, serta empty state.

## Tampilan

GembokGemas memakai palet biru/pink dengan garis tebal dan bayangan keras yang tetap
ramah dibaca. Ikon ekstensi berupa gembok netral dengan badan pink, shackle biru, dan
latar checker biru/pink, sehingga mudah dikenali di toolbar tanpa terlihat kekanak-
kanakan. Semua ilustrasi adalah SVG/CSS lokal; tidak ada aset atau permintaan jaringan
tambahan.

Decoder QR `lib/jsQR.js`, parser impor, dan pengisi OTP baru dimuat saat fitur
terkait benar-benar dipakai. Tema juga sengaja dipangkas: tanpa doodle dekoratif,
tanpa animasi, dan tanpa lapisan CSS ganda. Popup dan halaman pengaturan dibuka
dalam puluhan milidetik setelah Chrome siap.

## Batasan yang perlu dipahami

- **Bukan sinkronisasi langsung.** GembokGemas tidak dapat membaca Google Authenticator
  di HP secara langsung. Impor hanya lewat QR ekspor resmi.
- **Impor bersifat sementara/satu kali.** Perubahan di ponsel (akun baru, ganti label,
  hapus akun) tidak tercermin otomatis. Lakukan ekspor ulang bila perlu.
- **Kata sandi utama tidak bisa dipulihkan.** Jika lupa kata sandi, satu-satunya cara
  adalah reset brankas (data lokal terhapus) lalu pulihkan dari file cadangan yang
  masih memakai kata sandi lama.
- **HOTP memakai counter.** Setiap ketukan membuat kode berikutnya dan menaikkan
  counter. Jika kode tidak sempat dipakai, counter di layanan bisa tertinggal dan
  kode berikutnya ditolak. Gunakan TOTP bila layanan mendukung.
- **Cadangan tetap terenkripsi.** File cadangan hanya bisa dibuka dengan kata sandi
  yang berlaku saat file itu dibuat.
- **Isi otomatis hanya untuk TOTP.** Tombol **Isi** tersedia pada akun TOTP. HOTP
  tetap manual agar counter tidak terpakai tanpa sengaja. Pengisian hanya dilakukan
  ke kolom input biasa atau open shadow DOM di frame utama; halaman berbasis canvas,
  closed shadow DOM, dan iframe lintas origin tidak didukung. Kolom pembayaran
  seperti CVC dan nomor kartu selalu dilewati. Tidak ada auto-submit.

## Pemasangan

1. Buka `chrome://extensions` di Chrome.
2. Aktifkan **Developer mode**.
3. Klik **Load unpacked**, lalu pilih folder proyek ini (`D:\Authenticator`).
4. Sematkan ikon GembokGemas di toolbar.

Manifest memakai `key` pengembangan dengan ID tetap
`njgjjjckniihpfdekkdicelphjfmekfm`. Hapus/ganti `key` tersebut bila ekstensi akan
dipublikasikan ke Chrome Web Store.

> Chrome resmi versi baru memblokir pemuatan ekstensi lewat flag command line
> `--load-extension`. Pemasangan manual melalui halaman `chrome://extensions` tetap
> dapat digunakan. Untuk pengujian otomatis, gunakan Chromium/Chrome for Testing.

## Cara pakai

### 1. Buat brankas

Buka popup GembokGemas atau halaman opsi, lalu buat kata sandi utama minimal 8 karakter.
Gunakan kata sandi yang kuat dan unik; kata sandi ini melindungi seluruh secret 2FA.

### 2. Ekspor dari Google Authenticator

1. Buka **Google Authenticator** di ponsel.
2. Ketuk menu **⋮** → **Transfer accounts**.
3. Pilih **Export accounts**.
4. Centang akun yang ingin dipindahkan, lalu ketuk **Next/Export**.
5. Google menampilkan satu atau beberapa QR. Jangan tutup layar tersebut sebelum
   semua QR selesai dipindai.

QR ekspor berisi secret asli. Jangan membagikannya, dan hapus screenshot QR setelah
selesai digunakan.

### 3. Impor ke GembokGemas

Buka halaman **Impor** (dari popup: **Tambah akun**), lalu pilih metode:

- **Kamera** — arahkan kamera ke QR di layar HP. Untuk ekspor beberapa QR, pindai
  semuanya; indikator batch menunjukkan QR yang sudah terbaca. Kamera berhenti
  otomatis saat batch selesai.
- **Gambar** — unggah satu atau beberapa screenshot QR. Bisa drag-and-drop.
  Gambar yang diputar 90°/180°/270° tetap dicoba dibaca.
- **Tempel** — tempel satu atau beberapa tautan `otpauth-migration://` atau
  `otpauth://`.
- **Manual** — masukkan secret Base32 beserta algoritma, digit, dan periode.

Setelah QR terbaca, periksa daftar **Akun siap diimpor**. Akun yang sudah ada akan
ditandai **Sudah ada** dan tidak dipilih. Klik **Tambahkan N akun** untuk menyimpan.

### 4. Memakai kode

- Buka popup, lalu klik baris akun TOTP untuk menyalin kode. Kode diperbarui otomatis
  setiap periode.
- Klik tombol **Isi** di baris akun TOTP untuk mengetikkan kode langsung ke kolom
  verifikasi di tab yang sedang aktif. Jika kolom tidak dikenali, klik dulu kolom
  OTP di halaman lalu tekan **Isi** lagi. Kolom pembayaran (CVC/kartu), pencarian,
  email, dan kata sandi biasa selalu dilewati. Kode tidak dikirim ke jaringan dan
  tidak disubmit otomatis.
- Baris HOTP menampilkan **Ketuk**; setiap ketukan membuat dan menyalin kode HOTP
  berikutnya sekaligus menaikkan counter.
- Halaman opsi menampilkan daftar akun, pencarian, edit label, dan hapus akun.

### 5. Cadangan

Buka tab **Cadangan**:

- **Unduh cadangan terenkripsi** menghasilkan file JSON brankas dengan nama
  `gembokgemas-backup-YYYY-MM-DD.json`. File ini masih terenkripsi dan membutuhkan
  kata sandi yang berlaku saat ekspor.
- **Pulihkan cadangan** mendukung mode **Gabungkan** (hanya menambah akun yang belum
  ada) atau **Ganti brankas** (menghapus akun saat ini dan memakai isi cadangan;
  kata sandi utama menjadi kata sandi file cadangan).
- Cadangan dari versi lama (penanda `authvault`) tetap dapat dipulihkan; cadangan baru
  memakai penanda `gembokgemas`.

Disarankan membuat cadangan setelah menambah atau mengubah akun penting.

## Keamanan

- Secret dienkripsi dengan **AES-256-GCM**.
- Kunci diturunkan dari kata sandi utama dengan **PBKDF2-SHA256, 600.000 iterasi**,
  salt acak 16 byte, dan IV acak per penyimpanan.
- Kata sandi utama hanya diminta **sekali per sesi Chrome**. Setelah dibuka, brankas
  tetap terbuka saat berpindah tab atau membuka popup. Sesi berakhir saat Chrome
  ditutup, brankas dikunci manual, atau direset.
- Kunci sesi disimpan di `chrome.storage.session`, yang hanya dapat diakses halaman
  ekstensi dan dibersihkan saat Chrome ditutup. Tidak ada batas waktu otomatis.
- Ekstensi meminta izin `storage`, `clipboardWrite`, `activeTab`, dan `scripting`.
  Tidak ada host permission permanen: akses ke halaman aktif hanya diberikan
  sementara saat kamu membuka popup, dan hanya kode TOTP saat itu yang dikirim ke
  halaman saat tombol **Isi** ditekan.
- Ekstensi tidak memiliki kode jaringan atau server.
- Reset brankas menghapus vault dan sesi. File cadangan yang sudah diunduh tetap ada,
  tetapi tetap memerlukan kata sandi lamanya.

Keterbatasan yang wajar: siapa pun yang menguasai profil Chrome dan tahu kata sandi
utama dapat membuka brankas. Kode yang disalin berada di clipboard dan dapat dibaca
aplikasi lain di perangkat yang sama. Kode yang diisi ke halaman juga terlihat oleh
skrip halaman tersebut, sama seperti jika kamu mengetiknya sendiri.

## Format impor yang didukung

- `otpauth-migration://offline?data=...` — payload protobuf ekspor Google Authenticator,
  termasuk batch beberapa QR.
- `otpauth://totp/...` dan `otpauth://hotp/...` — parameter `secret`, `issuer`,
  `algorithm`, `digits`, `period`, dan `counter` sesuai standar.

Algoritma yang didukung: SHA1, SHA256, SHA512. Algoritma MD5 dari payload migrasi
dilewati dengan catatan.

## Struktur proyek

```text
manifest.json          Konfigurasi Manifest V3
popup.html/css/js      Popup daftar akun dan kode
vault.html/css/js      Halaman opsi: akun, impor, cadangan, pengaturan
icons/                 Ikon GembokGemas 16/32/48/128 px
src/crypto.js          PBKDF2, AES-GCM, utilitas Base64
src/otp.js             HOTP/TOTP dan Base32
src/autofill.js        Pengisian kode TOTP ke kolom verifikasi tab aktif
src/migrate.js         Parser QR migrasi Google Authenticator dan otpauth://
src/storage.js         Vault terenkripsi, sesi, cadangan
src/util.js            Helper UI, clipboard, format tanggal
lib/jsQR.js            Decoder QR lokal (jsQR 1.4.0, dimuat saat dibutuhkan)
test/core.test.mjs     Tes vektor OTP, parser, crypto, dan alur vault
```

## Pengembangan dan pengujian

Prasyarat: Node.js 18+ (memakai `crypto.subtle` bawaan; proyek ini diuji di Node 26).

```powershell
npm test
```

Tes inti mencakup vektor RFC 4226/6238, Base32, parser protobuf migrasi, parser
`otpauth://`, enkripsi/dekripsi, alur vault dengan mock `chrome.storage`, cadangan,
kompatibilitas cadangan lama, perubahan kata sandi, dan pemeriksaan sesi.

Untuk pengujian manual, muat folder ini sebagai ekstensi unpacked. ID tetap
`njgjjjckniihpfdekkdicelphjfmekfm` memungkinkan halaman diuji lewat
`chrome-extension://njgjjjckniihpfdekkdicelphjfmekfm/vault.html`.

Tes otomatis di repo ini tidak menjalankan browser; pengujian UI dilakukan manual
atau dengan alat CDP/Playwright pada Chromium.

## Privasi dan afiliasi

GembokGemas tidak berafiliasi dengan Google. Google Authenticator adalah merek dagang
Google LLC. Ekstensi ini tidak mengirim data ke mana pun dan tidak memiliki server.

## Kredit

- [jsQR](https://github.com/cozmo/jsQR) 1.4.0 oleh Cosmo Wolfe — Apache License 2.0.
  Salinan lisensi ada di `lib/LICENSE-jsQR.txt`.
- Ikon GembokGemas dibuat khusus untuk proyek ini.
