"use client";
import { useTituloDaPagina } from "@/components/PageTitleContext";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { pode } from "@/lib/permissoes";
import Surface from "@/components/ui/Surface";
import Skeleton from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import { IcoPercent } from "@/components/Icons";
import RedesLista from "@/components/margensRede/RedesLista";
import MargensForm from "@/components/margensRede/MargensForm";
import CustoMedioCard from "@/components/margensRede/CustoMedioCard";

const STORAGE_KEY = "margens_rede_selecionada";
const msgErro = (err, padrao) => err?.response?.data?.error || padrao;

/**
 * Margens por Rede (v2.0, fase 3): lista de redes a esquerda; a direita, os blocos Margens
 * (so com margens_rede.gerenciar) e Custo medio (com custo_medio.anexar; o backend decide quem anexa).
 * Um supervisor responsavel sem "gerenciar" ve so as redes dele e so o custo medio.
 */
export default function MargensRedesPage() {
  useTituloDaPagina("Margens por Rede", "Margem operacional, custo médio e modelos de cada rede");
  const { user, loading: authLoading } = useAuth();

  const [redes, setRedes] = useState(null);
  const [codigoRede, setCodigoRede] = useState("");
  const [detalhe, setDetalhe] = useState(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const podeVer = pode(user, "margens_rede.gerenciar", "custo_medio.anexar");
  const gerencia = pode(user, "margens_rede.gerenciar");
  const anexa = pode(user, "custo_medio.anexar");

  const carregarRedes = useCallback(async () => {
    try {
      const { data } = await api.get("/margens-rede");
      const lista = data.redes || [];
      setRedes(lista);
      return lista;
    } catch (err) {
      setRedes([]);
      setErro(msgErro(err, "Não foi possível carregar as redes."));
      return [];
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user || !podeVer) return;
    (async () => {
      const lista = await carregarRedes();
      let salvo = "";
      try { salvo = sessionStorage.getItem(STORAGE_KEY) || ""; } catch {}
      if (salvo && lista.some((r) => r.codigoRede === salvo)) setCodigoRede(salvo);
      else if (lista.length === 1) setCodigoRede(lista[0].codigoRede);
    })();
  }, [authLoading, user, podeVer, carregarRedes]);

  const carregarDetalhe = useCallback(async (rede) => {
    if (!rede) { setDetalhe(null); return; }
    setCarregandoDetalhe(true);
    setErro("");
    try {
      const { data } = await api.get(`/margens-rede/${rede}`);
      setDetalhe(data);
    } catch (err) {
      setDetalhe(null);
      setErro(msgErro(err, "Não foi possível carregar a rede."));
    } finally {
      setCarregandoDetalhe(false);
    }
  }, []);

  useEffect(() => { carregarDetalhe(codigoRede); }, [codigoRede, carregarDetalhe]);

  function selecionar(valor) {
    setCodigoRede(valor);
    setAviso("");
    setErro("");
    try { if (valor) sessionStorage.setItem(STORAGE_KEY, valor); else sessionStorage.removeItem(STORAGE_KEY); } catch {}
  }

  async function salvar(dados) {
    setSalvando(true);
    setErro("");
    setAviso("");
    try {
      const { data } = await api.put(`/margens-rede/${codigoRede}`, dados);
      setDetalhe((d) => (d ? { ...d, config: data.config } : d));
      setAviso("Margens salvas. A precificação passa a usar os novos valores em até um minuto.");
      carregarRedes();
    } catch (err) {
      setErro(msgErro(err, "Não foi possível salvar as margens."));
    } finally {
      setSalvando(false);
    }
  }

  async function aoImportar() {
    await Promise.all([carregarDetalhe(codigoRede), carregarRedes()]);
  }

  if (authLoading || !user || !podeVer) return null;

  const redeAtual = (redes || []).find((r) => r.codigoRede === codigoRede) || null;

  return (
    <div className="space-y-4">
      {!gerencia && (
        <p className="text-sm text-neutral-600">
          Você vê as redes em que é o <strong>supervisor responsável</strong> e pode anexar a planilha de custo médio delas.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <RedesLista redes={redes || []} selecionada={codigoRede} onSelecionar={selecionar} carregando={redes === null} />

        <div className="min-w-0 space-y-4">
          {erro && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
          {aviso && <p role="status" className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">{aviso}</p>}

          {!codigoRede ? (
            <Surface>
              <EmptyState
                icon={IcoPercent}
                titulo="Escolha uma rede"
                descricao={gerencia ? "Cadastre a margem operacional, as margens por categoria ou loja e importe o custo médio." : "Selecione a rede para ver e anexar o custo médio."}
              />
            </Surface>
          ) : carregandoDetalhe && !detalhe ? (
            <div className="space-y-4">
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : detalhe ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold text-neutral-900">{detalhe.rede.nome}</h2>
                <span className="text-xs text-neutral-500">Código {detalhe.rede.codigoRede} · {Number(detalhe.lojas.length).toLocaleString("pt-BR")} lojas na carteira</span>
              </div>

              {gerencia && detalhe.podeGerenciar && (
                <MargensForm
                  key={detalhe.rede.codigoRede}
                  config={detalhe.config}
                  lojas={detalhe.lojas}
                  categorias={detalhe.categorias}
                  onSalvar={salvar}
                  salvando={salvando}
                />
              )}

              {(anexa || gerencia) && (
                <CustoMedioCard
                  key={`cm-${detalhe.rede.codigoRede}`}
                  codigoRede={detalhe.rede.codigoRede}
                  versoes={detalhe.versoes}
                  podeAnexar={anexa && detalhe.podeAnexar}
                  responsavel={detalhe.responsavel}
                  onImportado={aoImportar}
                />
              )}
            </>
          ) : (
            redeAtual && <Surface><EmptyState icon={IcoPercent} titulo="Não foi possível carregar esta rede" /></Surface>
          )}
        </div>
      </div>
    </div>
  );
}
