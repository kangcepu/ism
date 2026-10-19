# Product Requirements Document

## Rewrite Backend IS Dept Management System ke NestJS

| Atribut | Nilai |
|---|---|
| Status | Specification of Record |
| Versi | 1.0.0 |
| Tanggal | 13 Oktober 2026 |
| Sistem sumber | Backend PHP pada repository `it_inventory` |
| Target | Backend REST API NestJS |
| Port wajib | `8001` |
| Database | MySQL atau MariaDB |
| Konsumen | Web dashboard, web denah, Map Asset, aplikasi mobile, public download client, scheduled jobs |

## 1. Tujuan Dokumen

Dokumen ini menjadi sumber kebutuhan utama untuk menulis ulang seluruh backend PHP IS Dept Management System menggunakan NestJS tanpa kehilangan fitur, aturan bisnis, data, hak akses, integrasi, atau kontrak operasional yang sudah ada.

Implementasi baru dinyatakan selesai hanya jika seluruh capability pada dokumen ini tersedia, teruji, dapat memigrasikan data lama, dan lolos uji parity terhadap backend PHP.

Dokumen ini harus cukup eksplisit agar Codex, Claude Sonnet, atau engineer lain dapat membangun ulang backend tanpa harus menebak perilaku bisnis dari source PHP. Source PHP tetap menjadi referensi terakhir jika ada payload historis yang belum terdokumentasi, tetapi implementasi baru wajib mengikuti kontrak REST pada dokumen ini.

## 2. Sasaran Produk

1. Mengganti seluruh backend PHP dengan aplikasi NestJS yang modular dan dapat dipelihara.
2. Menyediakan RESTful API konsisten untuk semua fitur web dan mobile.
3. Mempertahankan seluruh data dan fitur backend lama tanpa pengurangan.
4. Menyatukan aturan bisnis yang saat ini diduplikasi antara web dan mobile.
5. Memisahkan controller, use case, domain rule, persistence, integration client, background worker, dan file storage.
6. Menyediakan migrasi database deterministik; aplikasi tidak boleh melakukan perubahan skema ad hoc pada setiap request.
7. Menjalankan HTTP server pada port `8001` secara default dan melalui environment variable dengan nilai default tetap `8001`.
8. Menyediakan observability, audit trail, validation, error contract, dan automated test yang memadai untuk sistem internal production.

## 3. Non-Goals

1. Mendesain ulang frontend web.
2. Menulis ulang aplikasi mobile.
3. Mengubah arti status inventaris atau hak akses yang sudah berjalan.
4. Menghapus fitur legacy sebelum konsumen lama dipastikan sudah bermigrasi.
5. Memindahkan database ke engine selain MySQL/MariaDB pada fase rewrite.
6. Menjalankan probe jaringan berat di request list mobile.

## 4. Aturan Implementasi Wajib

### 4.1 Stack

- Node.js LTS yang masih didukung.
- NestJS versi stabil terbaru saat implementasi dimulai.
- TypeScript dengan `strict: true`.
- MySQL/MariaDB melalui Prisma atau TypeORM. Pilih satu dan gunakan konsisten.
- OpenAPI/Swagger dihasilkan dari DTO dan tersedia pada `/api/docs` di non-production atau sesuai kontrol konfigurasi.
- Scheduler menggunakan `@nestjs/schedule` atau worker queue yang setara.
- HTTP client menggunakan `@nestjs/axios` atau client teruji dengan timeout dan retry yang eksplisit.
- Password menggunakan Argon2id atau bcrypt dengan cost yang aman. Hash bcrypt lama harus tetap dapat diverifikasi dan di-upgrade saat login.

### 4.2 Port dan proses

- Aplikasi wajib bind ke `0.0.0.0:8001` secara default.
- Environment variable `PORT` boleh mengubah port hanya untuk test/deployment khusus.
- File bootstrap harus menggunakan `Number(process.env.PORT ?? 8001)`.
- Endpoint health tersedia pada `GET /health/live` dan `GET /health/ready`.
- Graceful shutdown harus menutup database pool, scheduler, dan job yang sedang berjalan.

### 4.3 Clean code

- Gunakan module, controller, service/use-case, repository, DTO, entity/model, guard, interceptor, filter, dan integration adapter yang terpisah.
- Tidak boleh ada business logic di controller.
- Tidak boleh ada SQL mentah tersebar di controller.
- Tidak boleh ada file service raksasa yang menggabungkan banyak domain.
- Nama class, method, variable, DTO, dan error harus menjelaskan tujuan kode.
- Implementasi baru tidak boleh berisi komentar per baris, komentar yang mengulang isi kode, atau commented-out code.
- Utamakan kode self-documenting. Jika tim menetapkan larangan komentar total, implementation source harus tanpa inline dan block comment; dokumentasi arsitektur ditempatkan di Markdown dan OpenAPI.
- Hindari `any`, magic string, magic number, silent catch, dan response shape yang berubah-ubah.
- Gunakan enum/value object untuk role, lifecycle status, condition grade, access level, monitor status, release platform, dan report status.

### 4.4 Struktur proyek minimum

```text
src/
  main.ts
  app.module.ts
  common/
    auth/
    errors/
    filters/
    guards/
    interceptors/
    pagination/
    validation/
  config/
  database/
    migrations/
    seeds/
  modules/
    auth/
    users/
    categories/
    locations/
    custom-fields/
    assets/
    asset-lifecycle/
    asset-photos/
    asset-sync/
    hr-directory/
    monitoring/
    switch-details/
    alerts/
    inventory-reports/
    it-support-reports/
    app-settings/
    adds/
    zerotier/
    mobile-releases/
    audit-logs/
    ai-assistant/
    floor-map/
    map-assets/
    unifi/
    blue-iris/
    switch-remote/
  jobs/
test/
```

Struktur dapat disesuaikan selama boundary domain dan dependency direction tetap bersih.

## 5. Konvensi REST API

### 5.1 Base URL

- API utama: `/api/v1`.
- Public resource: `/api/v1/public`.
- Compatibility adapter sementara dapat mengekspos path PHP lama, tetapi harus mendelegasikan ke use case yang sama.
- Tidak boleh ada business logic terpisah antara endpoint web dan mobile.

### 5.2 Format response

Response sukses tunggal:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-10-13T10:00:00+07:00"
  }
}
```

Response sukses collection:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "pagination": {
      "page": 1,
      "perPage": 25,
      "total": 100,
      "totalPages": 4
    },
    "requestId": "uuid",
    "timestamp": "2026-10-13T10:00:00+07:00"
  }
}
```

