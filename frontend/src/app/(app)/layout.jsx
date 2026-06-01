"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { IcoStore, IcoClipboard, IcoGrid, IcoSync, IcoUser, IcoUsers, IcoLogout, IcoTag, IcoCalendar } from "@/components/Icons";

const NAV_SIDEBAR = [
  { href: "/dashboard", label: "Dashboard", Icon: IcoGrid, roles: ["supervisor", "diretoria", "admin"] },
  { href: "/dashboard/supervisor", label: "Métricas Redes", Icon: IcoGrid, roles: ["supervisor", "diretoria", "admin"] },
  { href: "/estoque", label: "Lojas", Icon: IcoStore, roles: ["vendedor", "supervisor", "diretoria", "admin"] },
  { href: "/solicitacoes", label: "Solicitações", Icon: IcoClipboard, roles: ["vendedor", "supervisor", "diretoria", "admin"] },
  { href: "/encartes", label: "Encartes", Icon: IcoTag, roles: ["supervisor", "diretoria", "admin"] },
  { href: "/encartes/calendario", label: "Calendário Geral", Icon: IcoCalendar, roles: ["supervisor", "diretoria", "admin"] },
  { href: "/admin/usuarios", label: "Usuários", Icon: IcoUsers, roles: ["admin"] },
  { href: "/admin/responsabilidades", label: "Resp. Rede", Icon: IcoUsers, roles: ["admin"] },
  { href: "/admin/sync", label: "Sincronização", Icon: IcoSync, roles: ["admin", "diretoria"] },
];

const NAV_BOTTOM = [
  { href: "/estoque", label: "Lojas", Icon: IcoStore, roles: ["vendedor", "supervisor", "diretoria", "admin"] },
  { href: "/solicitacoes", label: "Pedidos", Icon: IcoClipboard, roles: ["vendedor", "supervisor", "diretoria", "admin"] },
  { href: "/encartes", label: "Encartes", Icon: IcoTag, roles: ["supervisor", "diretoria", "admin"] },
  { href: "/encartes/calendario", label: "Cal. Geral", Icon: IcoCalendar, roles: ["supervisor", "diretoria", "admin"] },
  { href: "/dashboard", label: "Gráficos", Icon: IcoGrid, roles: ["supervisor", "diretoria", "admin"] },
  { href: "/dashboard/supervisor", label: "Métricas", Icon: IcoGrid, roles: ["supervisor", "diretoria", "admin"] },
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

  const effectiveRoles = [user.role, ...(user.roles || [])];
  const navLinks = NAV_SIDEBAR.filter((n) => n.roles.some((r) => effectiveRoles.includes(r)));
  const bottomLinks = NAV_BOTTOM.filter((n) => n.roles.some((r) => effectiveRoles.includes(r)));
  const initials = (user.nome || "?").split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 w-screen max-w-full overflow-x-clip">
      {/* Navbar horizontal no topo */}
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-[1920px] mx-auto px-4 lg:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-brand to-brand-600 flex items-center justify-center font-black text-white shadow-md">
                VM
              </div>
              <div className="hidden sm:block">
                <div className="text-lg font-bold text-slate-900 leading-tight">Rebaixa</div>
                <div className="text-xs text-slate-500">Valemilk</div>
              </div>
            </div>

            {/* Nav links — desktop */}
            <nav className="hidden lg:flex items-center gap-1 flex-1 max-w-4xl mx-8">
              {navLinks.map(({ href, label, Icon }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                      active
                        ? "bg-brand text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* User menu — desktop */}
            <div className="hidden lg:flex items-center gap-3">
              <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-brand to-brand-600 flex items-center justify-center text-xs font-bold text-white">
                  {initials}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate max-w-[120px]">{user.nome}</div>
                  <div className="text-xs text-slate-500 capitalize">{user.role}</div>
                </div>
              </div>
              <button
                onClick={logout}
                className="h-10 px-4 flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
              >
                <IcoLogout className="w-4 h-4" />
                <span className="hidden xl:inline">Sair</span>
              </button>
            </div>

            {/* Mobile user badge + logout */}
            <div className="lg:hidden flex items-center gap-2">
              <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-slate-50">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-brand to-brand-600 flex items-center justify-center text-xs font-bold text-white">
                  {initials}
                </div>
                <div className="text-xs font-medium text-slate-700 capitalize">{user.role}</div>
              </div>
              <button
                onClick={logout}
                aria-label="Sair"
                className="h-10 w-10 rounded-lg bg-slate-100 hover:bg-slate-200 active:scale-95 transition flex items-center justify-center"
              >
                <IcoLogout className="w-5 h-5 text-slate-600" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Conteúdo principal */}
      <main className="flex-1 overflow-y-auto pb-20 lg:pb-6">
        <div className="max-w-[1920px] mx-auto px-4 py-4 lg:px-6 lg:py-6">{children}</div>
      </main>

      {/* Bottom nav — apenas mobile */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 z-50 safe-area-pb shadow-[0_-4px_20px_-8px_rgba(0,0,0,0.08)]">
        <div className="flex items-stretch px-1 pt-1.5">
          {bottomLinks.map(({ href, label, Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className="flex-1 flex flex-col items-center justify-center py-1.5 active:scale-95 transition-transform"
              >
                <span
                  className={`flex items-center justify-center w-12 h-7 rounded-full transition-colors ${
                    active ? "bg-brand/10 text-brand" : "text-slate-400"
                  }`}
                >
                  <Icon className="w-[22px] h-[22px]" />
                </span>
                <span className={`text-[10px] mt-0.5 font-medium ${active ? "text-brand" : "text-slate-500"}`}>
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

