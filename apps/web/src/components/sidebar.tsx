"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, Wrench, X } from "lucide-react";
import { navGroups, navItems } from "./nav";
import { useAuth } from "@/lib/auth";
import { useBranding } from "@/lib/branding";
import { API } from "@/lib/api";
export function Sidebar({
  open,
  collapsed,
  close,
}: {
  open: boolean;
  collapsed: boolean;
  close(): void;
}) {
  const path = usePathname();
  const { user } = useAuth();
  const branding = useBranding();
  const [logoFailed, setLogoFailed] = useState(false);
  const items = navItems.filter(
    (x) =>
      (!x.admin || user?.role === "admin") &&
      (!x.ga || user?.role === "admin" || user?.gaRole !== "none"),
  );
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={close}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-64 flex-col bg-[#0a0f1c] text-white transition-[width,transform] duration-200 lg:sticky lg:top-0 lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"} ${collapsed ? "lg:w-20" : "lg:w-64"}`}
      >
        <div
          className={`flex items-start gap-2 px-5 pb-5 pt-5 ${collapsed ? "lg:justify-center lg:px-2" : "justify-between"}`}
        >
          <Link
            href="/dashboard"
            className="flex min-w-0 items-center gap-3"
            title={branding.appName}
          >
            <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-slate-900 text-white ring-1 ring-white/10">
              {branding.logoUrl && !logoFailed ? (
                <img
                  src={`${API}/public/branding/logo`}
                  alt=""
                  onError={() => setLogoFailed(true)}
                  className="h-full w-full object-contain p-1"
                />
              ) : (
                <Wrench className="h-5 w-5" />
              )}
            </span>
            <span
              className={`min-w-0 leading-tight ${collapsed ? "lg:hidden" : ""}`}
            >
              <b className="block truncate text-base text-white">
                {branding.appName}
              </b>
              <span className="block truncate text-[11px] text-white/80">
                {branding.appSubtitle}
              </span>
            </span>
          </Link>
          <button onClick={close} className="p-1.5 text-white lg:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mx-5 border-t border-white/10" />
        <nav
          aria-label="Navigasi utama"
          className="scrollbar-none flex-1 overflow-y-auto px-3 py-5"
        >
          {navGroups.map((group) => {
            const GroupIcon = group.icon;
            const groupItems = group.items
              .map((href) => items.find((item) => item.href === href))
              .filter((item): item is (typeof items)[number] => Boolean(item));
            if (!groupItems.length) return null;
            const groupActive = groupItems.some(
              (item) => path === item.href || path.startsWith(`${item.href}/`),
            );
            if (collapsed)
              return (
                <div
                  key={group.label}
                  className="mb-4 space-y-2 border-b border-white/10 pb-4 last:border-0"
                >
                  {groupItems.map(({ href, label, icon: Icon }) => {
                    const active = path === href || path.startsWith(`${href}/`);
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={close}
                        title={label}
                        aria-label={label}
                        className={`grid h-11 place-items-center rounded-lg text-white transition ${active ? "bg-blue-600 shadow-sm" : "hover:bg-white/10"}`}
                      >
                        <Icon className="h-[18px] w-[18px]" />
                      </Link>
                    );
                  })}
                </div>
              );
            return (
              <details
                key={group.label}
                open={groupActive}
                className="group/nav"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-2 py-3 text-[11px] font-semibold uppercase tracking-[.12em] text-white hover:bg-white/10 [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-3">
                    <GroupIcon className="h-[17px] w-[17px] shrink-0" />
                    {group.label}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 transition-transform group-open/nav:rotate-180" />
                </summary>
                <div className="space-y-1.5 pb-4 pt-0.5">
                  {groupItems.map(({ href, label, icon: Icon }) => {
                    const active = path === href || path.startsWith(`${href}/`);
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={close}
                        className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white transition ${active ? "bg-blue-600 shadow-sm" : "hover:bg-white/10"}`}
                      >
                        <Icon className="h-[18px] w-[18px] shrink-0" />
                        <span>{label}</span>
                      </Link>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
