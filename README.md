[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/dayzdropeth-star/makefun-gta6-neonbay/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/dayzdropeth-star/makefun-gta6-neonbay/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# NEON BAY — Open-World Driving di Kota Neon

Entri untuk kompetisi **make.fun GTA 6 (gta6-01)**: game mengemudi
open-world 3D original di kota fiksi **Neon Bay**. Dibangun dengan
three.js (vendored) dan tanpa aset dari game komersial apa pun — semua
nama, gedung, kendaraan, misi, dan suara dibuat dari nol untuk game ini.

Kamu mulai di trotoar saat senja, di samping mobil magenta-mu. Ambil
mobil, jelajahi kota, selesaikan misi cerita, dan jangan sampai polisi
menangkapmu.

## Cara main

Buka `game/index.html` lewat server statis (lihat "Menjalankan" di bawah),
lalu klik **MULAI JELAJAH** atau tekan Enter.

| Tombol | Aksi |
| ------ | ---- |
| W / ↑ | Gas |
| S / ↓ | Rem / mundur |
| A D / ← → | Belok (jalan kaki: putar badan) |
| Spasi | Rem tangan |
| E | Naik mobil parkir · turun dari mobil · curi mobil yang sedang jalan |
| H | Klakson |
| M | Suara hidup/mati |
| P / Esc | Jeda |
| 1–4 | Mulai misi 1–3 / job Kurir Neon |
| R | Kembali ke jalan setelah tertangkap |

## Fitur

- **Kota Neon Bay** — grid 5×5 avenue dengan gedung bertingkat, jendela
  menyala, papan neon (RAMEN, ARCADE, KOPI, SINEMA, ...), lampu jalan,
  lampu lalu lintas yang bersiklus, pepohonan, dan teluk di sisi selatan.
- **Siklus siang-malam** — jam berjalan dari senja ke malam ke pagi;
  warna langit, matahari, bulan, dan bintang berubah mengikuti jam.
- **Cuaca** — Cerah, Berkabut, Hujan, dan Badai berganti sendiri. Hujan
  membasahi jalan: grip turun, mobil lebih lambat dan mudah selip.
- **Lalu lintas 3 jenis** — sedan, taksi kuning, dan truk/bus besar.
  Kepadatan mengikuti jam: paling ramai saat jam sibuk (07–09 dan 17–19),
  paling sepi tengah malam.
- **Wanted 5 bintang** — mencuri mobil dan menabrak lalu lintas menaikkan
  bintang. Polisi mengejar dengan sirene dan lampu berkedip; kalau mereka
  menempel saat kamu pelan, kamu tertangkap dan kena denda. Sembunyi 30
  detik untuk menurunkan satu bintang.
- **3 misi cerita + job kurir** — Paket Kilat (antar paket tepat waktu),
  Lolos dari Kejaran (bertahan 60 detik dari polisi), Taksi Kilat (jemput
  penumpang dan antar secepatnya, bonus makin besar makin cepat), plus
  Kurir Neon yang bisa diulang setelah misi cerita selesai.
- **Jalan kaki & curi mobil** — turun dari mobil kapan saja; mobil parkir
  gratis dinaiki, mobil yang sedang jalan bisa dicuri (wanted +1).
- **HUD + minimap** — uang, bintang wanted, jam, cuaca, objektif misi
  dengan timer, kecepatan, dan peta mini dengan posisi pemain, lalu
  lintas, polisi, dan penanda misi.
- **Audio prosedural** — suara mesin, klakson, sirene, tabrakan, dan
  denting misi semuanya disintesis WebAudio; tanpa file suara.
- **Seeded** — `?seed=N` membangun kota, lalu lintas, dan target misi
  yang sama setiap kali.
- **Simpan otomatis** — uang dan progres misi tersimpan di localStorage.

## Mode screenshot

Tiga adegan bisa dipentaskan secara deterministik untuk `screenshots/`:

| Query | Adegan |
| ----- | ------ |
| `?shot=start&seed=1` | Layar judul di atas kota saat senja |
| `?shot=play&seed=1` | Mengemudi dengan autopilot di jalanan |
| `?shot=end&seed=1` | Misi 1 selesai, banner kemenangan tampil |

Setiap adegan memainkan aturan game yang sesungguhnya dari dunia baru
(dengan seed yang sama hasilnya sama), lalu menandai
`window.__shotReady` saat frame selesai dilukis.

## Menjalankan

```sh
# Mainkan di browser:
node serve.ts
# lalu buka http://localhost:8080

# Hand-in (menyalin game/ + screenshots/ dan menulis dossier.json):
mkdir -p /tmp/neonbay-out
MAKEFUN_OUTPUT_DIR=/tmp/neonbay-out node main.ts
```

Jangan pernah menjalankan `main.ts` dengan `MAKEFUN_OUTPUT_DIR` menunjuk
ke direktori repo ini sendiri — salinan akan menimpa sumbernya.

## Struktur

```
game/
  index.html            HUD, menu, overlay (judul/jeda/tertangkap/selesai)
  vendor/three.min.js   three.js r160 (vendored)
  src/
    main.js             boot, loop, fisika mobil, polisi, kamera, HUD, minimap
    rng.js              RNG seeded (mulberry32 + helper)
    sky.js              siklus siang-malam, cuaca, hujan, grip jalan
    world.js            kota: jalan, gedung, neon, lampu, tabrakan
    traffic.js          lalu lintas 3 jenis + jam sibuk
    missions.js         3 misi cerita + job kurir berulang
    audio.js            suara prosedural WebAudio
main.ts                 program hand-in (menyalin game + screenshot, dossier)
serve.ts                server statis untuk pengembangan
shots.json              daftar screenshot
screenshots/            1-start.jpg, 2-play.jpg, 3-end.jpg
```

## Catatan teknis

- Game berjalan offline dari file statis: tidak ada network request,
  semua yang dimuat berasal dari `game/` atau dibuat saat runtime
  (tekstur jendela dan papan neon dilukis di canvas).
- three.js r160 dimuat sebagai script klasik (`window.THREE`), lalu
  `main.js` sebagai ES module.
- Loop memakai fixed-step 1/60 detik; fisika mobil arcade dengan grip
  yang dipengaruhi cuaca.
- Semua angka (kecepatan, reward, timer) bisa diubah di masing-masing
  modul tanpa menyentuh modul lain.

## Lisensi

MIT — lihat `LICENSE`.
