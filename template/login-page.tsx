"use client";

// Template UI login yang dipakai oleh route /login.

import { useEffect, useState } from "react";
import localFont from "next/font/local";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2, Wrench, X } from "lucide-react";
import { useLogin } from "@/hooks/use-auth";
import { useBranding } from "@/hooks/use-settings";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/types/api";

const utamaFont = localFont({
  src: "../font/UtamaFont-Regular.ttf",
  display: "swap",
  variable: "--font-utama",
});

const schema = z.object({
  username: z.string().min(1, "NIK wajib diisi"),
  // Boleh kosong: akun baru / password direset -> backend arahkan ke buat password.
  password: z.string(),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const login = useLogin();
  const branding = useBranding().data?.data;
  const logoUrl = branding?.logo_url ?? null;
  const appName = branding?.app_name || "MCS";
  const appSubtitle = branding?.app_subtitle || "Maintenance Control System";
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    // Jangan mewariskan nilai login sebelumnya saat halaman dibuka kembali.
    defaultValues: { username: "", password: "" },
  });

  // Saat halaman pertama kali dibuka dan setelah dialog ditutup, pengguna
  // bisa langsung mengetik NIK tanpa perlu mengklik field terlebih dahulu.
  useEffect(() => {
    if (!loginError) setFocus("username");
  }, [loginError, setFocus]);

  const onSubmit = handleSubmit((values) => {
    setLoginError(null);
    login.mutate(values, {
      onError: (err) => {
        const credentialError =
          err instanceof ApiError && [400, 401, 403, 404].includes(err.status);
        const message = credentialError
          ? "Pastikan data login benar, lalu coba masuk kembali."
          : err instanceof ApiError
            ? err.message
            : "Koneksi ke server bermasalah. Silakan coba beberapa saat lagi.";
        // Credential tidak disimpan/ditampilkan lagi setelah percobaan gagal.
        reset({ username: "", password: "" });
        setShowPassword(false);
        setLoginError(message);
      },
    });
  });

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#7d5a91] via-[#c98a9b] to-[#f0a97e] px-4 py-10">
      {/* Judul di atas kartu */}
      <h1 className="mb-8 text-center text-3xl font-extrabold tracking-tight text-white drop-shadow-sm sm:text-4xl">
        WELCOME {appName}
      </h1>

      {/* Kartu login (glass) */}
      <div className="w-full max-w-sm rounded-3xl border border-white/25 bg-white/15 p-7 shadow-2xl backdrop-blur-xl">
        {logoUrl ? (
          <div className="mb-5 text-center">
            {/* Crop tagline yang sudah menempel pada file logo; subtitle di bawah
                ini adalah teks biasa agar konsisten di login/sidebar. */}
            <div className="mx-auto h-[110px] overflow-hidden sm:h-[136px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt={appName}
                className="mx-auto h-36 w-auto max-w-[290px] object-contain object-top mix-blend-multiply drop-shadow-lg sm:h-44"
              />
            </div>
            <p className={`${utamaFont.className} mt-1 text-base font-semibold tracking-wide text-white sm:text-lg`}>
              {appSubtitle}
            </p>
          </div>
        ) : (
          <div className="mb-6 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-900 text-white shadow-md">
              <Wrench className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-xl font-bold text-white">{appName}</span>
              <span className="block text-xs text-white/80">{appSubtitle}</span>
            </span>
          </div>
        )}

        <form onSubmit={onSubmit} autoComplete="off" className="space-y-4">
          <div>
            <label
              htmlFor="username"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/90"
            >
              NIK
            </label>
            <input
              id="username"
              autoComplete="off"
              autoFocus
              className="h-11 w-full rounded-xl border-0 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none ring-0 placeholder:text-slate-400 focus:ring-2 focus:ring-white/70"
              {...register("username")}
            />
            {errors.username ? (
              <p className="mt-1 text-xs font-medium text-rose-100">
                {errors.username.message}
              </p>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/90"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="off"
                className="h-11 w-full rounded-xl border-0 bg-white px-4 pr-11 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-white/70"
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
              >
                {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </div>
            {errors.password ? (
              <p className="mt-1 text-xs font-medium text-rose-100">
                {errors.password.message}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={login.isPending}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-rose-600 px-7 text-sm font-semibold text-white shadow-lg transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60"
            >
              {login.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Memproses…
                </>
              ) : (
                "Login"
              )}
            </button>
          </div>
        </form>
      </div>

      <p className="mt-6 text-center text-xs text-white/80">
        Copyright © {new Date().getFullYear()}, MCS
        <br />
        All rights reserved.
      </p>

      <Modal
        open={Boolean(loginError)}
        onClose={() => setLoginError(null)}
        size="xl"
        centered
      >
        <div className="flex min-h-[290px] flex-col items-center justify-center gap-6 py-8 text-center">
          <button
            type="button"
            onClick={() => setLoginError(null)}
            className="rounded-lg p-2 text-slate-950 transition hover:bg-slate-100"
            aria-label="Tutup"
          >
            <X className="h-10 w-10 stroke-[2.5]" />
          </button>
          <h2 className="text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
            Login Gagal
          </h2>
          <p className="text-2xl font-bold text-slate-950 sm:text-3xl">
            Invalid NIK or PASSWORD
          </p>
        </div>
      </Modal>
    </div>
  );
}
