"use client";

import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { chaveCidade, DIAS_LONGOS, indiceDoDia, dm, tituloVisita } from "@/lib/agenda";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";

const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const chaveSub = (s) => `${s.codigoRede || ""}::${semAcento(s.nome)}`;

/**
 * Criar, editar ou (somente leitura) ver uma visita da agenda.
 * `valor`: { id?, data, diaInteiro, inicio, fim, cidade, redes[], subredes[], lojas[], observacao }.
 * A visita pode ser descrita pela cidade, por redes (classes) e subredes (subclasses), ou pelas tres coisas.
 */
export default function VisitaDialog({ valor, cidades, donoNome, donoCodigo, somenteLeitura, podeExcluir, onSalvar, onExcluir, onClose }) {
  const editando = !!valor.id;
  const [data, setData] = useState(valor.data);
  const [diaInteiro, setDiaInteiro] = useState(valor.diaInteiro);
  const [inicio, setInicio] = useState(valor.inicio || "08:00");
  const [fim, setFim] = useState(valor.fim || "12:00");
  const [cidade, setCidade] = useState(valor.cidade || "");
  const [observacao, setObservacao] = useState(valor.observacao || "");
  const [redesSel, setRedesSel] = useState(() => new Map((valor.redes || []).map((r) => [r.codigoRede, r])));
  const [subSel, setSubSel] = useState(() => new Map((valor.subredes || []).map((s) => [chaveSub(s), s])));
  const [mostrarRedes, setMostrarRedes] = useState((valor.redes || []).length + (valor.subredes || []).length > 0);
  const [opcoes, setOpcoes] = useState(null); // { redes[], subredes[] } da carteira do usuario
  const [buscaRede, setBuscaRede] = useState("");
  const [escolhidas, setEscolhidas] = useState(() => new Map((valor.lojas || []).map((l) => [l.clienteCodigo, l.clienteNome])));
  const [mostrarLojas, setMostrarLojas] = useState((valor.lojas || []).length > 0);
  const [soDaCidade, setSoDaCidade] = useState(true);
  const [catalogo, setCatalogo] = useState(null); // lojas que o usuario alcanca
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const cidadeConhecida = useMemo(() => {
    const k = chaveCidade(cidade);
    return k ? cidades.find((c) => chaveCidade(c) === k) || null : null;
  }, [cidade, cidades]);

  // Redes e subredes: carrega ao abrir a secao e de novo quando a cidade conhecida muda (para a contagem na cidade)
  useEffect(() => {
    if (!mostrarRedes || somenteLeitura) return;
    let vivo = true;
    api
      .get("/agenda/redes", { params: { ...(cidadeConhecida ? { cidade: cidadeConhecida } : {}), ...(donoCodigo ? { dono: donoCodigo } : {}) } })
      .then(({ data: d }) => vivo && setOpcoes({ redes: d.redes || [], subredes: d.subredes || [] }))
      .catch(() => vivo && setOpcoes((o) => o || { redes: [], subredes: [] }));
    return () => { vivo = false; };
  }, [mostrarRedes, cidadeConhecida, somenteLeitura, donoCodigo]);

  // Lojas: carrega uma vez, quando a pessoa abre a lista
  useEffect(() => {
    if (!mostrarLojas || catalogo || somenteLeitura) return;
    let vivo = true;
    api.get("/agenda/lojas", { params: donoCodigo ? { dono: donoCodigo } : {} }).then(({ data: d }) => vivo && setCatalogo(d.lojas || [])).catch(() => vivo && setCatalogo([]));
    return () => { vivo = false; };
  }, [mostrarLojas, catalogo, somenteLeitura, donoCodigo]);

  const q = semAcento(buscaRede.trim());
  const redesVisiveis = useMemo(() => (opcoes?.redes || []).filter((r) => !q || semAcento(r.nome).includes(q)), [opcoes, q]);
  const subVisiveis = useMemo(() => (opcoes?.subredes || []).filter((s) => !q || semAcento(s.nome).includes(q) || semAcento(s.redeNome).includes(q)), [opcoes, q]);

  const visiveis = useMemo(() => {
    if (!catalogo) return [];
    const qb = semAcento(busca.trim());
    return catalogo.filter((l) => {
      if (soDaCidade && cidadeConhecida && chaveCidade(l.cidade) !== chaveCidade(cidadeConhecida)) return false;
      return !qb || semAcento(l.clienteNome).includes(qb) || l.clienteCodigo.includes(qb);
    });
  }, [catalogo, busca, soDaCidade, cidadeConhecida]);

  const alternarMapa = (setter, k, valorItem) => setter((m) => {
    const n = new Map(m);
    n.has(k) ? n.delete(k) : n.set(k, valorItem);
    return n;
  });

  const temAlgo = cidade.trim().length >= 2 || redesSel.size > 0 || subSel.size > 0;

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    setSalvando(true);
    try {
      await onSalvar({
        data,
        diaInteiro,
        inicio: diaInteiro ? null : inicio,
        fim: diaInteiro ? null : fim,
        cidade,
        observacao,
        redes: [...redesSel.values()].map((r) => ({ codigoRede: r.codigoRede, nome: r.nome })),
        subredes: [...subSel.values()].map((s) => ({ codigoRede: s.codigoRede, redeNome: s.redeNome, nome: s.nome })),
        lojas: [...escolhidas].map(([clienteCodigo, clienteNome]) => ({ clienteCodigo, clienteNome })),
      });
    } catch (err) {
      setErro(err?.response?.data?.error || err?.message || "Não foi possível salvar a visita.");
      setSalvando(false);
    }
  }

  const tituloDia = `${DIAS_LONGOS[indiceDoDia(data)] || ""} ${dm(data)}`;

  if (somenteLeitura) {
    return (
      <Dialog open onClose={onClose} size="md" ariaLabel="Visita">
        <div className="space-y-3 p-5" id="visita-leitura">
          <h2 className="text-base font-semibold text-neutral-900">{tituloVisita(valor)}</h2>
          <p className="text-sm text-neutral-600">
            {tituloDia} · {valor.diaInteiro ? "dia inteiro" : `${valor.inicio} às ${valor.fim}`}
            {valor.donoNome ? ` · ${valor.donoNome}` : ""}
          </p>
          {valor.cidade && (valor.redes || []).length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Redes (classes)</p>
              <p className="text-sm text-neutral-700">{valor.redes.map((r) => r.nome || r.codigoRede).join(", ")}</p>
            </div>
          )}
          {(valor.subredes || []).length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Subredes (subclasses)</p>
              <p className="text-sm text-neutral-700">{valor.subredes.map((s) => s.nome).join(", ")}</p>
            </div>
          )}
          {(valor.lojas || []).length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Lojas</p>
              <ul className="list-disc pl-5 text-sm text-neutral-700">
                {valor.lojas.map((l) => <li key={l.clienteCodigo}>{l.clienteNome || l.clienteCodigo}</li>)}
              </ul>
            </div>
          )}
          {valor.observacao && <p className="whitespace-pre-line rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">{valor.observacao}</p>}
          <div className="flex justify-end"><Button variant="outline" onClick={onClose}>Fechar</Button></div>
        </div>
      </Dialog>
    );
  }

  const totalRedes = redesSel.size + subSel.size;
  const infoLojas = (o) => `${o.lojas} ${o.lojas === 1 ? "loja" : "lojas"}${cidadeConhecida ? ` · ${o.lojasNaCidade} em ${cidadeConhecida}` : ""}`;

  return (
    <Dialog open onClose={onClose} sheet size="lg" ariaLabel={editando ? "Editar visita" : "Nova visita"}>
      <form onSubmit={salvar} className="flex min-h-0 flex-1 flex-col" id="form-visita">
        <div className="shrink-0 border-b border-neutral-200 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
          <h2 className="text-base font-semibold text-neutral-900">{editando ? "Editar visita" : "Nova visita"}</h2>
          <p className="mt-0.5 text-xs text-neutral-500">{tituloDia}{donoNome ? ` · agenda de ${donoNome}` : ""}</p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {erro && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}

          <div>
            <label htmlFor="v-cidade" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Cidade</label>
            <input
              id="v-cidade" className="input" list="v-cidades" value={cidade} onChange={(e) => setCidade(e.target.value)}
              placeholder="Escolha ou digite a cidade" maxLength={80} autoFocus={!editando} autoComplete="off"
            />
            <datalist id="v-cidades">{cidades.map((c) => <option key={c} value={c} />)}</datalist>
            <p className="mt-1 text-xs text-neutral-500">Pode ficar em branco se a visita for só por rede ou subrede.</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="v-data" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Dia</label>
              <input id="v-data" type="date" className="input" value={data} onChange={(e) => setData(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="v-inicio" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Início</label>
              <input id="v-inicio" type="time" step={900} className="input disabled:bg-neutral-50 disabled:text-neutral-400" value={inicio} onChange={(e) => setInicio(e.target.value)} disabled={diaInteiro} required={!diaInteiro} />
            </div>
            <div>
              <label htmlFor="v-fim" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Fim</label>
              <input id="v-fim" type="time" step={900} className="input disabled:bg-neutral-50 disabled:text-neutral-400" value={fim} onChange={(e) => setFim(e.target.value)} disabled={diaInteiro} required={!diaInteiro} />
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-800">
            <input type="checkbox" id="v-dia-inteiro" className="h-4 w-4 rounded border-neutral-300 accent-secondary" checked={diaInteiro} onChange={(e) => setDiaInteiro(e.target.checked)} />
            Dia inteiro
          </label>

          {/* Redes (classes) e subredes (subclasses) */}
          <div>
            <button type="button" onClick={() => setMostrarRedes((v) => !v)} className="text-sm font-medium text-secondary hover:underline" id="v-toggle-redes">
              {mostrarRedes ? "Esconder as redes e subredes" : "Escolher redes ou subredes (opcional)"}
              {totalRedes > 0 ? ` · ${totalRedes} ${totalRedes === 1 ? "selecionada" : "selecionadas"}` : ""}
            </button>
            {mostrarRedes && (
              <div className="mt-2 space-y-3" id="v-redes">
                <input className="input" placeholder="Buscar rede ou subrede" value={buscaRede} onChange={(e) => setBuscaRede(e.target.value)} aria-label="Buscar rede ou subrede" />
                {!opcoes && <p className="py-2 text-center text-sm text-neutral-500">Carregando redes…</p>}
                {opcoes && (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Redes (classe)</p>
                      <ul className="max-h-52 divide-y divide-neutral-100 overflow-y-auto rounded-lg border border-neutral-200" id="v-lista-redes">
                        {redesVisiveis.length === 0 && <li className="px-3 py-3 text-center text-sm text-neutral-500">Nenhuma rede.</li>}
                        {redesVisiveis.map((r) => (
                          <li key={r.codigoRede}>
                            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-neutral-50">
                              <input type="checkbox" className="h-4 w-4 shrink-0 rounded border-neutral-300 accent-secondary" checked={redesSel.has(r.codigoRede)} onChange={() => alternarMapa(setRedesSel, r.codigoRede, { codigoRede: r.codigoRede, nome: r.nome })} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm text-neutral-800">{r.nome}</span>
                                <span className="block text-[11px] text-neutral-500">{infoLojas(r)}</span>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Subredes (subclasse)</p>
                      <ul className="max-h-52 divide-y divide-neutral-100 overflow-y-auto rounded-lg border border-neutral-200" id="v-lista-subredes">
                        {subVisiveis.length === 0 && <li className="px-3 py-3 text-center text-sm text-neutral-500">Nenhuma subrede.</li>}
                        {subVisiveis.map((s) => {
                          const k = chaveSub(s);
                          return (
                            <li key={k}>
                              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-neutral-50">
                                <input type="checkbox" className="h-4 w-4 shrink-0 rounded border-neutral-300 accent-secondary" checked={subSel.has(k)} onChange={() => alternarMapa(setSubSel, k, { codigoRede: s.codigoRede, redeNome: s.redeNome, nome: s.nome })} />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm text-neutral-800">{s.nome}</span>
                                  <span className="block truncate text-[11px] text-neutral-500">{s.redeNome} · {infoLojas(s)}</span>
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                )}
                {cidadeConhecida && opcoes && <p className="text-xs text-neutral-500">As opções com lojas em {cidadeConhecida} aparecem primeiro.</p>}
              </div>
            )}
          </div>

          <div>
            <button type="button" onClick={() => setMostrarLojas((v) => !v)} className="text-sm font-medium text-secondary hover:underline" id="v-toggle-lojas">
              {mostrarLojas ? "Esconder as lojas" : "Escolher lojas específicas (opcional)"}
              {escolhidas.size > 0 ? ` · ${escolhidas.size} ${escolhidas.size === 1 ? "selecionada" : "selecionadas"}` : ""}
            </button>
            {mostrarLojas && (
              <div className="mt-2 space-y-2" id="v-lojas">
                <input className="input" placeholder="Buscar loja por nome ou código" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar loja" />
                {cidadeConhecida && (
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-600">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded border-neutral-300 accent-secondary" checked={soDaCidade} onChange={(e) => setSoDaCidade(e.target.checked)} />
                    Só lojas de {cidadeConhecida}
                    <span className="text-neutral-400">(muitas lojas não têm a cidade cadastrada; desmarque para ver todas)</span>
                  </label>
                )}
                <ul className="max-h-56 divide-y divide-neutral-100 overflow-y-auto rounded-lg border border-neutral-200">
                  {!catalogo && <li className="px-3 py-4 text-center text-sm text-neutral-500">Carregando lojas…</li>}
                  {catalogo && visiveis.length === 0 && <li className="px-3 py-4 text-center text-sm text-neutral-500">Nenhuma loja encontrada.</li>}
                  {visiveis.map((l) => (
                    <li key={l.clienteCodigo}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-neutral-50">
                        <input type="checkbox" className="h-4 w-4 shrink-0 rounded border-neutral-300 accent-secondary" checked={escolhidas.has(l.clienteCodigo)} onChange={() => alternarMapa(setEscolhidas, l.clienteCodigo, l.clienteNome)} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-neutral-800">{l.clienteNome}</span>
                          <span className="block text-[11px] text-neutral-500">Cód. {l.clienteCodigo}{l.cidade ? ` · ${l.cidade}` : " · sem cidade cadastrada"}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="v-obs" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Observação</label>
            <textarea id="v-obs" className="input min-h-[72px]" value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={500} placeholder="Ex.: levar tabela nova, cobrança, ação de encarte" />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-neutral-200 px-5 py-3">
          <div>
            {editando && podeExcluir && (
              <Button variant="ghost" className="text-danger hover:bg-danger/10 hover:text-danger" onClick={onExcluir} disabled={salvando} id="v-excluir">Excluir</Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
            <Button type="submit" disabled={salvando || !temAlgo} id="v-salvar">{salvando ? "Salvando..." : "Salvar"}</Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
