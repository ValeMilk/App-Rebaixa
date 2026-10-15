"use client";
import { useTituloDaPagina } from "@/components/PageTitleContext";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { pode } from "@/lib/permissoes";
import {
  DIAS_CURTOS, hojeStr, somarDias, segundaDe, indiceDoDia, diaDoMes, dm, rotuloSemana, minutos, hhmm,
  corDaVisita, tituloVisita, nomesRedes, distribuirColunas, textoParaWhatsapp,
} from "@/lib/agenda";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import VisitaDialog from "@/components/agenda/VisitaDialog";
import { IcoChevronRight } from "@/components/Icons";

const PX_HORA = 56;
const HORA_INICIAL = 6;
const HORA_FINAL = 20;
const msgErro = (err, padrao) => err?.response?.data?.error || err?.message || padrao;
const primeiroNome = (n) => String(n || "").trim().split(/\s+/)[0] || "";

export default function AgendaPage() {
  useTituloDaPagina("Agenda de Visitas", "Planejamento semanal por cidade");
  const { user } = useAuth();
  const gerencia = pode(user, "agenda_visitas.gerenciar");
  const verTodas = pode(user, "agenda_visitas.ver_todas");
  const ehAdmin = user?.role === "admin";

  const [segunda, setSegunda] = useState(() => segundaDe(hojeStr()));
  const [donoSel, setDonoSel] = useState(null); // codigo | "todos" (so quem ve todas)
  const [donos, setDonos] = useState([]);
  const [cidades, setCidades] = useState([]);
  const [visitas, setVisitas] = useState(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [dialogo, setDialogo] = useState(null); // { valor }
  const [copiando, setCopiando] = useState(false);
  const gradeRef = useRef(null);

  // Quem aparece escolhido ao abrir: o proprio supervisor; os demais (diretoria/admin) veem todos
  useEffect(() => {
    if (!user || donoSel !== null) return;
    setDonoSel(verTodas ? (gerencia && user.role === "supervisor" ? user.codigo : "todos") : user.codigo);
  }, [user, verTodas, gerencia, donoSel]);

  useEffect(() => {
    if (verTodas) api.get("/agenda/donos").then(({ data }) => setDonos(data.donos || [])).catch(() => {});
    if (gerencia) api.get("/agenda/cidades").then(({ data }) => setCidades(data.cidades || [])).catch(() => {});
  }, [verTodas, gerencia]);

  const carregar = useCallback(async () => {
    if (donoSel === null) return;
    setErro("");
    try {
      const params = { de: segunda, ate: somarDias(segunda, 6) };
      if (verTodas) params.dono = donoSel;
      const { data } = await api.get("/agenda", { params });
      setVisitas(data.visitas || []);
    } catch (err) {
      setErro(msgErro(err, "Não foi possível carregar a agenda."));
      setVisitas([]);
    }
  }, [segunda, donoSel, verTodas]);

  useEffect(() => { setVisitas(null); carregar(); }, [carregar]);

  // Quem recebe a visita nova: o proprio usuario; o admin escolhe o supervisor no seletor
  const podeCriar = gerencia && (!ehAdmin || (donoSel && donoSel !== "todos"));
  const podeEditar = (v) => gerencia && (ehAdmin || v.donoCodigo === user?.codigo);
  const donoNomeAlvo = ehAdmin && donoSel && donoSel !== "todos" ? donos.find((d) => d.codigo === donoSel)?.nome : null;
  const mostrarDono = verTodas && donoSel === "todos";

  const hoje = hojeStr();
  const domingoComVisita = (visitas || []).some((v) => indiceDoDia(v.data) === 6);
  const nDias = domingoComVisita ? 7 : 6;
  const dias = useMemo(() => Array.from({ length: nDias }, (_, i) => somarDias(segunda, i)), [segunda, nDias]);

  // Faixa de horas: 6h-20h, ampliada se alguma visita sair dela
  const [horaIni, horaFim] = useMemo(() => {
    let a = HORA_INICIAL;
    let b = HORA_FINAL;
    for (const v of visitas || []) {
      if (v.diaInteiro) continue;
      a = Math.min(a, Math.floor(minutos(v.inicio) / 60));
      b = Math.max(b, Math.ceil(minutos(v.fim) / 60));
    }
    return [a, Math.min(b, 24)];
  }, [visitas]);
  const alturaGrade = (horaFim - horaIni) * PX_HORA;

  const porDia = useMemo(() => {
    const m = new Map(dias.map((d) => [d, { inteiro: [], horario: [] }]));
    for (const v of visitas || []) {
      const g = m.get(v.data);
      if (!g) continue;
      if (v.diaInteiro) g.inteiro.push(v);
      else g.horario.push({ ...v, iniMin: minutos(v.inicio), fimMin: minutos(v.fim) });
    }
    for (const g of m.values()) g.horario = distribuirColunas(g.horario);
    return m;
  }, [visitas, dias]);

  // Ao abrir a semana, rola a grade para o comeco do dia de trabalho
  useEffect(() => {
    if (gradeRef.current) gradeRef.current.scrollTop = Math.max(0, (7 - horaIni) * PX_HORA - 8);
  }, [visitas === null]); // eslint-disable-line react-hooks/exhaustive-deps

  function novaVisita(extra = {}) {
    if (!podeCriar) {
      if (gerencia && ehAdmin) setAviso("Escolha um supervisor no seletor para marcar visitas na agenda dele.");
      return;
    }
    setAviso("");
    const dentro = hoje >= segunda && hoje <= somarDias(segunda, 6);
    setDialogo({ valor: { data: dentro ? hoje : segunda, diaInteiro: true, inicio: "08:00", fim: "12:00", cidade: "", lojas: [], observacao: "", ...extra } });
  }

  function clicarNaColuna(e, data) {
    if (e.target !== e.currentTarget) return;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const min = Math.min(horaIni * 60 + Math.floor((y / PX_HORA) * 2) * 30, 23 * 60);
    novaVisita({ data, diaInteiro: false, inicio: hhmm(min), fim: hhmm(Math.min(min + 60, 24 * 60 - 1)) });
  }

  async function salvar(dados) {
    const corpo = { ...dados };
    if (ehAdmin && donoSel && donoSel !== "todos") corpo.donoCodigo = donoSel;
    const editando = dialogo.valor.id;
    if (editando) await api.put(`/agenda/${editando}`, corpo);
    else await api.post("/agenda", corpo);
    setDialogo(null);
    setAviso(editando ? "Visita atualizada." : "Visita marcada.");
    api.get("/agenda/cidades").then(({ data }) => setCidades(data.cidades || [])).catch(() => {});
    const alvo = segundaDe(dados.data);
    if (alvo !== segunda) setSegunda(alvo);
    else carregar();
  }

  async function excluir() {
    const v = dialogo.valor;
    if (!confirm(`Excluir a visita: ${tituloVisita(v)}?`)) return;
    try {
      await api.delete(`/agenda/${v.id}`);
      setDialogo(null);
      setAviso("Visita excluída.");
      carregar();
    } catch (err) {
      setErro(msgErro(err, "Não foi possível excluir a visita."));
      setDialogo(null);
    }
  }

  async function copiarSemanaAnterior() {
    setErro("");
    setAviso("");
    setCopiando(true);
    try {
      const corpo = { de: somarDias(segunda, -7), para: segunda };
      if (ehAdmin) corpo.donoCodigo = donoSel;
      const { data } = await api.post("/agenda/copiar-semana", corpo);
      if (data.deOrigem === 0) setAviso("A semana anterior não tem visitas para copiar.");
      else if (data.copiadas === 0) setAviso("As visitas da semana anterior já estão nesta semana.");
      else setAviso(`${data.copiadas} ${data.copiadas === 1 ? "visita copiada" : "visitas copiadas"} da semana anterior${data.ignoradas ? ` (${data.ignoradas} já existiam)` : ""}.`);
      carregar();
    } catch (err) {
      setErro(msgErro(err, "Não foi possível copiar a semana."));
    } finally {
      setCopiando(false);
    }
  }

  async function copiarTexto() {
    setErro("");
    const texto = textoParaWhatsapp({ segunda, visitas: visitas || [], dias: nDias });
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const t = document.createElement("textarea");
      t.value = texto;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    setAviso("Agenda copiada. É só colar no WhatsApp.");
  }

  function abrirVisita(v) {
    setAviso("");
    setDialogo({ valor: v, somenteLeitura: !podeEditar(v) });
  }

  if (!user || donoSel === null) {
    return <Skeleton className="h-[480px] w-full" />;
  }

  const colunas = { gridTemplateColumns: `52px repeat(${nDias}, minmax(0, 1fr))` };
  const semVisitas = visitas && visitas.length === 0;

  // Botao/etiqueta de uma visita (grade e lista usam o mesmo conteudo)
  const rotuloVisita = (v) => (mostrarDono ? `${primeiroNome(v.donoNome)} · ${tituloVisita(v)}` : tituloVisita(v));
  // linha de baixo: as redes/subredes da visita (quando a visita tem cidade, que e o titulo)
  const complemento = (v) => (v.cidade ? nomesRedes(v) : "");

  return (
    <div className="space-y-3">
      {/* Barra de ferramentas */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setSegunda(segundaDe(hoje))} id="btn-hoje">Hoje</Button>
        <div className="flex items-center">
          <Button variant="ghost" size="icon-sm" onClick={() => setSegunda((s) => somarDias(s, -7))} aria-label="Semana anterior" id="btn-anterior"><IcoChevronRight className="h-4 w-4 rotate-180" /></Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setSegunda((s) => somarDias(s, 7))} aria-label="Próxima semana" id="btn-proxima"><IcoChevronRight className="h-4 w-4" /></Button>
        </div>
        <h2 className="text-base font-semibold text-neutral-900" id="rotulo-semana">{rotuloSemana(segunda, nDias)}</h2>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {verTodas && (
            <select className="input h-9 w-auto min-w-[200px] py-0 text-sm" value={donoSel} onChange={(e) => setDonoSel(e.target.value)} aria-label="Supervisor" id="sel-supervisor">
              <option value="todos">Todos os supervisores</option>
              {donos.map((d) => <option key={d.codigo} value={d.codigo}>{d.nome}</option>)}
            </select>
          )}
          {gerencia && (
            <Button variant="outline" size="sm" onClick={copiarSemanaAnterior} disabled={copiando || !podeCriar} id="btn-copiar-semana">
              {copiando ? "Copiando..." : "Copiar semana anterior"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={copiarTexto} disabled={!visitas} id="btn-copiar-texto">Copiar para WhatsApp</Button>
          {gerencia && <Button size="sm" onClick={() => novaVisita()} id="btn-nova-visita">+ Nova visita</Button>}
        </div>
      </div>

      {erro && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
      {aviso && <p role="status" className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success" id="aviso-agenda">{aviso}</p>}
      {gerencia && ehAdmin && !podeCriar && (
        <p className="text-xs text-neutral-500">Escolha um supervisor no seletor para marcar visitas na agenda dele.</p>
      )}

      {!visitas ? (
        <Skeleton className="h-[480px] w-full" />
      ) : (
        <>
          {/* Visao em grade (computador) */}
          <div className="hidden overflow-hidden rounded-xl border border-neutral-200 bg-white md:block" id="agenda-grade">
            <div className="grid border-b border-neutral-200" style={colunas}>
              <div />
              {dias.map((d) => (
                <div key={d} className="border-l border-neutral-100 py-2 text-center" data-cabecalho={d}>
                  <div className={`text-[11px] font-semibold uppercase tracking-wide ${d === hoje ? "text-secondary" : "text-neutral-500"}`}>{DIAS_CURTOS[indiceDoDia(d)]}</div>
                  <div className={`mx-auto mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-base ${d === hoje ? "bg-secondary font-semibold text-white" : "text-neutral-800"}`}>{diaDoMes(d)}</div>
                </div>
              ))}
            </div>

            {/* Dia inteiro */}
            <div className="grid border-b border-neutral-200" style={colunas}>
              <div className="flex items-center justify-end pr-2 text-[10px] leading-tight text-neutral-400">dia inteiro</div>
              {dias.map((d) => (
                <div
                  key={d}
                  data-diainteiro={d}
                  onClick={(e) => { if (e.target === e.currentTarget) novaVisita({ data: d, diaInteiro: true }); }}
                  className={`min-h-[44px] space-y-1 border-l border-neutral-100 p-1 ${podeCriar ? "cursor-pointer hover:bg-neutral-50" : ""}`}
                >
                  {porDia.get(d).inteiro.map((v) => {
                    const cor = corDaVisita(v);
                    return (
                      <button
                        key={v.id} type="button" data-visita={v.id} onClick={() => abrirVisita(v)}
                        className={`block w-full rounded-md px-2 py-1 text-left text-xs font-medium ${cor.bg} ${cor.text} hover:opacity-90`}
                        title={[tituloVisita(v), complemento(v), v.lojas.length ? `${v.lojas.length} lojas` : ""].filter(Boolean).join(" · ")}
                      >
                        <span className="block truncate">
                          {rotuloVisita(v)}
                          {v.lojas.length > 0 && <span className="ml-1 opacity-80">· {v.lojas.length}</span>}
                        </span>
                        {complemento(v) && <span className="block truncate text-[10px] font-normal opacity-90">{complemento(v)}</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Horas */}
            <div ref={gradeRef} className="max-h-[62vh] overflow-y-auto">
              <div className="grid" style={colunas}>
                <div className="relative" style={{ height: alturaGrade }}>
                  {Array.from({ length: horaFim - horaIni }, (_, i) => (
                    <div key={i} className="absolute right-2 -translate-y-1/2 text-[10px] text-neutral-400" style={{ top: i * PX_HORA, display: i === 0 ? "none" : "block" }}>
                      {String(horaIni + i).padStart(2, "0")}:00
                    </div>
                  ))}
                </div>
                {dias.map((d) => (
                  <div
                    key={d}
                    data-coluna={d}
                    onClick={(e) => clicarNaColuna(e, d)}
                    className={`relative border-l border-neutral-100 ${podeCriar ? "cursor-pointer" : ""} ${d === hoje ? "bg-secondary/[0.03]" : ""}`}
                    style={{ height: alturaGrade }}
                  >
                    {Array.from({ length: horaFim - horaIni }, (_, i) => (
                      <div key={i} className="pointer-events-none absolute inset-x-0 border-t border-neutral-100" style={{ top: i * PX_HORA }} />
                    ))}
                    {porDia.get(d).horario.map((v) => {
                      const cor = corDaVisita(v);
                      const top = ((v.iniMin - horaIni * 60) / 60) * PX_HORA;
                      const altura = Math.max(((v.fimMin - v.iniMin) / 60) * PX_HORA, 24);
                      return (
                        <button
                          key={v.id} type="button" data-visita={v.id} onClick={() => abrirVisita(v)}
                          className={`absolute overflow-hidden rounded-md px-1.5 py-1 text-left text-xs leading-tight shadow-sm ring-1 ring-white ${cor.bg} ${cor.text} hover:opacity-90`}
                          style={{ top, height: altura - 2, left: `calc(${(v.col / v.cols) * 100}% + 2px)`, width: `calc(${100 / v.cols}% - 4px)` }}
                          title={[`${v.inicio} às ${v.fim}`, tituloVisita(v), complemento(v)].filter(Boolean).join(" · ")}
                        >
                          <span className="block truncate font-semibold">{rotuloVisita(v)}</span>
                          {complemento(v) && <span className="block truncate text-[10px] opacity-90">{complemento(v)}</span>}
                          <span className="block truncate opacity-90">{v.inicio} – {v.fim}{v.lojas.length ? ` · ${v.lojas.length} ${v.lojas.length === 1 ? "loja" : "lojas"}` : ""}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Visao em lista (celular) */}
          <div className="space-y-3 md:hidden" id="agenda-lista">
            {dias.map((d) => {
              const g = porDia.get(d);
              const todas = [...g.inteiro, ...g.horario];
              return (
                <section key={d} data-dia-lista={d} className={`rounded-xl border bg-white ${d === hoje ? "border-secondary/40" : "border-neutral-200"}`}>
                  <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2">
                    <h3 className={`text-sm font-semibold ${d === hoje ? "text-secondary" : "text-neutral-800"}`}>{DIAS_CURTOS[indiceDoDia(d)]} {dm(d)}</h3>
                    {podeCriar && (
                      <button type="button" className="text-xs font-medium text-secondary hover:underline" onClick={() => novaVisita({ data: d, diaInteiro: true })}>+ Visita</button>
                    )}
                  </div>
                  {todas.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-neutral-400">Sem visitas</p>
                  ) : (
                    <ul className="divide-y divide-neutral-100">
                      {todas.map((v) => {
                        const cor = corDaVisita(v);
                        return (
                          <li key={v.id}>
                            <button type="button" data-visita-lista={v.id} onClick={() => abrirVisita(v)} className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-neutral-50">
                              <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${cor.bg}`} aria-hidden />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-neutral-900">{rotuloVisita(v)}</span>
                                <span className="block text-xs text-neutral-500">
                                  {v.diaInteiro ? "Dia inteiro" : `${v.inicio} às ${v.fim}`}
                                  {v.lojas.length ? ` · ${v.lojas.length} ${v.lojas.length === 1 ? "loja" : "lojas"}` : ""}
                                </span>
                                {complemento(v) && <span className="mt-0.5 block text-xs text-neutral-500">{complemento(v)}</span>}
                                {v.observacao && <span className="mt-0.5 block truncate text-xs text-neutral-400">{v.observacao}</span>}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>

          {semVisitas && (
            <p className="text-center text-sm text-neutral-500" id="agenda-vazia">
              {gerencia ? "Nenhuma visita nesta semana. Clique num dia da agenda (ou em + Nova visita) para marcar a primeira." : "Nenhuma visita marcada nesta semana."}
            </p>
          )}
        </>
      )}

      {dialogo && (
        <VisitaDialog
          valor={dialogo.valor}
          cidades={cidades}
          donoNome={donoNomeAlvo}
          donoCodigo={ehAdmin && donoSel && donoSel !== "todos" ? donoSel : undefined}
          somenteLeitura={!!dialogo.somenteLeitura}
          podeExcluir={!dialogo.somenteLeitura && !!dialogo.valor.id}
          onSalvar={salvar}
          onExcluir={excluir}
          onClose={() => setDialogo(null)}
        />
      )}
    </div>
  );
}
