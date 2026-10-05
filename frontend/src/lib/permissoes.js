// RBAC no front: as permissoes efetivas chegam em `user.permissoes` (login e /auth/me).
// Aqui so se decide o que MOSTRAR; quem barra de verdade e a API.

/** O usuario tem ao menos uma das permissoes? */
export function pode(user, ...chaves) {
  const lista = user?.permissoes || [];
  return chaves.some((c) => lista.includes(c));
}

export const PERFIL_LABEL = { vendedor: "Vendedor", supervisor: "Supervisor", diretoria: "Diretoria", admin: "Admin" };
