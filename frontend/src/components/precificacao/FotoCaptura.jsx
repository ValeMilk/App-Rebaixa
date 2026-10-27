"use client";

import { useRef, useState } from "react";
import { IcoAlert, IcoX } from "@/components/Icons";

const LADO_MAX = 1280;
const QUALIDADE = 0.72;

/** Reduz a imagem no navegador (lado maior 1280 px, JPEG) e devolve o data URL. */
function comprimir(arquivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      try {
        const escala = Math.min(1, LADO_MAX / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", QUALIDADE));
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("imagem inválida")); };
    img.src = url;
  });
}

/**
 * Foto tirada na hora pela camera do celular (sem galeria: `capture="environment"`), obrigatoria
 * quando a acao combate um concorrente. `value` e o data URL (JPEG comprimido) ou "".
 */
export default function FotoCaptura({ value, onChange, obrigatoria = false }) {
  const inputRef = useRef(null);
  const [erro, setErro] = useState("");
  const [processando, setProcessando] = useState(false);

  async function escolher(e) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    setErro("");
    setProcessando(true);
    try {
      onChange(await comprimir(arquivo));
    } catch {
      setErro("Não foi possível ler a foto. Tente de novo.");
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div>
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
        Foto {obrigatoria ? "*" : "(opcional)"}
      </label>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={escolher} />
      {value ? (
        <div className="relative overflow-hidden rounded-xl border border-neutral-200">
          <img src={value} alt="Foto da ação" className="block max-h-56 w-full object-cover" />
          <div className="flex items-center justify-between gap-2 bg-neutral-50 px-3 py-1.5 text-[11px]">
            <button type="button" className="font-semibold text-secondary" onClick={() => inputRef.current?.click()}>Tirar outra</button>
            <button type="button" className="inline-flex items-center gap-1 text-neutral-500" onClick={() => onChange("")}>
              <IcoX className="h-3 w-3" /> Remover
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={processando}
          className={`flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-3 text-sm font-semibold transition ${obrigatoria ? "border-warning/50 bg-warning/5 text-warning" : "border-neutral-300 bg-white text-neutral-600"}`}
        >
          📷 {processando ? "Processando…" : "Tirar foto agora"}
        </button>
      )}
      {erro && (
        <div className="mt-1 flex items-center gap-1 text-[11px] text-danger"><IcoAlert className="h-3 w-3" /> {erro}</div>
      )}
    </div>
  );
}
