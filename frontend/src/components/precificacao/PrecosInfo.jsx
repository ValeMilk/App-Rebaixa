"use client";

import { fmtBRL } from "@/lib/utils";

/**
 * Campos informativos da solicitacao (v2.0, fase 2): Tabela 70 (ou tabela da rede), preco minimo,
 * desconto do cliente e preco liquido = ultima compra x (1 - desconto). Todos somente leitura.
 * `compacto`: uma linha com 4 celulas (modais); senao, grade.
 */
export default function PrecosInfo({ ctx, compacto = true, className = "" }) {
  if (!ctx) return null;
  const temUC = !!ctx.ultimaCompra?.encontrado;
  const celulas = [
    {
      label: ctx.precoTabelaOrigem === "rede" ? "Tabela da rede" : "Tabela 70",
      valor: fmtBRL(ctx.precoTabela),
      sub: ctx.precoTabelaOrigem === "rede" && ctx.item?.precoTabela ? `item ${fmtBRL(ctx.item.precoTabela)}` : null,
    },
    { label: "Preço mínimo", valor: ctx.item?.precoMinimo > 0 ? fmtBRL(ctx.item.precoMinimo) : "—" },
    {
      label: "Desc. cliente",
      valor: temUC ? `${Number(ctx.descontoClientePercentual || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` : "—",
      sub: temUC && ctx.ultimaCompra.descontoContratoTipo ? ctx.ultimaCompra.descontoContratoTipo : null,
    },
    {
      label: "Preço líquido",
      valor: ctx.precoLiquido != null ? fmtBRL(ctx.precoLiquido) : "—",
      sub: temUC ? "últ. compra − desconto" : "sem última compra",
      destaque: true,
    },
  ];
  return (
    <div className={`grid grid-cols-4 overflow-hidden rounded-xl border border-neutral-100 ${compacto ? "" : "sm:grid-cols-4"} ${className}`}>
      {celulas.map((c, i) => (
        <div key={c.label} className={`px-2 py-2 text-center ${i > 0 ? "border-l border-neutral-100" : ""} ${c.destaque ? "bg-secondary/5" : "bg-white"}`}>
          <div className={`text-[9px] font-semibold uppercase tracking-wide ${c.destaque ? "text-secondary/70" : "text-neutral-500"}`}>{c.label}</div>
          <div className={`mt-0.5 text-sm font-bold leading-tight ${c.destaque ? "text-secondary" : "text-neutral-800"}`}>{c.valor}</div>
          {c.sub && <div className="text-[9px] leading-tight text-neutral-400">{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}

/** Selo do preco da oferta: "Preço da rede (P#3)" travado ou "Preço do item (P#3)" editavel. */
export function SeloPrecoOferta({ oferta }) {
  if (!oferta?.rotulo) return null;
  const travado = oferta.travado;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${travado ? "border-success/30 bg-success/10 text-success" : "border-info/30 bg-info/10 text-info"}`}>
      {travado ? "🔒 " : ""}{oferta.rotulo}{travado ? "" : " · pode ajustar"}
    </span>
  );
}
