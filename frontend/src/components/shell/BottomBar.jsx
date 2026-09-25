"use client";

import Link from "next/link";
import clsx from "clsx";
import { IcoMenu } from "@/components/Icons";

// Barra inferior do celular: ate 3 destinos + "Menu" (abre a sidebar como painel lateral).
export default function BottomBar({ itens, ativo, onMenu }) {
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
              <Icon className="h-6 w-6" aria-hidden />
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
          <IcoMenu className="h-6 w-6" aria-hidden />
          Menu
        </span>
      </button>
    </nav>
  );
}
