const mongoose = require("mongoose");

/**
 * Visita planejada na agenda semanal de um supervisor (substitui a agenda mandada no WhatsApp).
 * Um registro = uma cidade num dia, de dia inteiro ou num horario; opcionalmente com as lojas a visitar.
 * `data` e texto "AAAA-MM-DD" (sem fuso) e os horarios "HH:MM".
 */
const agendaVisitaSchema = new mongoose.Schema(
  {
    donoId:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    donoCodigo:  { type: String, required: true, index: true },
    donoNome:    { type: String, required: true },
    data:        { type: String, required: true },
    diaInteiro:  { type: Boolean, default: false },
    inicio:      { type: String, default: null },
    fim:         { type: String, default: null },
    // A visita precisa de cidade OU de redes/subredes (um supervisor pode atender uma cidade so e visitar varias redes)
    cidade:      { type: String, default: "", trim: true },
    cidadeChave: { type: String, default: "" }, // minusculas e sem acento: agrupa grafias iguais
    redes: [
      {
        _id: false,
        codigoRede: { type: String, required: true }, // classe (rede) da carteira
        nome:       { type: String },
      },
    ],
    subredes: [
      {
        _id: false,
        codigoRede: { type: String },                 // rede a que a subrede (subclasse) pertence
        redeNome:   { type: String },
        nome:       { type: String, required: true },
      },
    ],
    lojas: [
      {
        _id: false,
        clienteCodigo: { type: String, required: true },
        clienteNome:   { type: String },
      },
    ],
    observacao:    { type: String, default: "" },
    criadoPorNome: { type: String },
  },
  { timestamps: true }
);

agendaVisitaSchema.index({ donoCodigo: 1, data: 1 });
agendaVisitaSchema.index({ data: 1 });

module.exports = mongoose.model("AgendaVisita", agendaVisitaSchema);
