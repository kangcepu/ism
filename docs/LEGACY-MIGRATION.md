# Migrasi ISM lama

Migrasi membaca database dan file dari `/mnt/www/webapp/it_inventory`. Database tujuan ditentukan oleh `DATABASE_URL`, dengan `.env.local` diprioritaskan di atas `.env`. Variabel lingkungan yang sudah ada memiliki prioritas tertinggi. `LEGACY_ROOT` dapat digunakan untuk memilih direktori sumber lain.

```bash
npm run migrate:legacy -- dry-run
npm run migrate:legacy -- execute
npm run migrate:legacy -- verify
```

Dry-run menampilkan jumlah data, kecocokan data yang sudah ada, bentrokan ID, dan background area yang tidak ditemukan. Perintah execute hanya dapat dijalankan sekali; checkpoint mencegah pengulangan. Data yang sudah cocok berdasarkan username, nama kategori dan jenisnya, nama lokasi, atau kode aset dipertahankan di tujuan. ID yang bentrok dipetakan ulang beserta referensinya.

Sebelum perubahan, script menyimpan backup PostgreSQL, snapshot database sumber, file sumber yang disalin, dan manifest SHA-256 di `.migration-backups/`. Direktori ini memiliki izin privat dan berisi data serta kredensial sensitif. Simpan dan kelola backup ini sesuai kebijakan keamanan. Verifikasi memeriksa jumlah ID yang dipetakan dan checksum file hasil migrasi.

Password bcrypt pengguna lama tetap dapat dipakai dan diperbarui menjadi Argon2 setelah login berhasil. Jika username sudah ada di tujuan, password pengguna tujuan tetap digunakan. Password bind ADDS, kredensial MinIO, dan rahasia pada state floor map disimpan terenkripsi.

Foto dari MinIO lama disalin ke penyimpanan lokal ISM agar endpoint foto yang tersedia dapat membacanya. Konfigurasi MinIO juga dipindahkan dan dapat diuji melalui Settings. File background area yang tidak tersedia pada sumber tidak dapat disalin; referensi dan data area tetap disimpan untuk pemulihan saat file ditemukan.

## ZeroTier, switch, dan monitoring

```bash
npm run migrate:legacy-network -- dry-run
npm run migrate:legacy-network -- execute
npm run migrate:legacy-network -- verify
```

Tahap ini memindahkan akun dan network ZeroTier, token default, perangkat switch beserta cache port, monitor dan cache detail, event serta seluruh riwayat monitoring, dan konfigurasi controller UniFi. Data ruangan dan denah yang sudah dimigrasikan diperiksa terhadap checkpoint tahap awal. Perubahan denah dari sumber digabung berdasarkan backup tahap awal sehingga perubahan yang berbeda di tujuan tidak ditimpa. Perubahan yang tidak dapat digabung dilaporkan sebagai konflik.

Sebelum mengimpor, script mencadangkan database tujuan dan snapshot sumber. Riwayat monitoring disimpan terkompresi bersama checksum dan dibaca dari snapshot database sumber yang konsisten. Izin backup dibatasi karena isinya sensitif. Checkpoint mencegah eksekusi ulang dan menyediakan perintah verifikasi jumlah.

Schema memperbolehkan status kosong untuk sampel traffic dan suhu yang tidak memiliki status perangkat. Latency, traffic, dan suhu menggunakan kolom desimal agar nilai sumber tetap presisi. Unik host monitor hanya berlaku untuk monitor aktif sehingga riwayat monitor lama yang dihapus dan memakai host sama tetap dapat dipertahankan.

Secret marker yang tidak memiliki ID marker yang cocok disimpan terenkripsi sebagai arsip. Arsip ini tidak otomatis dihubungkan ke marker lain. Koneksi UniFi yang dimigrasikan ditandai belum terhubung sampai sesi baru dibuat. Migrasi hanya mengambil snapshot dan tidak menyinkronkan perubahan berikutnya dari sistem lama.
