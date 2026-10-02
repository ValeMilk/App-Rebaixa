"use client";

import StatTile from "@/components/ui/StatTile";
import { fmtBRL } from "@/lib/utils";

const n = (v) => Number(v || 0).toLocaleString("pt-BR");

/** Cartoes-resumo da leitura: linhas, lojas, produtos e valor em estoque. */
export default function ResumoCards({ resumo }) {
  const r = resumo;
  const lojasTodas = r.lojasNoArquivo > 0 && r.lojasReconhecidas === r.lojasNoArquivo;
  const prodTodos = r.produtosNoArquivo > 0 && r.produtosPendentes === 0;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        label="Linhas válidas"
        valor={n(r.linhasValidas)}
        apoio={`${n(r.linhasDescartadas)} descartadas`}
        direita={`${n(r.totalLinhasArquivo)} no arquivo`}
        tone="primary"
      />
      <StatTile
        label="Lojas reconhecidas"
        valor={`${n(r.lojasReconhecidas)} de ${n(r.lojasNoArquivo)}`}
        apoio={lojasTodas ? "todas cadastradas" : "há lojas sem cadastro"}
        tone={lojasTodas ? "success" : "warning"}
      />
      <StatTile
        label="Produtos reconhecidos"
        valor={`${n(r.produtosReconhecidos)} de ${n(r.produtosNoArquivo)}`}
        apoio={`${n(r.produtosFantasma)} fantasma · ${n(r.produtosPendentes)} pendentes`}
        tone={prodTodos ? "success" : "warning"}
      />
      <StatTile
        label="Valor em estoque"
        valor={fmtBRL(r.valorTotalEstoque)}
        apoio={`Venda 30 dias: ${fmtBRL(r.vendaTotal)}`}
        tone="neutral"
      />
    </div>
  );
}