Response error:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Data tidak valid.",
    "details": {}
  },
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-10-13T10:00:00+07:00"
  }
}
```

### 5.3 HTTP semantics

- `GET` membaca resource tanpa mutasi domain.
- `POST` membuat resource atau menjalankan command eksplisit.
- `PATCH` memperbarui sebagian resource.
- `PUT` hanya dipakai jika benar-benar full replacement.
- `DELETE` menghapus atau soft-delete sesuai aturan resource.
- Creation mengembalikan `201`.
- Delete tanpa body boleh `204`; compatibility route boleh tetap `200` dengan message.
- Validation menggunakan `422`.
- Duplicate/conflict menggunakan `409`.
- Unauthenticated `401`, forbidden `403`, not found `404`, dependency failure `502`, rate limited `429`.
- Semua tanggal response menggunakan ISO 8601 dengan timezone `Asia/Jakarta` atau UTC dengan offset eksplisit.
- Semua list besar mendukung pagination, filter, sort allowlist, dan batas maksimum.
- ETag/private caching dipertahankan untuk endpoint mobile/snapshot yang sesuai.

### 5.4 Keamanan input

- Global `ValidationPipe` dengan whitelist dan `forbidNonWhitelisted`.
- Payload JSON default maksimum 64 KB; endpoint upload memiliki limit sendiri.
- Semua ID numerik harus positif.
- Semua sort field menggunakan allowlist.
- Semua URL integrasi harus divalidasi scheme, host, credential component, dan fragment.
- Endpoint yang dapat mengakses host internal harus memiliki perlindungan SSRF sesuai allowlist/konfigurasi jaringan.
- Filename tidak boleh dipakai langsung sebagai path.

## 6. Authentication, Session, dan Authorization

### 6.1 User dan role

- Role yang wajib tersedia: `admin` dan `user`.
- User memiliki username unik, password hash, full name, email opsional, role, soft-delete flag, serta timestamp.
- User yang soft-deleted tidak boleh login atau menggunakan token lama.

### 6.2 Web authentication

- Sediakan login, session/profile check, logout, dan change password.
- Web dapat memakai secure HttpOnly cookie berisi opaque session atau access token.
- Cookie production wajib `HttpOnly`, `SameSite=Lax` atau lebih ketat, `Secure`, dan path yang benar.
- Perilaku long-lived session lama dapat dikonfigurasi, tetapi default baru harus diputuskan secara eksplisit melalui environment.
- Login sukses harus melakukan session rotation.
- Logout harus mencabut session dan menghapus cookie.
- Mutasi berbasis cookie wajib memiliki perlindungan CSRF.

### 6.3 Mobile authentication

- Login menerima `username`, `password`, dan `deviceName`.
- Token berupa random opaque token; database hanya menyimpan SHA-256 token.
- Default masa berlaku 30 hari, configurable 1 sampai 90 hari.
- Token menyimpan user, device, expiry, last-used, revoked-at, dan created-at.
- Last-used cukup diperbarui maksimal sekali per lima menit.
- Logout mencabut token aktif.
- Change password memverifikasi current password, minimal delapan karakter, meminta confirmation, mempertahankan token perangkat aktif, dan mencabut token mobile lain milik user.
- Token dikirim melalui `Authorization: Bearer <token>`.

### 6.4 Authorization matrix

| Capability | User | Admin | Floor Map View | Floor Map Edit |
|---|---:|---:|---:|---:|
| Baca inventaris/master/report/monitoring | Ya | Ya | N/A | N/A |
| Mutasi item melalui web legacy | Ya, untuk parity | Ya | N/A | N/A |
| Mutasi item melalui mobile | Tidak | Ya | N/A | N/A |
| Kelola category/location/custom field/user/settings | Tidak | Ya | N/A | N/A |
| Kelola monitor | Tidak | Ya | N/A | N/A |
| Kelola ADDS/ZeroTier/release/audit | Tidak | Ya | N/A | N/A |
| Lihat denah dan Map Asset | Sesuai grant | Admin otomatis | Ya | Ya |
| Edit denah dan Map Asset | Sesuai grant | Admin otomatis | Tidak | Ya |
| AI read-only/draft | Ya | Ya | N/A | N/A |
| AI execute action/audit/memory | Tidak | Ya | N/A | N/A |
| Mutasi Laporan Kendala IT | Tidak | Ya | N/A | N/A |

Keputusan parity penting: backend PHP mengizinkan semua user web terautentikasi memutasi item. Implementasi baru wajib mempertahankan ini sampai product owner secara eksplisit mengubah policy.

### 6.5 Floor map ACL

- Admin selalu memiliki `edit`.
- User non-admin default `none`.
- Grant langsung: `view` atau `edit` per user.
- Group permission: group memiliki `view` atau `edit`, user dapat menjadi anggota banyak group.
- Effective permission adalah level tertinggi dari direct grant dan group grant.
- API harus mendukung CRUD grant, CRUD group, dan membership group.

## 7. Daftar Modul Wajib

| No | Modul | Web | Mobile | Public/Job |
|---:|---|:---:|:---:|:---:|
| 1 | Authentication dan profile | Ya | Ya | - |
| 2 | User management | Ya | Profile | - |
| 3 | Category dan item type | Ya | Options | - |
| 4 | Location | Ya | Options | - |
| 5 | Custom fields | Ya | Data aset | - |
| 6 | Asset inventory CRUD/search | Ya | Ya | - |
| 7 | Asset lifecycle/assignment/history | Ya | Ya | - |
| 8 | Asset photos local/S3 | Ya melalui detail | Ya | File stream |
| 9 | External asset synchronization | Ya | - | Manual/job |
| 10 | HR directory | Ya | Ya | Cache |
| 11 | Dashboard analytics | Ya | - | - |
| 12 | Network monitoring | Ya | Ya | Poller |
| 13 | Switch port/sensor/PoE detail | Ya | Ya | Cache/poller |
| 14 | VLAN traffic/top users/history/uptime | Ya | Ya | Poller |
| 15 | Temperature alerts dan SMTP | Settings | Read snapshot | Job |
| 16 | Inventory reports PDF/CSV | Ya | - | Export |
| 17 | IT support reports | Ya | - | CSV export |
| 18 | Application settings/branding | Ya | Branding/update | Public branding |
| 19 | ADDS services dan directory operations | Ya | Ya | - |
| 20 | ZeroTier accounts/networks/members | Ya | Ya | Central API |
| 21 | Mobile APK releases | Ya | Update check | Public download |
| 22 | Audit logs | Ya | Internal writer | - |
| 23 | AI Assistant | Ya | Ya | Ollama |
| 24 | Infrastructure floor-map editor | Ya | Read | Files/integrations |
| 25 | Floor-map area API | Ya | - | - |
| 26 | Map Asset | Ya | - | Ping probe |
| 27 | UniFi controller/AP detail | Ya | - | UniFi API |
| 28 | Blue Iris CCTV status/snapshot/record count | Ya | Floor-map snapshot | Blue Iris API |
| 29 | Switch remote UI/SSH bridge | Ya | - | SSH/command worker |
| 30 | Health, readiness, metrics, jobs | Internal | - | Ya |

## 8. Functional Requirements per Modul

## 8.1 Authentication API

### Endpoint target

- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/change-password`
- `POST /api/v1/mobile/auth/login`
- `GET /api/v1/mobile/auth/me`
- `POST /api/v1/mobile/auth/logout`
- `POST /api/v1/mobile/auth/change-password`

### Requirements

- Login memakai username case policy yang sama dengan database existing.
- Error login tidak boleh membedakan username tidak ada dan password salah.
- Login/logout/password change harus masuk audit log.
- Login gagal harus mendapat rate limit dan delay aman.
- Response tidak pernah mengembalikan password hash.

## 8.2 User Management

### Endpoint target

- `GET /api/v1/users`
- `GET /api/v1/users/:id`
- `POST /api/v1/users`
- `PATCH /api/v1/users/:id`
- `DELETE /api/v1/users/:id`
- `GET /api/v1/users/assignees`

### Requirements

- Hanya admin dapat CRUD user.
- Username wajib unik; full name dan role wajib.
- Password wajib pada create dan opsional pada update.
- Delete adalah soft delete.
- Daftar assignee dapat dibaca user terautentikasi dan hanya berisi user aktif.
- Response assignee juga menginformasikan apakah HR directory aktif.

## 8.3 Categories

- Category memiliki `name`, `description`, `itemType`, soft-delete, dan timestamp.
- Mendukung list biasa, list grouped by item type, distinct item type, detail, create, patch, soft-delete.
- Nama/category uniqueness mengikuti constraint database existing.
- Endpoint: `/api/v1/categories` dan `/api/v1/item-types`.
- Read untuk authenticated user; write admin-only.

## 8.4 Locations

- Location memiliki `name`, `description`, soft-delete, dan timestamp.
- Mendukung list, detail, create, patch, soft-delete.
- Read authenticated; write admin-only.
- Location yang direferensikan item tidak boleh di-hard-delete.

## 8.5 Custom Fields

- Definisi field memiliki `fieldName`, `fieldLabel`, `fieldType`, `isRequired`, soft-delete, dan timestamp sesuai data lama.
- Field type yang sudah tersimpan wajib tetap dikenali.
- Nilai item disimpan per `itemId + fieldName` dan bersifat upsert.
- Create/update/delete definition admin-only; read authenticated.
- Rewrite harus mempertahankan custom data lama walaupun definisi field sudah dihapus.

## 8.6 Asset Inventory

### Model utama

- Code unik.
- Name.
- Category dan derived item type.
- Location lokal.
- Legacy free-text user name.
- MAC address, serial number, description, purchase date, price.
- Lifecycle status dan condition grade.
- Assignment fields.
- External source identity dan hidden marker.
- Soft-delete dan timestamp.

### Enum

- Status: `available`, `in_use`, `maintenance`, `retired`, `disposed`.
- Condition: `new`, `good`, `fair`, `poor`, `broken`, atau `null`.

