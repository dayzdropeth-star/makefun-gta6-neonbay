[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/dayzdropeth-star/makefun-gta6-neonbay/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/dayzdropeth-star/makefun-gta6-neonbay/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>

# NEON BAY v2 — Open-World Crime

Game open-world crime orisinal berbasis three.js yang berjalan offline dari file statis di browser desktop. Kota fiksi **Neon Bay** di senja neon: jalan kaki dan mengemudi, traffic dan pejalan kaki, mencuri mobil, sistem wanted 5 bintang dengan kejaran polisi, misi cerita, combat jarak dekat, HUD + minimap, save progres, dan suara hasil sintesis WebAudio.

**Raka** baru bebas dan berutang pada **Madam Vex**, penguasa pelabuhan Neon Bay. Satu paket harus sampai sebelum tengah malam — dan polisi kota tidak pernah tidur. Curi mobil, kabur dari kejaran, selesaikan pekerjaan, dan jadilah legenda jalanan.

Yang baru di v2: misi cerita ketiga **Taksi Kilat** — antar penumpang secepat mungkin, makin cepat sampai makin besar tipnya — traffic yang lebih bervariasi, dan kamera mengemudi baru yang lebih jauh dan lebih tinggi supaya jalanan di depan mobil terlihat lebih lega.

## Yang berubah di v2

- **Misi 3 — Taksi Kilat (baru):** misi cerita ketiga, antar penumpang secepat mungkin dengan tip berbasis kecepatan.
- **Traffic lebih bervariasi:** kecepatan dan warna mobil AI kini lebih beragam di tiap seed.
- **Kamera mengemudi baru:** lebih jauh dan lebih tinggi dari kamera jalan kaki, dengan transisi halus saat masuk/keluar mobil.
- **Layar judul dirapikan:** daftar misi kini tercantum lengkap (3 misi cerita + kurir berulang) beserta bayarannya.

## Cara main

Serve folder `game/` secara lokal, lalu buka di browser desktop:

```sh
node serve.ts
# buka http://localhost:8080
```

Klik **MULAI** di layar judul. Selesaikan misi cerita secara berurutan, lalu pekerjaan kurir berulang tersedia di seluruh kota. Uang jalanan ($25) tersebar di trotoar — ambil dengan berjalan atau mengemudi melewatinya.

**Seed deterministik:** `?seed=1` selalu membangun kota yang sama (gedung, mobil parkir, traffic, pejalan kaki) dan aliran misi yang sama — berguna untuk mengulang adegan yang sama persis. Seed lain membangun kota yang berbeda. Mode staging `?shot=start|play|end&seed=1` dipakai untuk mengambil screenshot.

## Misi

| Misi | Tugas | Bayaran |
| --- | --- | --- |
| **Misi 1 — Paket Neon** | Ambil paket di penanda kuning, antar ke tujuan berikutnya | $500 |
| **Misi 2 — Kabur dari Polisi** | Polisi mengejar (wanted 3 bintang): capai rumah aman biru sebelum 90 detik habis | $800 |
| **Misi 3 — Taksi Kilat** *(baru di v2)* | Antar penumpang secepat mungkin; makin cepat sampai, makin besar tipnya | Tip per kecepatan |
| **Kurir berulang** | Setelah misi cerita selesai: ambil paket hijau, antar ke tujuan, ulangi terus | $200 per paket |

Gagal di Misi 2 tidak mengakhiri permainan — Raka tetap bebas dan pekerjaan kurir dibuka beberapa detik kemudian. Penanda misi berupa pilar cahaya (kuning untuk paket, biru untuk rumah aman, hijau untuk kurir) dan berlian di minimap.

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
- **Lalu lintas & pejalan kaki** — mobil AI melaju di jalan dengan kecepatan dan warna yang bervariasi; pejalan kaki berjalan di trotoar dan kabur saat mobil melaju kencang.
- **Mencuri mobil** — mobil parkir (+1 bintang) atau mobil traffic (+2 bintang) menaikkan wanted level. Mobil polisi tidak bisa dicuri.
- **Wanted 1–5 bintang** — mobil polisi muncul dan mengejar; makin tinggi bintang, makin banyak dan cepat polisinya. Bersembunyi jauh dari polisi selama 6 detik untuk menurunkan satu bintang.
- **Misi cerita** — 3 misi (antar paket, kabur dari polisi, Taksi Kilat) + pekerjaan kurir berulang, dengan beacon dan penanda di minimap.
- **Combat** — pukulan jarak dekat; memukul atau menabrak pejalan kaki menaikkan wanted.
- **Kamera mengemudi** — kamera mengikuti dari belakang mobil, lebih jauh dan lebih tinggi dibanding kamera jalan kaki, dengan transisi halus saat masuk/keluar mobil.
- **HUD & minimap** — health, uang, bintang wanted, kecepatan, objektif misi, dan minimap top-down (pemain, mobil, polisi, penanda misi, uang jalanan).
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

`main.ts` deterministik: dua run dengan input yang sama menghasilkan byte yang identik di `/output` (urutan file diurutkan, `dossier.json` ditulis sebagai canonical JSON).

## Teknologi

- three.js r160 (vendored di `game/vendor/three.min.js`, tanpa CDN saat game berjalan)
- JavaScript ES modules, tanpa build step
- Semua aset dibuat prosedural di dalam kode — tanpa aset game komersial apa pun

## Orisinalitas

NEON BAY adalah karya orisinal: kota, karakter (Raka, Madam Vex), cerita, nama misi, dan semua model dibuat prosedural dari kode. Tidak ada aset, nama, merek, atau materi dari Rockstar Games, Grand Theft Auto, atau game komersial lain yang dipakai — termasuk di dalam kode, teks, maupun screenshot. three.js dipakai di bawah lisensi MIT-nya sebagai library, bukan sebagai aset game.

## Lisensi

MIT — lihat `LICENSE`.
