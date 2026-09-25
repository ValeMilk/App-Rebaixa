"use client";

import clsx from "clsx";
import { usePaginaTitulo } from "@/components/PageTitleContext";
import { IcoPanelLeft } from "@/components/Icons";

export default function TopBar({ collapsed, onToggle, className }) {
  const pagina = usePaginaTitulo();
  return (
    <header
      className={clsx(
        "sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-neutral-400/30 bg-accent/80 px-4 backdrop-blur-sm md:px-6 lg:px-8",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          className="btn-ghost -ml-1 h-9 w-9 shrink-0 px-0"
        >
          <IcoPanelLeft className="h-5 w-5" aria-hidden />
        </button>
        {pagina?.titulo && (
          <div className="flex min-w-0 items-baseline gap-2">
            <h1 className="min-w-0 truncate text-base font-medium text-neutral-900">{pagina.titulo}</h1>
            {pagina.subtitulo && (
              <span className="hidden truncate text-sm text-neutral-500 md:inline">{pagina.subtitulo}</span>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
