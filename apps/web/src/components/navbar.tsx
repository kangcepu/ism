"use client";

import { Bell, ChevronLeft, LogOut, Menu, UserCog } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { titles } from "./nav";

type Notification = {
  id: string;
  newStatus: string;
  message: string | null;
  startedAt: string;
  monitor: { id: number; name: string };
};
const initials = (name = "") =>
  name
    .split(/\s+/)
    .slice(0, 3)
    .map((x) => x[0])
    .join("")
    .toUpperCase() || "?";

export function Navbar({
  collapsed,
  toggle,
  mobile,
}: {
  collapsed: boolean;
  toggle(): void;
  mobile(): void;
}) {
  const path = usePathname();
  const { user, logout } = useAuth();
  const [now, setNow] = useState<Date | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);
  async function showNotifications() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setLoading(true);
    setError("");
    try {
      setNotifications(await api<Notification[]>("/notifications"));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat notifikasi.");
    } finally {
      setLoading(false);
    }
  }
  const key = path.split("/")[1] || "dashboard";
  const title = titles[key] || "ISM";
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white pr-4">
      <button
        aria-label={collapsed ? "Tampilkan sidebar" : "Sembunyikan sidebar"}
        onClick={toggle}
        className="relative z-50 hidden h-16 w-10 place-items-center rounded-r-[2rem] bg-gradient-to-b from-[#09111f] to-[#070d18] text-white shadow-lg lg:grid"
      >
        <ChevronLeft
          className={`h-4 w-4 transition ${collapsed ? "rotate-180" : ""}`}
        />
      </button>
      <button
        aria-label="Buka menu"
        onClick={mobile}
        className="ml-3 rounded-lg p-2 text-slate-600 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1 py-2">
        <p className="truncate text-[15px] font-semibold text-slate-900">
          {title}
        </p>
        <p className="truncate text-xs text-slate-400">
          {key === "dashboard" ? title : `Dashboard → ${title}`}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden min-w-[152px] items-center justify-center border-r border-slate-200 pr-4 text-center sm:flex">
          <div>
            <p className="font-mono text-sm font-semibold tabular-nums">
              {now?.toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              }) || "--:--"}
            </p>
            <p className="text-[11px] text-slate-400">
              {now?.toLocaleDateString("id-ID", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              }) || "--"}
            </p>
          </div>
        </div>
        <div className="relative">
          <button
            aria-label="Notifikasi"
            aria-expanded={open}
            onClick={showNotifications}
            className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <Bell className="h-5 w-5" />
          </button>
          {open && (
            <section
              aria-label="Notifikasi monitoring"
              className="absolute right-0 top-full z-40 mt-2 w-[min(22rem,90vw)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
            >
              <div className="border-b px-4 py-3 text-sm font-semibold">
                Event Monitoring
              </div>
              <div className="max-h-80 overflow-y-auto">
                {loading ? (
                  <p className="p-4 text-sm text-slate-500">Memuat…</p>
                ) : error ? (
                  <p role="alert" className="p-4 text-sm text-rose-700">
                    {error}
                  </p>
                ) : notifications.length ? (
                  notifications.map((event) => (
                    <Link
                      key={event.id}
                      href={`/monitoring/${event.monitor.id}`}
                      onClick={() => setOpen(false)}
                      className="block border-b px-4 py-3 text-sm hover:bg-slate-50"
                    >
                      <span className="font-semibold">
                        {event.monitor.name} · {event.newStatus}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {event.message || "Status berubah"} ·{" "}
                        {new Date(event.startedAt).toLocaleString("id-ID")}
                      </span>
                    </Link>
                  ))
                ) : (
                  <p className="p-4 text-sm text-slate-500">
                    Belum ada event monitoring.
                  </p>
                )}
              </div>
            </section>
          )}
        </div>
        <details className="group relative">
          <summary className="flex cursor-pointer list-none items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 ring-1 ring-blue-200">
              {initials(user?.fullname)}
            </span>
            <span className="hidden max-w-[190px] truncate text-sm font-medium sm:block">
              {user?.fullname || "Memuat…"}
            </span>
          </summary>
          <div className="absolute right-0 top-full z-40 mt-1 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
            <div className="border-b px-3 py-2">
              <p className="truncate text-sm font-medium">{user?.fullname}</p>
              <p className="truncate text-xs text-slate-400">
                {user?.email || user?.username}
              </p>
            </div>
            <Link
              href="/profile"
              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50"
            >
              <UserCog className="h-4 w-4" />
              Profil
            </Link>
            <button
              onClick={logout}
              className="flex w-full items-center gap-2 border-t px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </details>
      </div>
    </header>
  );
}