### Endpoint target

- `GET /api/v1/assets`
- `GET /api/v1/assets/summary-by-type`
- `GET /api/v1/assets/:id`
- `POST /api/v1/assets`
- `PATCH /api/v1/assets/:id`
- `DELETE /api/v1/assets/:id`
- `GET /api/v1/assets/:id/history`
- `POST /api/v1/assets/:id/assignments`
- `POST /api/v1/assets/:id/check-in`
- `POST /api/v1/assets/:id/status-transitions`

### Filter list

- `categoryId`, `itemType`, `locationId`, `status`, `assignedTo`, `unassigned`, dan `q`.
- Pencarian minimal mencakup name, code, dan legacy user name.
- Target baru juga boleh mencari serial, assignee, category, dan location selama tidak mengubah hasil filter eksplisit.

### Create/update/delete

- Create membutuhkan code, name, category, dan location.
- Duplicate code menghasilkan `409`.
- Create menyimpan custom data dan history `create`.
- General update tidak boleh mengubah status secara terselubung; status menggunakan status transition command.
- Partial update tidak boleh mengosongkan condition atau field lain yang tidak dikirim.
- Delete adalah soft delete dan menulis history `delete`.
- Detail menyertakan category, item type, location, assignment display, custom data, photo list, dan snapshot sumber eksternal jika ada.

## 8.7 Asset Lifecycle dan Assignment

### Assign local user

- Input: asset ID, user ID, note opsional.
- User tujuan harus aktif.
- Menetapkan `assignedTo`, source `local`, snapshot nama, assigned time/by, note, legacy user name, dan status `in_use`.
- Jika sebelumnya sudah memiliki assignee berbeda, event adalah `transfer`; selain itu `assign`.

### Assign HR employee

- Input: asset ID, source `hr`, assignee name, code opsional, company opsional, note.
- Jika HR API aktif, server mencoba re-verification berdasarkan employee code atau exact name.
- Jika HR API gagal sementara, assignment boleh memakai payload tervalidasi dari client agar operasi tidak terblokir.
- Snapshot name/code/company disimpan pada asset dan history.

### Business rules

- Asset `retired` atau `disposed` tidak dapat di-assign.
- Assign selalu menghasilkan status `in_use`.
- Check-in hanya berlaku jika asset memiliki assignee.
- Check-in membersihkan seluruh assignment, legacy user name, expected return, note, dan mengubah status menjadi `available`.
- Status `in_use` tidak dapat dipilih tanpa assignee.
- Perubahan ke `available`, `retired`, atau `disposed` membersihkan assignee.
- `retired` dan `disposed` menyimpan retired time/reason.
- Reactivation membersihkan retired marker.
- Seluruh command menggunakan transaction dan menulis actor, event type, status from/to, assignee snapshot, location, note, dan timestamp ke history.

## 8.8 Asset Photos dan Object Storage

### Endpoint target

- `GET /api/v1/assets/:id/photos`
- `POST /api/v1/assets/:id/photos`
- `GET /api/v1/asset-photos/:photoId/file`
- `DELETE /api/v1/asset-photos/:photoId`
- `POST /api/v1/admin/asset-photos/migrate-storage`

### Requirements

- Metadata: item, internal filename, original filename, MIME, size, storage backend, timestamp.
- Format yang didukung harus mengikuti existing mobile uploader: image valid dengan allowlist MIME.
- File tidak pernah diekspos melalui path disk atau bucket langsung.
- Semua download/preview melalui authenticated streaming endpoint yang juga menerima valid mobile Bearer token.
- Backend storage: local atau S3-compatible/MinIO.
- S3 setting mencakup endpoint, region, bucket, access key, dan secret key.
- Migrasi local ke S3 adalah admin-only, idempotent, mencatat sukses/gagal, dan tidak menghapus source sebelum upload terverifikasi.
- Kegagalan database setelah upload harus membersihkan object/file orphan.

## 8.9 External Asset Sync

### Endpoint dan job

- `POST /api/v1/asset-sync/runs` admin-only.
- Scheduled sync opsional menggunakan setting enable dan interval jika product mengaktifkannya.

### Settings

- Enabled, URL, API key, key header default `x-api-key`, timeout 1–60 detik, default local location.

### Rules

- Default local location wajib aktif sebelum sync.
- Fetch mendukung pagination dan harus mendeteksi response tidak lengkap.
- Normalisasi row eksternal mencakup external ID, code, asset/alias name, brand, company, category, source location, ownership, active/status, responsible person, created/updated time.
- Category dicari case-insensitive dan dibuat jika belum ada.
- Existing item dicari dari source+external ID atau code.
- Item lokal yang pernah dihapus manual tidak boleh diaktifkan kembali otomatis.
- Item yang sebelumnya disembunyikan oleh sync boleh diaktifkan kembali jika muncul lagi.
- Setiap row diproses atomik dan menulis snapshot `item_external_sync_data` serta lifecycle history.
- Reconciliation removal hanya boleh berjalan setelah response sumber dipastikan lengkap dan tidak kosong.
- Hanya item milik external source tersebut yang boleh disembunyikan.
- Item lokal murni tidak boleh disentuh.
- Hasil run: fetched, created, updated, unchanged/skipped, removed, errors.

## 8.10 HR Directory

- Konfigurasi: enabled, base URL, search path, HTTP method, API key/header/prefix, query parameter, result path, mapping name/code/company, timeout, verify TLS.
- Endpoint: `GET /api/v1/hr/employees?q=...&limit=...`.
- User authenticated dapat mencari; endpoint diagnostic/config detail admin-only.
- Client mendukung nested result path dan configurable source field mapping.
- Cache response disediakan untuk mengurangi beban source dan fallback saat source sementara gagal.
- API key tidak boleh dikirim kembali ke client atau log.

## 8.11 Dashboard Analytics

- Endpoint `GET /api/v1/dashboard/summary`.
- Menyediakan total item, breakdown status, category, location, item type, recent activity, dan ringkasan network monitor.
- Hasil harus setara dengan kartu/grafik dashboard web saat ini.
- Query agregat tidak boleh melakukan N+1.

## 8.12 Network Monitoring

### Model monitor

- Name, device type, host, location, timeout, custom TCP ports, notes.
- SNMP enabled/version/port/community/interface index/interface label.
- HTTP check enabled dan URL.
- Last status, latency, check time, message, open ports.
- HTTP status/response time/check time/message.
- SNMP time/message, counters, rates, traffic scope, VLAN snapshot/time.
- Chassis temperature/check time/alert state/sent time.
- Soft-delete dan timestamps.

### Status

- `online`, `degraded`, `offline`, `unknown`.
- Exact classification behavior harus dipertahankan melalui characterization tests dari PHP.

### Endpoint target web/admin

- `GET /api/v1/monitors`
- `GET /api/v1/monitors/summary`
- `GET /api/v1/monitors/:id`
- `POST /api/v1/monitors`
- `PATCH /api/v1/monitors/:id`
- `DELETE /api/v1/monitors/:id`
- `POST /api/v1/monitors/:id/probes`
- `POST /api/v1/monitors/:id/traffic-snapshots`
- `POST /api/v1/monitors/probes`
- `POST /api/v1/monitors/traffic-snapshots`

### Validation

- Host menerima IP/hostname valid tanpa shell metacharacter.
- Port 1–65535, timeout dibatasi.
- Custom ports dinormalisasi unik dan tersortir.
- Default ports ditentukan per device type seperti backend lama.
- SNMP community wajib jika SNMP aktif dan tidak pernah tampil dalam response.
- HTTP URL hanya HTTP/HTTPS, tanpa embedded credential atau fragment.
- Duplicate host menghasilkan conflict sesuai aturan existing.

### Probe

- Probe menggabungkan ping/reachability, TCP ports, HTTP check jika aktif, dan SNMP/traffic jika aktif.
- Implementasi tidak boleh membangun shell command dari input mentah.
- Status transition harus dicatat sebagai event.
- Probe web manual dapat sinkron dengan timeout terbatas atau asynchronous job dengan status run.
- Create/update web lama menjalankan initial/re-probe; compatibility layer harus mempertahankan UX ini.
- Create/update mobile harus cepat dan tidak menunggu probe blocking.

