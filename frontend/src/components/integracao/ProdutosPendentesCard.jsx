"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import api from "@/lib/api";
import Surface from "@/components/ui/Surface";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";

const n = (v) => Number(v || 0).toLocaleString("pt-BR");

const MOTIVOS = {
  "outro codigo tambem aponta para este item":
    "Não pré-marcado: outro código do arquivo aponta para o mesmo item (pode ser um produto fantasma). Confira antes de vincular.",
  "ja vinculado a outro codigo": "Não pré-marcado: este item do catálogo já está vinculado a outro código do cliente.",
};

const toneDaPontuacao = (p) => (p >= 0.8 ? "success" : p >= 0.6 ? "warning" : "neutral");

/** Busca manual no catalogo por nome ou codigo (quando nenhuma sugestao serve). */
function BuscaManual({ onEscolher }) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const termo = q.trim();
    if (termo.length < 2) { setResultados([]); return undefined; }
    const minha = ++seq.current;
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const { data } = await api.get("/integracao-estoque/produtos/buscar", { params: { q: termo } });
        if (minha === seq.current) setResultados(data.produtos || []);
      } catch {
        if (minha === seq.current) setResultados([]);
      } finally {
        if (minha === seq.current) setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="mt-2">
      <input
        className="input h-9 text-sm"
        placeholder="Buscar outro item do catálogo por nome ou código…"
        aria-label="Buscar outro item do catálogo"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {q.trim().length >= 2 && (
        <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-neutral-200 bg-white text-sm">
          {buscando && <li className="px-3 py-2 text-xs text-neutral-500">Buscando…</li>}
          {!buscando && resultados.length === 0 && <li className="px-3 py-2 text-xs text-neutral-500">Nada encontrado.</li>}
          {resultados.map((p) => (
            <li key={p.produtoId}>
              <button
                type="button"
                className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left hover:bg-accent"
                onClick={() => { onEscolher(p); setQ(""); setResultados([]); }}
              >
                <span className="min-w-0 truncate">{p.descricao}</span>
                <span className="shrink-0 text-xs text-neutral-500">cód {p.codigo}{p.ativo ? "" : " · inativo"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Produtos do arquivo que nao foram reconhecidos. Para cada um: ate 3 sugestoes por semelhanca
 * de nome (nunca aplicadas sozinhas), busca manual e "marcar como fantasma". So as linhas que a
 * pessoa marca sao vinculadas.
 */
export default function ProdutosPendentesCard({ pendentes, onVincular, onFantasma, salvando }) {
  // codigo -> { produtoId, marcado, origem: "sugestao"|"manual", pontuacao, extra }
  const [escolhas, setEscolhas] = useState({});

  // Ao recarregar a lista (depois de cadastrar, vincular ou marcar fantasma), preserva o que a pessoa
  // ja escolheu; o resto volta a vir da pre-selecao do servidor (que pode ter mudado, ex.: sem o fantasma competindo).
  useEffect(() => {
    setEscolhas((prev) => Object.fromEntries(pendentes.map((p) => {
      if (prev[p.codigo]?.produtoId) return [p.codigo, prev[p.codigo]];
      const pre = p.sugestoes.find((s) => s.produtoId === p.preSelecionado);
      return [p.codigo, pre
        ? { produtoId: pre.produtoId, marcado: true, origem: "sugestao", pontuacao: pre.pontuacao, extra: null }
        : { produtoId: null, marcado: false, origem: "sugestao", pontuacao: null, extra: null }];
    })));
  }, [pendentes]);

  const marcados = pendentes.filter((p) => escolhas[p.codigo]?.marcado && escolhas[p.codigo]?.produtoId);

  function escolherSugestao(p, s) {
    setEscolhas((e) => ({ ...e, [p.codigo]: { produtoId: s.produtoId, marcado: true, origem: "sugestao", pontuacao: s.pontuacao, extra: e[p.codigo]?.extra || null } }));
  }
  function escolherManual(p, produto) {
    setEscolhas((e) => ({ ...e, [p.codigo]: { produtoId: produto.produtoId, marcado: true, origem: "manual", pontuacao: null, extra: produto } }));
  }
  function alternar(p, marcado) {
    setEscolhas((e) => ({ ...e, [p.codigo]: { ...e[p.codigo], marcado } }));
  }

  function vincular() {
    onVincular(marcados.map((p) => {
      const e = escolhas[p.codigo];
      return {
        codigo: p.codigo,
        descricao: p.descricao,
        produtoId: e.produtoId,
        metodo: e.origem === "sugestao" ? "sugestao_confirmada" : "manual",
        pontuacao: e.origem === "sugestao" ? e.pontuacao : null,
      };
    }));
  }

  return (
    <Surface className="overflow-hidden border-warning/30">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-warning/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-800">Produtos não identificados ({n(pendentes.length)})</h2>
          <p className="text-xs text-neutral-600">
            Escolha o item do catálogo, marque a linha e vincule. Se o código do cliente não corresponde a produto nenhum, marque como fantasma.
          </p>
        </div>
        <Button size="sm" disabled={salvando || marcados.length === 0} onClick={vincular}>
          {salvando ? "Vinculando…" : `Vincular ${n(marcados.length)} marcado${marcados.length === 1 ? "" : "s"}`}
        </Button>
      </div>

      <ul>
        {pendentes.map((p) => {
          const e = escolhas[p.codigo] || {};
          const extra = e.extra;
          return (
            <li key={p.codigo} className="flex gap-3 border-t border-neutral-100 px-4 py-3">
              <input
                type="checkbox"
                aria-label={`Vincular o código ${p.codigo}`}
                className="mt-1 h-4 w-4 shrink-0 accent-secondary"
                checked={!!e.marcado && !!e.produtoId}
                disabled={!e.produtoId}
                onChange={(ev) => alternar(p, ev.target.checked)}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-semibold text-neutral-800">{p.descricao || p.codigo}</span>
                  <span className="text-xs text-neutral-500">cód {p.codigo} · {n(p.linhas)} linhas · {n(p.lojas)} lojas</span>
                </div>

                <div role="radiogroup" aria-label={`Sugestões para ${p.codigo}`} className="mt-2 space-y-1">
                  {p.sugestoes.length === 0 && !extra && (
                    <p className="text-xs text-neutral-500">Nenhuma sugestão por semelhança. Use a busca abaixo.</p>
                  )}
                  {p.sugestoes.map((s) => (
                    <label
                      key={s.produtoId}
                      title={s.motivos.join(" · ")}
                      className={clsx(
                        "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition",
                        e.produtoId === s.produtoId ? "border-secondary/50 bg-secondary/5" : "border-neutral-200 hover:bg-accent"
                      )}
                    >
                      <input
                        type="radio"
                        name={`sug-${p.codigo}`}
                        className="h-4 w-4 accent-secondary"
                        checked={e.produtoId === s.produtoId}
                        onChange={() => escolherSugestao(p, s)}
                      />
                      <span className="min-w-0 flex-1 truncate">{s.descricao}</span>
                      <span className="shrink-0 text-xs text-neutral-500">cód {s.codigo}{s.ativo ? "" : " · inativo"}</span>
                      <Badge tone={toneDaPontuacao(s.pontuacao)}>{Math.round(s.pontuacao * 100)}%</Badge>
                    </label>
                  ))}
                  {extra && (
                    <label className={clsx("flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm", e.produtoId === extra.produtoId ? "border-secondary/50 bg-secondary/5" : "border-neutral-200")}>
                      <input
                        type="radio"
                        name={`sug-${p.codigo}`}
                        className="h-4 w-4 accent-secondary"
                        checked={e.produtoId === extra.produtoId}
                        onChange={() => escolherManual(p, extra)}
                      />
                      <span className="min-w-0 flex-1 truncate">{extra.descricao}</span>
                      <span className="shrink-0 text-xs text-neutral-500">cód {extra.codigo}</span>
                      <Badge tone="info">busca manual</Badge>
                    </label>
                  )}
                </div>

                {p.motivoSemPreSelecao && MOTIVOS[p.motivoSemPreSelecao] && (
                  <p className="mt-1.5 text-xs text-warning">{MOTIVOS[p.motivoSemPreSelecao]}</p>
                )}
                <BuscaManual onEscolher={(produto) => escolherManual(p, produto)} />
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={salvando}
                title="Este código não corresponde a produto nenhum: fica fora da análise e nunca mais vira pendência"
                onClick={() => onFantasma([{ codigo: p.codigo, descricao: p.descricao }])}
              >
                Fantasma
              </Button>
            </li>
          );
        })}
      </ul>
    </Surface>
  );
}
