"use client";

import Link from "next/link";
import clsx from "clsx";
import { GRUPOS } from "@/lib/nav";
import { IcoLogout } from "@/components/Icons";

function iniciais(nome) {
  return (nome || "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

/**
 * Sidebar de navegacao. `variant="desktop"`: fixa, colapsavel para icones.
 * `variant="sheet"`: a mesma sidebar dentro do painel off-canvas do celular.
 */
export default function Sidebar({ user, itens, ativo, collapsed = false, variant = "desktop", onNavigate, onLogout, className }) {
  const compacta = variant === "desktop" && collapsed;
  const inicio = itens[0]?.href || "/";

  return (
    <aside
      className={clsx(
        "flex flex-col bg-white",
        variant === "desktop" && "sticky top-0 h-screen shrink-0 border-r border-neutral-200 transition-[width] duration-200",
        variant === "desktop" && (compacta ? "w-16" : "w-64"),
        variant === "sheet" && "h-full w-full",
        className
      )}
      aria-label="Navegação principal"
    >
      {/* Cabecalho: logo -> primeira rota que a pessoa pode abrir */}
      <Link
        href={inicio}
        onClick={onNavigate}
        className={clsx("flex h-16 shrink-0 items-center border-b border-neutral-200", compacta ? "justify-center px-2" : "gap-3 px-4")}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-white" aria-hidden>
          IV
        </span>
        {!compacta && (
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-base font-semibold text-neutral-900">InfoVale</span>
            <span className="block truncate text-xs text-neutral-500">Valemilk</span>
          </span>
        )}
      </Link>

      {/* Grupos de itens */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {GRUPOS.map((g) => {
          const doGrupo = itens.filter((n) => n.group === g.id);
          if (!doGrupo.length) return null;
          return (
            <div key={g.id} className="mb-4">
              {!compacta && (
                <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{g.label}</div>
              )}
              <ul className="space-y-0.5">
                {doGrupo.map(({ href, label, Icon }) => {
                  const active = ativo === href;
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        onClick={onNavigate}
                        title={compacta ? label : undefined}
                        aria-current={active ? "page" : undefined}
                        className={clsx(
                          "flex h-10 items-center rounded-lg text-sm font-medium transition",
                          compacta ? "justify-center px-0" : "gap-3 px-3",
                          active ? "bg-secondary text-white" : "text-neutral-700 hover:bg-secondary/10 hover:text-primary"
                        )}
                      >
                        <Icon className="h-5 w-5 shrink-0" aria-hidden />
                        {!compacta && <span className="truncate">{label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Rodape: quem esta logado + sair */}
      <div className={clsx("shrink-0 border-t border-neutral-200 p-2", compacta ? "flex flex-col items-center gap-1" : "flex items-center gap-2")}>
        <span
          title={compacta ? user.nome : undefined}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white"
        >
          {iniciais(user.nome)}
        </span>
        {!compacta && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-neutral-900">{user.nome}</div>
            <div className="truncate text-xs capitalize text-neutral-500">{user.role}</div>
          </div>
        )}
        <button
          type="button"
          onClick={onLogout}
          aria-label="Sair"
          title="Sair"
          className={clsx("btn-ghost shrink-0", compacta ? "h-9 w-9 px-0" : "h-9 w-9 px-0")}
        >
          <IcoLogout className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </aside>
  );
}
