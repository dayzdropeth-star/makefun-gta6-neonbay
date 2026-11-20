[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/dayzdropeth-star/makefun-gta6-neonbay/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/dayzdropeth-star/makefun-gta6-neonbay/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# NEON BAY — Mengemudi Bebas di Kota Pelabuhan Neon

Entri untuk bounty **make.fun GTA 6 (gta6-01)**: [https://make.fun/bounty/gta6-01](https://make.fun/bounty/gta6-01)

NEON BAY adalah game mengemudi open-world 3D di kota pelabuhan fiksi yang
tidak pernah tidur. Semua yang kamu lihat — gedung, papan nama toko,
mobil, misi, sampai suara mesin — dibuat dari nol khusus untuk game ini.
Tidak ada aset, nama, musik, atau karakter dari game komersial mana pun.

Kamu memulai permainan di trotoar saat senja, di samping sedan magenta
milikmu. Dari sana kotanya milikmu: ambil mobil, antar paket kilat,
jemput penumpang yang terburu-buru, dan kabur dari kejaran polisi ketika
bintang wanted-mu mulai menyala.

## Yang ada di dalam game

- **Kota 5×5 blok** di tepi teluk: menara dengan jendela menyala, papan
  neon toko-toko fiksi, lampu jalan, pepohonan, dan promenade di tepi air.
- **Siklus siang–malam + cuaca**: satu hari penuh berjalan sekitar 8
  menit. Cerah, berkabut, hujan, dan badai bergantian — jalan basah
  membuat mobil lebih licin dan jarak pandang menyempit saat badai.
- **Lalu lintas hidup**: sedan, taksi, dan truk mengikuti jam sibuk —
  pagi dan sore paling padat, dini hari paling sepi.
- **Sistem wanted 5 bintang**: menabrak gedung atau mobil dan mencuri
  mobil menaikkan wanted. Mulai bintang 3, polisi mengejar dengan sirene.
  Bila mereka menyentuhmu, kamu tertangkap dan kena denda.
- **4 misi**: tiga misi cerita berurutan (antar paket dari pelabuhan,
  taksi tengah malam, dan kabur dari kejaran selama 60 detik) plus job
  Kurir Neon yang bisa diulang tanpa batas.
- **Jalan kaki & mengemudi**: turun dari mobil, jalan menyusuri trotoar,
  lalu curi mobil warga yang lewat — dengan konsekuensi.
- **Suara sintetis**: mesin, klakson, tabrakan, decit ban, dan sirene
  semuanya dibuat dengan WebAudio, tanpa file audio sama sekali.
- **HUD lengkap**: jam, cuaca, uang, bintang wanted, objektif misi,
  kecepatan, dan minimap kota yang menampilkanmu, lalu lintas, dan polisi.
- **Progres tersimpan**: uang dan jumlah misi selesai tersimpan otomatis
  di localStorage browser.

## Cara main

Buka `game/index.html` lewat server statis (lihat "Menjalankan" di
bawah), lalu klik **MULAI JELAJAH** atau tekan Enter.

| Tombol | Aksi |
| ------ | ---- |
| W / ↑ | Gas |
| S / ↓ | Rem / mundur |
| A D / ← → | Belok (jalan kaki: geser) |
| Mouse | Putar kamera (klik layar dulu) |
| E | Naik mobil · turun dari mobil · curi mobil |
| H | Klakson |
| Spasi | Rem tangan |
| M | Suara hidup / mati |
| P / Esc | Jeda |
| F1 | Panel cara main |

Dekati **penanda biru** yang bercahaya untuk mengambil misi, lalu ikuti
penanda **kuning** (jemput) dan **hijau** (antar). Perhatikan timer di
objektif — misi yang kehabisan waktu dianggap gagal dan bisa diulang
dari penanda biru.

**Tips singkat:** wanted turun sendiri bila kamu diam-diam tidak berbuat
onar selama setengah menit. Jalan basah setelah hujan membuat belokan
lebih liar — rem tangan (Spasi) membantumu berputar tajam, tapi juga
menaikkan risiko selip. Mobil polisi lebih cepat dari sedan biasa, jadi
jangan adu lurus: belok tajam di persimpangan untuk memutus kejaran.

## Menjalankan

Game ini 100% file statis dan berjalan offline — tidak ada request
jaringan apa pun. Yang dibutuhkan hanya server statis karena modul ES
tidak boleh dimuat dari `file://`.

```sh
# dari root repo
node serve.ts
# buka http://localhost:8080
```

Atau server statis apa pun yang menayangkan folder `game/`, misalnya:

```sh
npx serve game
python3 -m http.server --directory game 8080
```

Untuk kota yang berbeda, tambah `?seed=katamu` di alamat — seed yang
sama selalu membangun kota, lalu lintas, dan misi yang sama.

## Struktur repo

```text
game/
  index.html        # HUD + layar cover/jeda/busted/complete
  vendor/
    three.min.js    # three.js (vendored, offline)
  src/
    main.js         # inti game: pemain, mobil, polisi, HUD, kamera
    rng.js          # angka acak deterministik (mulberry32 + FNV-1a)
    sky.js          # langit, siklus siang-malam, cuaca, hujan
    world.js        # kota: gedung, jalan, lampu, tabrakan gedung
    traffic.js      # lalu lintas + mobil polisi
    missions.js     # 3 misi cerita + job kurir
    audio.js        # suara sintetis WebAudio
main.ts             # entrypoint penyerahan: salin game + screenshot,
                    # tulis dossier.json (Node 22, stdlib saja)
serve.ts            # server statis untuk main lokal
shots.json          # 3 adegan screenshot staging
screenshots/        # 1-start.jpg, 2-play.jpg, 3-end.jpg
vendor/
  makefun-game.ts   # pustaka dossier make.fun (jangan diubah)
```

## Penyerahan (make.fun)

```sh
mkdir -p /tmp/neonbay-out
MAKEFUN_OUTPUT_DIR=/tmp/neonbay-out node main.ts
```

`main.ts` menyalin `game/` dan `screenshots/` ke direktori output lalu
menulis `dossier.json` dengan `buildDossier` dari
`./vendor/makefun-game.ts`. Jangan pernah mengarahkan
`MAKEFUN_OUTPUT_DIR` ke direktori repo ini sendiri — penyalinan akan
menimpa sumbernya.

## Screenshot

Tiga adegan diambil lewat mode staging (`?shot=start|play|end&seed=1`,
lihat `shots.json`): layar awal kota senja, mengemudi di jalanan dengan
lalu lintas, dan adegan akhir dengan kejaran polisi.

## Lisensi

Kode game ini berlisensi MIT (lihat `LICENSE`). three.js di
`game/vendor/` mengikuti lisensinya sendiri.
