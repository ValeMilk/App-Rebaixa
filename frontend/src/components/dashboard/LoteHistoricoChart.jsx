"use client";

import { TONE } from "@/lib/tones";
import { escalaBonita } from "@/lib/acompanhamentoEstoque";

const W = 640, H = 190, L = 40, R = 22, T = 26, B = 30;
const fmtNum = (n) => Number(n || 0).toLocaleString("pt-BR");

// "2026-09-24T11:45" -> milissegundos (hora de relogio, sem fuso)
function ms(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s || "");
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : 0;
}
const diaMes = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const diaHora = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}`;

/**
 * Evolucao da quantidade de UM lote ao longo das contagens. Eixo X = quando foi contado
 * (proporcional ao tempo), eixo Y = quantidade. `contagens` vem da mais recente para a mais antiga.
 * O ponto da contagem usada no painel fica preenchido.
 */
export default function LoteHistoricoChart({ contagens, tone = "secondary", usadaEm, rotulo }) {
  const pontos = [...contagens].reverse(); // cronologico
  if (!pontos.length) return null;
  const cor = (TONE[tone] || TONE.secondary).hex;
  const t0 = ms(pontos[0].contadoEm);
  const t1 = ms(pontos[pontos.length - 1].contadoEm);
  const { topo, passo } = escalaBonita(Math.max(...pontos.map((p) => p.quantidade)));
  const x = (p) => (t1 === t0 ? (L + W - R) / 2 : L + ((ms(p.contadoEm) - t0) / (t1 - t0)) * (W - L - R));
  const y = (v) => T + (1 - v / topo) * (H - T - B);
  const caminho = pontos.map((p, i) => `${i ? "L" : "M"}${x(p).toFixed(1)},${y(p.quantidade).toFixed(1)}`).join(" ");
  const ticks = Array.from({ length: Math.round(topo / passo) + 1 }, (_, i) => i * passo);

  // rotulos do eixo X sem sobreposicao: sempre o primeiro e o ultimo; os do meio se houver espaco
  const MIN_GAP = 46;
  const mostrar = new Set([0, pontos.length - 1]);
  let ultimoX = x(pontos[0]);
  for (let i = 1; i < pontos.length - 1; i++) {
    if (x(pontos[i]) - ultimoX >= MIN_GAP && x(pontos[pontos.length - 1]) - x(pontos[i]) >= MIN_GAP) { mostrar.add(i); ultimoX = x(pontos[i]); }
  }
  // rotulo de quantidade em cada ponto, omitido quando colaria no anterior
  let ultimoRotulo = -Infinity;

  const resumo = pontos.map((p) => `${diaHora(p.contadoEm)}: ${fmtNum(p.quantidade)} un`).join("; ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[520px]" role="img" aria-label={`${rotulo || "Evolução do lote"}. ${resumo}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={TONE.neutral.hex} strokeOpacity="0.22" strokeDasharray={t === 0 ? undefined : "3 4"} />
          <text x={L - 7} y={y(t) + 4} textAnchor="end" fontSize="11" fill={TONE.neutral.hex}>{fmtNum(t)}</text>
        </g>
      ))}

      {pontos.length > 1 && <path d={caminho} fill="none" stroke={cor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}

      {pontos.map((p, i) => {
        const px = x(p), py = y(p.quantidade);
        const usada = usadaEm && p.contadoEm === usadaEm;
        const comRotulo = px - ultimoRotulo >= 26 || usada || i === pontos.length - 1;
        if (comRotulo) ultimoRotulo = px;
        return (
          <g key={`${p.contadoEm}-${i}`}>
            <title>{`${diaHora(p.contadoEm)}\n${fmtNum(p.quantidade)} un\n${p.agente || "não identificado"}${usada ? "\n(usada no painel)" : ""}`}</title>
            <circle cx={px} cy={py} r={usada ? 6 : 4.5} fill={usada ? cor : "white"} stroke={cor} strokeWidth="2.5" />
            <circle cx={px} cy={py} r="14" fill="transparent" />
            {comRotulo && (
              <text x={px} y={py - 11} textAnchor="middle" fontSize="12" fontWeight={usada ? 700 : 600} className="fill-neutral-800">
                {fmtNum(p.quantidade)}
              </text>
            )}
            {mostrar.has(i) && (
              <text x={px} y={H - 9} textAnchor={pontos.length === 1 ? "middle" : i === 0 ? "start" : i === pontos.length - 1 ? "end" : "middle"} fontSize="11" fill={TONE.neutral.hex}>
                {diaMes(p.contadoEm)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
