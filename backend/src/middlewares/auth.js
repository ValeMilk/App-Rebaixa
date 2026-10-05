const jwt = require("jsonwebtoken");
const { usuarioPode } = require("../services/permissoesService");

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Token ausente" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Token invalido" });
  }
}

// Checagem pelo NOME do perfil. Fica para regras que sao do perfil em si (ex.: filtros de escopo);
// o acesso a telas e acoes usa requirePermission.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Nao autenticado" });
    const effective = [req.user.role, ...(req.user.roles || [])];
    const ok = roles.some((r) => effective.includes(r));
    if (!ok) return res.status(403).json({ error: "Acesso negado" });
    next();
  };
}

/**
 * RBAC: libera se algum perfil do usuario tiver QUALQUER uma das permissoes informadas.
 * As permissoes de cada perfil vem do permissoesService (padrao + matriz editada pelo admin).
 */
function requirePermission(...chaves) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Nao autenticado" });
    try {
      if (await usuarioPode(req.user, ...chaves)) return next();
      return res.status(403).json({ error: "Acesso negado", permissao: chaves });
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { auth, requireRole, requirePermission };
