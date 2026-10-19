# MCS UI Templates

Folder ini menjadi sumber utama untuk empat bagian UI/UX MCS yang dapat
dipelihara secara terpisah:

- `login-page.tsx` — halaman login dan dialog error login.
- `navbar.tsx` — app header/navbar, jam, notifikasi, dan menu profil.
- `sidebar.tsx` — navigasi utama, submenu, permission, dan state collapse.
- `profile-page.tsx` — informasi akun, avatar, dan form ganti password.

Route dan komponen lama di dalam `src/` hanya menjadi wrapper/re-export agar
URL serta import existing tetap kompatibel. Alias `@template/*` didefinisikan
di `tsconfig.json`, dan folder ini sudah masuk ke konfigurasi content Tailwind.

Untuk mengubah tampilan salah satu bagian, edit file terkait di folder ini.
