"use client";

import { useEffect, useMemo, useState } from "react";
import Surface from "@/components/ui/Surface";
import Button from "@/components/ui/Button";
import { IcoPercent, IcoX } from "@/components/Icons";
import { fmtDataHora } from "@/lib/utils";

const DIAS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

const Rotulo = ({ htmlFor, children }) => (
  <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">{children}</label>
);

function formInicial(config) {
  const c = config || {};
  return {
    margemOperacional: c.margemOperacional ?? "",
    piso: c.piso || "minimo",
    margensPorCategoria: (c.margensPorCategoria || []).map((m) => ({ categoria: m.categoria, margem: String(m.margem) })),
    margensPorLoja: (c.margensPorLoja || []).map((m) => ({ clienteCodigo: m.clienteCodigo, margem: String(m.margem) })),
    diaSemana: c.diaLimite?.diaSemana ?? "",
    hora: c.diaLimite?.hora || "",
    assunto: c.modeloEmail?.assunto || "",
    texto: c.modeloEmail?.texto || "",
    modeloExcel: c.modeloExcel || "",
  };
}

/**
 * Bloco "Margens" da rede (so com margens_rede.gerenciar): margem operacional, piso, margens por
 * categoria e por loja, dia limite, modelo de e-mail e de Excel.
 */
