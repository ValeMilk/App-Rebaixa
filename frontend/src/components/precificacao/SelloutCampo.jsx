"use client";

import { fmtBRL } from "@/lib/utils";

/**
 * Campo de sellout (v2.0): so quem ve margens digita. Mostra as duas sugestoes quando existem:
 * automatico (rede mantem a margem dela no preco da oferta) e o da margem do PDV.
 * Para quem nao ve margens o campo nao e renderizado (o sellout e calculado e gravado em silencio).
 */
export default function SelloutCampo({ veMargens, value, onChange, selloutAutomatico, margemRede, selloutSugeridoPDV, margemPDV, compacto = false }) {
  if (!veMargens) return null;
  const cls = compacto ? "input !px-2.5 !py-2 text-sm" : "input";
  const atual = value === "" || value == null ? null : Number(value);
  return (
    <div>
      <label className={`mb-${compacto ? "0.5" : "1"} block text-[${compacto ? "9" : "10"}px] font-semibold uppercase tracking-wide text-neutral-500`}>
        Sellout (R$ desconto sobre últ. compra)
      </label>
      <input type="number" step="0.01" min="0" inputMode="decimal" placeholder="0,00" className={cls} value={value} onChange={(e) => onChange(e.target.value)} />
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {selloutAutomatico != null && atual !== selloutAutomatico && (
          <button type="button" onClick={() => onChange(String(selloutAutomatico))} className="text-[11px] font-semibold text-success">
            ↑ Automático {fmtBRL(selloutAutomatico)}{margemRede != null ? ` — margem da rede ${Number(margemRede).toFixed(1)}%` : ""}
          </button>
        )}
        {selloutSugeridoPDV != null && atual !== selloutSugeridoPDV && (
          <button type="button" onClick={() => onChange(String(selloutSugeridoPDV))} className="text-[11px] font-semibold text-info">
            ↑ Sugerido {fmtBRL(selloutSugeridoPDV)}{margemPDV != null ? ` — manter margem PDV (${margemPDV.toFixed(1)}%)` : ""}
          </button>
        )}
      </div>
    </div>
  );
}
