# Matchday

PWA pribadi untuk FC Barcelona: jadwal (La Liga, Liga Champions, Copa del Rey, Supercopa, uji coba),
skor live, momen laga, line-up, statistik, form, klasemen, top skor dan skuad.

- Data: ESPN public API (tidak resmi), dipanggil langsung dari browser. Semua akses ESPN ada di `espn.js`.
- Kalender: `barca.ics` dibuat ulang tiap 3 jam oleh GitHub Action (`tools/build_ics.py`).
  Langganan: https://khairuddin-n.github.io/matchday/barca.ics
- Rilis: naikkan `VERSION` di `app.js` dan `sw.js` serta `?v=` di `index.html`, lalu push.
