# Implementation Status

Status diperbarui: 13 Oktober 2026, Asia/Jakarta.

## Runtime aktif

- PostgreSQL 17 berjalan sebagai Windows service `postgresql-x64-17`.
- PM2 `ism-api` online pada port 8001.
- PM2 `ism-web` online pada port 3000.
- `/health/live` dan `/health/ready` sukses.
- Login admin, dashboard authenticated, CSRF, dan logout lulus smoke test.
- Typecheck API/web dan production build lulus.

## Sudah berfungsi

- Web/mobile authentication dasar, session web, opaque mobile token, CSRF, role admin/user, password Argon2id, logout, dan change password.
- User, category, item type, location, custom field CRUD dasar.
- Asset CRUD, filter/search dasar, custom data, assignment local/HR payload, transfer, check-in, status transition, history, dan local photo storage.
- Dashboard aggregation dasar.
- Monitor CRUD, TCP probe sederhana, persisted sample/event, history, uptime, dan cached switch port/sensor response.
- IT support report CRUD dan CSV; inventory report JSON dasar.
- Settings encrypted secret storage dan public branding.
- Floor-map editor state, area CRUD, direct/group ACL evaluation, Map Asset position/room exclusivity.
- APK metadata/upload/download/update check.
- Audit mutation dasar, token cleanup job, health/readiness, Swagger non-production.
- PM2 ecosystem, Docker files, PostgreSQL schema, seed admin, dan reverse proxy web/API.

## Belum selesai / belum parity dengan PRD

### Prioritas kritis

1. Versioned Prisma migration belum tersedia; bootstrap saat ini memakai `prisma db push`. Migrator database PHP lama, dry-run, backup, checksum file, dan cutover/rollback belum dibuat.
2. Automated tests belum ada: unit, integration PostgreSQL, contract PHP, E2E, mock integration, migration test, performance test, dan security scan CI.
3. Compatibility route untuk frontend/mobile/PHP lama serta fixture parity belum dibuat.
4. Dependency audit masih melaporkan 7 vulnerability production: 4 high dan 3 moderate.
5. Rate limit login, brute-force protection, bcrypt legacy verification/rehash, mobile last-used throttling, structured JSON logging, metrics, dan distributed job lock belum selesai.

### Integrasi dan worker

6. External Asset Sync baru membuat job record; fetch pagination, normalization, reconciliation guard, snapshot, dan scheduler belum diimplementasikan.
7. HR Directory masih mengembalikan data kosong; HTTP mapping, nested path, cache, fallback, dan re-verification belum diimplementasikan.
8. Monitoring baru melakukan TCP reachability. Ping aman, HTTP check, SNMP v2c, interface counters, rate, physical layout Cisco/Juniper, PoE, sensor, VLAN 1/40/50/70/80, top users, dan bounded concurrency belum ada.
9. Traffic poller, temperature alert/hysteresis, SMTP send/test, retention history/event, asset sync scheduler, orphan upload cleanup, dan distributed job observability belum ada.
10. S3/MinIO storage adapter, connectivity test, rollback cleanup, dan migrasi local-to-S3 belum ada.
11. LDAP/ADDS operation masih stub: connection test nyata, OU/user/group/computer, password over TLS, enable/disable, dan membership belum ada.
12. ZeroTier Central member list/update/delete masih stub; account/network CRUD juga belum lengkap.
13. Ollama diagnosis/model list, tool planner, fingerprint memory reuse, draft extraction, validation lengkap, dan transactional AI actions masih stub.
14. UniFi login/session refresh/AP filtering, Blue Iris challenge/status/snapshot/record count, dan switch SSH Cisco/Juniper command/parsing belum terhubung ke protocol client nyata.

### API dan UI

