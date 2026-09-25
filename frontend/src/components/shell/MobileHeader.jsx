"use client";

import { usePaginaTitulo } from "@/components/PageTitleContext";

function iniciais(nome) {
  return (nome || "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default function MobileHeader({ user, onMenu }) {
  const pagina = usePaginaTitulo();
  return (
    <header className="sticky top-0 z-30 flex min-h-12 items-center justify-between gap-2 border-b border-neutral-200 bg-white/95 px-4 py-2 backdrop-blur-sm safe-area-pt lg:hidden">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onMenu}
          aria-label="Abrir menu"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-white"
        >
          IV
        </button>
        <h1 className="min-w-0 truncate text-base font-medium text-neutral-900">{pagina?.titulo ?? "InfoVale"}</h1>
      </div>
      <span
        aria-label={user.nome}
        title={user.nome}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-xs font-semibold text-secondary"
      >
        {iniciais(user.nome)}
      </span>
    </header>
  );
}
