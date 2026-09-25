"use client";

import { useEffect } from "react";
import clsx from "clsx";

const TAMANHOS = { sm: "sm:max-w-sm", md: "sm:max-w-md", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" };

/**
 * Casca unica de dialogo: backdrop + painel.
 * - padrao: centralizado no desktop, folha inferior no celular (rounded-t-2xl)
 * - sheet: ocupa a altura toda no celular (formularios longos), centralizado no desktop
 * - side="left": painel lateral off-canvas (menu mobile)
 */
export default function Dialog({ open, onClose, children, sheet = false, side = "center", size = "md", className, ariaLabel }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  if (side === "left") {
    return (
      <div className="fixed inset-0 z-50 flex animate-fade-in" role="dialog" aria-modal="true" aria-label={ariaLabel}>
        <div className="absolute inset-0 bg-neutral-900/50 backdrop-blur-sm" onClick={onClose} />
        <div className={clsx("relative h-full w-[280px] max-w-[85vw] overflow-y-auto bg-white shadow-float animate-slide-in-left", className)}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:p-6 animate-fade-in" role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <div className="absolute inset-0 bg-neutral-900/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className={clsx(
          "relative flex w-full flex-col bg-white shadow-float animate-slide-up",
          sheet
            ? "h-dvh sm:h-auto sm:max-h-[90dvh] sm:rounded-2xl safe-area-pb"
            : "mt-auto max-h-[90dvh] rounded-t-2xl sm:mt-0 sm:rounded-2xl",
          TAMANHOS[size] || TAMANHOS.md,
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