### Mobile list

- Filter: page, perPage maksimum 100, q, status, deviceType, exact location, sort, includeSummary.
- Sort: name asc/desc, location asc, host asc, attention, traffic desc, temperature desc.
- Hanya membaca snapshot database.
- Mendukung ETag, private cache lima detik, dan `304`.
- Summary mencakup status dan aggregated VLAN traffic.
- Tidak pernah mengembalikan community atau secret.

## 8.13 Switch Detail, Port, Sensor, PoE, dan Traffic

- Detail switch membaca IF-MIB interface name/description/alias, admin/oper state, speed, HC counter dengan fallback 32-bit, errors, dan rate dari dua snapshot.
- Port diklasifikasikan menjadi ethernet/access, SFP/fiber, uplink, trunk/AP, management, stack, atau class lain yang sudah dikenal UI.
- Physical layout reconciliation harus mempertahankan model 24/48 LAN dan 2/4 SFP, termasuk Cisco dual-rate cage dan Juniper VC edge case.
- PoE membaca status dan power lalu dipetakan ke physical port.
- Sensor mendukung ENTITY-SENSOR-MIB, Cisco EnvMon fallback, dan Juniper operating sensors.
- Sensor temperature wajib diberi scope `chassis` atau `optical`.
- Suhu alert/list utama hanya menggunakan chassis; suhu SFP/optic tidak boleh menggantikan chassis.
- Cache detail disimpan secara terstruktur, bukan bergantung pada filename global tanpa repository abstraction.
- Endpoint:
  - `GET /api/v1/monitors/:id/switch-details`
  - `GET /api/v1/monitors/:id/ports`
  - `GET /api/v1/monitors/:id/sensors`
  - `GET /api/v1/monitors/:id/top-users`
- Port/sensor mobile mendukung pagination dan filter.
- Refresh live hanya untuk user yang berhak dan harus dibatasi concurrency/rate.

## 8.14 VLAN Traffic

- VLAN tetap yang wajib didukung: VLAN 1, 40, 50, 70, dan 80 Voice sesuai mapping existing.
- VLAN edge dihitung dari access port classification.
- VLAN 50 pada trunk AP ditandai `estimated: true` karena IF-MIB tidak memisahkan tagged VLAN.
- Uplink tidak boleh terhitung sebagai user/access traffic.
- Agregasi menghasilkan in bps, out bps, total bps, interface count, estimated interface count, label, dan name.
- Urutan VLAN response harus stabil.

## 8.15 Monitoring History dan Uptime

- Simpan periodic sample: status, latency, traffic in/out, temperature, dan timestamp.
- Simpan status event: previous, new, message, started, ended, duration.
- Status event aktif ditutup saat status berikutnya terjadi.
- Range: 24h, 7d, 30d.
- Granularity: raw maksimum 500 untuk 24h, hourly untuk 7d, daily untuk 30d.
- Retensi default history 30 hari dan events 180 hari.
- Uptime adalah waktu selain `offline`; degraded dan unknown dihitung up demi parity.
- Jika belum ada data event, uptime percent harus `null`, bukan 100%.
- Endpoint:
  - `GET /api/v1/monitors/:id/history`
  - `GET /api/v1/monitors/:id/events`
  - `GET /api/v1/monitors/:id/uptime`

## 8.16 Temperature Alert dan SMTP

- Settings: enabled, threshold default 52°C, hysteresis default 3°C, notification email list.
- SMTP: host, port, username, password, encryption, from email/name.
- Job membaca hanya chassis temperature.
- Alert aktif saat melewati threshold dan tidak mengirim berulang tanpa state transition/cooldown.
- Alert kembali normal setelah turun di bawah threshold dikurangi hysteresis.
- Email test dikirim ke email admin aktif.
- Kegagalan SMTP dicatat tanpa membocorkan password.
- Endpoint admin: `POST /api/v1/settings/test-email`.

## 8.17 Inventory Reports

- Report type: summary, detailed items, dan item history.
- Summary dapat group by category, location, status, atau item type yang didukung UI.
- Detailed report mendukung filter category, location, item type, date, dan filter existing lain.
- History report mendukung item type, action type, date range, dan relasi location/user.
- Output: JSON preview, PDF inline/download, dan CSV dengan compatibility label `excel`.
- Endpoint:
  - `GET /api/v1/reports/inventory/summary`
  - `GET /api/v1/reports/inventory/details`
  - `GET /api/v1/reports/inventory/history`
- Parameter `format=json|pdf|csv`.
- PDF wajib meng-escape semua content dan menghasilkan layout setara A4/A4 landscape.
- Export harus streaming dan aman untuk dataset besar.

## 8.18 IT Support Reports

- Entity: date, reporter, department, location, category, analysis, resolution, status, timestamps.
- Status: `OPEN`, `ON PROGRESS`, `DONE`.
- Read untuk authenticated user; create/update/delete admin-only.
- Filter: from, to, category, location, status, q.
- Sort allowlist: date, reporter, department, location, category, status.
- Pagination 10–100 rows.
- Summary global: total/open/progress/done.
- Filter options mengambil distinct category dan location.
- CSV delimiter semicolon dan UTF-8 BOM untuk kompatibilitas spreadsheet.
- Endpoint `/api/v1/it-support-reports` dan `/api/v1/it-support-reports/export`.

## 8.19 App Settings dan Branding

### Groups dan keys yang wajib dimigrasikan

- General: app name, default user role.
- ADDS: default service, auto sync, interval, auto-create users, default email domain, account suffix, notes.
- Alerts: enable, threshold, hysteresis, email recipients.
- SMTP: host, port, username, password, encryption, from email/name.
- ZeroTier: legacy API token.
- HR: seluruh setting HR directory.
- Asset sync: seluruh setting external sync.
- Storage: S3 endpoint, region, bucket, access key, secret key.
- Ollama: base URL dan default model.

### Requirements

- GET/PUT admin-only untuk full settings.
- Public branding endpoint hanya mengembalikan app name dan data non-sensitive.
- Sensitive fields dimasking dan tidak dikembalikan dalam plaintext.
- Nilai kosong pada update sensitive field berarti mempertahankan secret lama kecuali ada flag clear eksplisit.
- Boolean, integer, string, URL, email list, dan dependent settings divalidasi per type.
- Endpoint test S3/MinIO dan list Ollama model tersedia admin-only.
- Settings write diaudit dengan daftar key berubah tanpa nilai secret.

## 8.20 ADDS Management

### Service configuration

- Field: service name, host, port, base DN, bind DN/password, domain, NetBIOS, search filter, SSL, TLS, active, sync enabled, priority, description, soft-delete.
- List/detail tidak pernah mengembalikan bind password.
- Create/update wajib menguji koneksi jika diminta oleh workflow existing.
- Domain dapat dikonversi menjadi Base DN.
- Bind candidate mendukung DN, UPN, domain username, dan NetBIOS username.
- SSL dan TLS tidak boleh aktif bersamaan secara tidak valid.

### Directory operations

- List services.
- List OU satu level.
- List users, groups, dan computers pada OU.
- List group members.
- Create OU.
- Create group.
- Create user dan set password.
- Enable/disable user melalui `userAccountControl`.
- Add/remove group membership.
- Validasi DN wajib memastikan target berada di bawah Base DN.
- Escape LDAP filter dan DN wajib dilakukan dengan library yang benar.
- Create user/password hanya melalui STARTTLS atau LDAPS.
- LDAP signing requirement tidak boleh fallback ke koneksi plain.

### Endpoint target

- `/api/v1/adds/services`
- `/api/v1/adds/services/:id/test`
- `/api/v1/adds/services/:id/organizational-units`
- `/api/v1/adds/services/:id/users`
- `/api/v1/adds/services/:id/groups`
- `/api/v1/adds/services/:id/computers`
- `/api/v1/adds/services/:id/group-members`
- Command nested resource untuk create/status/membership.
- Semua endpoint admin-only.

## 8.21 ZeroTier

### Accounts

- Mendukung banyak ZeroTier API account: label, API token, notes, soft-delete.
- Token tidak pernah dikembalikan; empty token on patch mempertahankan token lama.
- CRUD account web admin-only.

### Managed networks

