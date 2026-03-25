let t2cn = null;
let loadPromise = null;

async function ensureConverter() {
  if (t2cn) return t2cn;
  if (!loadPromise) {
    loadPromise = import("opencc-js").then((OpenCC) => {
      // opencc-js ESM namespace import shape
      const mod = OpenCC?.default ? OpenCC.default : OpenCC;
      const conv = mod.Converter({ from: "t", to: "cn" });
      t2cn = conv;
      return conv;
    });
  }
  return await loadPromise;
}

export async function toSimplifiedChinese(text) {
  if (!text) return "";
  const conv = await ensureConverter();
  return conv(text);
}

