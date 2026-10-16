"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import DestinoRelatorio from "@/components/relatorios/DestinoRelatorio";

// Titulo e mes de referencia (importacao e edicao)
export function CamposRelatorio({ titulo, referencia, onTitulo, onReferencia, idPrefixo }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_200px]">
      <div>
        <label htmlFor={`${idPrefixo}-titulo`} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Nome do relatório</label>
        <input id={`${idPrefixo}-titulo`} className="input" value={titulo} maxLength={120} onChange={(e) => onTitulo(e.target.value)} placeholder="Ex.: Relatório mensal de setembro/2026" required />
      </div>
      <div>
        <label htmlFor={`${idPrefixo}-ref`} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Mês de referência</label>
        <input id={`${idPrefixo}-ref`} type="month" className="input" value={referencia} onChange={(e) => onReferencia(e.target.value)} />
      </div>
    </div>
  );
}

const mesmoConjunto = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/** Edita o relatorio: nome, mes de referencia e para quem e (comercial ou supervisor). `onSalvo` roda depois de gravar. */
export default function EditarRelatorioDialog({ relatorio, onClose, onSalvo }) {
  const tipoInicial = relatorio.tipo === "supervisor" ? "supervisor" : "comercial";
  const supInicial = (relatorio.supervisores || []).map((s) => s.codigo);
  const [titulo, setTitulo] = useState(relatorio.titulo);
  const [referencia, setReferencia] = useState(relatorio.referencia || "");
  const [tipo, setTipo] = useState(tipoInicial);
  const [supervisores, setSupervisores] = useState(supInicial);
  const [opcoes, setOpcoes] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let vivo = true;
    api.get("/relatorios/supervisores").then(({ data }) => vivo && setOpcoes(data.supervisores || [])).catch(() => vivo && setOpcoes([]));
    return () => { vivo = false; };
  }, []);

  const mudouDestino = tipo !== tipoInicial || (tipo === "supervisor" && !mesmoConjunto(supervisores, supInicial));
  const destinoInvalido = tipo === "supervisor" && supervisores.length === 0;

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setErro("");
    try {
      const corpo = { titulo, referencia: referencia || null };
      if (mudouDestino) { corpo.tipo = tipo; corpo.supervisores = tipo === "supervisor" ? supervisores : []; } // so envia o destino se mudou
      await api.put(`/relatorios/${relatorio.id}`, corpo);
      onSalvo();
    } catch (err) {
      setErro(err?.response?.data?.error || "Não foi possível salvar.");
      setSalvando(false);
    }
  }

  return (
    <Dialog open onClose={onClose} sheet size="lg" ariaLabel="Editar relatório">
      <form onSubmit={salvar} className="flex min-h-0 flex-1 flex-col" id="form-editar-relatorio">
        <div className="shrink-0 border-b border-neutral-200 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
          <h2 className="text-base font-semibold text-neutral-900">Renomear relatório</h2>
          <p className="mt-0.5 text-xs text-neutral-500">Nome, mês de referência e para quem é o relatório.</p>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {erro && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
          <CamposRelatorio idPrefixo="ed" titulo={titulo} referencia={referencia} onTitulo={setTitulo} onReferencia={setReferencia} />
          <DestinoRelatorio idPrefixo="ed" tipo={tipo} supervisores={supervisores} opcoes={opcoes} onTipo={setTipo} onSupervisores={setSupervisores} desabilitado={salvando} />
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-neutral-200 px-5 py-3">
          <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button type="submit" disabled={salvando || titulo.trim().length < 2 || destinoInvalido} id="ed-salvar">{salvando ? "Salvando..." : "Salvar"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
