const jwt = require("jsonwebtoken");

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

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Nao autenticado" });
    const effective = [req.user.role, ...(req.user.roles || [])];
    const ok = roles.some((r) => effective.includes(r));
    if (!ok) return res.status(403).json({ error: "Acesso negado" });
    next();
  };
}

module.exports = { auth, requireRole };
