"use client";

import { useState } from "react";
import clsx from "clsx";
import Badge from "@/components/ui/Badge";
import AcaoAtivaBadge from "@/components/AcaoAtivaBadge";
import SituacaoBadge from "@/components/visao/SituacaoBadge";
import { SITUACAO, MOTIVO_SAIDA, tipoSolicitacaoDe } from "@/components/visao/situacoes";
import { STATUS_SHELF_MAP } from "@/lib/estoque";
import { TONE } from "@/lib/tones";
import { fmtData, fmtDataHoraCurta, fmtBRL } from "@/lib/utils";
import { IcoPackage, IcoClock, IcoUser, IcoTag, IcoChevronDown, IcoPercent } from "@/components/Icons";

const fmtNum = (n) => Number(n || 0).toLocaleString("pt-BR");
const nomeAgente = (s) => (s ? String(s).toLowerCase() : "");

function diasAte(d) {
  if (!d) return null;
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const hoje = new Date();
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())) / 86400000);
}

/** Um lote (data de validade) do item: validade, quantidade, status, quem/quando; nao vigente em cinza com o motivo. */
function LoteLinha({ lote, item }) {
  const st = STATUS_SHELF_MAP[lote.status] || STATUS_SHELF_MAP.sem_shelf;
  const dias = diasAte(lote.dataValidade);
  const pct = lote.pctShelf != null ? Math.round(Number(lote.pctShelf) * 100) : null;
  let motivo = null;
  if (!lote.vigente) {
    motivo = MOTIVO_SAIDA[lote.motivoSaida] || "Fora da soma";
    if (lote.motivoSaida === "nao_reencontrado" && item.ultimaVisitaEm) {
      motivo = `Não reencontrado: loja visitada em ${fmtDataHoraCurta(item.ultimaVisitaEm).slice(0, 5)} sem este lote`;
    }
  }
  return (
    <li className={clsx("px-3 py-2 text-xs", !lote.vigente ? "text-neutral-400" : "text-neutral-700")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1 tabular-nums whitespace-nowrap">
          <IcoClock className="h-3 w-3" aria-hidden />{fmtData(lote.dataValidade)}{dias != null && <span>· {dias}d</span>}
        </span>
        <span className={clsx("tabular-nums whitespace-nowrap", lote.entraNaSoma && "font-semibold text-neutral-900")}>{fmtNum(lote.quantidade)} un</span>
        {pct != null && <span className="tabular-nums whitespace-nowrap">{pct}% do shelf</span>}
        {lote.vigente ? (
          <Badge tone={st.tone} dot className="text-[10px]">{st.label}{!lote.entraNaSoma && " · fora da soma"}</Badge>
        ) : (
          <Badge tone="neutral" className="text-[10px]">não vigente</Badge>
        )}
        <span className="inline-flex items-center gap-1 whitespace-nowrap capitalize">
          <IcoUser className="h-3 w-3" aria-hidden />{nomeAgente(lote.agente) || "não identificado"} · {fmtDataHoraCurta(lote.contadoEm)}
        </span>
      </div>
      {motivo && <div className="mt-0.5 text-[11px] text-neutral-400">{motivo}</div>}
    </li>
  );
}

/**
 * Item (produto) de uma loja na visao do vendedor. Mobile first: cabecalho com nome e selo, linha de
 * metadados que quebra, botao de solicitar em largura total; expandir mostra os lotes.
 */
export default function ItemLojaCard({ item, podeSolicitar, acaoAtiva, onSolicitar }) {
  const [aberto, setAberto] = useState(false);
  const s = SITUACAO[item.situacao] || SITUACAO.sem_shelf;
  const t = TONE[s.tone] || TONE.neutral;
  const tipo = tipoSolicitacaoDe(item.situacao);
  const temLotes = Array.isArray(item.lotes) && item.lotes.length > 0;
  const temVigente = temLotes && item.lotes.some((l) => l.vigente);
  const pct = item.pctShelf != null ? Math.round(Number(item.pctShelf) * 100) : null;
  const destaque = item.situacao === "ruptura" || item.situacao === "rebaixa" || item.situacao === "giro";

  return (
    <div className={clsx("rounded-xl border", destaque ? `${t.border} ${t.bg}` : "border-neutral-200 bg-white")}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left"
        aria-expanded={aberto}
      >
        <span className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", t.dot)} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-snug text-neutral-800">{item.produto || item.produtoCodigo}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
            <SituacaoBadge item={item} />
            {acaoAtiva && <AcaoAtivaBadge ativa={acaoAtiva} />}
            {item.abaixoMinimo && temVigente && (item.situacao === "rebaixa" || item.situacao === "giro") && (
              <Badge tone="neutral" className="text-[10px]">abaixo do mínimo</Badge>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600 sm:text-[13px]">
            {temVigente || item.situacao === "sem_shelf" ? (
              <span className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums"><IcoPackage className="h-3 w-3" aria-hidden />{fmtNum(item.quantidade)} un</span>
            ) : item.ultimaContagemQtd != null ? (
              <span className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums"><IcoPackage className="h-3 w-3" aria-hidden />últ. contagem {fmtNum(item.ultimaContagemQtd)} un</span>
            ) : null}
            {item.dataValidade && (
              <span className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums">
                <IcoClock className="h-3 w-3" aria-hidden />{fmtData(item.dataValidade)}{item.diasParaVencer != null && ` · ${item.diasParaVencer}d`}
              </span>
            )}
            {pct != null && <span className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums"><IcoPercent className="h-3 w-3" aria-hidden />{pct}% do shelf</span>}
            {item.precoTabela != null && item.precoTabela > 0 && (
              <span className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums"><IcoTag className="h-3 w-3" aria-hidden />{fmtBRL(item.precoTabela)}</span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-neutral-500">
            {item.ultimaContagemQtd != null && (
              <span className="whitespace-nowrap capitalize">
                contado por {nomeAgente(item.ultimaContagemPor) || "não identificado"} · {fmtDataHoraCurta(item.ultimaContagemEm)}
              </span>
            )}
            <span className="whitespace-nowrap">
              {item.ultimaCompraEm ? `última compra ${fmtData(item.ultimaCompraEm)}` : "sem compra em 90 dias"}
              {item.qtd90d > 0 && ` · ${fmtNum(item.qtd90d)} un`}
            </span>
          </div>
        </div>
        <IcoChevronDown className={clsx("mt-1 h-4 w-4 shrink-0 text-neutral-400 transition-transform", aberto && "rotate-180")} aria-hidden />
      </button>

      {aberto && (
        <div className="border-t border-neutral-100 animate-fade-in">
          {temLotes ? (
            <ul className="divide-y divide-neutral-100">
              {item.lotes.map((l, i) => <LoteLinha key={`${l.dataValidade}-${i}`} lote={l} item={item} />)}
            </ul>
          ) : (
            <p className="px-3 py-2 text-xs text-neutral-500">
              {item.situacao === "nao_contado"
                ? "Nenhuma contagem nos últimos 30 dias."
                : item.ultimaContagemQtd === 0
                  ? "Última contagem com zero, sem lote."
                  : "Sem lote (contagem sem data de validade)."}
            </p>
          )}
        </div>
      )}

      {podeSolicitar && tipo && onSolicitar && (
        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={() => onSolicitar(item, tipo)}
            className={clsx(
              "w-full rounded-xl py-2 text-sm font-semibold transition active:scale-[0.98]",
              acaoAtiva ? "border border-neutral-200 bg-neutral-50 text-neutral-500 hover:bg-neutral-100" : "border border-secondary/30 bg-white text-secondary hover:bg-secondary/5"
            )}
          >
            {acaoAtiva
              ? `Nova ${tipo === "oferta_interna" ? "oferta" : "rebaixa"} (já existe ação)`
              : tipo === "oferta_interna" ? "Solicitar oferta" : "Solicitar rebaixa"}
          </button>
        </div>
      )}
    </div>
  );
}
