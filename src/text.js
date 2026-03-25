export function normalizeText(raw) {
  let t = raw || "";
  t = t.replace(/\r\n/g, "\n");
  t = t.replace(/\r/g, "\n");
  // Collapse excessive blank lines while keeping paragraph breaks
  t = t.replace(/\n{4,}/g, "\n\n\n");
  return t.trim();
}

export function splitParagraphs(text) {
  const t = normalizeText(text);
  if (!t) return [];
  // Prefer blank-line separated paragraphs; fallback to single lines
  const parts = t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) return parts;
  return t.split("\n").map((p) => p.trim()).filter(Boolean);
}

export async function readTextFile(file) {
  const buf = await file.arrayBuffer();
  // Try UTF-8 first; fallback to GBK for common CN txt.
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  // Heuristic: if contains many �, try gbk
  const bad = (utf8.match(/\uFFFD/g) || []).length;
  if (bad >= 10) {
    try {
      return new TextDecoder("gbk", { fatal: false }).decode(buf);
    } catch {
      return utf8;
    }
  }
  return utf8;
}

export async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return await res.text();
}

