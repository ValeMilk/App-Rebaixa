"use client";

import { useState } from "react";
import Dialog from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";
import { IcoX } from "@/components/Icons";

/** "Ja resolvi": motivo obrigatorio. onConfirmar(motivo) devolve uma Promise. */
export default function JaResolviDialog({ pendencia, onClose, onConfirmar }) {
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function enviar(e) {
    e.preventDefault();
    const m = motivo.trim();
    if (!m) { setErro("Informe o motivo."); return; }
    setSalvando(true);
    setErro("");
    try {
      await onConfirmar(m);
    } catch (err) {
      setErro(err?.response?.data?.error || "Não foi possível registrar.");
      setSalvando(false);
    }
  }

  return (
    <Dialog open onClose={onClose} size="sm" ariaLabel="Já resolvi">
      <form onSubmit={enviar} className="flex flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-neutral-900">Já resolvi</h2>
            <p className="mt-0.5 truncate text-xs text-neutral-500">{pendencia.produto} · {pendencia.cliente}</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fechar"><IcoX className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-3 px-5 py-4">
          {erro && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
          <div>
            <label htmlFor="motivo-resolvi" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Motivo</label>
            <textarea
              id="motivo-resolvi"
              className="input h-24 resize-none py-2"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={500}
              placeholder="Ex.: produto já foi trocado na loja"
              required
              autoFocus
            />
          </div>
          <p className="text-xs text-neutral-500">Vale para todas as pendências abertas deste produto nesta loja; o outro destinatário verá que você resolveu.</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-3 safe-area-pb">
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button type="submit" disabled={salvando}>{salvando ? "Salvando..." : "Confirmar"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
