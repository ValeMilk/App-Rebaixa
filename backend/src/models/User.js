const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    nome: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    codigo: { type: String, required: true, unique: true, trim: true },
    senhaHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["vendedor", "supervisor", "diretoria", "admin"],
      default: "vendedor",
      required: true,
    },
    ativo: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.methods.compararSenha = function (senha) {
  return bcrypt.compare(senha, this.senhaHash);
};

userSchema.statics.gerarHash = function (senha) {
  return bcrypt.hash(senha, 10);
};

userSchema.methods.toJSON = function () {
  const { senhaHash, __v, ...rest } = this.toObject();
  return rest;
};

module.exports = mongoose.model("User", userSchema);
