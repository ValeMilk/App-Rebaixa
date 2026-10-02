"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import api from "@/lib/api";
import { fmtData, fmtDataHora, formatarRede } from "@/lib/utils";
import { STATUS_SHELF_MAP } from "@/lib/estoque";
import Dialog from "@/components/ui/Dialog";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { IcoX } from "@/components/Icons";

const fmtNum = (n) => Number(n || 0).toLocaleString("pt-BR");

// "2026-09-24T11:45" (hora de relogio da contagem) -> "24/09/2026 11:45"
function fmtContagem(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s || "");
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : "—";
}

function diasAte(dataIso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dataIso || "");
  if (!m) return null;
  const hoje = new Date();
  const alvo = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return Math.round((alvo - Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())) / 86400000);
}

function Agente({ nome, codigo }) {
  if (!nome && !codigo) return <span className="text-neutral-400">não identificado</span>;
  return (
    <>
      <span className="block whitespace-nowrap capitalize">{(nome || "").toLowerCase() || "—"}</span>
      {codigo && <span className="block whitespace-nowrap text-xs text-neutral-500">cód {codigo}</span>}
    </>
  );
}

/**
 * De onde veio a quantidade de um item do painel: os lotes (uma linha por data de validade, com
 * quem contou e quando, e se entra na soma) e as contagens dos ultimos 15 dias daquele produto na loja.
 */
