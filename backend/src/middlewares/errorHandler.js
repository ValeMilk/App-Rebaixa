function errorHandler(err, _req, res, _next) {
  // eslint-disable-next-line no-console
  console.error("[error]", err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.publicMessage || err.message || "Erro interno",
  });
}

module.exports = errorHandler;
