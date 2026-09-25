"use client";

import clsx from "clsx";
import Surface from "@/components/ui/Surface";

export default function Ranking({
  titulo,
  subtitulo,
  itens,
  chave,
  selecionada,
  onSelect,
  renderLabel,
  renderSub,
  renderValor,
  renderValorSub,
  controle,
  vazio,
}) {
  return (
    <Surface as="section" className="min-w-0 p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-neutral-800">{titulo}</h2>
          {subtitulo && <p className="mt-0.5 text-xs text-neutral-500">{subtitulo}</p>}
        </div>
        {controle}
      </div>

      {itens.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-500">{vazio || "Nada por aqui."}</p>
      ) : (
        <ol className="space-y-1.5">
          {itens.map((it, i) => {
            const id = it[chave];
            const ativa = selecionada === id;
            const sub = renderSub ? renderSub(it) : null;
            const valorSub = renderValorSub ? renderValorSub(it) : null;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onSelect(it)}
                  aria-pressed={ativa}
                  className={clsx(
                    "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition",
                    ativa
                      ? "border-secondary bg-secondary/5 ring-1 ring-secondary/30"
                      : "border-neutral-200 hover:bg-neutral-50 active:bg-neutral-100"
                  )}
                >
                  <span
                    className={clsx(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      ativa ? "bg-secondary text-white" : "bg-secondary/10 text-secondary"
                    )}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-neutral-800">{renderLabel(it)}</div>
                    {sub && <div className="truncate text-xs text-neutral-500">{sub}</div>}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="whitespace-nowrap text-sm font-semibold tabular-nums text-neutral-900">{renderValor(it)}</div>
                    {valorSub && <div className="whitespace-nowrap text-[11px] text-neutral-500">{valorSub}</div>}
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </Surface>
  );
}
