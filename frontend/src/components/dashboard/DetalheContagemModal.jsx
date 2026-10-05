"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import api from "@/lib/api";
import { fmtData, fmtDataHora, formatarRede } from "@/lib/utils";
import { STATUS_SHELF_MAP } from "@/lib/estoque";
import Dialog from "@/components/ui/Dialog";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { IcoX } from "@/components/Icons";
import LoteHistoricoChart from "@/components/dashboard/LoteHistoricoChart";

const fmtNum = (n) => Number(n || 0).toLocaleString("pt-BR");
const dia = (s) => (s || "").slice(0, 10);

// "2026-09-24T11:45" (hora de relogio da contagem) -> "24/09/2026 11:45"
function fmtContagem(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s || "");
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : "—";
}

function hojeIso() {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`;
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
 * Agrupa o historico por lote (data de validade). Cada grupo traz as contagens daquele lote da
 * mais recente para a mais antiga, com a variacao em relacao a contagem anterior do mesmo lote.
 * Registros "sem lote" (quantidade zero com validade vazia ou igual ao dia da visita) viram o
 * grupo de visitas em que nao havia o produto.
 */
function agruparPorLote(historico, lotes) {
  const SEM = "__sem_produto__";
  const grupos = new Map();
  for (const h of historico) {
    const semLote = !h.dataValidade || (h.quantidade === 0 && h.dataValidade <= dia(h.contadoEm));
    const chave = semLote ? SEM : h.dataValidade;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(h);
  }
  const doItem = new Map(lotes.map((l) => [dia(l.dataValidade), l]));
  const hoje = hojeIso();
  const lista = [...grupos.entries()].map(([chave, contagens]) => {
    // variacao: diferenca para a contagem imediatamente anterior (a lista vem da mais recente para a mais antiga)
    const linhas = contagens.map((c, i) => ({ ...c, anterior: contagens[i + 1] ? contagens[i + 1].quantidade : null }));
    const lote = chave === SEM ? null : doItem.get(chave) || null;
    return { chave, semProduto: chave === SEM, validade: chave === SEM ? null : chave, lote, linhas, vencido: chave !== SEM && chave <= hoje };
  });
  const ordem = (g) => (g.lote ? 0 : g.semProduto ? 2 : 1);
  return lista.sort((a, b) => ordem(a) - ordem(b) || (a.lote ? a.validade.localeCompare(b.validade) : (b.validade || "").localeCompare(a.validade || "")));
}

function Variacao({ atual, anterior }) {
  if (anterior == null) return <span className="text-xs text-neutral-400">1ª contagem</span>;
  const d = atual - anterior;
  if (d === 0) return <span className="text-xs text-neutral-500">= igual</span>;
  return <span className={clsx("text-xs font-semibold tabular-nums", d < 0 ? "text-success" : "text-warning")}>{d > 0 ? "+" : "−"}{fmtNum(Math.abs(d))}</span>;
}

/** Contagens de um lote em tabela: quando, quantidade, variacao e quem contou. */
function TabelaContagens({ g }) {
  const indiceUsada = g.lote
    ? g.linhas.findIndex((h) => g.lote.contadoEm === h.contadoEm && Number(g.lote.quantidade) === h.quantidade)
    : -1;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="text-left text-xs font-medium text-neutral-500">
          <tr className="border-t border-neutral-100">
            <th className="px-3 py-1.5">Quando</th>
            <th className="px-3 py-1.5 text-right">Qtd</th>
            <th className="px-3 py-1.5">Variação</th>
            <th className="whitespace-nowrap px-3 py-1.5">Quem contou</th>
            <th className="px-3 py-1.5" />
          </tr>
        </thead>
        <tbody>
          {g.linhas.map((h, i) => {
            // so a primeira linha que casa (registros duplicados da mesma contagem nao repetem a marca)
            const usada = i === indiceUsada;
            return (
              <tr key={i} className={clsx("border-t border-neutral-100", !usada && "text-neutral-600")}>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmtContagem(h.contadoEm)}</td>
                <td className={clsx("px-3 py-2 text-right tabular-nums", usada && "font-semibold text-neutral-900")}>{fmtNum(h.quantidade)}</td>
                <td className="whitespace-nowrap px-3 py-2">{g.semProduto ? null : <Variacao atual={h.quantidade} anterior={h.anterior} />}</td>
                <td className="px-3 py-2"><Agente nome={h.agente} codigo={h.agenteCodigo} /></td>
                <td className="px-3 py-2 text-right">{usada && <Badge tone="info">usada no painel</Badge>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * De onde veio a quantidade de um item do painel: os lotes (uma linha por data de validade, com
 * quem contou e quando, e se entra na soma) e o historico de contagens de cada lote.
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
  const lotes = useMemo(() => it?.lotes || [], [it]);
  const usados = lotes.filter((l) => l.entraNaSoma);
  const soma = usados.reduce((s, l) => s + (Number(l.quantidade) || 0), 0);
  const rede = formatarRede({ redeSubrede: item.redeSubrede, subrede: item.subrede, codigoRede: item.codigoRede });
  const seg = STATUS_SHELF_MAP[item.status] || STATUS_SHELF_MAP.sem_shelf;
  const antigos = lotes.filter((l) => l.naUltimaVisita === false);

  const historico = dados?.historico;
  const grupos = useMemo(() => (historico ? agruparPorLote(historico, lotes) : []), [historico, lotes]);

  // Contagem mais nova que o painel ainda nao processou (lote vigente ou registro de "sem produto")
  const diaUsado = lotes.map((l) => dia(l.contadoEm)).filter(Boolean).sort().pop() || null;
  const maisNova = historico && historico.length ? historico[0] : null;
  const haContagemNova = !!(
    maisNova && diaUsado && dia(maisNova.contadoEm) > diaUsado &&
    (maisNova.quantidade === 0 || (maisNova.dataValidade && maisNova.dataValidade > hojeIso()))
  );

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
                {" "}Cada lote vale pela sua última contagem.
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
              {antigos.length > 0 && (
                <p className="mt-2 text-xs text-neutral-500">
                  {antigos.length === 1 ? "Um lote não foi recontado" : `${antigos.length} lotes não foram recontados`} na última visita do produto:
                  {" "}{antigos.map((l) => fmtData(l.dataValidade)).join(", ")}. Continua{antigos.length === 1 ? "" : "m"} valendo a última contagem de cada um.
                </p>
              )}
            </section>

            {/* Historico por lote */}
            <section>
              <h3 className="text-sm font-semibold text-neutral-800">Histórico de contagem por lote</h3>
              <p className="mt-0.5 text-xs text-neutral-500">
                Todas as contagens deste produto nesta loja nos últimos {dados.diasHistorico || 60} dias, separadas por data de validade.
              </p>
              {historico === null ? (
                <p className="mt-2 rounded-lg border border-neutral-200 px-3 py-3 text-sm text-neutral-500">Histórico indisponível no momento.</p>
              ) : grupos.length === 0 ? (
                <p className="mt-2 rounded-lg border border-neutral-200 px-3 py-3 text-sm text-neutral-500">Nenhuma contagem no período.</p>
              ) : (
                <div className="mt-2 space-y-3">
                  {grupos.map((g) => {
                    const st = g.lote ? STATUS_SHELF_MAP[g.lote.status] || STATUS_SHELF_MAP.sem_shelf : null;
                    return (
                      <div key={g.chave} className="overflow-hidden rounded-xl border border-neutral-200" data-lote={g.validade || "sem-produto"}>
                        <div className="flex flex-wrap items-center gap-2 bg-neutral-50 px-3 py-2">
                          <span className="text-sm font-semibold text-neutral-800">
                            {g.semProduto ? "Visitas sem o produto na loja" : `Lote com validade ${fmtData(g.validade)}`}
                          </span>
                          {g.lote && <Badge tone={st.tone} dot>{st.label}</Badge>}
                          {g.lote && <span className="text-xs text-neutral-500">{g.lote.entraNaSoma ? "entra na soma" : "não entra na soma"}</span>}
                          {!g.lote && !g.semProduto && (
                            <Badge tone="neutral">{g.vencido ? "vencido" : g.linhas[0].quantidade === 0 ? "zerado" : "fora do painel"}</Badge>
                          )}
                          <span className="ml-auto text-xs text-neutral-500">{g.linhas.length} {g.linhas.length === 1 ? "contagem" : "contagens"}</span>
                        </div>
                        {g.semProduto || g.linhas.length < 2 ? (
                          // sem evolucao para desenhar (uma contagem so, ou visitas sem o produto): tabela direta
                          <TabelaContagens g={g} />
                        ) : (
                          <>
                            <div className="overflow-x-auto border-t border-neutral-100 px-3 pb-1 pt-2">
                              <LoteHistoricoChart
                                contagens={g.linhas}
                                tone={st ? st.tone : "neutral"}
                                usadaEm={g.lote ? g.lote.contadoEm : null}
                                rotulo={`Quantidade do lote com validade ${fmtData(g.validade)} a cada contagem`}
                              />
                            </div>
                            <details className="border-t border-neutral-100">
                              <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-secondary hover:underline">
                                Ver em tabela (quem contou e variação)
                              </summary>
                              <TabelaContagens g={g} />
                            </details>
                          </>
                        )}
                      </div>
                    );
                  })}
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
