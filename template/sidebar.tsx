"use client";

// Template sidebar utama aplikasi.

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Wrench, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, type NavChild, type NavItem } from "@/components/layout/nav";
import { useMe } from "@/hooks/use-auth";
import { useBranding } from "@/hooks/use-settings";
import { canRead } from "@/lib/permissions";
import type { MeUser } from "@/types/auth";

function visibleChildren(item: NavItem, user: MeUser | undefined) {
  if (!item.children) return [];
  return item.children.filter((c) => !c.area || canRead(user, c.area));
}

function isItemVisible(item: NavItem, user: MeUser | undefined) {
  if (item.children && item.children.length > 0) {
    const hasAreaChildren = item.children.some((c) => c.area);
    if (hasAreaChildren) return visibleChildren(item, user).length > 0;
  }
  if (!item.area) return true;
  return canRead(user, item.area);
}

export function AppSidebar({
  open,
  collapsed = false,
  onClose,
}: {
  open: boolean;
  collapsed?: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { data: user } = useMe();
  const branding = useBranding().data?.data;
  const logoUrl = branding?.logo_url ?? null;
  const appName = branding?.app_name || "MCS";
  const appSubtitle = branding?.app_subtitle || "Maintenance Control System";

  const items = useMemo(
    () => NAV_ITEMS.filter((i) => isItemVisible(i, user)),
    [user],
  );

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={onClose}
        />
      ) : null}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-dvh w-64 flex-col bg-[#0a0f1c] text-slate-300 transition-transform lg:sticky lg:top-0 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
          collapsed && "lg:hidden",
        )}
      >
        {/* Brand */}
        <div className="flex items-start justify-between gap-2 px-5 pb-4 pt-5">
          <Link href="/dashboard" className="flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={appName}
                className="h-10 w-10 shrink-0 rounded-xl bg-white object-contain p-1 ring-1 ring-white/10"
              />
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-900 text-white ring-1 ring-white/10">
                <Wrench className="h-5 w-5" />
              </span>
            )}
            <span className="leading-tight">
              <span className="block text-base font-bold text-white">{appName}</span>
              <span className="block text-[11px] text-slate-400">{appSubtitle}</span>
            </span>
          </Link>
          <button
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 lg:hidden"
            onClick={onClose}
            aria-label="Tutup menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mx-5 border-t border-white/10" />

        {/* Section label */}
        <p className="px-5 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Menu Utama
        </p>

        <nav className="no-scrollbar flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {items.map((item) => (
            <SidebarLink
              key={item.href}
              item={item}
              pathname={pathname}
              childItems={visibleChildren(item, user)}
              onNavigate={onClose}
            />
          ))}
        </nav>
      </aside>
    </>
  );
}

function SidebarLink({
  item,
  pathname,
  childItems,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  childItems: NavChild[];
  onNavigate: () => void;
}) {
  const active = item.match
    ? pathname.startsWith(item.match)
    : pathname === item.href;
  const [expanded, setExpanded] = useState(active);
  const Icon = item.icon;
  const hasChildren = childItems.length > 0;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center rounded-lg text-sm font-medium text-white transition",
          active ? "bg-blue-600 shadow-sm" : "hover:bg-white/5",
        )}
      >
        <Link
          href={item.href}
          onClick={onNavigate}
          className="flex flex-1 items-center gap-3 px-3 py-2.5"
        >
          <Icon
            className={cn(
              "h-[18px] w-[18px] shrink-0",
              active ? "text-white" : "text-slate-300 group-hover:text-white",
            )}
          />
          <span className="text-white">{item.label}</span>
        </Link>
        {hasChildren ? (
          <button
            onClick={() => setExpanded((v) => !v)}
            className={cn(
              "px-2.5 py-2.5",
              active ? "text-white/80" : "text-slate-500 hover:text-slate-300",
            )}
            aria-label={expanded ? "Tutup submenu" : "Buka submenu"}
          >
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")}
            />
          </button>
        ) : (
          <span className="px-2.5" />
        )}
      </div>

      {hasChildren && expanded ? (
        <div className="ml-[26px] mt-1 space-y-0.5 border-l border-white/10 pl-3">
          {childItems.map((child) => {
            const ChildIcon = child.icon;
            const childActive =
              pathname === child.href ||
              pathname + (typeof window !== "undefined" ? window.location.search : "") ===
                child.href;
            return (
              <Link
                key={child.href}
                href={child.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] text-white transition",
                  childActive ? "font-medium" : "hover:bg-white/5",
                )}
              >
                <ChildIcon className="h-3.5 w-3.5 shrink-0 text-white" />
                <span className="text-white">{child.label}</span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
