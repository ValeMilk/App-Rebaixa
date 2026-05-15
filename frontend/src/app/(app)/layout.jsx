"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { IcoStore, IcoClipboard, IcoGrid, IcoSync, IcoUser, IcoUsers, IcoLogout } from "@/components/Icons";

const NAV_SIDEBAR = [
  { href: "/dashboard", label: "Dashboard", Icon: IcoGrid, roles: ["supervisor", "diretoria", "admin"] },
  { href: "/estoque", label: "Lojas", Icon: IcoStore, roles: ["vendedor", "supervisor", "diretoria", "admin"] },
  { href: "/solicitacoes", label: "Solicitações", Icon: IcoClipboard, roles: ["vendedor", "supervisor", "diretoria", "admin"] },
  { href: "/admin/usuarios", label: "Usuários", Icon: IcoUsers, roles: ["admin"] },
  { href: "/admin/sync", label: "Sincronização", Icon: IcoSync, roles: ["admin", "diretoria"] },
];

const NAV_BOTTOM = [
  { href: "/estoque", label: "Lojas", Icon: IcoStore, roles: ["vendedor", "supervisor", "diretoria", "admin"] },
  { href: "/solicitacoes", label: "Pedidos", Icon: IcoClipboard, roles: ["vendedor", "supervisor", "diretoria", "admin"] },
  { href: "/dashboard", label: "Gráficos", Icon: IcoGrid, roles: ["supervisor", "diretoria", "admin"] },
  { href: "/admin/sync", label: "Sync", Icon: IcoSync, roles: ["admin", "diretoria"] },
  { href: "/admin/usuarios", label: "Usuários", Icon: IcoUsers, roles: ["admin"] },
];

export default function AppLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, token, init, loading, logout } = useAuth();
  const syncedRef = useRef(false);

  useEffect(() => { init(); }, [init]);
  useEffect(() => { if (!loading && !token) router.replace("/login"); }, [loading, token, router]);

  useEffect(() => {
    if (user && token && !syncedRef.current) {
      syncedRef.current = true;
      api.post("/sync/trigger").catch(() => {});
    }
  }, [user, token]);

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-slate-200 border-t-brand animate-spin" />
          <p className="text-slate-500 text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  const sideLinks = NAV_SIDEBAR.filter((n) => n.roles.includes(user.role));
  const bottomLinks = NAV_BOTTOM.filter((n) => n.roles.includes(user.role));
  const initials = (user.nome || "?").split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar — apenas desktop */}
      <aside className="hidden lg:flex w-64 bg-gradient-to-b from-brand to-brand-700 text-white flex-col shrink-0">
        <div className="px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/15 flex items-center justify-center font-black">VM</div>
            <div>
              <div className="text-lg font-bold leading-tight">Rebaixa</div>
              <div className="text-xs text-white/70">Valemilk</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {sideLinks.map(({ href, label, Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? "bg-white/15 font-semibold shadow-sm" : "hover:bg-white/10 text-white/85"}`}>
                <Icon className="w-5 h-5" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-full bg-white/15 flex items-center justify-center text-xs font-bold">{initials}</div>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{user.nome}</div>
              <div className="text-xs text-white/70 capitalize">{user.role}</div>
            </div>
          </div>
          <button onClick={logout} className="w-full flex items-center justify-center gap-2 text-xs bg-white/10 hover:bg-white/20 rounded-lg py-2 transition">
            <IcoLogout className="w-4 h-4" /> Sair
          </button>
        </div>
      </aside>

      {/* Conteúdo principal */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top bar — apenas mobile */}
        <header className="lg:hidden sticky top-0 z-40 bg-gradient-to-r from-brand to-brand-600 text-white px-4 pt-3 pb-3 shadow-sm safe-area-pt">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-9 w-9 shrink-0 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-xs font-black ring-1 ring-white/20">VM</div>
              <div className="min-w-0">
                <div className="font-bold text-sm leading-tight truncate">Rebaixa Valemilk</div>
                <div className="text-[11px] text-white/75 capitalize truncate">{user.nome} · {user.role}</div>
              </div>
            </div>
            <button onClick={logout} aria-label="Sair" className="shrink-0 h-9 w-9 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 transition flex items-center justify-center">
              <IcoLogout className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Conteúdo */}
        <main className="flex-1 overflow-auto pb-24 lg:pb-0">
          <div className="max-w-7xl mx-auto p-4 lg:p-6">{children}</div>
        </main>

        {/* Bottom nav — apenas mobile */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 z-50 safe-area-pb shadow-[0_-4px_20px_-8px_rgba(0,0,0,0.08)]">
          <div className="flex items-stretch px-1 pt-1.5">
            {bottomLinks.map(({ href, label, Icon }) => {
              const active = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link key={href} href={href} className="flex-1 flex flex-col items-center justify-center py-1.5 active:scale-95 transition-transform">
                  <span className={`flex items-center justify-center w-12 h-7 rounded-full transition-colors ${active ? "bg-brand/10 text-brand" : "text-slate-400"}`}>
                    <Icon className="w-[22px] h-[22px]" />
                  </span>
                  <span className={`text-[10px] mt-0.5 font-medium ${active ? "text-brand" : "text-slate-500"}`}>{label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