- Entity: 16-character network ID unik, label, notes, optional account ID, soft-delete.
- Account null memakai legacy token pada app settings.
- Deleting managed network hanya menghapus dari daftar aplikasi, bukan menghapus network di ZeroTier Central.
- Summary per network: reachable, member count, authorized count, online count, message.

### Members

- List real-time dari ZeroTier Central.
- Format: node ID, name, description, authorized, online, last online, IP assignments, physical address, client version.
- Online berarti last online kurang dari lima menit.
- Admin dapat authorize/deauthorize, rename, dan delete member.
- Delete member benar-benar mengeluarkan device dari network.
- Semua operasi hanya boleh untuk network yang terdaftar sebagai managed network.
- Mobile summary/member list mendukung private ETag cache lima detik.
- Dependency failure menggunakan `502` tanpa membocorkan API token.

### Endpoint target

- `/api/v1/zerotier/accounts`
- `/api/v1/zerotier/networks`
- `/api/v1/zerotier/networks/:networkId/members`
- `/api/v1/zerotier/networks/:networkId/members/:memberId`

## 8.22 Mobile Application Releases

- Entity: platform, version name, version code, notes, force update, stored filename, original filename, size, SHA-256, active, creator, published time.
- Platform minimum `android`.
- Version code harus integer positif dan versi terbaru ditentukan oleh version code lalu ID.
- Upload APK admin-only, multipart, limit mengikuti konfigurasi server yang eksplisit.
- File harus tersimpan dengan random internal name dan checksum SHA-256.
- Admin dapat list dan mengaktifkan/menonaktifkan release.
- Public latest-release metadata tanpa autentikasi.
- Public download APK tanpa autentikasi karena aplikasi dibutuhkan sebelum login.
- Download wajib path-safe, content type APK, content length, content disposition, nosniff, dan no-store.
- Mobile update endpoint tetap membutuhkan Bearer token dan membandingkan current version code.
- Endpoint:
  - `GET/POST /api/v1/mobile-releases`
  - `PATCH /api/v1/mobile-releases/:id`
  - `GET /api/v1/public/releases/latest?platform=android`
  - `GET /api/v1/public/releases/latest/download`
  - `GET /api/v1/mobile/app-update?versionCode=...`

## 8.23 Audit Logs

- Audit log umum mencatat actor ID/username/name, source web/mobile/job, action, resource, resource ID, method, route, status code, IP, user agent, metadata, timestamp.
- Seluruh mutasi authenticated harus diaudit setelah final response status diketahui.
- Login dan logout dicatat eksplisit.
- Secret, password, token, SNMP community, LDAP bind password, dan file binary tidak boleh masuk metadata.
- Admin dapat list dengan pagination/filter source, actor, resource, date, dan q.
- Audit writer tidak boleh menggagalkan business transaction jika storage audit sementara gagal, tetapi kegagalan harus masuk application log/metric.

## 8.24 AI Assistant

### Integration

- Ollama base URL dan default model berasal dari app settings.
- Jika belum dikonfigurasi, endpoint yang membutuhkan model mengembalikan error jelas tanpa mencoba network call.
- Client mendukung list model dan chat dengan timeout.

### Tools read-only

- `summary`: total asset, maintenance, unassigned, monitor total/offline/degraded/temperature alerts.
- `inventory-search`: mencari name, code, serial, category, item type, location, status, dan assignee; maksimal 100 item; menyertakan matched total dan status breakdown.
- `inventory-analytics`: status summary, without-photo, lifecycle trend 12 bulan.
- `monitoring-health`: hanya persisted snapshot; tidak menjalankan live probe.
- `switch-detail`: hanya membaca cached SNMP detail; tidak menjalankan SNMP dan tidak membocorkan secret.

### Diagnosis

- Tool planner memilih tool dari prompt dan filter eksplisit.
- Ollama hanya menerima evidence yang dibatasi ukuran dan field.
- Model diinstruksikan tidak mengarang angka/status dan tidak menyebut internal implementation kecuali diminta.
- Response mencakup answer, model, tools used, tool results, read-only marker, dan timing/cache metadata.

### Memory

- Normalize question dan fingerprint current tool output.
- Exact answer boleh digunakan ulang hanya jika normalized question dan data fingerprint identik.
- Similar history hanya boleh memengaruhi gaya, bukan fakta.
- Simpan use count, last used, model, response time, dan timestamp.

### Draft dan validation

- Draft asset mengekstrak name, quantity, category, location, description tanpa mutasi.
- Validation memastikan quantity 1–1000, required field, dan memberi warning jika master category/location tidak ditemukan.

### Execute action

- Admin-only.
- Mendukung create assets, update asset, assign, check-in, dan change status.
- Asset target harus unik berdasarkan ID, code, serial, atau exact name; ambiguity harus ditolak.
- Create maksimal 100 item per command dan menghasilkan unique code `AI-YYYYMMDD-*`.
- Category/location harus cocok dengan master data.
- Seluruh command satu transaction dan memakai lifecycle service yang sama dengan API biasa.
- Hasil plan, action, actor, dan result diaudit.

### Endpoint target

- `GET /api/v1/ai/capabilities`
- `GET /api/v1/ai/summary`
- `POST /api/v1/ai/inventory-search`
- `POST /api/v1/ai/inventory-analytics`
- `POST /api/v1/ai/monitoring-health`
- `POST /api/v1/ai/switch-detail`
- `POST /api/v1/ai/diagnoses`
- `POST /api/v1/ai/asset-drafts`
- `POST /api/v1/ai/asset-drafts/validate`
- `POST /api/v1/ai/actions`
- `GET /api/v1/ai/audit-logs`
- `GET /api/v1/ai/memory/stats`

## 8.25 Infrastructure Floor Map Editor

### State

- Satu active editor state key `default` untuk parity, dengan page, zoom, marker list, cable list, page names, dan full JSON properties marker.
- State maximum size harus dibatasi sesuai existing backend atau konfigurasi eksplisit.
- Save hanya `edit`, load/monitoring action minimal `view`.
- Persist updated by dan timestamp.

### Background dan icon

- List halaman PNG dari `floor-map-assets/page-N.png` berikut dimensions dan version timestamp.
- Upload page PNG maksimal sesuai limit, page 1–99 pada editor baru.
- Upload VSD maksimal 100 MB dan simpan sebagai source `backround.vsd` untuk kompatibilitas proses export Windows/Visio.
- Backend tidak wajib menjalankan Microsoft Visio, tetapi wajib menyediakan status/sync request untuk external watcher.
- Upload custom icon PNG/JPEG/WEBP maksimal 2 MB.
- Upload CCTV reference image maksimal 4 MB.
- Semua file memakai safe generated filename dan MIME inspection.

### Marker dan cable

- Pertahankan seluruh property marker existing, termasuk kind, identity, page, normalized position, style, network/SNMP, Blue Iris, UniFi, switch remote, dan custom icon.
- Kind minimum: switch, CCTV, AP, dan marker lain yang sudah ada dalam state lama.
- Cable state dan page relation harus lossless saat migrasi JSON.
- Secret marker harus diredaksi dari response yang tidak memerlukannya.

### Live actions

- Poll marker switch temperature.
- Poll switch traffic.
- Read switch ports dari marker SNMP atau monitor link.
- Ping/status AP.
- Blue Iris status, snapshot, dan record count.
- MJPEG proxy tetap dinonaktifkan untuk mencegah worker exhaustion; UI memakai periodic snapshot.
- Integrasi Switch UI untuk remote monitoring.

### Endpoint target

- `GET /api/v1/floor-map/editor`
- `PUT /api/v1/floor-map/editor`
- `/api/v1/floor-map/backgrounds`
- `/api/v1/floor-map/icons`
- `/api/v1/floor-map/cctv-references`
- `/api/v1/floor-map/markers/:id/temperature`
- `/api/v1/floor-map/markers/:id/traffic`
- `/api/v1/floor-map/markers/:id/ports`
- `/api/v1/floor-map/markers/:id/ap-status`
- `/api/v1/floor-map/markers/:id/cctv-status`
- `/api/v1/floor-map/markers/:id/cctv-snapshot`
- `/api/v1/floor-map/markers/:id/cctv-record-count`

## 8.26 Generic Floor Map Areas

