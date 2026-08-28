self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch {}
  const title = data.title ?? "재입고 알림";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body ?? "관심 상품이 재입고됐어요!",
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: data.url ?? "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(clients.openWindow(url));
});
