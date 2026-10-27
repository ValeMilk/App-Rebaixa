"use client";

import Link from "next/link";
import clsx from "clsx";
import { IcoMenu } from "@/components/Icons";

// Barra inferior do celular: ate 3 destinos + "Menu" (abre a sidebar como painel lateral).
// `badges`: { [href]: numero } mostra um contador no icone; `badgeMenu` no botao Menu (itens fora da barra).
export default function BottomBar({ itens, ativo, badges = {}, badgeMenu = 0, onMenu }) {
  const bolinha = (n) => (n > 0 ? (
    <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-white" aria-label={`${n} novas`}>{n > 99 ? "99+" : n}</span>
  ) : null);
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_8px_rgba(16,24,40,.06)] lg:hidden"
    >
      {itens.map(({ href, short, label, Icon }) => {
        const active = ativo === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className="relative flex min-h-14 flex-1 flex-col items-center justify-center px-1"
          >
            <span
              className={clsx(
                "flex flex-col items-center gap-1 rounded-2xl px-2 py-1 text-[11px] font-medium",
                active ? "bg-secondary/10 text-secondary" : "text-neutral-500"
              )}
            >
              <span className="relative"><Icon className="h-6 w-6" aria-hidden />{bolinha(badges[href])}</span>
              {short || label}
            </span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onMenu}
        className="relative flex min-h-14 flex-1 flex-col items-center justify-center px-1"
        aria-label="Abrir menu completo"
      >
        <span className="flex flex-col items-center gap-1 rounded-2xl px-2 py-1 text-[11px] font-medium text-neutral-500">
          <span className="relative"><IcoMenu className="h-6 w-6" aria-hidden />{bolinha(badgeMenu)}</span>
          Menu
        </span>
      </button>
    </nav>
  );
}
