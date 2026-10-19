# Denah Visio

Infrastructure Map menampilkan denah SVG sebagai elemen vektor dan menyimpan marker serta kabel dalam koordinat halaman lama. PNG lama tetap disimpan dan dapat dipilih untuk perbandingan. Untuk denah baru, ekspor halaman dari Visio sebagai SVG dengan `viewBox`, lalu unggah pada halaman yang sesuai. PNG juga tetap didukung.

Berkas VSD dan PNG migrasi disimpan di direktori upload `floor-map-assets`. Untuk membuat ulang SVG dari berkas migrasi tersebut, jalankan perintah berikut dari root proyek pada server yang memiliki LibreOffice, Python UNO, Pillow, dan ImageMagick:

```sh
/usr/bin/python3 scripts/export-floor-visio.py apps/api/uploads/floor-map-assets/backround.vsd apps/api/uploads/floor-map-assets
```

Skrip menggunakan PNG sebagai acuan untuk memotong bidang Visio dan tidak mengubah PNG, VSD, marker, atau kabel. Halaman dengan batas yang tidak cocok dilewati. Untuk denah migrasi yang dikenali melalui hash, skrip juga memulihkan simbol antena dan sejumlah detail yang tidak diekspor oleh LibreOffice dari PNG referensi sebagai path SVG. Detail yang ditelusuri dari PNG mengikuti resolusi sumber dan tidak memiliki struktur objek Visio asli. Konversi Visio oleh LibreOffice dapat berbeda dari Microsoft Visio, sehingga periksa setiap halaman dan bandingkan dengan pilihan PNG lama, terutama sebelum mengganti denah yang sudah memiliki marker. File asli dan hasil konversi berada di direktori upload dan harus disertakan dalam backup.
