"use client";

import { TONE, CHART } from "@/lib/tones";
import { fmtBRL } from "@/lib/utils";
import { diaMes, diaMesAno, fmtMoedaCompacta, escalaBonita } from "@/lib/acompanhamentoEstoque";

const L = 64, R = 16, T = 14, B = 34, W = 760, H = 250;
const COR_ESTOQUE = TONE.secondary.hex;
const COR_VENDA = CHART[2].hex;

/**
 * Evolucao do valor em estoque e da venda de 30 dias entre os retratos. Clicar (ou Enter) num
 * ponto abre aquele retrato. Cor + estilo de linha (a venda e tracejada) distinguem as series.
 */
export default function SerieChart({ pontos, selecionadoId, onSelect }) {
  if (!pontos.length) return null;
  const n = pontos.length;
  const maxV = Math.max(1, ...pontos.flatMap((p) => [p.valorEstoque, p.vendaReais]));
  const { topo, passo: passoY } = escalaBonita(maxV);
  const x = (i) => (n === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (n - 1));
  const y = (v) => T + (1 - Math.max(0, v) / topo) * (H - T - B);
  const linha = (campo) => pontos.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[campo]).toFixed(1)}`).join(" ");
  const ticks = Array.from({ length: Math.round(topo / passoY) + 1 }, (_, i) => i * passoY);
  const passo = Math.ceil(n / 10); // no maximo ~10 datas no eixo

  const resumo = pontos.map((p) => `${diaMesAno(p.dataRetrato)}: estoque ${fmtBRL(p.valorEstoque)}, venda ${fmtBRL(p.vendaReais)}`).join("; ");

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Evolução do estoque e da venda entre retratos. ${resumo}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={TONE.neutral.hex} strokeOpacity="0.25" strokeDasharray={t === 0 ? undefined : "3 4"} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill={TONE.neutral.hex}>{fmtMoedaCompacta(t)}</text>
          </g>
        ))}

        <path d={linha("valorEstoque")} fill="none" stroke={COR_ESTOQUE} strokeWidth="2.5" strokeLinejoin="round" />
        <path d={linha("vendaReais")} fill="none" stroke={COR_VENDA} strokeWidth="2.5" strokeLinejoin="round" strokeDasharray="7 5" />

        {pontos.map((p, i) => {
          const sel = p.id === selecionadoId;
          return (
            <g
              key={p.id}
              role="button"
              tabIndex={0}
              aria-label={`Abrir retrato de ${diaMesAno(p.dataRetrato)}`}
              aria-pressed={sel}
              className="cursor-pointer outline-none"
              onClick={() => onSelect(p.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(p.id); } }}
            >
              <title>{`${diaMesAno(p.dataRetrato)}\nEstoque: ${fmtBRL(p.valorEstoque)}\nVenda 30 dias: ${fmtBRL(p.vendaReais)}`}</title>
              {sel && <line x1={x(i)} x2={x(i)} y1={T} y2={H - B} stroke={COR_ESTOQUE} strokeOpacity="0.45" strokeWidth="1.5" strokeDasharray="4 4" />}
              <circle cx={x(i)} cy={y(p.valorEstoque)} r={sel ? 6 : 4} fill="#fff" stroke={COR_ESTOQUE} strokeWidth="2.5" />
              <circle cx={x(i)} cy={y(p.vendaReais)} r={sel ? 6 : 4} fill="#fff" stroke={COR_VENDA} strokeWidth="2.5" />
              <rect x={x(i) - 18} y={T} width="36" height={H - T - B + 20} fill="transparent" />
              {(i % passo === 0 || sel) && (
                <text x={x(i)} y={H - 12} textAnchor="middle" fontSize="11" fontWeight={sel ? 700 : 400} fill={sel ? TONE.primary.hex : TONE.neutral.hex}>
                  {diaMes(p.dataRetrato)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-neutral-600">
        <span className="flex items-center gap-2">
          <svg width="26" height="8" aria-hidden><line x1="0" y1="4" x2="26" y2="4" stroke={COR_ESTOQUE} strokeWidth="2.5" /></svg>
          Valor em estoque
        </span>
        <span className="flex items-center gap-2">
          <svg width="26" height="8" aria-hidden><line x1="0" y1="4" x2="26" y2="4" stroke={COR_VENDA} strokeWidth="2.5" strokeDasharray="6 4" /></svg>
          Venda de 30 dias
        </span>
        <span className="text-neutral-400">Clique num ponto para abrir o retrato.</span>
      </div>
    </div>
  );
}
