"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";

// Ícones SVG inline para bottom nav
function IcoLojas() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 21V12h6v9" />
    </svg>
  );
}
function IcoPedidos() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M9 16h4" />
    </svg>
  );
}
function IcoDash() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
function IcoSync() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 9A8 8 0 006.93 5.07M4 15a8 8 0 0013.07 3.93" />
    </svg>
  );
}
function IcoUser() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <circle cx="12" cy="7" r="4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 21c0-4 3.58-7 8-7s8 3 8 7" />
    </svg>
  );
}

const NAV_SIDEBAR = [
  { href: "/dashboard", label: "Dashboard", roles: ["supervisor", "diretoria", "admin"] },
  { href: "/estoque", label: "Lojas", roles: ["vendedor", "supervisor", "diretoria", "admin"] },
  { href: "/solicitacoes", label: "Solicitacoes", roles: ["vendedor", "supervisor", "diretoria", "admin"] },
  { href: "/admin/usuarios", label: "Usuarios", roles: ["admin"] },
  { href: "/admin/sync", label: "Sincronizacao", roles: ["admin", "diretoria"] },
];

const NAV_BOTTOM = [
  { href: "/estoque", label: "Lojas", Icon: IcoLojas, roles: ["vendedor", "supervisor", "diretoria", "admin"] },
  { href: "/solicitacoes", label: "Pedidos", Icon: IcoPedidos, roles: ["vendedor", "supervisor", "diretoria", "admin"] },
  { href: "/dashboard", label: "Graficos", Icon: IcoDash, roles: ["supervisor", "diretoria", "admin"] },
  { href: "/admin/sync", label: "Sync", Icon: IcoSync, roles: ["admin", "diretoria"] },
  { href: "/admin/usuarios", label: "Usuarios", Icon: IcoUser, roles: ["admin"] },
];

export default function AppLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, token, init, loading, logout } = useAuth();
  const syncedRef = useRef(false);

  useEffect(() => { init(); }, [init]);
  useEffect(() => { if (!loading && !token) router.replace("/login"); }, [loading, token, router]);

  // Dispara sync silencioso uma vez por sessão assim que o usuário estiver autenticado
  useEffect(() => {
    if (user && token && !syncedRef.current) {
      syncedRef.current = true;
      api.post("/sync/trigger").catch(() => {});
    }
  }, [user, token]);

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-slate-500">Carregando...</p>
      </div>
    );
  }

  const sideLinks = NAV_SIDEBAR.filter((n) => n.roles.includes(user.role));
  const bottomLinks = NAV_BOTTOM.filter((n) => n.roles.includes(user.role));

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar — apenas desktop */}
      <aside className="hidden lg:flex w-64 bg-brand text-white flex-col shrink-0">
        <div className="px-6 py-5 border-b border-white/10">
          <div className="text-lg font-bold">Rebaixa</div>
          <div className="text-xs text-white/70">Valemilk</div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {sideLinks.map((n) => {
            const active = pathname === n.href || pathname.startsWith(n.href + "/");
            return (
              <Link key={n.href} href={n.href}
                className={`block rounded-lg px-3 py-2 text-sm transition ${active ? "bg-white/15 font-semibold" : "hover:bg-white/10"}`}>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-white/10">
          <div className="text-sm font-medium">{user.nome}</div>
          <div className="text-xs text-white/70 capitalize">{user.role}</div>
          <button onClick={logout} className="mt-3 text-xs underline opacity-80 hover:opacity-100">Sair</button>
        </div>
      </aside>

      {/* Conteúdo principal */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top bar — apenas mobile */}
        <header className="lg:hidden flex items-center justify-between bg-brand text-white px-4 py-3 shrink-0">
          <div>
            <div className="font-bold text-base leading-tight">Rebaixa Valemilk</div>
            <div className="text-xs text-white/70 capitalize">{user.nome} · {user.role}</div>
          </div>
          <button onClick={logout} className="text-xs text-white/80 underline">Sair</button>
        </header>

        {/* Conteúdo */}
        <main className="flex-1 overflow-auto pb-20 lg:pb-0">
          <div className="max-w-7xl mx-auto p-4 lg:p-6">{children}</div>
        </main>

        {/* Bottom nav — apenas mobile */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex z-50 safe-area-pb">
          {bottomLinks.map(({ href, label, Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link key={href} href={href}
                className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors ${active ? "text-brand" : "text-slate-400"}`}>
                <Icon />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

