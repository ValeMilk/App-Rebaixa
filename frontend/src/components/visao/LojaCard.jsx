"use client";

import clsx from "clsx";
import { IcoStore, IcoUsers, IcoChevronDown } from "@/components/Icons";
import { fmtDataHoraCurta, formatarRede } from "@/lib/utils";

/**
 * Acordeao de uma loja: nome, rede, ultima visita do promotor e contadores; o conteudo (itens)
 * vem por children quando expandido. Usado nas telas Estoque e vencimento e Ruptura.
 */
export default function LojaCard({ loja, resumo, totalLabel, tone = "neutral", expanded, onToggle, children }) {
  const nome = loja.cliente || loja.clienteCodigo;
  const nomeRede = formatarRede({ redeSubrede: loja.redeSubrede, subrede: loja.subrede });
  const mostrarRede = nomeRede && !String(nome).toUpperCase().startsWith(nomeRede.toUpperCase());
  const borda = tone === "danger" ? "border-danger/30" : tone === "warning" ? "border-warning/30" : "border-neutral-200";
  const iconBg = tone === "danger" ? "bg-danger/10 text-danger" : tone === "warning" ? "bg-warning/10 text-warning" : "bg-secondary/10 text-secondary";

  return (
    <div className={clsx("surface overflow-hidden", borda)}>
      <button type="button" className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors active:bg-neutral-50" onClick={onToggle} aria-expanded={expanded}>
        <div className={clsx("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", iconBg)}>
          <IcoStore className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-neutral-900">{nome}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500">
            {totalLabel && <span className="whitespace-nowrap">{totalLabel}</span>}
            {loja.ultimaVisitaEm && (
              <span className="whitespace-nowrap" title={loja.ultimaVisitaPor ? `Última visita do promotor: ${loja.ultimaVisitaPor}` : "Última visita do promotor"}>
                · visita {fmtDataHoraCurta(loja.ultimaVisitaEm)}{loja.ultimaVisitaPor && <span className="capitalize"> ({String(loja.ultimaVisitaPor).toLowerCase()})</span>}
              </span>
            )}
            {resumo}
            {mostrarRede && (
              <span className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-info">
                <IcoUsers className="h-3 w-3" aria-hidden />{nomeRede}
              </span>
            )}
          </div>
        </div>
        <IcoChevronDown className={clsx("h-5 w-5 shrink-0 text-neutral-400 transition-transform duration-200", expanded && "rotate-180")} aria-hidden />
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-neutral-100 px-3 pb-3 pt-2 animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
}
