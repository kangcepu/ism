# Product Requirements Document — ISM Continuation

## Penyelesaian Gap, Production Hardening, dan Legacy Parity

| Atribut | Nilai |
|---|---|
| Status | Draft for Implementation |
| Versi | 1.0.0 |
| Tanggal | 13 Oktober 2026 |
| Dokumen induk | `PRD.md` |
| Baseline implementasi | `IMPLEMENTATION_STATUS.md` |
| Target stack | NestJS, Next.js, Prisma, PostgreSQL, PM2 |
| Port API | `8001` |
| Port web | `3000` |

## 1. Tujuan

Dokumen ini mendefinisikan pekerjaan lanjutan untuk membawa implementasi IS Department Management System dari baseline saat ini menuju production-ready dan parity terhadap sistem PHP lama.

Dokumen ini hanya mencakup capability yang belum selesai atau belum dapat diverifikasi. Capability yang sudah selesai tetap mengikuti `PRD.md` dan tidak boleh diregresikan.

## 2. Baseline yang Harus Dipertahankan

Implementasi lanjutan wajib mempertahankan kondisi berikut:

1. PostgreSQL 17 sebagai database utama.
2. NestJS API pada `0.0.0.0:8001`.
3. Next.js web pada port `3000`.
4. PM2 process `ism-api` dan `ism-web`.
5. Web session HttpOnly cookie, CSRF double-submit, dan opaque mobile token.
6. Role `admin` dan `user` beserta floor-map ACL.
7. Response envelope, audit mutation, soft-delete, asset lifecycle transaction, dan local file streaming yang sudah ada.
8. Template login, sidebar, navbar, dan profile yang sudah diterapkan.

Setiap perubahan schema, response, route, atau UI wajib backward-compatible atau disertai migration/compatibility adapter.

## 3. Sasaran Produk

1. Menyelesaikan seluruh stub dan placeholder integration.
2. Menyediakan migrasi database dan file legacy yang deterministik serta dapat di-rollback.
3. Mencapai compatibility dengan web/mobile lama selama masa cutover.
4. Menyelesaikan scheduled jobs, monitoring network, report, floor-map ecosystem, dan AI workflow.
5. Menyediakan UI operasional lengkap, bukan tabel atau form generik.
6. Menambahkan automated testing dan CI security gate.
7. Menyiapkan deployment production, backup, observability, dan recovery procedure.

## 4. Non-Goals

1. Mengganti PostgreSQL dengan database lain.
2. Mendesain ulang empat template UI utama.
3. Menambah role bisnis baru di luar `admin` dan `user`.
4. Menghapus compatibility route sebelum seluruh client lama dinyatakan selesai migrasi.
5. Menjalankan Microsoft Visio di server aplikasi.
6. Menyimpan password/token/integration secret dalam plaintext.

## 5. Prioritas Delivery

| Prioritas | Fokus | Release gate |
|---|---|---|
| P0 | Migration, tests, security, compatibility | Wajib sebelum data production |
| P1 | Monitoring, storage, worker, report | Wajib sebelum operational cutover |
| P1 | ADDS, ZeroTier, UniFi, Blue Iris, SSH | Wajib sebelum legacy shutdown |
| P1 | Floor map dan Map Asset lengkap | Wajib sebelum floor-map cutover |
| P2 | AI Assistant lengkap | Boleh dirilis setelah core stabil |
| P2 | UI admin/detail lengkap | Wajib sebelum penerimaan pengguna |
| P2 | Production operations | Wajib sebelum go-live |

## 6. Epic A — Versioned Migration dan Legacy Cutover

### 6.1 Versioned PostgreSQL migration

Requirements:

1. Ganti bootstrap `prisma db push` dengan versioned Prisma migrations.
2. Initial migration harus dapat membangun database kosong.
3. Migration berikutnya wajib forward-only dan memiliki rollback procedure tertulis.
4. Migration deployment menggunakan `prisma migrate deploy`.
5. Startup API harus gagal jika schema belum mencapai migration version yang dibutuhkan.
6. Tidak boleh membuat atau mengubah schema dari request handler.

Acceptance criteria:

- Database kosong dapat dimigrasikan dan di-seed tanpa interaksi manual.
- Migration dapat dijalankan dua kali tanpa merusak data.
- CI membuktikan migration dari snapshot legacy dan database kosong.
- `db push` tidak digunakan pada production workflow.

### 6.2 Legacy database migrator

Requirements:

