const mongoose = require("mongoose");

/** Inscricao de push (Web Push / VAPID) de um navegador ou celular de um usuario. */
const pushSubscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, default: null },
    ultimoEnvioEm: { type: Date, default: null },
    falhas: { type: Number, default: 0 },
    ultimoErro: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PushSubscription", pushSubscriptionSchema);
