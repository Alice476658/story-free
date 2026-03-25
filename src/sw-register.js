export function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  // Avoid caching issues during local dev (Vite).
  // The build output (dist/) will still register SW normally.
  try {
    // Vite injects import.meta.env
    if (import.meta?.env && import.meta.env.DEV) return;
  } catch {
    // ignore
  }

  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    } catch (e) {
      // ignore
    }
  });
}