- Pertahankan API area yang sudah ada walaupun UI utama menggunakan editor default.
- Area: name, unique slug, description, background, canvas width/height, state JSON, sort order, soft-delete, creator/updater, timestamps.
- CRUD area memerlukan floor-map edit; list/detail memerlukan view.
- Canvas width 400–10000 dan height 300–10000.
- Background PNG/JPEG/WEBP maksimum 12 MB.
- Delete adalah archive/soft-delete.
- Response area dapat menyertakan monitor list non-sensitive.
- Endpoint `/api/v1/floor-map/areas` dan `/api/v1/floor-map/areas/:id/background`.

## 8.27 Map Asset

### Tujuan

Menempatkan item inventory pada denah PABRIK tanpa mengubah data inventaris dan tanpa menulis marker ke background image.

### Rules

- Direct position memiliki satu row per item dengan x/y 0–100 persen dan placed by.
- Room marker memiliki name dan x/y persen.
- Room-item relation unik per item; item hanya boleh berada di satu room.
- Menempatkan direct marker menghapus room membership.
- Menambahkan item ke room menghapus direct position dan membership room lama.
- Menghapus dari map/room tidak menghapus item inventory.
- Soft-deleted item tidak ditampilkan.
- Data display menyertakan category, type, location, status, dan external source snapshot.

### Network overlay

- Hanya item type CPU, telephone, atau printer sesuai classification existing yang didukung.
- IP disimpan pada custom field `map_asset_ip` dengan fallback field mapping existing.
- IP hanya IPv4 valid.
- Network check menghasilkan `online`, `offline`, `no_ip`, atau `unknown` sesuai parser ping existing.
- Probe harus aman dari command injection dan dibatasi timeout/concurrency.

### Endpoint target

- `GET /api/v1/map-assets`
- `PUT /api/v1/map-assets/items/:itemId/position`
- `DELETE /api/v1/map-assets/items/:itemId/position`
- `POST /api/v1/map-assets/rooms`
- `PATCH /api/v1/map-assets/rooms/:roomId`
- `DELETE /api/v1/map-assets/rooms/:roomId`
- `PUT /api/v1/map-assets/rooms/:roomId/items/:itemId`
- `DELETE /api/v1/map-assets/rooms/:roomId/items/:itemId`
- `GET /api/v1/map-assets/network-assets`
- `PUT /api/v1/map-assets/network-assets/:itemId`
- `POST /api/v1/map-assets/network-assets/:itemId/checks`

## 8.28 UniFi Controller

- Satu shared controller configuration untuk floor map: URL, site, username, encrypted credentials opsional, session payload, self-signed policy, updater, timestamps.
- Connect melakukan login dan dapat remember credentials.
- Disconnect menghapus persisted session dan credential.
- Session status mengembalikan configured, connected/auto-reconnect, controller/site/username non-sensitive, dan can configure.
- Credential harus dienkripsi at rest menggunakan application encryption key, bukan hash.
- Detail AP hanya untuk marker kind `ap` yang sudah tersimpan.
- Jika session expired, auto-login memakai remembered credential; jika tidak ada, meminta reconnect.
- Detail memfilter client agar sesuai AP marker dan mempertahankan mapping/status existing.
- Endpoint `/api/v1/unifi/session` dan `/api/v1/floor-map/markers/:id/unifi-detail`.

## 8.29 Blue Iris

- Base URL dapat berasal dari default configuration atau override marker.
- Login challenge/session Blue Iris harus didukung.
- Camera matching menggunakan marker candidates seperti name/short name/camera ID existing.
- Status camera menormalisasi connected, recording, disabled, no signal, dan message.
- Record count mendukung period day, week, month, all.
- Snapshot diproxy dengan content type yang benar, timeout, dan no-store.
- Credential tidak boleh masuk response/log.
- Multi-server marker harus dikelompokkan agar satu request status tidak login berulang untuk server+credential sama.

## 8.30 Switch Remote UI dan SSH Bridge

- Pertahankan daftar device switch, physical port layout, cached monitoring result, remote preparation token, dan monitoring command yang digunakan route `switch-ui`.
- Remote preparation menerima host, name, marker ID, location, model, SSH port, port count, username, dan password.
- Password tidak boleh dimasukkan ke URL, log, database plaintext permanen, atau response.
- Hasil prepare berupa one-time short-lived token.
- SSH harus memakai library Node SSH, bukan menyusun command shell dengan credential.
- Mendukung Cisco/Juniper parsing dan layout reconciliation existing.
- Cached state harus bisa dimigrasikan dari format `switches.json`.
- Endpoint minimum:
  - `GET /api/v1/switch-remote/devices`
  - `POST /api/v1/switch-remote/sessions`
  - `GET /api/v1/switch-remote/sessions/:token`
  - command/refresh endpoint yang dibutuhkan UI existing.
- Seluruh akses minimal floor-map view; pembuatan session remote mengikuti policy edit/admin yang disepakati saat implementasi, dengan default paling aman `edit`.

## 9. Mobile API Requirements

API mobile memakai use case dan entity yang sama dengan web. Perbedaan hanya authentication transport, response compatibility, payload size, dan larangan operasi tertentu untuk non-admin.

### 9.1 Assets mobile

- List/detail/options.
- Admin-only create, partial update, photo upload, assign, check-in, dan status transition.
- Detail menyertakan custom data dan photo.
- Tidak ada endpoint hard-delete asset pada mobile existing; jangan menambah tanpa kebutuhan.

### 9.2 Monitoring mobile

- List/summary, detail, port, sensor, history, events, uptime.
- Admin-only CRUD monitor.
- Create/update tidak menjalankan blocking probe.
- Tidak pernah mengirim SNMP community.

### 9.3 Floor map mobile

- Read-only list page/area berdasarkan editor state.
- Summary marker per halaman.
- Marker status berasal dari persisted monitor/state, bukan live probe.
- Detail flag menentukan berat payload.

### 9.4 ADDS mobile

- Seluruh capability management tetap admin-only dan sama dengan web.

### 9.5 ZeroTier mobile

- Read network/member authenticated.
- Write network/member admin-only.
- Mobile tidak mengelola ZeroTier API accounts.

### 9.6 AI mobile

- Capability sama dengan web.
- Execute action, audit, dan memory admin-only.
- Response memakai envelope mobile unified.

### 9.7 App update

- Authenticated update check mengembalikan latest release, update available, force update, notes, checksum, dan download URL.

## 10. Database dan Data Migration

### 10.1 Tabel/domain yang wajib dipertahankan

1. `users`
2. `categories`
3. `locations`
4. `custom_fields`
5. `items`
6. `item_custom_data`
7. `item_history`
8. `item_photos`
9. `item_external_sync_data`
10. `app_settings`
11. `adds_services`
12. `zerotier_accounts`
13. `zerotier_networks`
14. `mobile_api_tokens`
15. `mobile_app_releases`
16. `network_monitors`
17. `network_monitor_history`
18. `network_monitor_events`
19. `audit_logs`
20. `it_support_reports`
21. `ai_assistant_qa_memory`
22. `ai_assistant_audit_logs`
23. `floor_map_permissions`
24. `floor_map_permission_groups`
25. `floor_map_permission_group_members`
26. `floor_map_editor_state`
27. `floor_map_editor_blue_iris_default`
28. `floor_map_areas`
29. `floor_map_unifi_controller`
30. `asset_map_positions`
31. `asset_map_rooms`
32. `asset_map_room_items`
33. Legacy `user_module_permissions` dan `denah_cctv_backbone_states` sebagai migration source.

### 10.2 Migration principles

- Buat versioned migration; jangan membuat/alter table di request handler.
- Migration harus bisa berjalan pada database kosong dan database production lama.
- Backup dan dry-run report wajib sebelum cutover.
- IDs existing dipertahankan agar relasi frontend/cache/history tidak rusak.
- Timestamp, soft-delete state, assignment snapshot, external source identity, dan JSON floor-map harus lossless.
- Credential existing dimigrasikan ke encrypted storage bila reversible plaintext diperlukan.
- Sensitive settings tidak boleh tercetak di migration log.
- Legacy floor-map state memiliki migrator terpisah ke editor state baru.
- Legacy map permission harus dipetakan ke floor-map ACL baru.
- File local photo, floor-map asset, icon, CCTV reference, dan APK harus memiliki manifest migrasi serta checksum.