15. Inventory export PDF/CSV streaming dan filter report lengkap belum ada.
16. Floor-map background/VSD/icon/CCTV-reference upload, watcher status, cable editor, secret redaction per action, serta snapshot proxy belum ada.
17. Floor-map group/grant CRUD API belum lengkap walaupun schema dan effective permission check sudah ada.
18. Map Asset IP update/check endpoint dan safe network probe belum ada.
19. Mobile API baru mencakup auth, asset alias, monitoring alias, floor-map summary, dan update check; response compatibility, ETag/304, options, admin mutation policy, ADDS, ZeroTier, dan AI mobile belum lengkap.
20. Beberapa dashboard/admin page masih menggunakan tabel/form generik. UI detail aset, photo manager, history timeline, floor-map canvas, settings editor, ADDS tree, ZeroTier member management, release multipart upload, AI chat/draft/action, dan report preview/export belum lengkap.
21. Notification dropdown masih visual dan belum terhubung ke temperature/monitoring event backend.

### Operasional

22. PM2 process list sudah disimpan dengan `pm2 save`, tetapi auto-start Windows setelah reboot belum didaftarkan sebagai service/startup task.
23. Production secret manager, TLS/reverse proxy, backup terjadwal, object/file backup, log rotation, monitoring dashboard, dan runbook recovery belum disiapkan.
24. Data production lama belum tersedia, sehingga lossless migration dan parity terhadap backend PHP belum dapat diverifikasi.

# Perkembangan AS, ST, dan CT — 19 Oktober 2026

- AS: hasil opname menampilkan perbedaan lokasi dan serial serta aset yang tidak ditemukan. Approval assignment, transfer, repair, disposal, tahapan verifikasi opname, dan bukti foto masih harus diselesaikan.
- ST: receipt, QC dan putaway terdokumentasi dengan persetujuan terpisah; retur terhubung ke issue dan memerlukan persetujuan; hold dapat dilepas dengan catatan; proposal minimum stock tersimpan dan memiliki status persetujuan. Kode dibuat otomatis dan mutasi stok dicatat pada ledger immutable. Adjustment dan opname sekarang memakai dokumen dengan approval pengguna lain; selisih opname membutuhkan recount dan perubahan ledger setelah snapshot membuat dokumen kedaluwarsa. PO dibuat di ISM dengan kode otomatis dan bersifat opsional pada penerimaan; item dan sisa kuantitas diperiksa, termasuk penerimaan bersamaan. Pelacakan per serial belum selesai.
- CT: 107 marker CCTV telah diimpor ke register. Bukti foto/video dapat disimpan dan diakses dengan izin. Polling Blue Iris memakai cache 15 detik untuk kamera yang terhubung ke marker; status saat server tidak merespons adalah unknown. Pemeriksaan rekaman dan retensi yang dapat diverifikasi, integrasi NVR selain Blue Iris, serta sinkronisasi posisi dua arah belum selesai. Sudut pandang kamera yang terhubung ke marker dapat ditampilkan pada denah berdasarkan posisi marker dan konfigurasi register; panjang coverage bersifat ilustrasi, belum terkalibrasi.
- Akses: akun non-admin tanpa grup tidak lagi otomatis mendapat akses pada modul yang dilindungi; pengecualian role GA dan izin denah tetap berlaku. Endpoint yang belum memiliki aturan eksplisit sekarang ditolak untuk non-admin; dashboard, notifikasi, direktori HR, serta sesi/profile telah dipetakan. Evaluasi lanjutan terhadap kebutuhan masing-masing role tetap diperlukan.
- Pengujian inventory terisolasi (11 tes), izin, dan polling Blue Iris (14 tes) lulus; build frontend lulus. Hasil test suite keseluruhan sebelumnya masih memiliki satu kegagalan pada `monitoring-overview.test.js` terkait timestamp dan suhu data migrasi.
- Endpoint `/inventory/issue` dan `/inventory/release` sekarang menerima `reservationId` dan `qty`; integrasi lain yang memakai format lama perlu diperbarui.

