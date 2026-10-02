"use client";

import clsx from "clsx";
import Surface from "@/components/ui/Surface";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { IcoSearch, IcoX, IcoPackage } from "@/components/Icons";
import { fmtBRL } from "@/lib/utils";
import { fmtNum, fmtDias } from "@/lib/acompanhamentoEstoque";

const COLUNAS = [
  { campo: "lojaNome", label: "Loja", align: "left" },
  { campo: "produtoNome", label: "Produto", align: "left" },
  { campo: "estoque", label: "Estoque", align: "right" },
  { campo: "qtdVendida", label: "Venda 30d", align: "right" },
  { campo: "vendaDiaria", label: "Venda/dia", align: "right" },
  { campo: "cobertura", label: "Cobertura", align: "right" },
  { campo: "status", label: "Status", align: "left" },
  { campo: "valorEstoque", label: "Valor em estoque", align: "right" },
  { campo: "idade", label: "Idade", align: "right" },
  { campo: "ddeCliente", label: "DDE cliente", align: "right" },
];

function Th({ col, ordem, onOrdenar }) {
  const ativa = ordem.campo === col.campo;
  return (
    <th
      onClick={() => onOrdenar(col.campo)}
      aria-sort={ativa ? (ordem.dir === 1 ? "ascending" : "descending") : "none"}
      title={`${col.label}: clique para ordenar`}
      className={clsx(
        "cursor-pointer select-none whitespace-nowrap px-3 py-2.5 text-xs font-medium hover:text-neutral-900",
        col.align === "right" ? "text-right" : "text-left",
        ativa ? "text-neutral-900" : "text-neutral-600"
      )}
    >
      {col.label} <span className={ativa ? "" : "opacity-30"} aria-hidden>{ativa ? (ordem.dir === 1 ? "↑" : "↓") : "↕"}</span>
    </th>
  );
}

/** Detalhe loja x produto, com filtros e ordenacao locais (os indicadores acima nao mudam). */
export default function TabelaEstoque({
  linhas, totalFiltrado, totalGeral, filtros, setFiltros, opcoes, statusMap, ordem, onOrdenar, onMais, onLimpar,
}) {
  const algumFiltro = Object.values(filtros).some(Boolean);
  const set = (parcial) => setFiltros((f) => ({ ...f, ...parcial }));
  const produtoNome = filtros.produto ? opcoes.produtoNome(filtros.produto) : null;

  return (
    <Surface as="section" className="min-w-0 overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 px-5 pb-3 pt-5">
        <h2 className="text-base font-semibold text-neutral-800">Detalhe por loja e produto</h2>
        <span className="text-xs text-neutral-500">{fmtNum(totalGeral)} linhas</span>
      </div>

      <div className="flex flex-wrap gap-2 px-5 pb-4">
        <div className="relative min-w-[12rem] flex-1">
          <IcoSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
          <input className="input pl-9" placeholder="Buscar loja ou produto" aria-label="Buscar loja ou produto" value={filtros.q} onChange={(e) => set({ q: e.target.value })} />
        </div>
        <select aria-label="Filtrar por loja" className="select w-auto min-w-[10rem]" value={filtros.loja} onChange={(e) => set({ loja: e.target.value })}>
          <option value="">Todas as lojas</option>
          {opcoes.lojas.map((l) => <option key={l.codigo} value={l.codigo}>{l.nome}</option>)}
        </select>
        <select aria-label="Filtrar por categoria" className="select w-auto min-w-[10rem]" value={filtros.categoria} onChange={(e) => set({ categoria: e.target.value })}>
          <option value="">Todas as categorias</option>
          {opcoes.categorias.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select aria-label="Filtrar por status" className="select w-auto min-w-[10rem]" value={filtros.status} onChange={(e) => set({ status: e.target.value })}>
          <option value="">Todos os status</option>
          {opcoes.status.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {produtoNome && (
          <button type="button" onClick={() => set({ produto: "" })} className="chip chip-active" title="Remover filtro de produto">
            {produtoNome} <IcoX className="h-3 w-3" aria-hidden />
          </button>
        )}
        {algumFiltro && <Button variant="ghost" size="sm" onClick={onLimpar}>Limpar filtros</Button>}
      </div>

      {totalFiltrado === 0 ? (
        <div className="border-t border-neutral-200">
          <EmptyState icon={IcoPackage} titulo={algumFiltro ? "Nenhuma linha corresponde aos filtros" : "Nenhuma linha neste retrato"} />
        </div>
      ) : (
        <div className="overflow-x-auto border-t border-neutral-200">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="bg-neutral-50">
              <tr>{COLUNAS.map((c) => <Th key={c.campo} col={c} ordem={ordem} onOrdenar={onOrdenar} />)}</tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const st = statusMap[l.status];
                return (
                  <tr key={`${l.linha}-${l.lojaCodigo}-${l.produtoCodigo}`} className="border-t border-neutral-100 hover:bg-neutral-50/60">
                    <td className="max-w-[14rem] truncate px-3 py-2 font-medium text-neutral-800" title={l.lojaNome}>{l.lojaNome}</td>
                    <td className="max-w-[18rem] truncate px-3 py-2 text-neutral-700" title={l.produtoNome}>{l.produtoNome}</td>
                    <td className={clsx("px-3 py-2 text-right tabular-nums", l.estoque < 0 && "font-semibold text-danger")}>{fmtNum(l.estoque)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(l.qtdVendida)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-600">{l.vendaDiaria ? fmtNum(l.vendaDiaria, 1) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtDias(l.cobertura)}</td>
                    <td className="px-3 py-2">{st && <Badge tone={st.tone} dot title={st.descricao}>{st.label}</Badge>}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtBRL(l.valorEstoque)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-600">{l.idade == null ? "—" : `${fmtNum(l.idade)} d`}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-500" title="Cobertura calculada pelo cliente: só conferência">{l.ddeCliente == null ? "—" : fmtNum(l.ddeCliente)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-center justify-between gap-3 border-t border-neutral-100 px-5 py-3 text-xs text-neutral-500">
            <span>Mostrando {fmtNum(linhas.length)} de {fmtNum(totalFiltrado)}</span>
            {linhas.length < totalFiltrado && <Button variant="outline" size="sm" onClick={onMais}>Mostrar mais</Button>}
          </div>
        </div>
      )}
    </Surface>
  );
}