### 10.3 Referential integrity

- Tambahkan foreign key jika aman setelah data orphan diaudit.
- Soft-delete entity yang masih direferensikan tetap dapat ditampilkan melalui historical snapshot.
- History tidak boleh cascade-delete saat asset/user/location dihapus.
- Room deletion menghapus join rows, bukan item.
- Account/network/service delete mengikuti soft-delete behavior existing.

## 11. External Integration Requirements

| Integration | Protocol | Timeout/Resilience | Secret handling |
|---|---|---|---|
| MySQL/MariaDB | TCP | Pool, reconnect, readiness | Env/secret manager |
| HR Directory API | HTTP(S) | Configurable timeout, cache, fallback | Header key masked |
| IT Assets API | HTTP(S) | Pagination, completeness guard | API key masked |
| ZeroTier Central | HTTPS | Error normalization, short cache | Token encrypted/masked |
| Ollama | HTTP(S) | Explicit timeout, model validation | URL controlled |
| ADDS | LDAP/STARTTLS/LDAPS | Network timeout, no insecure password operation | Bind password encrypted |
| SNMP | v2c existing minimum | Timeout, bounded concurrency | Community encrypted/masked |
| SMTP | SMTP/STARTTLS/TLS | Timeout and protocol validation | Password encrypted |
| S3/MinIO | AWS SigV4 HTTP(S) | Checksum, rollback cleanup | Keys encrypted |
| UniFi | HTTP(S) session API | Session refresh/re-login | Credentials encrypted |
| Blue Iris | HTTP API | Login session, request grouping | Credentials encrypted |
| Switch SSH | SSH | Short-lived session, bounded timeout | Never log/password URL |
| Windows Visio exporter | File/watcher boundary | External worker status | No credential requirement |

## 12. Scheduled Jobs dan Workers

### 12.1 Network traffic poller

- Default setiap satu menit.
- Membaca active SNMP monitors.
- Menghitung rate dari counters dan time delta.
- Menyimpan aggregate/VLAN snapshot dan history.
- Lock mencegah overlapping run.

### 12.2 Temperature monitor

- Membaca chassis sensors dari active SNMP monitor.
- Menyimpan snapshot, menentukan alert dengan threshold/hysteresis, dan mengirim email.
- Optical sensor tidak memicu chassis alert.

### 12.3 History retention

- Hapus sample lebih lama dari 30 hari dan event lebih lama dari 180 hari secara configurable.
- Operasi batch agar tidak lock tabel lama.

### 12.4 Optional jobs

- External asset sync sesuai configured interval.
- ADDS sync policy jika fitur auto-sync lama diaktifkan.
- Cleanup expired/revoked mobile tokens.
- Cleanup expired switch remote sessions.
- Cleanup orphan temporary upload.

### 12.5 Job observability

- Setiap run memiliki ID, started/finished time, status, processed/succeeded/failed count, dan error summary.
- Distributed lock diperlukan jika aplikasi berjalan lebih dari satu replica.

## 13. Configuration dan Environment

Minimum environment variables:

```text
NODE_ENV
PORT=8001
APP_TIMEZONE=Asia/Jakarta
DATABASE_HOST
DATABASE_PORT
DATABASE_NAME
DATABASE_USER
DATABASE_PASSWORD
DATABASE_POOL_MIN
DATABASE_POOL_MAX
WEB_SESSION_DAYS
MOBILE_TOKEN_DAYS
COOKIE_SECRET
ENCRYPTION_KEY
CSRF_SECRET
CORS_ORIGINS
UPLOAD_ROOT
LOG_LEVEL
TRUST_PROXY
```

- Tidak ada production secret dalam source, README, seed, Docker image, atau test fixture.
- Default admin password tidak boleh dibuat pada production migration.
- Seed development harus explicit dan tidak berjalan otomatis di production.
- Config validation harus menggagalkan startup jika variable wajib invalid.

## 14. Security Requirements

1. Encryption at rest untuk reversible integration secrets menggunakan AES-256-GCM atau secret manager.
2. Password user hanya hash satu arah.
3. Auth rate limiting dan account brute-force protection.
4. CSRF untuk cookie-authenticated mutation.
5. CORS allowlist, tidak wildcard bersama credential.
6. Helmet/security headers termasuk nosniff, frame policy, dan CSP yang kompatibel.
7. SQL injection dicegah melalui ORM/parameterized query.
8. LDAP injection dicegah melalui DN/filter escaping.
9. Command injection dicegah dengan library protocol; jangan menjalankan command string dari host/user input.
10. SSRF guard untuk HTTP health check dan integration URLs.
11. MIME sniffing dan file size limit pada upload.
12. Path traversal guard untuk semua file download.
13. Response/log redaction untuk password, token, API key, SNMP community, session cookie, dan authorization header.
14. Semua admin mutation dan AI action diaudit.
15. Dependency dan container vulnerability scan pada CI.

## 15. Performance dan Reliability

- P95 endpoint database-only di jaringan internal di bawah 250 ms untuk payload normal.
- Mobile list server processing ditargetkan di bawah 250 ms seperti kontrak existing.
- Network/LDAP/Ollama/ZeroTier calls tidak boleh menahan database transaction.
- List tidak boleh N+1; custom data/photo dapat di-batch.
- Upload/download menggunakan stream.
- SNMP polling memakai bounded concurrency.
- Timeout eksternal wajib; retry hanya untuk operasi idempotent.
- Circuit breaker atau backoff diterapkan pada integration yang sering gagal.
- Cache tidak boleh dianggap source of truth untuk inventory.
- Health live tidak bergantung pada external integration; readiness minimal memeriksa database dan migration state.

## 16. Observability

- Structured JSON log dengan request ID dan actor ID non-sensitive.
- Access log mencatat method, route template, status, duration, dan response size.
- Error log menyimpan stack pada server, response hanya safe message.
- Metrics minimum: request count/duration/error, DB pool, job duration/failure, integration latency/failure, cache age, active alerts.
- Audit log berbeda dari technical application log.
- Timezone display Asia/Jakarta; timestamp storage disarankan UTC.

## 17. Test Strategy

### 17.1 Unit tests

- Asset lifecycle state transitions.
- HR assignment fallback/re-verification.
- External sync completeness/removal guard.
- Monitor status classification.
- VLAN port classification dan aggregation.
- Chassis versus optical temperature scope.
- Uptime calculation.
- Switch physical layout reconciliation.
- Blue Iris status normalization.
- UniFi marker/client selection.
- Map Asset exclusivity direct position versus room.
- AI tool planning, fingerprint, validation, dan action transaction.

### 17.2 Integration tests

- Repository terhadap MySQL/MariaDB container.
- Migration dari snapshot skema/data PHP.
- Auth cookie, CSRF, Bearer token expiry/revocation.
- Local/S3 photo lifecycle.
- Export PDF/CSV.
- Mock HTTP untuk HR, Asset API, ZeroTier, Ollama, UniFi, Blue Iris.
- Mock LDAP, SMTP, SNMP, dan SSH adapter.

### 17.3 Contract tests

- Snapshot fixture dari setiap endpoint PHP dibandingkan dengan API NestJS setelah normalization.
- Pastikan field sensitive tidak muncul.
- Pastikan error/status code konsisten.
- Compatibility endpoint dites dengan frontend web existing dan mobile existing.

### 17.4 End-to-end tests

- Login web → dashboard → CRUD asset → assign → check-in → history.
- Admin master data dan settings.
- Monitoring list/detail/create/update/delete tanpa live device dependency.
- Floor-map load/save/upload dan ACL.
- Map Asset drag/room/network status.
- APK publish → public metadata → download → mobile update check.
- ADDS/ZeroTier/AI dengan mock integration.

### 17.5 Baseline test existing

- Seluruh test PHP existing dijadikan characterization suite sebelum dihapus.
- Saat audit awal, syntax 102 file PHP lulus.
- Test VLAN, temperature scope, switch status, Map Asset network, UniFi, Blue Iris, dan external asset lulus.
- Fixture `switch-physical-layout-test.php` untuk host `200.200.200.17` saat ini tidak memenuhi ekspektasi 48 LAN/4 SFP karena cache menghasilkan 0/0. Fixture/cache ini harus diperbaiki atau dibekukan definisi expected behavior-nya sebelum parity gate final.

