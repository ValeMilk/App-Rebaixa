"use client";

import { fmtData, formatarRede } from "@/lib/utils";
import { STATUS_SHELF_MAP } from "@/lib/estoque";
import AcaoAtivaBadge from "@/components/AcaoAtivaBadge";
import { IcoSearch, IcoX, IcoPackage } from "@/components/Icons";

const fmtNum = (n) => Number(n || 0).toLocaleString("pt-BR");

const SELECT_CLS =
  "w-full sm:w-auto px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-700 focus:outline-none focus:ring-4 focus:ring-brand/10 focus:border-brand transition";

const COLUNAS = [
  { campo: "cliente",    label: "Loja",     align: "left" },
  { campo: "produto",    label: "Produto",  align: "left" },
  { campo: "quantidade", label: "Qtd",      align: "right" },
  { campo: "validade",   label: "Validade", align: "right" },
  { campo: "dias",       label: "Dias",     align: "right" },
  { campo: "status",     label: "Status",   align: "left" },
];

function BadgeStatus({ cls }) {
  const c = STATUS_SHELF_MAP[cls] || STATUS_SHELF_MAP.sem_shelf;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap ${c.bg} ${c.text} ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

function Th({ col, ordem, onOrdenar }) {
  const ativa = ordem.campo === col.campo;
  return (
    <th
      onClick={() => onOrdenar(col.campo)}
      className={`py-2.5 px-3 font-medium cursor-pointer select-none whitespace-nowrap hover:text-slate-700 ${
        col.align === "right" ? "text-right" : "text-left"
      } ${ativa ? "text-slate-800" : ""}`}
    >
      {col.label}{" "}
      <span className={ativa ? "" : "opacity-30"}>{ativa ? (ordem.dir === 1 ? "↑" : "↓") : "↕"}</span>
    </th>
  );
}

export default function TabelaVencimentos({
  linhas,
  totalLinhas,
  filtros,
  setFiltros,
  opcoesRede,
  opcoesLoja,
  produtoFiltradoNome,
  ordem,
  onOrdenar,
  onMais,
  onLimpar,
  getAcaoAtiva,
  onSolicitar,
  selecionados,
  onToggleItem,
  onToggleVisiveis,
}) {
  const temFiltro = !!(filtros.busca || filtros.rede || filtros.loja || filtros.produtoCodigo || filtros.venceAte);
  const lojaForaDasOpcoes = filtros.loja && !opcoesLoja.some((o) => o.value === filtros.loja);
  const visiveisMarcados = linhas.filter((l) => selecionados.has(l._id)).length;
  const todosVisiveis = linhas.length > 0 && visiveisMarcados === linhas.length;

  return (
    <section className="bg-white rounded-2xl border border-slate-100 p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Detalhe por loja</h2>
        <span className="text-xs text-slate-400 whitespace-nowrap">
          {fmtNum(totalLinhas)} {totalLinhas === 1 ? "item" : "itens"}
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-0">
          <IcoSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            className="input pl-10 pr-9"
            placeholder="Buscar loja ou produto"
            value={filtros.busca}
            onChange={(e) => setFiltros((f) => ({ ...f, busca: e.target.value }))}
          />
          {filtros.busca && (
            <button
              type="button"
              onClick={() => setFiltros((f) => ({ ...f, busca: "" }))}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
            >
              <IcoX className="w-4 h-4" />
            </button>
          )}
        </div>

        <select
          className={SELECT_CLS}
          value={filtros.rede}
          onChange={(e) => setFiltros((f) => ({ ...f, rede: e.target.value, loja: "" }))}
        >
          <option value="">Todas as redes</option>
          {opcoesRede.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select
          className={SELECT_CLS}
          value={filtros.loja}
          onChange={(e) => setFiltros((f) => ({ ...f, loja: e.target.value }))}
        >
          <option value="">Todas as lojas</option>
          {lojaForaDasOpcoes && <option value={filtros.loja}>Loja selecionada (sem itens aqui)</option>}
          {opcoesLoja.map((o) => (
            <option key={o.value} value={o.value}>{o.label} ({o.n})</option>
          ))}
        </select>

        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 whitespace-nowrap focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10 transition">
          Vence até
          <input
            type="date"
            aria-label="Vence até"
            className="bg-transparent text-slate-700 focus:outline-none min-w-0"
            value={filtros.venceAte}
            onChange={(e) => setFiltros((f) => ({ ...f, venceAte: e.target.value }))}
          />
        </label>
      </div>

      {(produtoFiltradoNome || temFiltro) && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {produtoFiltradoNome && (
            <button
              type="button"
              onClick={() => setFiltros((f) => ({ ...f, produtoCodigo: "" }))}
              className="chip chip-active"
              title="Remover filtro de produto"
            >
              <IcoPackage className="w-3.5 h-3.5" />
              <span className="max-w-[220px] truncate">{produtoFiltradoNome}</span>
              <IcoX className="w-3.5 h-3.5" />
            </button>
          )}
          {temFiltro && (
            <button type="button" onClick={onLimpar} className="text-xs font-semibold text-brand hover:underline">
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {linhas.length === 0 ? (
        <div className="py-10 text-center">
          <div className="mx-auto mb-3 h-11 w-11 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
            <IcoPackage className="w-5 h-5" />
          </div>
          <p className="text-sm font-medium text-slate-600">Nenhum item com esses filtros</p>
          {temFiltro && (
            <button type="button" onClick={onLimpar} className="mt-2 text-xs font-semibold text-brand hover:underline">
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm min-w-[780px]">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400 uppercase tracking-wider">
                  <th className="py-2.5 px-3 w-8">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos os visíveis"
                      className="h-4 w-4 rounded border-slate-300 accent-brand cursor-pointer align-middle"
                      checked={todosVisiveis}
                      ref={(el) => { if (el) el.indeterminate = visiveisMarcados > 0 && !todosVisiveis; }}
                      onChange={(e) => onToggleVisiveis(linhas.map((l) => l._id), e.target.checked)}
                    />
                  </th>
                  {COLUNAS.map((c) => (
                    <Th key={c.campo} col={c} ordem={ordem} onOrdenar={onOrdenar} />
                  ))}
                  <th className="py-2.5 px-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {linhas.map((l) => {
                  const seg = STATUS_SHELF_MAP[l.status] || STATUS_SHELF_MAP.sem_shelf;
                  const acao = seg.acao === "oferta_interna" ? "oferta" : "rebaixa";
                  const ativa = getAcaoAtiva(l);
                  const rede = formatarRede({ redeSubrede: l.redeSubrede, subrede: l.subrede, codigoRede: l.codigoRede });
                  const marcado = selecionados.has(l._id);
                  return (
                    <tr key={l._id} className={`transition-colors ${marcado ? "bg-brand/5" : "hover:bg-slate-50"}`}>
                      <td className="py-2 px-3">
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${l.produto} em ${l.cliente}`}
                          className="h-4 w-4 rounded border-slate-300 accent-brand cursor-pointer align-middle"
                          checked={marcado}
                          onChange={() => onToggleItem(l._id)}
                        />
                      </td>
                      <td className="py-2 px-3 max-w-[220px]">
                        <div className="font-medium text-slate-800 truncate">{l.cliente}</div>
                        {rede && <div className="text-[10px] text-slate-400 truncate">{rede}</div>}
                      </td>
                      <td className="py-2 px-3 max-w-[260px] text-slate-700 truncate">{l.produto}</td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-800">{fmtNum(l.quantidade)}</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-500 whitespace-nowrap">{fmtData(l.dataValidade)}</td>
                      <td className="py-2 px-3 text-right">
                        <span
                          className="inline-block rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
                          style={{ color: seg.hex, backgroundColor: seg.hex + "18" }}
                        >
                          {l.diasParaVencer ?? "—"}d
                        </span>
                        <div className="text-[10px] text-slate-400 whitespace-nowrap mt-0.5">
                          {l.pct != null ? `${Math.round(l.pct * 100)}% do shelf` : "sem shelf"}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1.5">
                          <BadgeStatus cls={l.status} />
                          {ativa && <AcaoAtivaBadge ativa={ativa} />}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => onSolicitar(l)}
                          className="rounded-lg border border-brand/30 text-brand text-xs font-semibold px-3 py-1.5 hover:bg-brand/5 active:scale-95 transition whitespace-nowrap"
                        >
                          {ativa ? `Nova ${acao}` : acao === "oferta" ? "Oferta" : "Rebaixar"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalLinhas > linhas.length && (
            <button
              type="button"
              onClick={onMais}
              className="mt-3 w-full rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-brand hover:bg-slate-50 active:scale-[0.99] transition"
            >
              Mostrar mais ({fmtNum(totalLinhas - linhas.length)} restantes)
            </button>
          )}
        </>
      )}
    </section>
  );
}
