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

/**
 * Baixa o relatorio COMPLETO em um PDF (todas as paginas, na ordem). O servidor monta o arquivo;
 * aqui so se dispara o download. Lanca Error com a mensagem para mostrar ao usuario.
 */
export async function baixarRelatorioPdf(relatorioId, titulo) {
  try {
    const { data } = await api.get(`/relatorios/${relatorioId}/pdf`, { responseType: "blob", timeout: 300000 });
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${String(titulo || "Relatório").replace(/[\\/:*?"<>|]+/g, "-").trim() || "Relatório"}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  } catch (err) {
    let msg = "Não foi possível baixar o relatório.";
    const corpo = err?.response?.data;
    if (corpo instanceof Blob) {
      try { msg = JSON.parse(await corpo.text())?.error || msg; } catch { /* mantem a mensagem padrao */ }
    }
    throw new Error(msg);
  }
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