## 18. Compatibility dan Cutover

### Phase 1: Characterization

- Rekam OpenAPI-like contract dari seluruh endpoint PHP.
- Ambil anonymized fixture database, JSON state, cache, dan file manifest.
- Bekukan expected business rules melalui test.

### Phase 2: NestJS core

- Implement database migrations, auth, master, assets, lifecycle, dan audit.
- Jalankan pada port 8001 tanpa mengubah production traffic.

### Phase 3: Integrations dan operational modules

- Monitoring, jobs, reports, ADDS, ZeroTier, AI, file storage, releases.

### Phase 4: Floor map ecosystem

- Editor, Map Asset, UniFi, Blue Iris, Switch Remote, legacy state migration.

### Phase 5: Compatibility layer

- Proxy/adapter path lama ke NestJS.
- Current web dan mobile harus berjalan tanpa perubahan besar.
- Field/envelope adapter hanya berada di controller compatibility, bukan domain service.

### Phase 6: Shadow dan cutover

- Mirror read request ke backend baru dan compare sanitized output.
- Dual-write tidak digunakan tanpa idempotency/consistency design eksplisit.
- Freeze write singkat, jalankan final migration, switch traffic, lakukan smoke test.
- Rollback plan mempertahankan database/file backup dan routing ke PHP.

## 19. Mapping Backend PHP ke Modul NestJS

| Source PHP | Target module/capability |
|---|---|
| `api/auth.php` | Auth web |
| `api/mobile/v1/bootstrap.php` | Mobile API envelope, validation, token guard, ETag, dan error handling |
| `api/mobile/v1/auth.php` | Auth mobile/token |
| `api/users.php` | Users |
| `api/categories.php` | Categories/item types |
| `api/locations.php` | Locations |
| `api/custom_fields.php` | Custom fields |
| `api/items.php` | Assets dan lifecycle web |
| `api/mobile/v1/assets.php` | Assets mobile/photos/lifecycle |
| `api/asset_photo_file.php` | Authenticated photo streaming |
| `api/asset_photo_storage_migrate.php` | Storage migration |
| `api/asset_sync.php` | External asset sync command |
| `api/hr_directory.php`, `api/mobile/v1/hr_directory.php` | HR directory |
| `api/network_monitors.php` | Monitor CRUD/probe/traffic |
| `api/network_switch_details.php` | Switch ports/sensor/PoE detail |
| `api/network_monitor_top_users.php` | Top-user cache/report |
| `api/network_monitor_history.php` | History/events/uptime |
| `api/mobile/v1/monitoring.php` | Mobile monitoring contract |
| `api/cli/network_traffic_monitor.php` | Traffic scheduled job |
| `api/cli/temperature_monitor.php` | Temperature/alert scheduled job |
| `api/reports.php` | Inventory reports PDF/CSV |
| `api/it_reports.php`, `api/it_reports_export.php` | IT support reports |
| `api/app_settings.php`, `api/app_branding.php` | Settings/branding |
| `api/adds_services.php` | ADDS service config/test |
| `api/mobile/v1/adds.php` | ADDS directory operations |
| `api/zerotier_accounts.php` | ZeroTier API accounts |
| `api/zerotier_networks.php` | Managed ZeroTier networks |
| `api/zerotier_members.php` | ZeroTier members web |
| `api/mobile/v1/zerotier.php` | ZeroTier mobile |
| `api/mobile_releases.php` | Release management |
| `api/public_release.php`, `download.php`, `download-apk.php` | Public release/download |
| `api/mobile/v1/app_update.php` | Authenticated update check |
| `api/audit_logs.php` | Audit query |
| `api/ai_assistant.php`, `api/mobile/v1/ai_assistant.php` | AI API |
| `api/lib/AiAssistantService.php` | AI tools/memory/actions/audit |
| `api/floor_map_permissions.php` | Floor-map ACL |
| `api/floor_map_editor.php`, `denah.php` backend calls | Editor/state/live actions |
| `api/floor_maps.php` | Generic floor-map areas |
| `api/mobile/v1/floor_maps.php` | Mobile read floor map |
| `map_asset/api.php`, `map_asset/network.php` | Map Asset dan network probe |
| `api/ap_unifi.php` | UniFi controller/AP detail |
| `map/modules/denah_cctv_backbone/api.php` | Legacy floor-map migration/compatibility |
| `new_map/.../switch ui/api.php` | Switch remote/SSH UI |
| `migration.php`, `api/cli/migrate_*.php` | Versioned data migrations |

`api/items_final.php` dan duplicate package di `new_map` harus diaudit sebagai artefak legacy. Fitur unik di dalamnya wajib dipindahkan; file duplikatnya tidak menjadi alasan untuk membuat dua domain implementation.

## 20. Definition of Done

Rewrite backend dianggap selesai hanya jika semua kondisi berikut terpenuhi:

1. NestJS berjalan di port `8001` dan health/readiness berhasil.
2. Seluruh modul pada Section 7 tersedia.
3. Seluruh mapping source PHP pada Section 19 memiliki implementasi atau migration/compatibility disposition tertulis.
4. Tidak ada endpoint penting yang masih menjalankan business logic PHP.
5. Web existing dapat login dan menjalankan seluruh flow utama melalui compatibility layer atau frontend yang sudah dimigrasikan.
6. Mobile existing dapat login, membaca/memutasi capability yang sama, mengunduh update, dan memakai Bearer token.
7. Data production dapat dimigrasikan tanpa kehilangan row, relasi, file, history, state denah, permission, atau secret.
8. Semua business rule lifecycle, monitoring, VLAN, temperature, sync, dan ACL lolos test.
9. Seluruh external integration memiliki mock test dan smoke-test procedure.
10. Tidak ada secret dalam response, log, source, atau OpenAPI example.
11. Seluruh mutation memiliki audit trail.
12. API memiliki OpenAPI document dan contoh request/response.
13. Unit, integration, contract, E2E, lint, typecheck, migration test, dan security scan lulus di CI.
14. P95 performance target terpenuhi untuk endpoint database-only/mobile list.
15. Rollback dan backup procedure diuji.
16. Dokumentasi runbook job, integration, storage, dan troubleshooting tersedia.
17. Tidak ada pengurangan fitur dibanding backend PHP; setiap perbedaan harus mendapat persetujuan product owner tertulis.

## 21. Parity Checklist Final

- [ ] Web session login/check/logout.
- [ ] Mobile login/profile/logout/change password/revocation.
- [ ] User/category/location/custom-field CRUD.
- [ ] Asset CRUD, search, filters, summary, custom data.
- [ ] Assignment local/HR, transfer, check-in, status, history.
- [ ] Photo upload/stream/delete dan local/S3 migration.
- [ ] External asset sync dan safe reconciliation.
- [ ] HR search/cache/fallback.
- [ ] Dashboard analytics.
- [ ] Monitor CRUD, ping, TCP, HTTP, SNMP, traffic.
- [ ] Switch port, physical layout, sensor, PoE, temperature.
- [ ] VLAN aggregation dan top users.
- [ ] History, events, uptime, retention.
- [ ] Temperature alert dan SMTP test/send.
- [ ] Inventory report preview/PDF/CSV.
- [ ] IT support report CRUD/filter/summary/export.
- [ ] Settings, validation, secret masking, branding.
- [ ] ADDS config/test dan seluruh directory operations.
- [ ] ZeroTier multi-account/network/member operations.
- [ ] APK upload/publish/public metadata/download/update check.
- [ ] Audit logs web/mobile/job.
- [ ] AI tools, diagnosis, memory, draft, validation, admin actions.
- [ ] Floor-map ACL direct/group.
- [ ] Editor state/background/icon/CCTV reference/live actions.
- [ ] Generic floor-map area CRUD.
- [ ] Mobile floor-map read model.
- [ ] Map Asset direct position/rooms/network probe.
- [ ] UniFi connection/session/AP detail.
- [ ] Blue Iris status/snapshot/record count.
- [ ] Switch remote session/device/layout/SSH behavior.
- [ ] CLI behavior dipindahkan ke scheduler/worker.
- [ ] Legacy schema, state, cache, uploads, dan route migration.

