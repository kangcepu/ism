"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "./sidebar";
import { Navbar } from "./navbar";
export function AppShell({ children }: { children: React.ReactNode }) { const { user, loading } = useAuth(); const router = useRouter(); const path = usePathname(); const [open, setOpen] = useState(false); const [collapsed, setCollapsed] = useState(false); useEffect(() => { if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(path)}`); }, [loading, user, router, path]); if (loading || !user) return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Memuat aplikasi…</div>; return <div className="flex min-h-screen"><Sidebar open={open} collapsed={collapsed} close={() => setOpen(false)}/><div className="min-w-0 flex-1"><Navbar collapsed={collapsed} toggle={() => setCollapsed(!collapsed)} mobile={() => setOpen(true)}/><main className="p-4 sm:p-6">{children}</main></div></div>; }
