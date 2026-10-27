/* eslint-disable no-restricted-globals */
// Service worker customizado: o next-pwa (customWorkerDir, padrao "worker") inclui este arquivo no sw.js gerado.
// Aqui ficam so as notificacoes push das pendencias; o cache/offline continua com o workbox.

self.__WB_DISABLE_DEV_LOGS = true;

var ICONE = "/icons/icon-192.png";

self.addEventListener("push", function (event) {
  var dados = { title: "InfoVale", body: "Você tem uma pendência nova.", url: "/pendencias", tag: null };
  if (event.data) {
    try {
      var json = event.data.json();
      dados = Object.assign(dados, json || {});
    } catch (e) {
      try { dados.body = event.data.text(); } catch (e2) {}
    }
  }
  var opcoes = {
    body: dados.body,
    icon: ICONE,
    badge: ICONE,
    tag: dados.tag || undefined,
    renotify: !!dados.tag,
    data: { url: dados.url || "/pendencias" },
  };
  event.waitUntil(self.registration.showNotification(dados.title || "InfoVale", opcoes));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || "/pendencias";
  var destino = new URL(url, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (lista) {
      // Foca uma aba do app ja aberta (navegando para a url) ou abre uma nova
      for (var i = 0; i < lista.length; i++) {
        var c = lista[i];
        if (c.url && c.url.indexOf(self.location.origin) === 0 && "focus" in c) {
          return c.focus().then(function (cliente) {
            if (cliente && "navigate" in cliente && cliente.url !== destino) return cliente.navigate(destino);
            return cliente;
          });
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(destino);
      return null;
    })
  );
});
