const mongoose = require("mongoose");

/**
 * Cadastro de margens por rede (v2.0, fase 3). Uma configuracao por rede (codigoRede da Carteira).
 * Usado pelo sellout automatico: a rede mantem a margem dela no preco da oferta.
 *   margem da loja/produto = margensPorLoja[clienteCodigo] ?? margensPorCategoria[categoria] ?? margemOperacional
 * O custo medio da rede (planilha, so Mix Mateus por enquanto) fica em CustoMedioRede.
 */
const configRedeSchema = new mongoose.Schema(
  {
    codigoRede: { type: String, required: true, unique: true, index: true },
    redeSubrede: { type: String, default: null },

    margemOperacional: { type: Number, default: null }, // 0-100, um valor para a rede
    margensPorLoja: {
      type: [new mongoose.Schema({ clienteCodigo: { type: String, required: true }, clienteNome: { type: String, default: null }, margem: { type: Number, required: true } }, { _id: false })],
      default: [],
    },
    margensPorCategoria: {
      type: [new mongoose.Schema({ categoria: { type: String, required: true }, margem: { type: Number, required: true } }, { _id: false })],
      default: [],
    },

    // Piso da escalada de aprovacao: o valor que a Valemilk recebe e comparado com este preco do item
    piso: { type: String, enum: ["minimo", "p3"], default: "minimo" },

    // Envio centralizado a rede (fase 4 usa; aqui so o cadastro)
    diaLimite: {
      diaSemana: { type: Number, min: 0, max: 6, default: null }, // 0 = domingo
      hora: { type: String, default: null }, // "HH:MM"
    },
    modeloEmail: {
      assunto: { type: String, default: null },
      texto: { type: String, default: null },
    },
    modeloExcel: { type: String, default: null },

    atualizadoPorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    atualizadoPorNome: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ConfigRede", configRedeSchema);
