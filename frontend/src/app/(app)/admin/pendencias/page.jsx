"use client";

import { useEffect, useState } from "react";
import { useTituloDaPagina } from "@/components/PageTitleContext";
import api from "@/lib/api";
import { fmtData, fmtDataHora } from "@/lib/utils";
import { PERFIL_LABEL } from "@/lib/permissoes";
import { TONE } from "@/lib/tones";
import Surface from "@/components/ui/Surface";
import Badge from "@/components/ui/Badge";
import StatTile from "@/components/ui/StatTile";
import Skeleton from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import { IcoCheck, IcoUsers, IcoAlert } from "@/components/Icons";
import { EVENTO } from "@/components/pendencias/PendenciaCard";

const PERIODOS = [7, 30, 90];
const msgErro = (err, padrao) => err?.response?.data?.error || padrao;

function tonePct(v) {
  if (v >= 80) return "success";
  if (v >= 50) return "warning";
  return "danger";
}

function Pct({ v }) {
  const cor = v == null ? "text-neutral-400" : TONE[tonePct(v)].text;
  return <span className={`font-medium tabular-nums ${cor}`}>{v == null ? "—" : `${v}%`}</span>;
}

export default function AcompanhamentoPendenciasPage() {
  useTituloDaPagina("Acompanhamento de pendências", "Por vendedor e supervisor: enviadas, vistas e com ação");
  const [dias, setDias] = useState(30);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let vivo = true;
    setDados(null);
    setErro("");
    api.get("/pendencias/acompanhamento", { params: { dias } })
      .then(({ data }) => { if (vivo) setDados(data); })
      .catch((err) => { if (vivo) { setErro(msgErro(err, "Não foi possível carregar o acompanhamento.")); setDados({ usuarios: [], semAcao48h: [], totais: {} }); } });
    return () => { vivo = false; };
  }, [dias]);

  const carregando = dados === null;
  const t = dados?.totais || {};
  const pctAcao = t.enviadas ? Math.round((t.comAcao / t.enviadas) * 100) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período">
        {PERIODOS.map((d) => (
          <button key={d} type="button" aria-pressed={dias === d} onClick={() => setDias(d)} className={`chip ${dias === d ? "chip-active" : ""}`}>
            {d} dias
          </button>
        ))}
        {!carregando && dados.desde && <span className="ml-auto text-xs text-neutral-500">desde {fmtData(dados.desde)}</span>}
      </div>

      {erro && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Pendências enviadas" valor={carregando ? "…" : t.enviadas ?? 0} />
        <StatTile label="Com ação" valor={carregando ? "…" : t.comAcao ?? 0} apoio={pctAcao != null ? `${pctAcao}% das enviadas` : undefined} tone={pctAcao != null ? tonePct(pctAcao) : "neutral"} />
        <StatTile label="Sem ação há mais de 48 h" valor={carregando ? "…" : t.semAcao48h ?? 0} tone={t.semAcao48h ? "danger" : "neutral"} destaque={!!t.semAcao48h} />
        <StatTile label="Destinatários" valor={carregando ? "…" : (dados.usuarios || []).length} />
      </div>

      {/* Destaque: sem acao ha mais de 48 h */}
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
          <IcoAlert className="h-4 w-4 text-danger" aria-hidden />
          Sem ação há mais de 48 horas
        </h2>
        {carregando ? (
          <Skeleton className="h-28" />
        ) : dados.semAcao48h.length === 0 ? (
          <Surface><EmptyState icon={IcoCheck} titulo="Nenhuma pendência parada" descricao="Todas as pendências do período tiveram ação em até 48 horas ou ainda estão no prazo." /></Surface>
        ) : (
          <Surface className="overflow-x-auto border-danger/30">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-danger/5 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Evento</th>
                  <th className="px-4 py-2.5 font-semibold">Loja</th>
                  <th className="px-4 py-2.5 font-semibold">Produto</th>
                  <th className="px-4 py-2.5 font-semibold">Enviada em</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Horas</th>
                  <th className="px-4 py-2.5 font-semibold">Destinatários</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {dados.semAcao48h.map((p) => {
                  const ev = EVENTO[p.evento] || EVENTO.rebaixa;
                  return (
                    <tr key={p._id} className="align-top">
                      <td className="px-4 py-2.5"><Badge tone={ev.tone}>{ev.label}</Badge></td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-neutral-900">{p.cliente || p.clienteCodigo}</div>
                        <div className="text-xs text-neutral-500">{p.redeSubrede ? `${p.redeSubrede} · ` : ""}cód. {p.clienteCodigo}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="text-neutral-800">{p.produto || p.produtoCodigo}</div>
                        {p.evento !== "ruptura" && <div className="text-xs text-neutral-500">{p.quantidade} un · vence {fmtData(p.dataValidade)}</div>}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-neutral-700">{fmtDataHora(p.enviadaEm)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-danger">{p.horasSemAcao}h</td>
                      <td className="px-4 py-2.5">
                        <ul className="space-y-0.5 text-xs">
                          {p.destinatarios.map((d) => (
                            <li key={d.userId} className="flex items-center gap-1.5">
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${d.vistaEm ? "bg-success" : "bg-neutral-300"}`} aria-hidden />
                              <span className="text-neutral-800">{d.nome}</span>
                              <span className="text-neutral-500">({PERFIL_LABEL[d.papel] || d.papel})</span>
                              <span className={d.vistaEm ? "text-success" : "text-neutral-400"}>{d.vistaEm ? `viu ${fmtDataHora(d.vistaEm)}` : "não viu"}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Surface>
        )}
      </section>

      {/* Tabela por destinatario */}
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
          <IcoUsers className="h-4 w-4 text-neutral-500" aria-hidden />
          Por vendedor e supervisor
        </h2>
        {carregando ? (
          <Skeleton className="h-40" />
        ) : dados.usuarios.length === 0 ? (
          <Surface><EmptyState icon={IcoUsers} titulo="Nenhuma pendência no período" descricao="Mude o período ou aguarde a próxima sincronização." /></Surface>
        ) : (
          <Surface className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Usuário</th>
                  <th className="px-4 py-2.5 font-semibold">Papel</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Enviadas</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Vistas</th>
                  <th className="px-4 py-2.5 text-right font-semibold">% vistas</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Com ação</th>
                  <th className="px-4 py-2.5 text-right font-semibold">% com ação</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Sem ação 48 h</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {dados.usuarios.map((u) => (
                  <tr key={u.userId} className={u.semAcao48h ? "bg-danger/5" : undefined}>
                    <td className="px-4 py-2.5 font-medium text-neutral-900">{u.nome || u.userId}</td>
                    <td className="px-4 py-2.5 text-neutral-600">{PERFIL_LABEL[u.papel] || u.papel}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-neutral-800">{u.enviadas}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-neutral-800">{u.vistas}</td>
                    <td className="px-4 py-2.5 text-right"><Pct v={u.pctVistas} /></td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-neutral-800">{u.comAcao}</td>
                    <td className="px-4 py-2.5 text-right"><Pct v={u.pctComAcao} /></td>
                    <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${u.semAcao48h ? "text-danger" : "text-neutral-400"}`}>{u.semAcao48h}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Surface>
        )}
      </section>
    </div>
  );
}
