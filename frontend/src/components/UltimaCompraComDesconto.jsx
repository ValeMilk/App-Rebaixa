"use client";

import { fmtBRL } from "@/lib/utils";

/**
 * Extrai de uma resposta da API (ou de um item gravado) os campos do desconto de contrato,
 * para repassar no payload sem repetir os nomes. Campos ausentes ficam undefined.
 */
export function camposDesconto(src) {
  if (!src) return {};
  return {
    descontoContratoPercentual:   src.descontoContratoPercentual   ?? undefined,
    descontoContratoTipo:         src.descontoContratoTipo         ?? undefined,
    precoUltimaCompraComDesconto: src.precoUltimaCompraComDesconto ?? undefined,
  };
}

const ALIGN = { left: "text-left", right: "text-right", center: "text-center" };

/**
 * Linha "ultima compra com desconto de contrato diluido" (so informativa; as margens nao a usam).
 *  - percentual null/undefined: nao consultado (item antigo) -> nao renderiza nada
 *  - percentual 0: "sem desconto de contrato"
 *  - percentual > 0: preco com desconto + "-X% · Tipo"
 */
export default function UltimaCompraComDesconto({ preco, percentual, tipo, align = "center", className = "" }) {
  if (percentual == null) return null;
  const pct = Number(percentual);
  const al = ALIGN[align] || ALIGN.center;

  if (!(pct > 0)) {
    return <div className={`text-[9px] text-neutral-400 ${al} ${className}`}>sem desconto de contrato</div>;
  }

  return (
    <div className={`${al} ${className}`}>
      <div className="text-[10px] text-neutral-500 leading-tight">
        c/ desconto <b className="text-secondary tabular-nums">{fmtBRL(preco)}</b>
      </div>
      <div className="text-[9px] text-neutral-400 leading-tight tabular-nums">
        −{pct.toFixed(pct % 1 === 0 ? 0 : 1)}%{tipo ? ` · ${tipo}` : ""}
      </div>
    </div>
  );
}
