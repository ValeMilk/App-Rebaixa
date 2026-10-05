"use client";
import { useTituloDaPagina } from "@/components/PageTitleContext";

import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { fmtData, fmtDataHora } from "@/lib/utils";
import Surface from "@/components/ui/Surface";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Dialog from "@/components/ui/Dialog";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import { IcoStore, IcoSearch, IcoX } from "@/components/Icons";

const msgErro = (err, padrao) => err?.response?.data?.error || padrao;
const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Formulario de criar/editar rede: nome, supervisores e lojas
function RedeDialog({ rede, opcoes, onClose, onSalvo }) {
  const [nome, setNome] = useState(rede?.nome || "");
  // Rede nova (com nome proprio) ou lojas a mais numa rede que ja existe no Lacteus
  const [tipo, setTipo] = useState("nova");
  const [codigoLacteus, setCodigoLacteus] = useState("");
  const doLacteus = rede ? !!rede.doLacteus : tipo === "lacteus";
  const [supervisores, setSupervisores] = useState(() => new Set((rede?.supervisores || []).map((s) => s.id)));
  const [lojas, setLojas] = useState(() => new Map((rede?.lojas || []).map((l) => [l.clienteCodigo, l.clienteNome])));
  const [busca, setBusca] = useState("");
  const [soMarcadas, setSoMarcadas] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  // Lojas que podem ser escolhidas: as livres do Ativmob + as que ja sao desta rede
  const candidatas = useMemo(() => {
    const mapa = new Map();
    for (const l of rede?.lojas || []) mapa.set(l.clienteCodigo, { clienteCodigo: l.clienteCodigo, clienteNome: l.clienteNome, ultimaContagem: null, noLacteus: l.noLacteus });
    for (const l of opcoes.lojas) {
      if (l.rede && l.rede.codigoRede !== rede?.codigoRede) continue; // ja esta em outra rede do InfoVale
      mapa.set(l.clienteCodigo, { ...mapa.get(l.clienteCodigo), ...l });
    }
    return [...mapa.values()].sort((a, b) => a.clienteNome.localeCompare(b.clienteNome, "pt-BR"));
  }, [opcoes.lojas, rede]);

  const visiveis = useMemo(() => {
    const q = semAcento(busca.trim());
    return candidatas.filter((l) => (!soMarcadas || lojas.has(l.clienteCodigo)) && (!q || semAcento(l.clienteNome).includes(q) || l.clienteCodigo.includes(q)));
  }, [candidatas, busca, soMarcadas, lojas]);

  function alternarSupervisor(id) {
    setSupervisores((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function alternarLoja(l) {
    setLojas((m) => { const n = new Map(m); n.has(l.clienteCodigo) ? n.delete(l.clienteCodigo) : n.set(l.clienteCodigo, l.clienteNome); return n; });
  }
  function marcarVisiveis(marcar) {
    setLojas((m) => { const n = new Map(m); for (const l of visiveis) marcar ? n.set(l.clienteCodigo, l.clienteNome) : n.delete(l.clienteCodigo); return n; });
  }

  // Ao escolher a rede do Lacteus, sugere os supervisores que ja a tem na carteira
  function escolherRedeLacteus(codigo) {
    setCodigoLacteus(codigo);
    const escolhida = opcoes.redesLacteus.find((r) => r.codigoRede === codigo);
    if (escolhida) setSupervisores(new Set(opcoes.supervisores.filter((s) => escolhida.supervisoresCodigos.includes(s.codigo)).map((s) => s.id)));
  }

  const redeLacteus = opcoes.redesLacteus.find((r) => r.codigoRede === codigoLacteus);
  const nomeFinal = rede ? (rede.doLacteus ? rede.nome : nome.trim()) : doLacteus ? redeLacteus?.nome || "" : nome.trim();

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setErro("");
    const corpo = { supervisores: [...supervisores], lojas: [...lojas].map(([clienteCodigo, clienteNome]) => ({ clienteCodigo, clienteNome })) };
    if (!rede && doLacteus) corpo.codigoRedeLacteus = codigoLacteus;
    else corpo.nome = nome;
    try {
      const { data } = rede ? await api.put(`/redes-infovale/${rede.id}`, corpo) : await api.post("/redes-infovale", corpo);
      onSalvo(data.redes, rede ? `Rede ${nomeFinal} atualizada.` : doLacteus ? `Lojas adicionadas à rede ${nomeFinal}.` : `Rede ${nomeFinal} criada.`);
    } catch (err) {
      setErro(msgErro(err, "Não foi possível salvar a rede."));
      setSalvando(false);
    }
  }

  const todasVisiveisMarcadas = visiveis.length > 0 && visiveis.every((l) => lojas.has(l.clienteCodigo));

  return (
    <Dialog open onClose={onClose} sheet size="lg" ariaLabel={rede ? "Editar rede" : "Nova rede"}>
      <form onSubmit={salvar} className="flex min-h-0 flex-1 flex-col" id="form-rede">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-neutral-200 px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">{rede ? "Editar rede" : "Nova rede"}</h2>
            <p className="mt-0.5 text-xs text-neutral-500">Para lojas que estão no Ativmob e não existem no Lacteus.</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fechar"><IcoX className="h-4 w-4" /></Button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {erro && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}

          {!rede && (
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 p-1" role="group" aria-label="Tipo de rede">
              {[["nova", "Rede nova"], ["lacteus", "Rede que já existe no Lacteus"]].map(([valor, rotulo]) => (
                <button
                  key={valor} type="button" aria-pressed={tipo === valor} onClick={() => setTipo(valor)} data-tipo={valor}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${tipo === valor ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600 hover:text-neutral-900"}`}
                >
                  {rotulo}
                </button>
              ))}
            </div>
          )}

          {doLacteus ? (
            <div>
              <label htmlFor="rede-lacteus" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Rede do Lacteus</label>
              {rede ? (
                <p className="text-sm font-medium text-neutral-800">{rede.nome} <span className="font-normal text-neutral-500">· cód. {rede.codigoRede}</span></p>
              ) : (
                <select id="rede-lacteus" className="input" value={codigoLacteus} onChange={(e) => escolherRedeLacteus(e.target.value)} required>
                  <option value="">Selecione a rede...</option>
                  {opcoes.redesLacteus.map((r) => <option key={r.codigoRede} value={r.codigoRede}>{r.nome}</option>)}
                </select>
              )}
              <p className="mt-1.5 text-xs text-neutral-500">As lojas escolhidas abaixo se somam às que a rede já tem no Lacteus. Nada muda no Lacteus.</p>
            </div>
          ) : (
            <div>
              <label htmlFor="rede-nome" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Nome da rede</label>
              <input id="rede-nome" className="input" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} placeholder="Ex.: Mega Supermercados" required autoFocus={!rede} />
            </div>
          )}

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Supervisores <span className="font-normal normal-case text-neutral-400">({doLacteus ? "as lojas adicionadas entram na carteira de cada um" : "a rede entra na carteira de cada um"})</span>
            </p>
            {opcoes.supervisores.length === 0 ? (
              <p className="text-sm text-neutral-500">Nenhum supervisor ativo cadastrado.</p>
            ) : (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Supervisores da rede">
                {opcoes.supervisores.map((s) => {
                  const marcado = supervisores.has(s.id);
                  return (
                    <button
                      key={s.id} type="button" aria-pressed={marcado} onClick={() => alternarSupervisor(s.id)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${marcado ? "border-secondary bg-secondary text-white" : "border-neutral-200 bg-white text-neutral-600 hover:border-secondary/50"}`}
                    >
                      {s.nome}
                    </button>
                  );
                })}
              </div>
            )}
            {supervisores.size === 0 && opcoes.supervisores.length > 0 && (
              <p className="mt-1.5 text-xs text-neutral-500">Sem supervisor, só diretoria e administrador veem {doLacteus ? "estas lojas" : "as lojas desta rede"}.</p>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Lojas <span className="font-normal normal-case text-neutral-400">({lojas.size} {lojas.size === 1 ? "selecionada" : "selecionadas"})</span>
              </p>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-600">
                <input type="checkbox" className="h-3.5 w-3.5 rounded border-neutral-300 accent-secondary" checked={soMarcadas} onChange={(e) => setSoMarcadas(e.target.checked)} />
                Só as selecionadas
              </label>
            </div>
            <div className="relative">
              <IcoSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input className="input pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar loja por nome ou código" aria-label="Buscar loja" />
            </div>
            <div className="mt-2 overflow-hidden rounded-lg border border-neutral-200">
              {visiveis.length > 0 && (
                <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-600">
                  <span>{visiveis.length} {visiveis.length === 1 ? "loja" : "lojas"}{busca.trim() ? " na busca" : ""}</span>
                  <button type="button" className="text-secondary underline-offset-4 hover:underline" onClick={() => marcarVisiveis(!todasVisiveisMarcadas)}>
                    {todasVisiveisMarcadas ? "Desmarcar todas" : "Marcar todas"}
                  </button>
                </div>
              )}
              <ul className="max-h-72 divide-y divide-neutral-100 overflow-y-auto" id="lista-lojas">
                {visiveis.map((l) => (
                  <li key={l.clienteCodigo}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-neutral-50">
                      <input type="checkbox" className="h-4 w-4 shrink-0 rounded border-neutral-300 accent-secondary" checked={lojas.has(l.clienteCodigo)} onChange={() => alternarLoja(l)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-neutral-800">{l.clienteNome}</span>
                        <span className="block text-[11px] text-neutral-500">
                          Cód. {l.clienteCodigo}
                          {l.ultimaContagem && ` · última contagem ${fmtData(l.ultimaContagem)}`}
                        </span>
                      </span>
                      {l.noLacteus && <Badge tone="warning" title="Esta loja passou a existir no Lacteus; vale a rede do Lacteus.">No Lacteus: {l.noLacteus}</Badge>}
                    </label>
                  </li>
                ))}
                {visiveis.length === 0 && (
                  <li className="px-3 py-6 text-center text-sm text-neutral-500">
                    {candidatas.length === 0 ? "Não há lojas do Ativmob fora do Lacteus disponíveis." : "Nenhuma loja corresponde à busca."}
                  </li>
                )}
              </ul>
            </div>
            <p className="mt-1.5 text-xs text-neutral-500">Aparecem as lojas com contagem no Ativmob nos últimos 90 dias que não estão no Lacteus nem em outra rede do InfoVale.</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-neutral-200 px-5 py-3">
          <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button type="submit" disabled={salvando || !nomeFinal || lojas.size === 0}>{salvando ? "Salvando..." : rede ? "Salvar rede" : doLacteus ? "Adicionar lojas" : "Criar rede"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function RedesInfovalePage() {
  useTituloDaPagina("Redes InfoVale", "Redes criadas aqui para lojas que só existem no Ativmob");

  const [redes, setRedes] = useState(null);
  const [opcoes, setOpcoes] = useState(null);
  const [form, setForm] = useState(null); // null | { rede } (rede null = nova)
  const [abrindo, setAbrindo] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/redes-infovale");
        setRedes(data.redes || []);
      } catch (err) {
        setErro(msgErro(err, "Não foi possível carregar as redes."));
        setRedes([]);
      }
    })();
  }, []);

  // As opcoes (lojas livres e supervisores) sao lidas a cada abertura do formulario
  async function abrir(rede) {
    setAbrindo(true);
    setErro("");
    setAviso("");
    try {
      const { data } = await api.get("/redes-infovale/opcoes");
      setOpcoes(data);
      setForm({ rede });
    } catch (err) {
      setErro(msgErro(err, "Não foi possível carregar as lojas do Ativmob."));
    } finally {
      setAbrindo(false);
    }
  }

  async function excluir(rede) {
    const pergunta = rede.doLacteus
      ? `Tirar da rede ${rede.nome} as ${rede.lojas.length} lojas adicionadas aqui? Elas voltam a ficar sem rede; a rede continua existindo no Lacteus.`
      : `Excluir a rede ${rede.nome}? As ${rede.lojas.length} lojas dela voltam a ficar sem rede.`;
    if (!confirm(pergunta)) return;
    setErro("");
    setAviso("");
    try {
      const { data } = await api.delete(`/redes-infovale/${rede.id}`);
      setRedes(data.redes || []);
      setAviso(`Rede ${rede.nome} excluída.`);
    } catch (err) {
      setErro(msgErro(err, "Não foi possível excluir a rede."));
    }
  }

  if (!redes) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Surface className="flex flex-wrap items-start justify-between gap-3 p-4">
        <p className="max-w-3xl text-sm text-neutral-600">
          A rede de cada loja vem do cadastro do cliente no Lacteus. Para lojas que <strong className="font-semibold text-neutral-800">só existem no Ativmob</strong>,
          crie a rede aqui (ou escolha uma rede que já existe no Lacteus), defina os supervisores e selecione as lojas. A rede passa a valer nas telas de estoque, solicitações e encartes como qualquer outra.
          Se uma loja for cadastrada depois no Lacteus, passa a valer a rede do Lacteus.
        </p>
        <Button onClick={() => abrir(null)} disabled={abrindo} id="btn-nova-rede">{abrindo && !form ? "Carregando..." : "+ Nova rede"}</Button>
      </Surface>

      {erro && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
      {aviso && <p role="status" className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">{aviso}</p>}

      {redes.length === 0 ? (
        <Surface>
          <EmptyState
            icon={IcoStore}
            titulo="Nenhuma rede criada no InfoVale"
            descricao="Crie uma rede para agrupar lojas do Ativmob que não estão no Lacteus."
            acao={<Button variant="outline" size="sm" onClick={() => abrir(null)} disabled={abrindo}>+ Nova rede</Button>}
          />
        </Surface>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {redes.map((r) => {
            const ignoradas = r.lojas.filter((l) => l.noLacteus).length;
            return (
              <Surface key={r.id} className="flex flex-col p-4" data-rede={r.codigoRede}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-900">
                      <span className="truncate">{r.nome}</span>
                      {r.doLacteus && <Badge tone="neutral" title="A rede já existe no Lacteus; aqui ficam só as lojas a mais.">Rede do Lacteus</Badge>}
                    </h2>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      Cód. {r.codigoRede} · {r.lojas.length} {r.lojas.length === 1 ? "loja" : "lojas"}{r.doLacteus ? (r.lojas.length === 1 ? " adicionada" : " adicionadas") : ""}
                      {r.atualizadoPorNome && ` · alterada por ${r.atualizadoPorNome} em ${fmtDataHora(r.atualizadoEm)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => abrir(r)} disabled={abrindo}>Editar</Button>
                    <Button variant="ghost" size="sm" className="text-danger hover:bg-danger/10 hover:text-danger" onClick={() => excluir(r)}>Excluir</Button>
                  </div>
                </div>

                <div className="mt-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Supervisores</p>
                  <div className="flex flex-wrap gap-1.5">
                    {r.supervisores.length === 0
                      ? <span className="text-sm text-neutral-500">Nenhum (só diretoria e administrador veem)</span>
                      : r.supervisores.map((s) => <Badge key={s.id} tone="info">{s.nome}</Badge>)}
                  </div>
                </div>

                <div className="mt-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Lojas</p>
                  <ul className="max-h-40 space-y-1 overflow-y-auto text-sm text-neutral-700">
                    {r.lojas.map((l) => (
                      <li key={l.clienteCodigo} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate">{l.clienteNome} <span className="text-xs text-neutral-400">· {l.clienteCodigo}</span></span>
                        {l.noLacteus && <Badge tone="warning" title="Esta loja passou a existir no Lacteus; vale a rede do Lacteus.">No Lacteus: {l.noLacteus}</Badge>}
                      </li>
                    ))}
                  </ul>
                  {ignoradas > 0 && (
                    <p className="mt-2 text-xs text-warning">
                      {ignoradas === 1 ? "1 loja já está no Lacteus e segue a rede de lá." : `${ignoradas} lojas já estão no Lacteus e seguem a rede de lá.`}
                    </p>
                  )}
                </div>
              </Surface>
            );
          })}
        </div>
      )}

      {form && opcoes && (
        <RedeDialog
          rede={form.rede}
          opcoes={opcoes}
          onClose={() => setForm(null)}
          onSalvo={(novas, msg) => { setRedes(novas); setForm(null); setAviso(msg); }}
        />
      )}
    </div>
  );
}