export default function MargensForm({ config, lojas, categorias, onSalvar, salvando }) {
  const [form, setForm] = useState(() => formInicial(config));
  const [novaCat, setNovaCat] = useState({ categoria: "", margem: "" });
  const [novaLoja, setNovaLoja] = useState({ clienteCodigo: "", margem: "" });
  const [erroLocal, setErroLocal] = useState("");
  const [sujo, setSujo] = useState(false);

  useEffect(() => { setForm(formInicial(config)); setSujo(false); setErroLocal(""); }, [config]);

  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setSujo(true); };

  const lojaPorCodigo = useMemo(() => new Map((lojas || []).map((l) => [l.clienteCodigo, l])), [lojas]);
  const categoriasLivres = useMemo(() => {
    const usadas = new Set(form.margensPorCategoria.map((m) => m.categoria));
    return (categorias || []).filter((c) => !usadas.has(c));
  }, [categorias, form.margensPorCategoria]);
  const lojasLivres = useMemo(() => {
    const usadas = new Set(form.margensPorLoja.map((m) => m.clienteCodigo));
    return (lojas || []).filter((l) => !usadas.has(l.clienteCodigo));
  }, [lojas, form.margensPorLoja]);

  const margemOk = (v) => {
    if (v === "" || v === null || v === undefined) return false;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) && n >= 0 && n <= 100;
  };

  function adicionarCategoria() {
    if (!novaCat.categoria) { setErroLocal("Escolha a categoria."); return; }
    if (!margemOk(novaCat.margem)) { setErroLocal("Informe a margem da categoria entre 0 e 100."); return; }
    setErroLocal("");
    set({ margensPorCategoria: [...form.margensPorCategoria, { ...novaCat }] });
    setNovaCat({ categoria: "", margem: "" });
  }
  function adicionarLoja() {
    if (!novaLoja.clienteCodigo) { setErroLocal("Escolha a loja."); return; }
    if (!margemOk(novaLoja.margem)) { setErroLocal("Informe a margem da loja entre 0 e 100."); return; }
    setErroLocal("");
    set({ margensPorLoja: [...form.margensPorLoja, { ...novaLoja }] });
    setNovaLoja({ clienteCodigo: "", margem: "" });
  }

  function submeter(e) {
    e.preventDefault();
    if (form.margemOperacional !== "" && !margemOk(form.margemOperacional)) { setErroLocal("A margem operacional precisa estar entre 0 e 100."); return; }
    for (const m of form.margensPorCategoria) if (!margemOk(m.margem)) { setErroLocal(`Margem inválida na categoria ${m.categoria}.`); return; }
    for (const m of form.margensPorLoja) if (!margemOk(m.margem)) { setErroLocal(`Margem inválida na loja ${m.clienteCodigo}.`); return; }
    if (form.hora && !/^\d{1,2}:\d{2}$/.test(form.hora)) { setErroLocal("Hora limite no formato HH:MM."); return; }
    setErroLocal("");
    const num = (v) => (v === "" ? null : Number(String(v).replace(",", ".")));
    onSalvar({
      margemOperacional: num(form.margemOperacional),
      piso: form.piso,
      margensPorCategoria: form.margensPorCategoria.map((m) => ({ categoria: m.categoria, margem: num(m.margem) })),
      margensPorLoja: form.margensPorLoja.map((m) => ({ clienteCodigo: m.clienteCodigo, margem: num(m.margem) })),
      diaLimite: { diaSemana: form.diaSemana === "" ? null : Number(form.diaSemana), hora: form.hora || null },
      modeloEmail: { assunto: form.assunto || null, texto: form.texto || null },
      modeloExcel: form.modeloExcel || null,
    });
  }

  return (
    <Surface as="form" onSubmit={submeter} className="space-y-5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
            <IcoPercent className="h-4 w-4 text-secondary" aria-hidden /> Margens
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            A margem do item é a da loja, se houver; senão a da categoria; senão a operacional da rede.
          </p>
        </div>
        {config?.atualizadoEm && (
          <span className="text-right text-xs text-neutral-500">
            Atualizado {fmtDataHora(config.atualizadoEm)}{config.atualizadoPorNome ? ` por ${config.atualizadoPorNome}` : ""}
          </span>
        )}
      </div>

      {/* Operacional + piso */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Rotulo htmlFor="margem-operacional">Margem operacional (%)</Rotulo>
          <input
            id="margem-operacional"
            className="input"
            inputMode="decimal"
            placeholder="ex.: 20"
            value={form.margemOperacional}
            onChange={(e) => set({ margemOperacional: e.target.value })}
          />
          <p className="mt-1 text-xs text-neutral-500">Um valor para a rede inteira. Vazio = sem margem cadastrada.</p>
        </div>
        <div>
          <Rotulo htmlFor="piso">Piso da escalada</Rotulo>
          <select id="piso" className="select" value={form.piso} onChange={(e) => set({ piso: e.target.value })}>
            <option value="minimo">Mínimo do item</option>
            <option value="p3">P#3</option>
          </select>
          <p className="mt-1 text-xs text-neutral-500">Preço com que o valor recebido é comparado para subir a aprovação.</p>
        </div>
      </div>

      {/* Por categoria */}
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Margens por categoria</legend>
        {form.margensPorCategoria.length > 0 && (
          <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
            {form.margensPorCategoria.map((m, i) => (
              <li key={m.categoria} className="flex items-center gap-2 px-3 py-1.5">
                <span className="min-w-0 flex-1 truncate text-sm text-neutral-800">{m.categoria}</span>
                <input
                  className="input h-8 w-24 text-right"
                  inputMode="decimal"
                  aria-label={`Margem da categoria ${m.categoria}`}
                  value={m.margem}
                  onChange={(e) => set({ margensPorCategoria: form.margensPorCategoria.map((x, j) => (j === i ? { ...x, margem: e.target.value } : x)) })}
                />
                <span className="text-xs text-neutral-500">%</span>
                <button type="button" className="btn-ghost h-8 w-8 px-0 text-neutral-500 hover:text-danger" aria-label={`Remover ${m.categoria}`}
                  onClick={() => set({ margensPorCategoria: form.margensPorCategoria.filter((_, j) => j !== i) })}>
                  <IcoX className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <select className="select min-w-0 flex-1" aria-label="Categoria" value={novaCat.categoria} onChange={(e) => setNovaCat({ ...novaCat, categoria: e.target.value })}>
            <option value="">Adicionar categoria…</option>
            {categoriasLivres.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input className="input w-24 text-right" inputMode="decimal" placeholder="%" aria-label="Margem da categoria" value={novaCat.margem} onChange={(e) => setNovaCat({ ...novaCat, margem: e.target.value })} />
          <Button variant="outline" size="sm" onClick={adicionarCategoria}>Adicionar</Button>
        </div>
      </fieldset>

      {/* Por loja */}
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Margens por loja</legend>
        {form.margensPorLoja.length > 0 && (
          <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
            {form.margensPorLoja.map((m, i) => {
              const loja = lojaPorCodigo.get(m.clienteCodigo);
              return (
                <li key={m.clienteCodigo} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-neutral-800">
                    {loja?.clienteNome || m.clienteCodigo} <span className="text-xs text-neutral-500">({m.clienteCodigo})</span>
                  </span>
                  <input
                    className="input h-8 w-24 text-right"
                    inputMode="decimal"
                    aria-label={`Margem da loja ${m.clienteCodigo}`}
                    value={m.margem}
                    onChange={(e) => set({ margensPorLoja: form.margensPorLoja.map((x, j) => (j === i ? { ...x, margem: e.target.value } : x)) })}
                  />
                  <span className="text-xs text-neutral-500">%</span>
                  <button type="button" className="btn-ghost h-8 w-8 px-0 text-neutral-500 hover:text-danger" aria-label={`Remover loja ${m.clienteCodigo}`}
                    onClick={() => set({ margensPorLoja: form.margensPorLoja.filter((_, j) => j !== i) })}>
                    <IcoX className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <select className="select min-w-0 flex-1" aria-label="Loja" value={novaLoja.clienteCodigo} onChange={(e) => setNovaLoja({ ...novaLoja, clienteCodigo: e.target.value })}>
            <option value="">Adicionar loja…</option>
            {lojasLivres.map((l) => <option key={l.clienteCodigo} value={l.clienteCodigo}>{l.clienteNome || l.clienteCodigo} ({l.clienteCodigo})</option>)}
          </select>
          <input className="input w-24 text-right" inputMode="decimal" placeholder="%" aria-label="Margem da loja" value={novaLoja.margem} onChange={(e) => setNovaLoja({ ...novaLoja, margem: e.target.value })} />
          <Button variant="outline" size="sm" onClick={adicionarLoja}>Adicionar</Button>
        </div>
      </fieldset>

      {/* Dia limite */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Rotulo htmlFor="dia-semana">Dia limite das solicitações</Rotulo>
          <select id="dia-semana" className="select" value={form.diaSemana} onChange={(e) => set({ diaSemana: e.target.value })}>
            <option value="">Sem dia limite</option>
            {DIAS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </div>
        <div>
          <Rotulo htmlFor="hora-limite">Hora limite</Rotulo>
          <input id="hora-limite" type="time" className="input" value={form.hora} onChange={(e) => set({ hora: e.target.value })} />
        </div>
      </div>

      {/* Modelos */}
      <div className="space-y-3">
        <div>
          <Rotulo htmlFor="assunto">Modelo de e-mail: assunto</Rotulo>
          <input id="assunto" className="input" maxLength={200} value={form.assunto} onChange={(e) => set({ assunto: e.target.value })} placeholder="ex.: Rebaixa Vale Milk – {loja} – {data}" />
        </div>
        <div>
          <Rotulo htmlFor="texto">Modelo de e-mail: texto</Rotulo>
          <textarea id="texto" className="input h-32 resize-y py-2" maxLength={5000} value={form.texto} onChange={(e) => set({ texto: e.target.value })} />
        </div>
        <div>
          <Rotulo htmlFor="modelo-excel">Nome do modelo de Excel</Rotulo>
          <input id="modelo-excel" className="input" maxLength={200} value={form.modeloExcel} onChange={(e) => set({ modeloExcel: e.target.value })} placeholder="ex.: mix-mateus" />
        </div>
      </div>

      {erroLocal && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erroLocal}</p>}

      <div className="flex items-center justify-end gap-3">
        {sujo && !salvando && <span className="text-xs text-neutral-500">Alterações não salvas</span>}
        <Button type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Salvar margens"}</Button>
      </div>
    </Surface>
  );
}
