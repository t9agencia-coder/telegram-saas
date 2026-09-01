// Service worker do PWA — escrito à mão (sem next-pwa/Workbox) de propósito: o
// único trabalho aqui é reagir a push/clique de notificação, então uma dependência
// de build inteira seria complexidade sem necessidade real.
//
// Não intercepta fetch/rede — nenhum comportamento de chamada de API existente muda.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Notificação', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Notificação';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-192.png',
    tag: data.tag,
    data: data.data || {},
    // renotify garante que uma segunda notificação com a mesma tag (ex: um retry)
    // ainda alerta o usuário, em vez de atualizar silenciosamente a existente.
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Clique na notificação sempre abre o contexto certo (nunca só a Home) — se já
// existir uma aba do app aberta, foca nela e navega; senão abre uma nova.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(targetUrl);
          return;
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
