"use client";

import clsx from "clsx";
import { fmtData, formatarRede } from "@/lib/utils";
import { STATUS_SHELF_MAP } from "@/lib/estoque";
import AcaoAtivaBadge from "@/components/AcaoAtivaBadge";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Surface from "@/components/ui/Surface";
import EmptyState from "@/components/ui/EmptyState";
import { IcoSearch, IcoX, IcoPackage } from "@/components/Icons";

const fmtNum = (n) => Number(n || 0).toLocaleString("pt-BR");

const COLUNAS = [
  { campo: "cliente",    label: "Loja",     align: "left" },
  { campo: "produto",    label: "Produto",  align: "left" },
  { campo: "quantidade", label: "Qtd",      align: "right" },
  { campo: "validade",   label: "Validade", align: "right" },
  { campo: "dias",       label: "Dias",     align: "right" },
  { campo: "status",     label: "Status",   align: "left" },
];

function Th({ col, ordem, onOrdenar }) {
  const ativa = ordem.campo === col.campo;
  const direcao = ativa ? (ordem.dir === 1 ? "crescente" : "decrescente") : "sem ordenação";
  return (
    <th
      onClick={() => onOrdenar(col.campo)}
      aria-sort={ativa ? (ordem.dir === 1 ? "ascending" : "descending") : "none"}
      title={`${col.label}: ${direcao}. Clique para ordenar.`}
      className={clsx(
        "cursor-pointer select-none whitespace-nowrap px-3 py-2.5 text-xs font-medium hover:text-neutral-900",
        col.align === "right" ? "text-right" : "text-left",
        ativa ? "text-neutral-900" : "text-neutral-600"
      )}
    >
      {col.label}{" "}
      <span className={ativa ? "" : "opacity-30"} aria-hidden>{ativa ? (ordem.dir === 1 ? "↑" : "↓") : "↕"}</span>
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
    <Surface as="section" className="p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-neutral-800">Detalhe por loja</h2>
        <span className="whitespace-nowrap text-xs text-neutral-500">
          {fmtNum(totalLinhas)} {totalLinhas === 1 ? "item" : "itens"}
        </span>
      </div>

      {/* Toolbar: busca sempre visivel + filtros */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <IcoSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
          <input
            className="input pl-10 pr-9"
            placeholder="Buscar loja ou produto"
            aria-label="Buscar loja ou produto"
            value={filtros.busca}
            onChange={(e) => setFiltros((f) => ({ ...f, busca: e.target.value }))}
          />
          {filtros.busca && (
            <button
              type="button"
              onClick={() => setFiltros((f) => ({ ...f, busca: "" }))}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-600"
            >
              <IcoX className="h-4 w-4" />
            </button>
          )}
        </div>

        <select
          className="select sm:w-auto"
          aria-label="Rede"
          value={filtros.rede}
          onChange={(e) => setFiltros((f) => ({ ...f, rede: e.target.value, loja: "" }))}
        >
          <option value="">Todas as redes</option>
          {opcoesRede.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select
          className="select sm:w-auto"
          aria-label="Loja"
          value={filtros.loja}
          onChange={(e) => setFiltros((f) => ({ ...f, loja: e.target.value }))}
        >
          <option value="">Todas as lojas</option>
          {lojaForaDasOpcoes && <option value={filtros.loja}>Loja selecionada (sem itens aqui)</option>}
          {opcoesLoja.map((o) => (
            <option key={o.value} value={o.value}>{o.label} ({o.n})</option>
          ))}
        </select>

        <label className="flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-600 transition focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-400/30">
          Vence até
          <input
            type="date"
            aria-label="Vence até"
            className="min-w-0 bg-transparent text-neutral-800 focus:outline-none"
            value={filtros.venceAte}
            onChange={(e) => setFiltros((f) => ({ ...f, venceAte: e.target.value }))}
          />
        </label>
      </div>

      {(produtoFiltradoNome || temFiltro) && (
        <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Filtros ativos">
          {produtoFiltradoNome && (
            <button
              type="button"
              onClick={() => setFiltros((f) => ({ ...f, produtoCodigo: "" }))}
              className="chip chip-active"
              title="Remover filtro de produto"
            >
              <IcoPackage className="h-3.5 w-3.5" aria-hidden />
              <span className="max-w-[220px] truncate">{produtoFiltradoNome}</span>
              <IcoX className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
          {temFiltro && (
            <Button variant="link" size="sm" onClick={onLimpar}>Limpar filtros</Button>
          )}
        </div>
      )}

      {linhas.length === 0 ? (
        <EmptyState
          icon={IcoPackage}
          titulo={temFiltro ? "Nenhum item corresponde aos filtros" : "Nenhum item em giro ou rebaixa"}
          descricao={temFiltro ? "Ajuste ou limpe os filtros para ver mais itens." : "Quando o estoque entrar na régua do shelf, os itens aparecem aqui."}
          acao={temFiltro ? <Button variant="outline" size="sm" onClick={onLimpar}>Limpar filtros</Button> : null}
        />
      ) : (
        <>
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[780px] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50">
                  <th className="w-8 px-3 py-2.5">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos os visíveis"
                      className="h-4 w-4 cursor-pointer rounded border-neutral-300 align-middle accent-secondary"
                      checked={todosVisiveis}
                      ref={(el) => { if (el) el.indeterminate = visiveisMarcados > 0 && !todosVisiveis; }}
                      onChange={(e) => onToggleVisiveis(linhas.map((l) => l._id), e.target.checked)}
                    />
                  </th>
                  {COLUNAS.map((c) => (
                    <Th key={c.campo} col={c} ordem={ordem} onOrdenar={onOrdenar} />
                  ))}
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {linhas.map((l) => {
                  const seg = STATUS_SHELF_MAP[l.status] || STATUS_SHELF_MAP.sem_shelf;
                  const acao = seg.acao === "oferta_interna" ? "oferta" : "rebaixa";
                  const ativa = getAcaoAtiva(l);
                  const rede = formatarRede({ redeSubrede: l.redeSubrede, subrede: l.subrede, codigoRede: l.codigoRede });
                  const marcado = selecionados.has(l._id);
                  return (
                    <tr key={l._id} className={clsx("transition-colors", marcado ? "bg-secondary/5" : "hover:bg-neutral-50")}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${l.produto} em ${l.cliente}`}
                          className="h-4 w-4 cursor-pointer rounded border-neutral-300 align-middle accent-secondary"
                          checked={marcado}
                          onChange={() => onToggleItem(l._id)}
                        />
                      </td>
                      <td className="max-w-[220px] px-3 py-2">
                        <div className="truncate font-medium text-neutral-800">{l.cliente}</div>
                        {rede && <div className="truncate text-[11px] text-neutral-500">{rede}</div>}
                      </td>
                      <td className="max-w-[260px] truncate px-3 py-2 text-neutral-700">{l.produto}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-neutral-800">{fmtNum(l.quantidade)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-neutral-600">{fmtData(l.dataValidade)}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={clsx("inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", seg.bg, seg.text)}>
                          {l.diasParaVencer ?? "—"}d
                        </span>
                        <div className="mt-0.5 whitespace-nowrap text-[11px] text-neutral-500">
                          {l.pct != null ? `${Math.round(l.pct * 100)}% do shelf` : "sem shelf"}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <Badge tone={seg.tone} dot>{seg.label}</Badge>
                          {ativa && <AcaoAtivaBadge ativa={ativa} />}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button variant="outline" size="sm" onClick={() => onSolicitar(l)}>
                          {ativa ? `Nova ${acao}` : acao === "oferta" ? "Oferta" : "Rebaixar"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalLinhas > linhas.length && (
            <div className="mt-3 flex items-center justify-between gap-3 text-sm text-neutral-600">
              <span>Mostrando {fmtNum(linhas.length)} de {fmtNum(totalLinhas)}</span>
              <Button variant="outline" size="sm" onClick={onMais}>Mostrar mais</Button>
            </div>
          )}
        </>
      )}
    </Surface>
  );
}