1. Buat inventory mapping MySQL/MariaDB PHP lama ke schema PostgreSQL.
2. Pertahankan ID, timestamp, soft-delete, assignment snapshot, history, dan external identity.
3. Migrator menyediakan mode `analyze`, `dry-run`, `execute`, dan `verify`.
4. Dry-run menghasilkan count source/target, orphan, duplicate, invalid enum, dan unresolved relation.
5. Secret reversible dipindahkan ke encrypted storage tanpa dicetak pada log.
6. Migrator dapat dilanjutkan setelah failure dengan checkpoint/idempotency key.
7. Semua perubahan cutover didahului backup database dan file manifest.

### 6.3 File and state migration

Migrate:

- Asset photo local.
- APK release.
- Floor-map background, VSD, icon, dan CCTV reference.
- Editor state JSON dan cable state.
- `switches.json` cache.
- Legacy permission dan `denah_cctv_backbone_states`.

Setiap file wajib memiliki source path, target identity, size, SHA-256, status, dan error reason.

### 6.4 Compatibility layer

Requirements:

1. Inventarisasi seluruh route PHP dari Section 19 `PRD.md`.
2. Buat adapter untuk route/path dan payload legacy yang masih dipakai.
3. Adapter hanya melakukan translation; business rule tetap memakai service domain baru.
4. Contract fixture membandingkan response sanitized PHP dan NestJS.
5. Tambahkan deprecation telemetry untuk mengetahui client lama yang masih aktif.

## 7. Epic B — Authentication dan Security Hardening

### 7.1 Authentication

Requirements:

1. Tambahkan rate limit berbasis IP dan username pada login web/mobile.
2. Tambahkan progressive delay tanpa membocorkan keberadaan username.
3. Verifikasi bcrypt legacy dan rehash ke Argon2id setelah login sukses.
4. Mobile token `lastUsedAt` diperbarui maksimum sekali per lima menit.
5. Password change mempertahankan mobile token aktif dan mencabut token lain.
6. Tambahkan session/device list dan revoke command untuk admin atau pemilik akun.
7. Tambahkan configurable session duration 1–90 hari.

Acceptance criteria:

- Brute-force test membuktikan rate limit dan delay bekerja.
- Session rotation terjadi setiap login.
- User soft-deleted tidak dapat memakai session/token lama.
- Cookie production selalu `Secure`; local HTTP hanya melalui explicit override.

### 7.2 Application security

Requirements:

1. Buat SSRF guard terpusat untuk HTTP integration dan probe.
2. Tolak private/link-local/metadata network sesuai configurable allowlist.
3. Tambahkan MIME signature inspection, bukan hanya MIME header.
4. Tambahkan upload quota, filename safety, dan orphan cleanup.
5. Tambahkan LDAP DN/filter escaping library.
6. Redact authorization, cookie, password, token, community, dan secret dari log/audit.
7. Tambahkan CSP production yang kompatibel dengan UI.
8. Selesaikan seluruh high/critical dependency advisory atau tulis risk acceptance.

## 8. Epic C — External Asset Sync dan HR Directory

### 8.1 External Asset Sync

Requirements:

1. Implement configurable HTTP client dengan URL, header API key, timeout, retry idempotent, dan SSRF guard.
2. Ambil semua page dan validasi completeness sebelum reconciliation.
3. Normalisasi external ID, code, alias, brand, company, category, location, ownership, status, responsible person, dan timestamp.
4. Category lookup case-insensitive; create hanya jika diizinkan setting.
5. Upsert per row dalam transaction dan tulis external snapshot serta lifecycle history.
6. Asset yang dihapus manual tidak boleh diaktifkan kembali otomatis.
7. Reconciliation removal hanya berjalan untuk response complete dan non-empty.
8. Job run menyimpan fetched, created, updated, skipped, removed, failed, duration, dan error summary.
9. Sediakan manual run dan scheduler configurable.

### 8.2 HR Directory

Requirements:

1. Implement configurable HTTP method, headers, prefix, query key, nested result path, dan field mapping.
2. Cache search result dengan TTL configurable.
3. Jika source gagal, response boleh memakai cache dan harus menandai `stale`.
4. Assignment HR melakukan re-verification berdasarkan employee code atau exact name.
5. Client payload fallback tetap tersedia saat HR API sementara gagal.
6. Config detail dan diagnostic hanya admin; search tersedia bagi authenticated user.

## 9. Epic D — Object Storage dan File Lifecycle

Requirements:

