function hasCJK(s) {
  return /[\u4E00-\u9FFF]/.test(s || "");
}

function pickLang(query, preferred) {
  if (preferred === "auto" || !preferred) return hasCJK(query) ? "zh" : "en";
  return preferred;
}

function wikiApiBase(lang) {
  return lang === "zh" ? "https://zh.wikipedia.org/w/api.php" : "https://en.wikipedia.org/w/api.php";
}

async function fetchJson(url, { signal } = {}) {
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return await res.json();
}

async function fetchJsonViaJina(url, { signal } = {}) {
  const proxied = `https://r.jina.ai/${url.replace(/^https?:\/\//, "http://")}`;
  const res = await fetch(proxied, { signal });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const text = await res.text();
  // r.jina.ai may return plain text; best-effort JSON extraction.
  try {
    return JSON.parse(text);
  } catch {
    const objStart = text.indexOf("{");
    const objEnd = text.lastIndexOf("}");
    if (objStart >= 0 && objEnd > objStart) {
      return JSON.parse(text.slice(objStart, objEnd + 1));
    }
    const arrStart = text.indexOf("[");
    const arrEnd = text.lastIndexOf("]");
    if (arrStart >= 0 && arrEnd > arrStart) {
      return JSON.parse(text.slice(arrStart, arrEnd + 1));
    }
    throw new Error("Proxy did not return JSON");
  }
}

function withTimeout(signal, timeoutMs) {
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason || new Error("aborted"));
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  const t = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
  controller.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(t);
      if (signal) signal.removeEventListener?.("abort", onAbort);
    },
    { once: true }
  );
  return controller.signal;
}

async function safeJson(url, { signal, timeoutMs = 8000, preferProxy = true } = {}) {
  const s = withTimeout(signal, timeoutMs);
  if (preferProxy) {
    try {
      return await fetchJsonViaJina(url, { signal: s });
    } catch {
      return await fetchJson(url, { signal: s });
    }
  }
  try {
    return await fetchJson(url, { signal: s });
  } catch {
    return await fetchJsonViaJina(url, { signal: s });
  }
}

const MEMO = new Map();

function cacheKey(prefix, obj) {
  return `${prefix}:${JSON.stringify(obj)}`;
}

function lsGet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    if (data.exp && Date.now() > data.exp) return null;
    return data.val ?? null;
  } catch {
    return null;
  }
}

function lsSet(key, val, ttlMs) {
  try {
    const exp = ttlMs ? Date.now() + ttlMs : 0;
    localStorage.setItem(key, JSON.stringify({ exp, val }));
  } catch {
    // ignore quota errors
  }
}

export async function openLibrarySearch(query, limit = 10, { signal } = {}) {
  const q = (query || "").trim();
  if (!q) return [];
  // Avoid spamming remote for very short inputs
  if (q.length < 2) return [];
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=${Math.max(
    1,
    Math.min(20, limit)
  )}`;

  const key = cacheKey("olSearch", { q, limit });
  if (MEMO.has(key)) return MEMO.get(key);
  const lsKey = `sfr:${key}`;
  const cached = lsGet(lsKey);
  if (cached) {
    MEMO.set(key, cached);
    return cached;
  }

  const data = await safeJson(url, { signal, timeoutMs: 8000, preferProxy: true });
  const docs = Array.isArray(data?.docs) ? data.docs : [];
  const out = docs.map((d) => {
    const workKey = d.key; // "/works/OL....W"
    const author = Array.isArray(d.author_name) ? d.author_name[0] : "";
    const cover = d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null;
    return {
      source: "openlibrary",
      id: `ol${workKey}`,
      workKey,
      title: d.title || "",
      author,
      lang: Array.isArray(d.language) ? d.language[0] : "",
      year: d.first_publish_year || null,
      cover,
      externalUrl: workKey ? `https://openlibrary.org${workKey}` : null
    };
  });
  MEMO.set(key, out);
  // Cache for 7 days
  lsSet(lsKey, out, 7 * 24 * 60 * 60 * 1000);
  return out;
}

export async function openLibraryWorkDetail(workKey, { signal } = {}) {
  if (!workKey) return { description: "" };
  const url = `https://openlibrary.org${workKey}.json`;

  const key = cacheKey("olWork", { workKey });
  if (MEMO.has(key)) return MEMO.get(key);
  const lsKey = `sfr:${key}`;
  const cached = lsGet(lsKey);
  if (cached) {
    MEMO.set(key, cached);
    return cached;
  }

  const data = await safeJson(url, { signal, timeoutMs: 8000, preferProxy: true });
  let desc = "";
  if (typeof data?.description === "string") desc = data.description;
  if (typeof data?.description?.value === "string") desc = data.description.value;
  const out = { description: desc || "" };
  MEMO.set(key, out);
  lsSet(lsKey, out, 30 * 24 * 60 * 60 * 1000);
  return out;
}

