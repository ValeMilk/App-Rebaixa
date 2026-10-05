"use client";

import { TONE } from "@/lib/tones";
import { escalaBonita } from "@/lib/acompanhamentoEstoque";

const W = 640, H = 196, L = 40, R = 22, T = 26, B = 36;
const fmtNum = (n) => Number(n || 0).toLocaleString("pt-BR");

// "2026-09-24T11:45" -> milissegundos (hora de relogio, sem fuso); so a data vale meio-dia
function ms(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s || "");
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0) : 0;
}
const diaMes = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const diaHora = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}`;

/**
 * Evolucao da quantidade de UM lote ao longo das contagens. Eixo X = quando foi contado
 * (proporcional ao tempo), eixo Y = quantidade. `contagens` vem da mais recente para a mais antiga.
 * O ponto da contagem usada no painel fica preenchido. `semContagem` = dias (AAAA-MM-DD) em que
 * houve visita ao produto na loja e ESTE lote nao foi contado: viram um × no eixo; depois da
 * ultima contagem, a linha tracejada mostra que o valor antigo continua sendo carregado.
 */
export default function LoteHistoricoChart({ contagens, tone = "secondary", usadaEm, rotulo, semContagem = [], mantemValor = true }) {
  const pontos = [...contagens].reverse(); // cronologico
  if (!pontos.length) return null;
  const cor = (TONE[tone] || TONE.secondary).hex;
  const cinza = TONE.neutral.hex;
  const ultimo = pontos[pontos.length - 1];
  const tUltimo = ms(ultimo.contadoEm);
  const faltas = semContagem.map((d) => ({ dia: d, t: ms(d) })).sort((a, b) => a.t - b.t);
  // so um lote que ainda esta no painel "carrega" a ultima contagem pelas visitas seguintes
  const depois = mantemValor ? faltas.filter((f) => f.t > tUltimo) : [];

  const t0 = Math.min(ms(pontos[0].contadoEm), faltas.length ? faltas[0].t : Infinity);
  const t1 = Math.max(tUltimo, faltas.length ? faltas[faltas.length - 1].t : -Infinity);
  const { topo, passo } = escalaBonita(Math.max(...pontos.map((p) => p.quantidade)));
  const xt = (t) => (t1 === t0 ? (L + W - R) / 2 : L + ((t - t0) / (t1 - t0)) * (W - L - R));
  const x = (p) => xt(ms(p.contadoEm));
  const y = (v) => T + (1 - v / topo) * (H - T - B);
  const caminho = pontos.map((p, i) => `${i ? "L" : "M"}${x(p).toFixed(1)},${y(p.quantidade).toFixed(1)}`).join(" ");
  const ticks = Array.from({ length: Math.round(topo / passo) + 1 }, (_, i) => i * passo);

  // rotulos do eixo X (contagens e visitas sem contagem) sem sobreposicao: extremos sempre, o resto se couber
  const marcas = [
    ...pontos.map((p) => ({ px: x(p), texto: diaMes(p.contadoEm), falta: false })),
    ...faltas.map((f) => ({ px: xt(f.t), texto: diaMes(f.dia), falta: true })),
  ].sort((a, b) => a.px - b.px);
  const MIN_GAP = 46;
  const visiveis = [];
  marcas.forEach((m, i) => {
    const primeiro = i === 0, fim = i === marcas.length - 1;
    const livreAntes = !visiveis.length || m.px - visiveis[visiveis.length - 1].px >= MIN_GAP;
    const livreDepois = fim || marcas[marcas.length - 1].px - m.px >= MIN_GAP;
    if (primeiro || (fim && livreAntes) || (livreAntes && livreDepois)) visiveis.push(m);
    else if (fim) { visiveis.pop(); visiveis.push(m); } // o ultimo vence o vizinho
  });
  const ancora = (m) => (marcas.length === 1 ? "middle" : m === marcas[0] ? "start" : m === marcas[marcas.length - 1] ? "end" : "middle");

  // rotulo de quantidade em cada ponto, omitido quando colaria no anterior
  let ultimoRotulo = -Infinity;

  const resumo = pontos.map((p) => `${diaHora(p.contadoEm)}: ${fmtNum(p.quantidade)} un`).join("; ");
  const resumoFaltas = faltas.length ? ` Visitas sem contar este lote: ${faltas.map((f) => diaMes(f.dia)).join(", ")}.` : "";

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[520px]" role="img" aria-label={`${rotulo || "Evolução do lote"}. ${resumo}.${resumoFaltas}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={cinza} strokeOpacity="0.22" strokeDasharray={t === 0 ? undefined : "3 4"} />
            <text x={L - 7} y={y(t) + 4} textAnchor="end" fontSize="11" fill={cinza}>{fmtNum(t)}</text>
          </g>
        ))}

        {/* visitas em que este lote nao foi contado */}
        {faltas.map((f) => (
          <g key={f.dia}>
            <title>{`${diaMes(f.dia)}: houve visita e este lote não foi contado`}</title>
            <line x1={xt(f.t)} x2={xt(f.t)} y1={T} y2={y(0)} stroke={cinza} strokeOpacity="0.45" strokeDasharray="2 4" />
            <text x={xt(f.t)} y={y(0) + 4.5} textAnchor="middle" fontSize="15" fontWeight="700" className="fill-warning">×</text>
          </g>
        ))}

        {pontos.length > 1 && <path d={caminho} fill="none" stroke={cor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
        {/* depois da ultima contagem: o valor antigo continua valendo */}
        {depois.length > 0 && (
          <line x1={x(ultimo)} x2={xt(depois[depois.length - 1].t)} y1={y(ultimo.quantidade)} y2={y(ultimo.quantidade)} stroke={cor} strokeOpacity="0.55" strokeWidth="2" strokeDasharray="6 5" />
        )}

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
                // colado na borda esquerda, o rotulo abre para a direita para nao encostar na escala do eixo
                <text x={px - L < 14 ? px - 5 : px} y={py - 11} textAnchor={px - L < 14 ? "start" : "middle"} fontSize="12" fontWeight={usada ? 700 : 600} className="fill-neutral-800">
                  {fmtNum(p.quantidade)}
                </text>
              )}
            </g>
          );
        })}

        {visiveis.map((m) => (
          <text key={`${m.texto}-${m.px}`} x={m.px} y={H - 9} textAnchor={ancora(m)} fontSize="11" fontWeight={m.falta ? 700 : 400} className={m.falta ? "fill-warning" : undefined} fill={m.falta ? undefined : cinza}>
            {m.texto}
          </text>
        ))}
      </svg>
      {faltas.length > 0 && (
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
          <span><span className="font-bold text-warning">×</span> visita em que este lote não foi contado</span>
          {depois.length > 0 && (
            <span className="flex items-center gap-1.5">
              <svg width="24" height="6" aria-hidden><line x1="0" y1="3" x2="24" y2="3" stroke={cor} strokeOpacity="0.55" strokeWidth="2" strokeDasharray="6 5" /></svg>
              última contagem mantida no painel
            </span>
          )}
        </p>
      )}
    </div>
  );
}
