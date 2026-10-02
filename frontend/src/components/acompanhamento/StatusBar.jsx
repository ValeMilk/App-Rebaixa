"use client";

import clsx from "clsx";
import Surface from "@/components/ui/Surface";
import { TONE } from "@/lib/tones";

/**
 * Distribuicao das linhas (loja x produto) por status de cobertura. Cada item da legenda e um
 * botao: filtra a tabela de detalhe por aquele status.
 */
export default function StatusBar({ status, selecionado, onSelect }) {
  const total = status.reduce((s, x) => s + x.itens, 0);
  if (!total) return null;
  const visiveis = status.filter((s) => s.itens > 0);
  const pct = (s) => (s.itens / total) * 100;

  return (
    <Surface className="px-5 py-4">
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Distribuição das linhas por status de cobertura">
        {visiveis.map((s) => (pct(s) < 0.5 ? null : (
          <div key={s.key} title={`${s.label}: ${s.itens} (${pct(s).toFixed(1)}%)`} className="h-full transition-all duration-500" style={{ width: `${pct(s)}%`, backgroundColor: TONE[s.tone].hex }} />
        )))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-2 gap-y-1">
        {visiveis.map((s) => {
          const ativo = selecionado === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onSelect(ativo ? "" : s.key)}
              aria-pressed={ativo}
              title={`${s.descricao}. Clique para filtrar a tabela.`}
              className={clsx(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition",
                ativo ? "border-secondary bg-secondary/5 text-neutral-800 ring-1 ring-secondary/30" : "border-transparent text-neutral-600 hover:bg-neutral-50"
              )}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TONE[s.tone].hex }} />
              {s.label}
              <span className="font-semibold tabular-nums text-neutral-800">{s.itens}</span>
              <span className="tabular-nums text-neutral-400">{pct(s).toFixed(0)}%</span>
            </button>
          );
        })}
      </div>
    </Surface>
  );
}