export async function wikipediaSummary(query, preferredLang = "auto", { signal } = {}) {
  const q = (query || "").trim();
  if (!q) return null;
  if (q.length < 2) return null;
  const lang = pickLang(q, preferredLang);
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`;

  const key = cacheKey("wikiSum", { q, lang });
  if (MEMO.has(key)) return MEMO.get(key);
  const lsKey = `sfr:${key}`;
  const cached = lsGet(lsKey);
  if (cached) {
    MEMO.set(key, cached);
    return cached;
  }

  try {
    const data = await safeJson(url, { signal, timeoutMs: 8000, preferProxy: true });
    const out = normalizeWikiSummary(data, lang);
    MEMO.set(key, out);
    lsSet(lsKey, out, 30 * 24 * 60 * 60 * 1000);
    return out;
  } catch {
    return null;
  }
}

export async function wikipediaOpenSearch(query, lang = "zh", limit = 5, { signal } = {}) {
  const q = (query || "").trim();
  if (!q || q.length < 2) return [];
  const api = wikiApiBase(lang);
  const url = `${api}?action=opensearch&search=${encodeURIComponent(q)}&limit=${Math.max(
    1,
    Math.min(10, limit)
  )}&namespace=0&format=json&origin=*`;

  const key = cacheKey("wikiOS", { q, lang, limit });
  if (MEMO.has(key)) return MEMO.get(key);
  const lsKey = `sfr:${key}`;
  const cached = lsGet(lsKey);
  if (cached) {
    MEMO.set(key, cached);
    return cached;
  }

  const data = await safeJson(url, { signal, timeoutMs: 8000, preferProxy: true });
  const titles = Array.isArray(data?.[1]) ? data[1] : [];
  const out = titles.filter(Boolean);
  MEMO.set(key, out);
  lsSet(lsKey, out, 30 * 24 * 60 * 60 * 1000);
  return out;
}

export async function wikipediaBestSummary(query, lang = "zh", { signal } = {}) {
  // Try exact title first
  const direct = await wikipediaSummary(query, lang, { signal });
  if (direct?.extract) return direct;
  // Fallback: search a better title, then fetch summary
  const titles = await wikipediaOpenSearch(query, lang, 5, { signal });
  if (!titles.length) return direct;
  for (const t of titles.slice(0, 3)) {
    const s = await wikipediaSummary(t, lang, { signal });
    if (s?.extract) return s;
  }
  return direct;
}

function wsApiBase(lang) {
  return lang === "en" ? "https://en.wikisource.org/w/api.php" : "https://zh.wikisource.org/w/api.php";
}

export async function wikisourceSearch(query, lang = "zh", limit = 10, { signal } = {}) {
  const q = (query || "").trim();
  if (!q || q.length < 2) return [];
  const api = wsApiBase(lang);
  const url = `${api}?action=opensearch&search=${encodeURIComponent(q)}&limit=${Math.max(
    1,
    Math.min(20, limit)
  )}&namespace=0&format=json&origin=*`;

  const key = cacheKey("wsSearch", { q, lang, limit });
  if (MEMO.has(key)) return MEMO.get(key);
  const lsKey = `sfr:${key}`;
  const cached = lsGet(lsKey);
  if (cached) {
    MEMO.set(key, cached);
    return cached;
  }

  const data = await safeJson(url, { signal, timeoutMs: 8000, preferProxy: true });

  // opensearch: [search, titles[], descs[], urls[]]
  const titles = Array.isArray(data?.[1]) ? data[1] : [];
  const descs = Array.isArray(data?.[2]) ? data[2] : [];
  const urls = Array.isArray(data?.[3]) ? data[3] : [];
  const out = titles.map((t, i) => ({
    source: "wikisource",
    id: `ws:${lang}:${t}`,
    lang,
    title: t,
    description: descs[i] || "",
    externalUrl: urls[i] || ""
  }));

  MEMO.set(key, out);
  lsSet(lsKey, out, 7 * 24 * 60 * 60 * 1000);
  return out;
}

export async function wikisourceFetchPlainText(title, lang = "zh", { signal } = {}) {
  const t = (title || "").trim();
  if (!t) return "";
  const api = wsApiBase(lang);
  // Prefer extracts (plain text) for speed and stability.
  const extractsUrl = `${api}?action=query&prop=extracts&explaintext=1&exsectionformat=plain&redirects=1&titles=${encodeURIComponent(
    t
  )}&formatversion=2&format=json&origin=*`;

  const key = cacheKey("wsPage", { title: t, lang });
  if (MEMO.has(key)) return MEMO.get(key);
  const lsKey = `sfr:${key}`;
  const cached = lsGet(lsKey);
  if (cached) {
    MEMO.set(key, cached);
    return cached;
  }

  let data = await safeJson(extractsUrl, { signal, timeoutMs: 10000, preferProxy: true });

  const pages = Array.isArray(data?.query?.pages) ? data.query.pages : [];
  let text = (pages[0]?.extract || "").trim();

  // Fallback to parse HTML if extracts is unavailable/empty for this page.
  if (!text) {
    const parseUrl = `${api}?action=parse&page=${encodeURIComponent(t)}&prop=text&formatversion=2&format=json&origin=*`;
    data = await safeJson(parseUrl, { signal, timeoutMs: 12000, preferProxy: true });
    const html = data?.parse?.text;
    if (typeof html !== "string" || !html) return "";
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("table, nav, .mw-editsection, .reference, sup, .toc, .infobox").forEach((n) => n.remove());
    text = (doc.body?.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
  }

  MEMO.set(key, text);
  lsSet(lsKey, text, 30 * 24 * 60 * 60 * 1000);
  return text;
}

function normalizeWikiSummary(data, lang) {
  if (!data || data.type === "https://mediawiki.org/wiki/HyperSwitch/errors/not_found") return null;
  return {
    source: "wikipedia",
    lang,
    title: data.title || "",
    extract: data.extract || "",
    externalUrl: data?.content_urls?.desktop?.page || "",
    thumbnail: data?.thumbnail?.source || ""
  };
}