export default function DetalheContagemModal({ item, onClose }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let cancelado = false;
    setDados(null);
    setErro("");
    api.get(`/estoque/${item._id}/detalhes`)
      .then(({ data }) => { if (!cancelado) setDados(data); })
      .catch((err) => { if (!cancelado) setErro(err?.response?.data?.error || "Não foi possível carregar os detalhes."); });
    return () => { cancelado = true; };
  }, [item._id]);

  const it = dados?.item;
  const lotes = it?.lotes || [];
  const usados = lotes.filter((l) => l.entraNaSoma);
  const soma = usados.reduce((s, l) => s + (Number(l.quantidade) || 0), 0);
  const rede = formatarRede({ redeSubrede: item.redeSubrede, subrede: item.subrede, codigoRede: item.codigoRede });
  const seg = STATUS_SHELF_MAP[item.status] || STATUS_SHELF_MAP.sem_shelf;

  // Dia da visita que o painel usa (a contagem mais recente entre os lotes) x contagens mais novas no historico
  const diaUsado = lotes.map((l) => (l.contadoEm || "").slice(0, 10)).filter(Boolean).sort().pop() || null;
  const historico = dados?.historico;
  const maisNova = historico && historico.length ? historico[0] : null;
  const haContagemNova = !!(maisNova && diaUsado && maisNova.contadoEm.slice(0, 10) > diaUsado);

  return (
    <Dialog open onClose={onClose} sheet size="lg" ariaLabel="Detalhes da contagem">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-neutral-200 px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:rounded-t-2xl">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-secondary">Detalhes da contagem</div>
          <h2 className="text-base font-semibold leading-snug text-neutral-900">{item.produto}</h2>
          <p className="mt-0.5 truncate text-sm text-neutral-600">
            {item.cliente}{rede ? <span className="text-neutral-400"> · {rede}</span> : null}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 transition hover:bg-neutral-200"
        >
          <IcoX className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {/* O que o painel mostra */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm">
          <div><span className="text-neutral-500">No painel: </span><strong className="tabular-nums text-neutral-900">{fmtNum(item.quantidade)} un</strong></div>
          <div><span className="text-neutral-500">Validade: </span><strong className="tabular-nums text-neutral-900">{fmtData(item.dataValidade)}</strong></div>
          <Badge tone={seg.tone} dot>{seg.label}</Badge>
          {it?.shelf > 0 && <span className="text-xs text-neutral-500">shelf de {it.shelf} dias</span>}
        </div>

        {erro && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}

        {!dados && !erro && (
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {dados && (
          <>
            {haContagemNova && (
              <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-neutral-800">
                Há uma contagem mais recente ({fmtContagem(maisNova.contadoEm)}) que o painel ainda não refletiu. Ela entra na próxima sincronização.
              </p>
            )}

            {/* Lotes */}
            <section>
              <h3 className="text-sm font-semibold text-neutral-800">Como chegamos nesse número</h3>
              <p className="mt-0.5 text-xs text-neutral-500">
                {usados.length > 1
                  ? `A quantidade é a soma de ${usados.length} lotes (datas de validade) em giro ou rebaixa.`
                  : "A quantidade vem de um único lote (uma data de validade)."}
                {lotes.length > usados.length ? " Lotes ainda “ok” ficam de fora da soma." : ""}
              </p>

              {lotes.length === 0 ? (
                <p className="mt-2 rounded-lg border border-neutral-200 px-3 py-3 text-sm text-neutral-500">
                  O detalhe por lote aparece após a próxima sincronização do estoque.
                </p>
              ) : (
                <div className="mt-2 overflow-x-auto rounded-xl border border-neutral-200">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead className="bg-neutral-50 text-left text-xs font-medium text-neutral-600">
                      <tr>
                        <th className="px-3 py-2">Validade</th>
                        <th className="px-3 py-2 text-right">Qtd</th>
                        <th className="px-3 py-2 text-right">Dias</th>
                        <th className="px-3 py-2">Situação</th>
                        <th className="whitespace-nowrap px-3 py-2">Quem contou</th>
                        <th className="px-3 py-2">Quando</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lotes.map((l, i) => {
                        const st = STATUS_SHELF_MAP[l.status] || STATUS_SHELF_MAP.sem_shelf;
                        const dias = diasAte(l.dataValidade);
                        const pct = it.shelf > 0 && dias != null ? Math.round(Math.max(0, Math.min(1, (it.shelf - dias) / it.shelf)) * 100) : null;
                        return (
                          <tr key={i} className={clsx("border-t border-neutral-100", !l.entraNaSoma && "bg-neutral-50/60 text-neutral-500")}>
                            <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmtData(l.dataValidade)}</td>
                            <td className={clsx("px-3 py-2 text-right tabular-nums", l.entraNaSoma && "font-semibold text-neutral-900")}>{fmtNum(l.quantidade)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                              {dias != null ? `${dias}d` : "—"}
                              {pct != null && <span className="ml-1 text-xs text-neutral-500">({pct}%)</span>}
                            </td>
                            <td className="px-3 py-2">
                              <Badge tone={st.tone} dot>{st.label}</Badge>
                              {!l.entraNaSoma && <div className="mt-0.5 whitespace-nowrap text-xs">não entra na soma</div>}
                            </td>
                            <td className="px-3 py-2"><Agente nome={l.agente} codigo={l.agenteCodigo} /></td>
                            <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmtContagem(l.contadoEm)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-neutral-200 bg-neutral-50 font-semibold text-neutral-900">
                        <td className="whitespace-nowrap px-3 py-2">Total no painel</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNum(soma)}</td>
                        <td className="px-3 py-2 text-xs font-normal text-neutral-500" colSpan={4}>
                          {usados.length > 1 ? `soma de ${usados.length} lotes` : "um lote"}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </section>

            {/* Historico */}
            <section>
              <h3 className="text-sm font-semibold text-neutral-800">Contagens dos últimos 15 dias</h3>
              <p className="mt-0.5 text-xs text-neutral-500">Todas as contagens deste produto nesta loja, da mais recente para a mais antiga. O painel usa só a da última visita.</p>
              {historico === null ? (
                <p className="mt-2 rounded-lg border border-neutral-200 px-3 py-3 text-sm text-neutral-500">Histórico indisponível no momento.</p>
              ) : historico.length === 0 ? (
                <p className="mt-2 rounded-lg border border-neutral-200 px-3 py-3 text-sm text-neutral-500">Nenhuma contagem nos últimos 15 dias.</p>
              ) : (
                <div className="mt-2 overflow-x-auto rounded-xl border border-neutral-200">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="bg-neutral-50 text-left text-xs font-medium text-neutral-600">
                      <tr>
                        <th className="px-3 py-2">Quando</th>
                        <th className="px-3 py-2 text-right">Qtd</th>
                        <th className="px-3 py-2">Validade</th>
                        <th className="whitespace-nowrap px-3 py-2">Quem contou</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {historico.map((h, i) => {
                        const dia = h.contadoEm.slice(0, 10);
                        const marca = !diaUsado ? null : dia > diaUsado ? { tone: "warning", texto: "ainda não sincronizada" } : dia === diaUsado ? { tone: "info", texto: "visita usada no painel" } : null;
                        return (
                          <tr key={i} className={clsx("border-t border-neutral-100", !marca && "text-neutral-500")}>
                            <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmtContagem(h.contadoEm)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{fmtNum(h.quantidade)}</td>
                            <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmtData(h.dataValidade)}</td>
                            <td className="px-3 py-2"><Agente nome={h.agente} codigo={h.agenteCodigo} /></td>
                            <td className="px-3 py-2">{marca && <Badge tone={marca.tone}>{marca.texto}</Badge>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-neutral-200 px-5 py-3 sm:rounded-b-2xl">
        <span className="text-xs text-neutral-500">{dados ? `Painel sincronizado em ${fmtDataHora(dados.sincronizadoEm)}` : ""}</span>
        <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
      </div>
    </Dialog>
  );
}
