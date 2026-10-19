# IS Department Management System

Implementasi monorepo untuk workflow pada `PRD.md`:

- `apps/api`: NestJS REST API, Prisma, PostgreSQL, session web, token mobile, audit, scheduler, file streaming, dan adapter integrasi.
- `apps/web`: Next.js dashboard yang mengikuti template login, navbar, sidebar, dan profile dari folder `template`.

## Menjalankan lokal

1. Install Node.js 22 LTS dan Docker Desktop.
2. Salin `.env.example` menjadi `.env`, lalu isi secret dan `SEED_ADMIN_PASSWORD`.
3. Untuk development host, jalankan `docker compose up -d postgres`, lalu `npm install`, `npm run db:generate`, `npm run db:migrate`, `npm run db:seed`, dan `npm run dev`.
4. Alternatif tanpa instalasi Node/PostgreSQL di host: jalankan `docker compose up --build -d`, lalu sekali saja jalankan `docker compose exec api npm run db:migrate && docker compose exec api npm run db:seed`.

Web tersedia di `http://localhost:3000`, API di `http://localhost:8001/api/v1`, dan Swagger di `http://localhost:8001/api/docs` saat non-production.

Frontend menggunakan proxy `/api/v1` pada host yang sama. Jika API berjalan di alamat lain, atur `API_ORIGIN` pada environment proses web. Variabel `NEXT_PUBLIC_API_URL` dapat dipakai untuk mengubah alamat API di browser bila diperlukan.

### Database lokal alternatif

Untuk memakai database development yang berbeda tanpa mengubah `.env`, buat `.env.local` di root proyek dan isi `DATABASE_URL`. Proses API dan perintah `db:*` akan membaca file ini lebih dahulu; variabel environment yang diberikan langsung tetap memiliki prioritas tertinggi. Jangan gunakan `db:migrate` pada database yang belum siap diubah: perintah saat ini memakai `prisma db push`, bukan migrasi berversi.

Pada mesin ini, database development terpisah sudah disiapkan di port `55432`, dengan data di `~/.local/share/ism-local/database`. Jika belum berjalan, jalankan:

```bash
pg_ctl -D "$HOME/.local/share/ism-local/database" -l "$HOME/.local/share/ism-local/postgres.log" -o "-p 55432 -h 127.0.0.1 -k $HOME/.local/share/ism-local" start
npm run dev
```

Login menggunakan `SEED_ADMIN_USERNAME` dan `SEED_ADMIN_PASSWORD` yang sudah dikonfigurasi di `.env`. Jika pindah sistem operasi, jalankan `npm install` dan `npm run db:generate` pada sistem tujuan agar dependency native dan Prisma sesuai platform.

## Menjalankan dengan PM2

Setelah dependency, database, migrasi, dan build siap:

```powershell
npm.cmd run build
npm.cmd run pm2:start
npm.cmd run pm2:list
```

Gunakan `npm.cmd run pm2:restart`, `npm.cmd run pm2:logs`, atau `npm.cmd run pm2:stop` untuk operasional berikutnya. Konfigurasi proses berada di `ecosystem.config.cjs` dan log berada di folder `logs/`.

## Keputusan database

Walaupun dokumen awal menyebut MySQL/MariaDB, implementasi menggunakan PostgreSQL sesuai instruksi proyek terbaru. Seluruh model Prisma, migrasi, health check, dan Docker Compose telah disesuaikan untuk PostgreSQL.

