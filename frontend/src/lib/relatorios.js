"use client";

import { useEffect, useState } from "react";
import api from "./api";

// As imagens exigem login (Authorization), entao vem por axios como blob e viram URL local.
// Um cache por pagina evita baixar de novo ao abrir a ampliacao ou voltar para a lista.
const cache = new Map();

export function carregarImagem(relatorioId, numero) {
  const chave = `${relatorioId}:${numero}`;
  if (!cache.has(chave)) {
    const p = api
      .get(`/relatorios/${relatorioId}/paginas/${numero}`, { responseType: "blob" })
      .then((r) => URL.createObjectURL(r.data))
      .catch((err) => {
        cache.delete(chave);
        throw err;
      });
    cache.set(chave, p);
  }
  return cache.get(chave);
}

/** URL local da imagem de uma pagina (numero 0 = miniatura). `ativo=false` adia o download (carga preguicosa). */
export function useImagem(relatorioId, numero, ativo = true) {
  const [url, setUrl] = useState(null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    if (!ativo || !relatorioId) return undefined;
    let vivo = true;
    setErro(false);
    carregarImagem(relatorioId, numero)
      .then((u) => vivo && setUrl(u))
      .catch(() => vivo && setErro(true));
    return () => {
      vivo = false;
    };
  }, [relatorioId, numero, ativo]);
  return { url, erro };
}
