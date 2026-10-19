"use client";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Wrench, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { api, ApiError, API } from "@/lib/api";
import { useBranding } from "@/lib/branding";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const auth = useAuth();
  const branding = useBranding();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (auth.user) router.replace("/dashboard");
  }, [auth.user, router]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await api<{ user: unknown; csrfToken: string }>(
        "/auth/login",
        { method: "POST", body: JSON.stringify({ username, password }) },
      );
      sessionStorage.setItem("csrf", result.csrfToken);
      await auth.refresh();
      router.replace("/dashboard");
    } catch (err) {
      setUsername("");
      setPassword("");
      setShow(false);
      setError(
        err instanceof ApiError && [400, 401, 403, 404].includes(err.status)
          ? "Pastikan data login benar, lalu coba masuk kembali."
          : "Koneksi ke server bermasalah.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#7d5a91] via-[#c98a9b] to-[#f0a97e] px-4 py-10">
      <div className="absolute -left-24 top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute -right-20 bottom-10 h-80 w-80 rounded-full bg-rose-300/20 blur-3xl" />
      <h1 className="mb-8 text-center text-3xl font-extrabold tracking-tight text-white drop-shadow-sm sm:text-4xl">
        WELCOME {branding.appName}
      </h1>
      <div className="z-10 w-full max-w-sm rounded-3xl border border-white/25 bg-white/15 p-7 shadow-2xl backdrop-blur-xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-xl bg-slate-900 text-white shadow-md">
            {branding.logoUrl ? (
              <img
                src={`${API}/public/branding/logo`}
                alt=""
                className="h-full w-full object-contain p-1"
              />
            ) : (
              <Wrench className="h-5 w-5" />
            )}
          </span>
          <span>
            <b className="block text-xl text-white">{branding.appName}</b>
            <span className="block text-xs text-white/80">
              {branding.appSubtitle}
            </span>
          </span>
        </div>
        <form onSubmit={submit} autoComplete="off" className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/90">
              NIK
            </label>
            <input
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="h-11 w-full rounded-xl border-0 bg-white px-4 text-sm shadow-sm outline-none focus:ring-2 focus:ring-white/70"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/90">
              Password
            </label>
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 w-full rounded-xl border-0 bg-white px-4 pr-11 text-sm shadow-sm outline-none focus:ring-2 focus:ring-white/70"
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                {show ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button
              disabled={pending}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-rose-600 px-7 text-sm font-semibold text-white shadow-lg hover:bg-rose-700 disabled:opacity-60"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending ? "Memproses…" : "Login"}
            </button>
          </div>
        </form>
      </div>
      <p className="mt-6 text-center text-xs text-white/80">
        Copyright © {new Date().getFullYear()}, {branding.appName}
        <br />
        All rights reserved.
      </p>
      {error && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <div className="flex min-h-[290px] w-full max-w-xl flex-col items-center justify-center gap-6 rounded-3xl bg-white p-8 text-center shadow-2xl">
            <button
              onClick={() => setError(null)}
              className="rounded-lg p-2 hover:bg-slate-100"
            >
              <X className="h-10 w-10" />
            </button>
            <h2 className="text-4xl font-bold">Login Gagal</h2>
            <p className="text-xl font-bold">Invalid NIK or PASSWORD</p>
            <p className="text-sm text-slate-500">{error}</p>
          </div>
        </div>
      )}
    </main>
  );
}
