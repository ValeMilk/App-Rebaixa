"use client";

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
    <section className="bg-white rounded-2xl border border-slate-100 p-5 min-w-0">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">{titulo}</h2>
          {subtitulo && <p className="text-xs text-slate-400 mt-0.5">{subtitulo}</p>}
        </div>
        {controle}
      </div>

      {itens.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">{vazio || "Nada por aqui."}</p>
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
                  className={`w-full flex items-center gap-3 rounded-xl px-3 py-2 border text-left transition ${
                    ativa
                      ? "border-brand bg-brand/5 ring-1 ring-brand"
                      : "border-slate-100 hover:bg-slate-50 active:bg-slate-100"
                  }`}
                >
                  <span
                    className={`shrink-0 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                      ativa ? "bg-brand text-white" : "bg-brand/10 text-brand"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800 truncate">{renderLabel(it)}</div>
                    {sub && <div className="text-xs text-slate-400 truncate">{sub}</div>}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-black tabular-nums text-slate-900 whitespace-nowrap">{renderValor(it)}</div>
                    {valorSub && <div className="text-[10px] text-slate-400 whitespace-nowrap">{valorSub}</div>}
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
