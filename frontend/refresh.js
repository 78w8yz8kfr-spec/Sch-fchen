(async () => {
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith("schaefchen-")).map((key) => caches.delete(key))
      );
    }
  } finally {
    window.location.replace(`./?aktualisiert=${Date.now()}`);
  }
})();
