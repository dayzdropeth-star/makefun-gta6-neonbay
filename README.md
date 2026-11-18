[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/dayzdropeth-star/makefun-gta6-neonbay/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/dayzdropeth-star/makefun-gta6-neonbay/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>

# NEON BAY — Open-World Crime

Game open-world crime orisinal berbasis three.js yang berjalan offline dari file statis di browser desktop. Kota fiksi **Neon Bay** di senja neon: jalan kaki dan mengemudi, traffic dan pejalan kaki, mencuri mobil, sistem wanted 5 bintang dengan kejaran polisi, misi cerita, combat jarak dekat, HUD + minimap, save progres, dan suara hasil sintesis WebAudio.

**Raka** baru bebas dan berutang pada **Madam Vex**, penguasa pelabuhan Neon Bay. Satu paket harus sampai sebelum tengah malam — dan polisi kota tidak pernah tidur. Curi mobil, kabur dari kejaran, selesaikan pekerjaan, dan jadilah legenda jalanan.

## Cara main

Serve folder `game/` secara lokal, lalu buka di browser desktop:

```sh
node serve.ts
# buka http://localhost:8080
```

Klik **MULAI** di layar judul. Selesaikan **Misi 1** (antar paket Neon), lalu **Misi 2** (kabur dari polisi menuju rumah aman). Setelah itu pekerjaan kurir berulang tersedia di seluruh kota. Uang jalanan ($25) tersebar di trotoar — ambil dengan berjalan atau mengemudi melewatinya.

**Seed deterministik:** `?seed=1` selalu membangun kota yang sama (gedung, mobil parkir, traffic, pejalan kaki) dan aliran misi yang sama — berguna untuk mengulang adegan yang sama persis. Seed lain membangun kota yang berbeda. Mode staging `?shot=start|play|end&seed=1` dipakai untuk mengambil screenshot.

## Kontrol

| Input | Aksi |
| --- | --- |
| WASD / panah | Gerak / mengemudi (setir, gas, rem) |
| Mouse | Putar kamera (klik canvas untuk pointer lock) |
| Shift | Lari |
| Spasi | Lompat |
| E | Masuk / keluar mobil |
| F / klik kiri | Pukul |
| M / tombol SUARA | Bisu / nyalakan suara |
| P / Esc | Jeda |

## Sistem

- **Kota prosedural 8×8 blok** — gedung dengan jendela menyala, papan neon, lampu jalan, marka jalan, dan penyeberangan.
- **Lalu lintas & pejalan kaki** — mobil AI melaju di jalan, pejalan kaki berjalan di trotoar dan kabur saat mobil melaju kencang.
- **Mencuri mobil** — mobil parkir (+1 bintang) atau mobil traffic (+2 bintang) menaikkan wanted level.
- **Wanted 1–5 bintang** — mobil polisi muncul dan mengejar; makin tinggi bintang, makin banyak dan cepat polisinya. Bersembunyi jauh dari polisi untuk menurunkan bintang.
- **Misi cerita** — 2 misi (antar paket, kabur dari polisi) + pekerjaan kurir berulang, dengan beacon dan penanda di minimap.
- **Combat** — pukulan jarak dekat; memukul pejalan kaki atau menabraknya menaikkan wanted.
- **HUD & minimap** — health, uang, bintang wanted, kecepatan, objektif misi, dan minimap top-down (pemain, mobil, polisi, penanda misi).
- **Save** — uang dan misi selesai tersimpan di `localStorage`; tombol **LANJUTKAN** memuat progres.
- **Suara** — mesin, sirene, pickup, dan pukulan disintesis dengan WebAudio; tanpa file audio eksternal. Tombol **SUARA** di kanan bawah atau tombol **M** membisukan semuanya.

## Performa

Game menargetkan 60 fps di desktop dengan software rendering sekalipun: HUD di-refresh 10 Hz dan minimap 5 Hz (bukan tiap frame), material fasad gedung di-cache bersama (bukan satu material baru per gedung), lampu jalan memakai dua `InstancedMesh`, dan kamera memakai ulang satu vektor scratch alih-alih mengalokasi `Vector3` baru tiap frame.

## Struktur

```
game/
  index.html            # HUD, layar judul/jeda/game-over, tombol suara
  src/
    main.js             # loop game, misi, wanted/polisi, mengemudi, combat
    world.js            # kota prosedural 8x8, mobil, pejalan kaki, pickup
    rng.js              # RNG ber-seed (mulberry32) + helper int/shuffle
    audio.js            # synth WebAudio: mesin, sirene, jingle misi
  vendor/three.min.js   # three.js r160 (vendored, tanpa CDN)
main.ts                 # entry make.fun: salin game/ + screenshots/ ke /output
screenshots/           # 3 screenshot asli dari headless Chromium (seed 1)
serve.ts                # server statis lokal untuk pengembangan
```

## Screenshot & validasi

Screenshot diambil dari game yang sedang berjalan di headless Chromium dengan mode staging (`?shot=start|play|end&seed=1`, lihat `shots.json`), masing-masing JPEG ≤ 256 KiB. Sebelum submit, jalankan dari repo ini:

```sh
mkdir -p /tmp/gta6-out && MAKEFUN_OUTPUT_DIR=/tmp/gta6-out node main.ts   # harus exit 0
node cli/makefun.mjs check --kit . --repo /path/to/repo   # dari direktori kit gta6-01
```

Jangan pernah menjalankan `main.ts` dengan output dir = direktori repo.

## Teknologi

- three.js r160 (vendored di `game/vendor/three.min.js`, tanpa CDN saat game berjalan)
- JavaScript ES modules, tanpa build step
- Semua aset dibuat prosedural di dalam kode — tanpa aset game komersial apa pun

## Lisensi

MIT — lihat `LICENSE`.
