"use client";

import { useState } from "react";
import api from "@/lib/api";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";

// Titulo e mes de referencia (importacao e renomeacao)
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

/** Renomeia o relatorio (nome e mes de referencia). `onSalvo` e chamado depois de gravar. */
export default function EditarRelatorioDialog({ relatorio, onClose, onSalvo }) {
  const [titulo, setTitulo] = useState(relatorio.titulo);
  const [referencia, setReferencia] = useState(relatorio.referencia || "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setErro("");
    try {
      await api.put(`/relatorios/${relatorio.id}`, { titulo, referencia: referencia || null });
      onSalvo();
    } catch (err) {
      setErro(err?.response?.data?.error || "Não foi possível salvar.");
      setSalvando(false);
    }
  }

  return (
    <Dialog open onClose={onClose} size="lg" ariaLabel="Renomear relatório">
      <form onSubmit={salvar} className="flex flex-col gap-4 p-5" id="form-editar-relatorio">
        <h2 className="text-base font-semibold text-neutral-900">Renomear relatório</h2>
        {erro && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
        <CamposRelatorio idPrefixo="ed" titulo={titulo} referencia={referencia} onTitulo={setTitulo} onReferencia={setReferencia} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button type="submit" disabled={salvando || titulo.trim().length < 2}>{salvando ? "Salvando..." : "Salvar"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