1. Implement storage interface `local` dan `s3`.
2. Mendukung AWS S3, MinIO, dan S3-compatible endpoint.
3. Implement admin connectivity test tanpa membocorkan credential.
4. Upload melakukan checksum dan database commit setelah object terverifikasi.
5. Database failure setelah upload menghapus object orphan.
6. Local-to-S3 migration bersifat idempotent dan resumable.
7. Source local tidak dihapus sebelum checksum target cocok.
8. File streaming tetap melalui authenticated API; bucket tidak diekspos langsung.
9. Tambahkan cleanup job untuk temporary/orphan file.

## 10. Epic E — Network Monitoring Lengkap

### 10.1 Probe engine

Implement:

- ICMP/ping menggunakan library atau safe process API tanpa command interpolation.
- TCP port check dengan bounded concurrency.
- HTTP/HTTPS check dengan SSRF guard, timeout, status, dan latency.
- SNMP v2c minimum dengan encrypted community.
- Stable classification `online`, `degraded`, `offline`, dan `unknown`.
- Status transition event open/close dan duration.

Create/update mobile tidak boleh menunggu live probe. Web compatibility boleh menjalankan bounded initial probe.

### 10.2 Switch detail

Implement:

1. IF-MIB interface identity, alias, admin/oper state, speed, counter, errors, dan rates.
2. HC counter dengan fallback 32-bit.
3. Physical layout reconciliation 24/48 LAN dan 2/4 SFP.
4. Cisco dual-rate cage dan Juniper VC edge case.
5. PoE mapping ke physical port.
6. ENTITY-SENSOR-MIB, Cisco EnvMon, dan Juniper sensor fallback.
7. Sensor scope `chassis` dan `optical`.
8. Chassis temperature menjadi satu-satunya input alert utama.

### 10.3 VLAN and history

Requirements:

1. VLAN 1, 40, 50, 70, dan 80 Voice.
2. Exclude uplink dari access/user aggregation.
3. VLAN 50 trunk AP diberi `estimated: true`.
4. Simpan traffic, temperature, latency, dan status sample.
5. Range 24h/7d/30d dengan raw/hourly/daily aggregation.
6. Uptime menghitung selain `offline` sebagai up; tanpa event menghasilkan `null`.
7. Top-user cache/report tidak boleh selalu mengembalikan array kosong.

### 10.4 Scheduled jobs

Implement:

- Traffic poller per satu menit.
- Temperature monitor dengan threshold/hysteresis/cooldown.
- SMTP alert dan test email nyata.
- History/event retention batch.
- Expired session/token cleanup.
- Distributed lock untuk multi-replica.
- Job metrics dan run history.

## 11. Epic F — Reports

### 11.1 Inventory reports

Requirements:

1. Summary group by category, location, status, dan item type.
2. Detail filter category, location, type, status, purchase date, dan q.
3. History filter type, action, actor, location, dan date range.
4. Format `json`, `pdf`, dan `csv` dengan compatibility alias `excel`.
5. PDF A4/A4 landscape dan escape seluruh user content.
6. CSV/PDF menggunakan streaming dan bounded memory.
7. UI menyediakan preview, filter, download, dan empty/error state.

### 11.2 IT support reports

Lengkapi date range, sort allowlist, summary filtered/global, filter options, update/delete confirmation, dan CSV UTF-8 BOM delimiter semicolon.

## 12. Epic G — ADDS

Requirements:

1. LDAP/STARTTLS/LDAPS client nyata dengan connection timeout.
2. SSL dan STARTTLS mutually exclusive.
3. Mendukung bind DN, UPN, domain username, dan NetBIOS username.
4. List OU satu level, user, group, computer, dan group member.
5. Create OU, group, dan user.
6. Password operation hanya melalui STARTTLS atau LDAPS.
7. Enable/disable user melalui `userAccountControl`.
8. Add/remove membership.
9. Validasi seluruh target DN berada di bawah Base DN.
10. UI berupa directory tree dengan lazy-load, detail panel, dan confirmation.

Acceptance criteria menggunakan mock LDAP dan smoke procedure terhadap environment staging.

## 13. Epic H — ZeroTier

Requirements:

1. CRUD account lengkap dengan encrypted token.
2. CRUD managed network lokal tanpa menghapus remote network.
3. Real-time member list dari ZeroTier Central.
4. Normalize dependency errors menjadi `502`.
5. Authorize/deauthorize, rename, dan delete member.
6. Online jika `lastOnline` kurang dari lima menit.
7. Private ETag cache lima detik untuk mobile.
8. UI account, network summary, member table, dan mutation confirmation.

## 14. Epic I — AI Assistant

Requirements:

1. Implement Ollama model list dan chat client dengan timeout.
2. Tool planner hanya memilih allowlisted read-only tools.
3. Batasi evidence size dan field sebelum dikirim ke model.
4. Diagnosis tidak boleh mengarang angka/status.
5. Implement normalized question dan data fingerprint.
6. Exact answer reuse hanya jika question dan fingerprint identik.
7. Similar history hanya memengaruhi style.
8. Draft extraction mendukung name, quantity, category, location, dan description.
9. Validation quantity 1–1000 dan master reference.
10. Admin actions: create assets, update, assign, check-in, dan status transition.
11. Target harus unik; ambiguity ditolak.
12. Maksimal 100 create per command dalam satu transaction.
13. Seluruh plan/action/result masuk audit log.
14. UI chat memperlihatkan tools used, evidence, read-only marker, validation, dan explicit execute confirmation.

## 15. Epic J — Floor Map, UniFi, Blue Iris, dan Switch Remote

### 15.1 Floor-map files and editor

Implement:

- Background PNG upload page 1–99.
- VSD upload maksimum 100 MB dan watcher status.
- Custom icon maksimum 2 MB.
- CCTV reference maksimum 4 MB.
- Cable editor dan page relation lossless.
- Marker property editor lengkap.
- Group/grant/membership CRUD UI dan API.
- Payload size limit dan secret redaction.

### 15.2 Map Asset

Requirements:

1. Complete direct-position dan room drag/drop UI.
2. Implement update IPv4 custom field `map_asset_ip`.
3. Implement safe network check dengan timeout/concurrency.
4. Status: `online`, `offline`, `no_ip`, dan `unknown`.
5. Hanya CPU, telephone, dan printer yang masuk network overlay.

### 15.3 UniFi

Implement controller login, remember credential encrypted, disconnect, session refresh, auto-login, site selection, AP marker validation, client filtering, dan normalized status.

### 15.4 Blue Iris

Implement challenge/session login, grouped session reuse, camera matching, status normalization, snapshot proxy, record count day/week/month/all, timeout, content type, dan no-store.

### 15.5 Switch remote

Requirements:

1. Gunakan Node SSH library.
2. One-time token maksimum lima menit.
3. Jangan simpan password plaintext permanen.
4. Implement command allowlist dan output parser Cisco/Juniper.
5. Reconcile physical port layout.
6. Migrate `switches.json` cache.
7. Tambahkan session cleanup job dan rate limit.

## 16. Epic K — Mobile API Completion

Requirements:

1. Unified mobile response envelope.
2. Assets: list/detail/options/photo/assign/check-in/status; mutation admin-only.
3. Monitoring: list/summary/detail/port/sensor/history/event/uptime; no community secret.
4. Floor map: page/area list, marker summary, optional detail payload.
5. ADDS capability lengkap dan admin-only.
6. ZeroTier read untuk authenticated, write admin-only; account management tidak tersedia pada mobile.
7. AI parity; execute/audit/memory admin-only.
8. ETag/private cache lima detik dan `304` pada endpoint snapshot yang sesuai.
9. Mobile contract test memakai fixture aplikasi existing.

## 17. Epic L — Web UI Completion

Halaman berikut tidak boleh berhenti pada generic resource table:

1. Asset detail, edit, custom data, photo manager, lifecycle timeline, assignment, check-in, dan status dialog.
2. Monitor detail dengan chart, port layout, sensor, PoE, VLAN, event, dan uptime.
3. Settings editor per group dengan validation, secret mask/clear, dan test action.
4. Inventory report filter, preview, export, dan progress.
5. Floor-map canvas/editor dan Map Asset drag/drop.
6. ADDS directory tree.
7. ZeroTier account/network/member management.
8. APK multipart upload, publish toggle, checksum, dan download link.
9. AI chat/draft/validation/execute workflow.
10. Notification dropdown membaca monitor event dan temperature alert.

Seluruh halaman wajib responsive, keyboard-accessible, memiliki loading/empty/error/success state, dan mengikuti template yang sudah ada.

## 18. Epic M — Observability dan Production Operations

### 18.1 Logging and metrics

Requirements:

1. Structured JSON log dengan request ID dan actor ID.
2. Access log: method, route template, status, duration, dan response size.
3. Metrics: request, DB pool, job, integration, cache age, dan active alert.
4. Secret redaction test.
5. Log rotation untuk PM2.
6. Alert untuk API down, DB unavailable, job failure, disk usage, dan certificate expiry.

### 18.2 Deployment

Requirements:

1. Daftarkan PM2 sebagai Windows startup task/service atau gunakan deployment service yang disetujui.
2. Gunakan TLS reverse proxy; production cookie wajib Secure.
3. Production secret tidak berasal dari committed `.env`.
4. Tambahkan backup PostgreSQL dan file/object storage.
5. Backup memiliki retention, encryption, checksum, dan restore drill.
6. Tambahkan zero-downtime/restart procedure dan rollback version.
7. Buat runbook incident, integration failure, storage, scheduler, migration, backup, dan recovery.

## 19. Automated Test Strategy

### 19.1 Unit

- Lifecycle state machine.
- HR fallback/re-verification.
- Sync completeness guard.
- Monitor classification.
- VLAN aggregation.
- Temperature scope/hysteresis.
- Uptime calculation.
- Physical layout reconciliation.
- UniFi/Blue Iris normalization.
- Map Asset exclusivity.
- AI planner/fingerprint/action validation.

### 19.2 Integration

- PostgreSQL repository and migration.
- Cookie/CSRF/Bearer expiry/revocation.
- Local/S3 file lifecycle.
- PDF/CSV export.
- Mock HTTP integrations.
- Mock LDAP/SMTP/SNMP/SSH.

### 19.3 Contract and E2E

- Snapshot PHP versus NestJS after normalization.
- Web login → asset create → assign → check-in → history.
- Monitor create/update without device dependency.
- Floor-map ACL and upload.
- APK publish/download/update check.
- ADDS, ZeroTier, dan AI menggunakan mock integration.

### 19.4 CI gates

Pull request tidak dapat digabung jika salah satu gagal:

- Format/typecheck/build.
- Unit/integration/contract/E2E.
- Migration empty/legacy snapshot.
- Dependency audit tanpa unaccepted high/critical finding.
- Secret scan.
- Container vulnerability scan.

## 20. Delivery Plan

### Phase 1 — Production foundation

- Versioned migration.
- Test harness dan CI.
- Security hardening.
- Compatibility inventory.
- Dependency remediation.

Exit gate: database kosong/legacy fixture dapat dimigrasikan dan core E2E lulus.

### Phase 2 — Operational core

- Asset sync dan HR.
- S3 storage.
- Monitoring/SNMP/VLAN/temperature.
- Reports dan worker.

Exit gate: seluruh operational module berjalan terhadap mock dan staging integration.

### Phase 3 — Enterprise integrations

- ADDS.
- ZeroTier.
- UniFi.
- Blue Iris.
- Switch SSH.

Exit gate: integration contract test dan staging smoke test lulus.

### Phase 4 — Floor map, mobile, dan UI

- Floor-map file/editor.
- Map Asset network overlay.
- Mobile API completion.
- Replace generic admin pages.

Exit gate: web/mobile parity flow lulus.

### Phase 5 — AI and cutover

- Ollama/AI workflow.
- Legacy migration rehearsal.
- Shadow read comparison.
- Backup/restore drill.
- Production cutover dan rollback rehearsal.

## 21. Definition of Done

Continuation dinyatakan selesai hanya jika:

1. Seluruh item pada `IMPLEMENTATION_STATUS.md` telah ditutup atau mendapat written risk acceptance.
2. Tidak ada endpoint PRD yang mengembalikan stub, constant success, atau empty result tanpa integration call yang semestinya.
3. Versioned migration dan legacy migration teruji.
4. Seluruh external integration memiliki mock test dan staging smoke procedure.
5. Seluruh scheduled job memiliki lock, run history, metric, dan failure alert.
6. Seluruh UI workflow dapat diselesaikan tanpa memakai generic JSON form.
7. Web dan mobile compatibility tests lulus.
8. High/critical security finding bernilai nol atau memiliki risk acceptance yang ditandatangani.
9. Backup dan restore drill berhasil.
10. PM2/startup service, TLS, logging, metrics, alert, dan runbook aktif.
11. Cutover dan rollback procedure telah direhearsal menggunakan snapshot production yang dianonimkan.
12. Product owner menyetujui parity checklist final pada `PRD.md`.

## 22. Handoff Checklist

Engineer yang melanjutkan wajib memulai dengan urutan berikut:

1. Baca `PRD.md` sebagai specification of record.
2. Baca `IMPLEMENTATION_STATUS.md` untuk baseline runtime dan gap yang sudah teridentifikasi.
3. Jalankan `npm.cmd run typecheck` dan `npm.cmd run build`.
4. Periksa `npm.cmd run pm2:list` dan `/health/ready`.
5. Kerjakan Phase 1 terlebih dahulu; jangan menghubungkan production integration sebelum migration, tests, dan secret handling siap.
6. Perbarui dokumen ini dan `IMPLEMENTATION_STATUS.md` setiap capability selesai.

