function shouldSkipServiceWorker() {
  const ua = navigator.userAgent || "";
  // 华为自带浏览器等旧 WebView 上 SW 易卡住或异常，直接跳过仍可正常用站点
  if (/HuaweiBrowser|HUAWEI|HBPC|Petal/i.test(ua)) return true;
  return false;
}

export function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  if (shouldSkipServiceWorker()) return;
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

