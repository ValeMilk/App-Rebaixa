"use client";
import { useTituloDaPagina } from "@/components/PageTitleContext";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { fmtDataHora } from "@/lib/utils";
import Surface from "@/components/ui/Surface";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";

const msgErro = (err, padrao) => err?.response?.data?.error || padrao;
const mesmaLista = (a, b) => a.length === b.length && a.every((c) => b.includes(c));

export default function PermissoesPage() {
  useTituloDaPagina("Permissões", "O que cada perfil pode abrir e fazer");

  const [grupos, setGrupos] = useState([]);
  const [perfis, setPerfis] = useState(null);
  const [rascunho, setRascunho] = useState({}); // { perfil: [chaves] } so dos perfis editaveis
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const aplicar = useCallback((data) => {
    setGrupos(data.grupos || []);
    setPerfis(data.perfis || []);
    setRascunho(Object.fromEntries((data.perfis || []).filter((p) => p.editavel).map((p) => [p.perfil, p.permissoes])));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/permissoes");
        aplicar(data);
      } catch (err) {
        setErro(msgErro(err, "Não foi possível carregar as permissões."));
        setPerfis([]);
      }
    })();
  }, [aplicar]);

  const alterados = useMemo(
    () => (perfis || []).filter((p) => p.editavel && rascunho[p.perfil] && !mesmaLista(rascunho[p.perfil], p.permissoes)),
    [perfis, rascunho]
  );
  const totalAlteracoes = alterados.reduce((n, p) => {
    const novo = rascunho[p.perfil];
    return n + novo.filter((c) => !p.permissoes.includes(c)).length + p.permissoes.filter((c) => !novo.includes(c)).length;
  }, 0);

  // Avisa antes de sair da pagina com alteracoes por salvar
  useEffect(() => {
    if (!alterados.length) return;
    const aoSair = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", aoSair);
    return () => window.removeEventListener("beforeunload", aoSair);
  }, [alterados.length]);

  function alternar(perfil, chave) {
    setAviso("");
    setRascunho((r) => {
      const atual = r[perfil] || [];
      return { ...r, [perfil]: atual.includes(chave) ? atual.filter((c) => c !== chave) : [...atual, chave] };
    });
  }

  function descartar() {
    setRascunho(Object.fromEntries(perfis.filter((p) => p.editavel).map((p) => [p.perfil, p.permissoes])));
    setErro("");
  }

  async function salvar() {
    setSalvando(true);
    setErro("");
    setAviso("");
    try {
      let data;
      for (const p of alterados) ({ data } = await api.put(`/permissoes/${p.perfil}`, { permissoes: rascunho[p.perfil] }));
      // mantem o rascunho dos perfis que ainda nao foram gravados, caso um falhe no meio
      if (data) aplicar(data);
      setAviso("Permissões salvas. Já valem; quem está com o sistema aberto vê o menu novo ao voltar para a aba ou recarregar a página.");
    } catch (err) {
      setErro(msgErro(err, "Não foi possível salvar as permissões."));
    } finally {
      setSalvando(false);
    }
  }

  async function restaurar(p) {
    if (!confirm(`Voltar o perfil ${p.label} às permissões padrão? As alterações feitas neste perfil serão perdidas.`)) return;
    setSalvando(true);
    setErro("");
    setAviso("");
    try {
      const { data } = await api.post(`/permissoes/${p.perfil}/restaurar`);
      const outros = rascunho;
      aplicar(data);
      // preserva o que estava sendo editado nos outros perfis
      setRascunho((r) => ({ ...r, ...Object.fromEntries(Object.entries(outros).filter(([perfil]) => perfil !== p.perfil)) }));
      setAviso(`Perfil ${p.label} voltou ao padrão.`);
    } catch (err) {
      setErro(msgErro(err, "Não foi possível restaurar o perfil."));
    } finally {
      setSalvando(false);
    }
  }

  if (!perfis) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Surface className="p-4 text-sm text-neutral-600">
        <p>
          Cada usuário tem um <strong className="font-semibold text-neutral-800">perfil</strong> (definido em{" "}
          <Link href="/admin/usuarios" className="text-secondary underline-offset-4 hover:underline">Usuários</Link>) e cada perfil tem as
          permissões marcadas abaixo. Quem tem perfis adicionais soma as permissões de todos eles.
        </p>
        <p className="mt-1.5">
          A permissão libera a tela ou a ação. <strong className="font-semibold text-neutral-800">Os dados que cada pessoa enxerga não mudam</strong>:
          vendedor vê a própria carteira, supervisor as suas redes, diretoria e admin veem tudo.
        </p>
      </Surface>

      {erro && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
      {aviso && <p role="status" className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">{aviso}</p>}

      {perfis.length > 0 && (
        <Surface className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm" id="matriz-permissoes">
            <thead>
              <tr className="border-b border-neutral-200 align-top">
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">Permissão</th>
                {perfis.map((p) => (
                  <th key={p.perfil} scope="col" className="w-36 px-3 py-3 text-center font-normal" data-perfil={p.perfil}>
                    <div className="text-sm font-semibold text-neutral-800">{p.label}</div>
                    <div className="mt-0.5 text-[11px] text-neutral-500">{p.usuarios} {p.usuarios === 1 ? "usuário" : "usuários"}</div>
                    <div className="mt-1.5 flex flex-col items-center gap-1">
                      {!p.editavel ? (
                        <Badge tone="neutral">Acesso total</Badge>
                      ) : p.personalizado ? (
                        <>
                          <Badge tone="warning" title={p.atualizadoPorNome ? `Alterado por ${p.atualizadoPorNome} em ${fmtDataHora(p.atualizadoEm)}` : undefined}>Personalizado</Badge>
                          <button type="button" onClick={() => restaurar(p)} disabled={salvando} className="text-[11px] text-secondary underline-offset-4 hover:underline disabled:opacity-50">
                            Restaurar padrão
                          </button>
                        </>
                      ) : (
                        <Badge tone="neutral">Padrão</Badge>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                <Fragment key={g.id}>
                  <tr className="border-b border-neutral-100 bg-neutral-50">
                    <th scope="colgroup" colSpan={perfis.length + 1} className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-600">
                      {g.label}
                    </th>
                  </tr>
                  {g.permissoes.map((perm) => (
                    <tr key={perm.chave} className="border-b border-neutral-100 last:border-0" data-permissao={perm.chave}>
                      <th scope="row" className="px-4 py-2.5 text-left font-normal">
                        <div className="font-medium text-neutral-800">{perm.label}</div>
                        <div className="mt-0.5 text-xs text-neutral-500">{perm.descricao}</div>
                      </th>
                      {perfis.map((p) => {
                        const naoSeAplica = p.editavel && (perm.somenteAdmin || (perm.naoSeAplica || []).includes(p.perfil));
                        if (naoSeAplica) {
                          return (
                            <td key={p.perfil} className="px-3 py-2.5 text-center text-neutral-300" title={perm.somenteAdmin ? "Exclusiva do perfil Admin" : `Não se aplica ao perfil ${p.label}`}>
                              <span aria-hidden>—</span>
                              <span className="sr-only">Não se aplica</span>
                            </td>
                          );
                        }
                        const marcado = p.editavel ? (rascunho[p.perfil] || []).includes(perm.chave) : true;
                        const mudou = p.editavel && marcado !== p.permissoes.includes(perm.chave);
                        return (
                          <td key={p.perfil} className={`px-3 py-2.5 text-center ${mudou ? "bg-warning/10" : ""}`}>
                            <input
                              type="checkbox"
                              aria-label={`${perm.label} para o perfil ${p.label}`}
                              title={!p.editavel ? "O perfil Admin tem sempre todas as permissões" : undefined}
                              className="h-4 w-4 cursor-pointer rounded border-neutral-300 align-middle accent-secondary disabled:cursor-not-allowed disabled:opacity-50"
                              checked={marcado}
                              disabled={!p.editavel || salvando}
                              onChange={() => alternar(p.perfil, perm.chave)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </Surface>
      )}

      {alterados.length > 0 && (
        <div className="sticky bottom-20 z-30 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-lg lg:bottom-4" id="barra-salvar">
          <span className="text-sm text-neutral-700">
            <b>{totalAlteracoes}</b> {totalAlteracoes === 1 ? "alteração não salva" : "alterações não salvas"} em {alterados.map((p) => p.label).join(", ")}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={descartar} disabled={salvando}>Descartar</Button>
            <Button size="sm" onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar permissões"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
