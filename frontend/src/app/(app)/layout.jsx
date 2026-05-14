"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

const NAV = [
  { href: "/dashboard", label: "Dashboard", roles: ["supervisor", "diretoria", "admin"] },
  { href: "/estoque", label: "Estoque", roles: ["supervisor", "diretoria", "admin"] },
  { href: "/solicitacoes", label: "Solicitacoes", roles: ["supervisor", "diretoria", "admin"] },
  { href: "/admin/usuarios", label: "Usuarios", roles: ["admin"] },
  { href: "/admin/sync", label: "Sincronizacao", roles: ["admin", "diretoria"] },
];

export default function AppLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, token, init, loading, logout } = useAuth();

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (!loading && !token) router.replace("/login");
  }, [loading, token, router]);

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-slate-500">Carregando...</p>
      </div>
    );
  }

  const links = NAV.filter((n) => n.roles.includes(user.role));

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 bg-brand text-white flex flex-col">
        <div className="px-6 py-5 border-b border-white/10">
          <div className="text-lg font-bold">Rebaixa</div>
          <div className="text-xs text-white/70">Valemilk</div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {links.map((n) => {
            const active = pathname === n.href || pathname.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`block rounded-lg px-3 py-2 text-sm transition ${
                  active ? "bg-white/15 font-semibold" : "hover:bg-white/10"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-white/10">
          <div className="text-sm font-medium">{user.nome}</div>
          <div className="text-xs text-white/70 capitalize">{user.role}</div>
          <button onClick={logout} className="mt-3 text-xs underline opacity-80 hover:opacity-100">
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-6">{children}</div>
      </main>
    </div>
  );
}
