import { searchCatalog } from "./catalog.js";
import { addToBookshelf, exportBackup, importBackup, loadState, recordOpen, removeFromBookshelf, saveState, setProgress, upsertBook } from "./store.js";
import { openLibrarySearch, openLibraryWorkDetail, wikipediaBestSummary, wikisourceFetchPlainText, wikisourceSearch } from "./search.js";
import { fetchText, normalizeText, splitParagraphs } from "./text.js";
import { toSimplifiedChinese } from "./convert.js";

const app = document.getElementById("app");

function toProxyUrl(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    const httpish = u.protocol === "http:" || u.protocol === "https:";
    if (!httpish) return url;
    // Many networks block direct access to some sources; provide a readable proxy.
    return `https://r.jina.ai/http://${u.host}${u.pathname}${u.search}${u.hash}`;
  } catch {
    return url;
  }
}

/** 普通搜索页链接（与你在浏览器地址栏打开一样），应用不抓取第三方正文。 */
function webSearchUrl(engine, query) {
  const q = encodeURIComponent((query || "").trim());
  switch (engine) {
    case "baidu":
      return `https://www.baidu.com/s?wd=${q}`;
    case "bing":
      return `https://www.bing.com/search?q=${q}`;
    case "ddg":
      return `https://duckduckgo.com/?q=${q}`;
    case "sogou":
      return `https://www.sogou.com/web?query=${q}`;
    default:
      return `https://www.baidu.com/s?wd=${q}`;
  }
}

function externalSearchCard(query) {
  const t = (query || "").trim();
  if (!t) return el("div");
  return el("div", { class: "card" }, [
    el("div", { class: "cardTop" }, [
      el("div", { class: "cardTitle", text: "用浏览器搜索本书" }),
      el("div", { class: "badge", text: "仅链接" })
    ]),
    el("div", {
      class: "muted small",
      text: "下面只是跳转到各搜索引擎结果页（和你自己打开浏览器搜一样）。本应用不会像爬虫那样批量抓取小说站正文。"
    }),
    el("div", { class: "cardActions" }, [
      el("a", { class: "btn ghost", href: webSearchUrl("baidu", t), target: "_blank", rel: "noreferrer" }, [el("span", { text: "百度搜索" })]),
      el("a", { class: "btn ghost", href: webSearchUrl("bing", t), target: "_blank", rel: "noreferrer" }, [el("span", { text: "必应" })]),
      el("a", { class: "btn ghost", href: webSearchUrl("sogou", t), target: "_blank", rel: "noreferrer" }, [el("span", { text: "搜狗" })]),
      el("a", { class: "btn ghost", href: webSearchUrl("ddg", t), target: "_blank", rel: "noreferrer" }, [el("span", { text: "DuckDuckGo" })])
    ])
  ]);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) node.setAttribute(k, "");
    else if (v !== false && v != null) node.setAttribute(k, String(v));
  }
  for (const c of children) node.append(c);
  return node;
}

function formatPct(p) {
  if (p == null || Number.isNaN(p)) return "0%";
  return `${Math.max(0, Math.min(100, Math.round(p * 100)))}%`;
}

function route() {
  const h = location.hash || "#/";
  const [path, qs] = h.slice(1).split("?");
  const params = new URLSearchParams(qs || "");
  return { path, params };
}

function navTo(path, params = {}) {
  const sp = new URLSearchParams(params);
  location.hash = `#${path}${sp.toString() ? `?${sp.toString()}` : ""}`;
}

function layout({ title, actions = null, content }) {
  const header = el("header", { class: "header" }, [
    el("div", { class: "brand", text: "Story Free Reader" }),
    el("div", { class: "spacer" }),
    actions || el("div")
  ]);
  const main = el("main", { class: "main" }, [content]);
  const footer = el("footer", { class: "footer" }, [
    el("div", { class: "muted", text: title || "阅读器（PWA）" })
  ]);
  return el("div", { class: "shell" }, [header, main, footer]);
}

function toast(message) {
  const t = el("div", { class: "toast", text: message });
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 250);
  }, 1800);
}

function bookCard(state, bookId, { onOpen, onRemove } = {}) {
  const b = state.books[bookId];
  if (!b) return el("div");
  const pct = b.progress?.pct ?? 0;
  return el("div", { class: "card" }, [
    el("div", { class: "cardTop" }, [
      el("div", { class: "cardTitle", text: b.title || "未命名" }),
      el("div", { class: "badge", text: formatPct(pct) })
    ]),
    el("div", { class: "cardMeta muted", text: [b.author, b.lang].filter(Boolean).join(" · ") || "本地/导入" }),
    el("div", { class: "cardActions" }, [
      el("button", { class: "btn", onClick: () => onOpen?.(bookId), type: "button" }, [el("span", { text: "继续阅读" })]),
      el("button", { class: "btn ghost", onClick: () => onRemove?.(bookId), type: "button" }, [el("span", { text: "移出书架" })])
    ])
  ]);
}

function homeView(state) {
  const qInput = el("input", { class: "input", placeholder: "输入书名 / 作者（例：小王子 / 海明威 / The Little Prince）", value: "" });
  const resultsBox = el("div", { class: "stack" });
  const shelfBox = el("div", { class: "stack" });
  const recentBox = el("div", { class: "stack" });
  const hintBar = el("div", { class: "row hintBar" });

  const langSelect = el(
    "select",
    { class: "input" },
    [
      el("option", { value: "auto", text: "简介语言：自动" }),
      el("option", { value: "zh", text: "简介语言：中文" }),
      el("option", { value: "en", text: "简介语言：English" })
    ]
  );
  langSelect.value = "auto";
  const searchBtn = el("button", { class: "btn", type: "button" }, [el("span", { text: "搜索" })]);
  const searchRow = el("div", { class: "searchRow" }, [qInput, searchBtn]);

  let hasSearched = false;
  const fullTextOnlyKey = "sfr:pref:fullTextOnly";
  const fullTextOnly = el(
    "select",
    { class: "input" },
    [el("option", { value: "0", text: "结果类型：书目/简介（推荐）" }), el("option", { value: "1", text: "结果类型：只看可阅读全文（公版/授权）" })]
  );
  fullTextOnly.value = localStorage.getItem(fullTextOnlyKey) || "0";
  fullTextOnly.addEventListener("change", () => {
    localStorage.setItem(fullTextOnlyKey, fullTextOnly.value);
    if (hasSearched) renderResults();
  });

  function renderShelf() {
    shelfBox.replaceChildren();
    if (!state.bookshelf.length) {
      shelfBox.append(el("div", { class: "muted", text: "书架还是空的。你可以先搜索书名/作者，把结果加入书架。" }));
      return;
    }
    for (const id of state.bookshelf) {
      shelfBox.append(
        bookCard(state, id, {
          onOpen: (bookId) => navTo("/read", { id: bookId }),
          onRemove: (bookId) => {
            removeFromBookshelf(state, bookId);
            saveState(state);
            renderShelf();
            toast("已移出书架");
          }
        })
      );
    }
  }

  function renderRecent() {
    recentBox.replaceChildren();
    const hist = Array.isArray(state.ui?.history) ? state.ui.history : [];
    if (!hist.length) {
      recentBox.append(el("div", { class: "muted", text: "最近阅读为空。打开任意一本书后会自动记录。" }));
      return;
    }
    for (const h of hist.slice(0, 6)) {
      const bookId = h.bookId;
      const b = state.books?.[bookId];
      if (!b) continue;
      recentBox.append(
        el("div", { class: "card" }, [
          el("div", { class: "cardTop" }, [
            el("div", { class: "cardTitle", text: b.title || "未命名" }),
            el("div", { class: "badge", text: formatPct(b.progress?.pct ?? 0) })
          ]),
          el("div", { class: "cardMeta muted", text: [b.author, b.lang].filter(Boolean).join(" · ") }),
          el("div", { class: "cardActions" }, [
            el("button", { class: "btn", type: "button", onClick: () => navTo("/read", { id: bookId }) }, [
              el("span", { text: "继续阅读" })
            ])
          ])
        ])
      );
    }
  }

  async function backupCopy() {
    const payload = JSON.stringify(exportBackup(state));
    try {
      await navigator.clipboard.writeText(payload);
      toast("已复制备份到剪贴板");
    } catch {
      toast("复制失败：请手动复制");
      prompt("备份内容（复制保存）", payload);
    }
  }

  function backupRestore() {
    const raw = prompt("粘贴备份内容（JSON）");
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      const next = importBackup(state, data);
      saveState(next);
      toast("已恢复备份");
      renderApp();
    } catch {
      toast("备份内容无效");
    }
  }

  async function addCatalogBook(item) {
    const id = item.id;
    upsertBook(state, { ...item, kind: "remote", text: null, paragraphs: null });
    addToBookshelf(state, id);
    saveState(state);
    toast("已加入书架");
    navTo("/read", { id });
  }

  async function addLinkBook(item) {
    const id = item.id;
    upsertBook(state, {
      id,
      kind: "link",
      title: item.title,
      author: item.author || "",
      lang: item.lang || "",
      year: item.year || null,
      cover: item.cover || null,
      externalUrl: item.externalUrl || "",
      proxyUrl: item.externalUrl ? toProxyUrl(item.externalUrl) : "",
      description: item.description || "",
      text: null,
      paragraphs: null
    });
    addToBookshelf(state, id);
    saveState(state);
    toast("已加入书架（简介/外链）");
    navTo("/read", { id });
  }

  async function addWikisourceBook(item) {
    const id = item.id;
    upsertBook(state, {
      id,
      kind: "wikisource",
      title: item.title,
      author: "",
      lang: item.lang,
      externalUrl: item.externalUrl || "",
      proxyUrl: item.externalUrl ? toProxyUrl(item.externalUrl) : "",
      wsTitle: item.title,
      wsLang: item.lang,
      description: item.description || "",
      text: null,
      paragraphs: null
    });
    addToBookshelf(state, id);
    saveState(state);
    toast("已加入书架（安全全文）");
    navTo("/read", { id });
  }

  function renderResults() {
    const q = qInput.value.trim();
    resultsBox.replaceChildren();
    hintBar.replaceChildren();
    if (!q || !hasSearched) {
      hintBar.append(
        el("div", {
          class: "muted small",
          text: "提示：输入书名/作者后，点“搜索”或按回车。支持中英文查询与简介。"
        })
      );
      return;
    }
    if (q.length < 2) {
      hintBar.append(el("div", { class: "muted small", text: "至少输入 2 个字/字符再搜索。" }));
      return;
    }
    resultsBox.append(externalSearchCard(q));
    const local = searchCatalog(q);
    if (local.length) {
      hintBar.append(el("div", { class: "badge", text: `公版全文：${local.length}` }));
    }
    hintBar.append(el("div", { class: "badge", text: "安全全文：维基文库（中/英）" }));
    if (fullTextOnly.value !== "1") hintBar.append(el("div", { class: "badge", text: "全网简介：Open Library + Wikipedia（中英）" }));

    if (fullTextOnly.value === "1") {
      resultsBox.append(
        el("div", {
          class: "muted small",
          text: "只显示“可阅读全文（公版/授权）”的结果。若你搜的是现代版权书，可能只有书目/简介，没有免费合规全文。"
        })
      );
    } else {
      // Render local public-domain full-text results first
      for (const it of local) {
        resultsBox.append(
          el("div", { class: "card" }, [
            el("div", { class: "cardTop" }, [
              el("div", { class: "cardTitle", text: it.title }),
              el("div", { class: "badge", text: (it.lang || "").toUpperCase() || "TXT" })
            ]),
            el("div", { class: "cardMeta muted", text: it.author || "" }),
            el("div", { class: "cardActions" }, [
              el("button", { class: "btn", type: "button", onClick: () => addCatalogBook(it) }, [
                el("span", { text: "加入书架并打开全文" })
              ])
            ])
          ])
        );
      }
    }

    // Async web search results (wikisource + books + intro)
    const loading = el("div", { class: "muted", text: "正在查找书籍与简介…" });
    resultsBox.append(loading);
    (async () => {
      const reqId = crypto.randomUUID();
      renderResults._reqId = reqId;
      if (renderResults._abort) renderResults._abort.abort();
      const abort = new AbortController();
      renderResults._abort = abort;

      let wsZh = [];
      let wsEn = [];
      let wsZhErr = "";
      let wsEnErr = "";
      try {
        wsZh = await wikisourceSearch(q, "zh", 8, { signal: abort.signal });
      } catch (e) {
        wsZh = [];
        wsZhErr = e?.message || String(e);
      }
      try {
        wsEn = await wikisourceSearch(q, "en", 8, { signal: abort.signal });
      } catch (e) {
        wsEn = [];
        wsEnErr = e?.message || String(e);
      }

      let olItems = [];
      let olErr = "";
      if (fullTextOnly.value !== "1") {
        try {
          olItems = await openLibrarySearch(q, 12, { signal: abort.signal });
        } catch (e) {
          olItems = [];
          olErr = e?.message || String(e);
        }
      }

      // Wikipedia summary for the query term itself (always try zh+en)
      let wikiZh = null;
      let wikiEn = null;
      let wikiErr = "";
      if (fullTextOnly.value !== "1") {
        try {
          const [a, b] = await Promise.allSettled([
            wikipediaBestSummary(q, "zh", { signal: abort.signal }),
            wikipediaBestSummary(q, "en", { signal: abort.signal })
          ]);
          wikiZh = a.status === "fulfilled" ? a.value : null;
          wikiEn = b.status === "fulfilled" ? b.value : null;
        } catch (e) {
          wikiZh = null;
          wikiEn = null;
          wikiErr = e?.message || String(e);
        }
      }

      if (renderResults._reqId !== reqId) return;
      loading.remove();

      const wsAll = [...wsZh, ...wsEn];
      if (wsAll.length) {
        resultsBox.append(
          el("div", { class: "muted small", text: `可阅读全文（维基文库）：${wsAll.length} 条（同名会全部列出，建议先预览再加入书架）` })
        );
        for (const it of wsAll) {
          const preview = el("details", { class: "details" }, [
            el("summary", { class: "btn ghost", text: "预览前 200 字（防止点错同名）" }),
            el("div", { class: "muted", text: "加载中…" })
          ]);
          preview.addEventListener("toggle", async () => {
            if (!preview.open) return;
            const box = preview.lastChild;
            if (box && box.getAttribute?.("data-loaded") === "1") return;
            try {
              const raw = await wikisourceFetchPlainText(it.title, it.lang, { signal: abort.signal });
              const txt = normalizeText(raw);
              box.textContent = txt ? `${txt.slice(0, 200)}${txt.length > 200 ? "…" : ""}` : "没有可提取的正文。";
              box.setAttribute("data-loaded", "1");
            } catch (e) {
              box.textContent = `预览失败：${e?.message || String(e)}`;
              box.setAttribute("data-loaded", "1");
            }
          });

          resultsBox.append(
            el("div", { class: "card" }, [
              el("div", { class: "cardTop" }, [
                el("div", { class: "cardTitle", text: it.title }),
                el("div", { class: "badge", text: (it.lang || "").toUpperCase() })
              ]),
              it.description ? el("div", { class: "cardMeta muted", text: it.description }) : el("div"),
              preview,
              el("div", { class: "cardActions" }, [
                el(
                  "button",
                  { class: "btn", type: "button", onClick: () => addWikisourceBook(it) },
                  [el("span", { text: "加入书架并打开全文" })]
                ),
                it.externalUrl
                  ? el("a", { class: "btn ghost", href: it.externalUrl, target: "_blank", rel: "noreferrer" }, [
                      el("span", { text: "打开维基文库" })
                    ])
                  : el("div")
                ,
                it.externalUrl
                  ? el("a", { class: "btn ghost", href: toProxyUrl(it.externalUrl), target: "_blank", rel: "noreferrer" }, [
                      el("span", { text: "代理打开" })
                    ])
                  : el("div")
              ])
            ])
          );
        }
      }

      if (fullTextOnly.value !== "1" && (wikiZh?.extract || wikiEn?.extract)) {
        resultsBox.append(
          el("div", { class: "card" }, [
            el("div", { class: "cardTop" }, [
              el("div", { class: "cardTitle", text: "简介（Wikipedia，中/英）" }),
              el("div", { class: "badge", text: "WIKI" })
            ]),
            (wikiZh?.thumbnail || wikiEn?.thumbnail)
              ? el("img", { class: "cover", src: wikiZh?.thumbnail || wikiEn?.thumbnail, alt: "cover", loading: "lazy" })
              : el("div"),
            wikiZh?.extract
              ? el("div", { class: "cardMeta muted", text: `中文：${wikiZh.extract}` })
              : el("div", { class: "cardMeta muted", text: "中文：未找到该词条简介" }),
            wikiEn?.extract
              ? el("div", { class: "cardMeta muted", text: `English: ${wikiEn.extract}` })
              : el("div", { class: "cardMeta muted", text: "English: no summary found" }),
            el("div", { class: "cardActions" }, [
              wikiZh?.externalUrl
                ? el("a", { class: "btn ghost", href: wikiZh.externalUrl, target: "_blank", rel: "noreferrer" }, [
                    el("span", { text: "打开中文 Wikipedia" })
                  ])
                : el("div"),
              wikiZh?.externalUrl
                ? el("a", { class: "btn ghost", href: toProxyUrl(wikiZh.externalUrl), target: "_blank", rel: "noreferrer" }, [
                    el("span", { text: "中文代理打开" })
                  ])
                : el("div"),
              wikiEn?.externalUrl
                ? el("a", { class: "btn ghost", href: wikiEn.externalUrl, target: "_blank", rel: "noreferrer" }, [
                    el("span", { text: "Open English Wikipedia" })
                  ])
                : el("div")
              ,
              wikiEn?.externalUrl
                ? el("a", { class: "btn ghost", href: toProxyUrl(wikiEn.externalUrl), target: "_blank", rel: "noreferrer" }, [
                    el("span", { text: "English proxy" })
                  ])
                : el("div")
            ])
          ])
        );
      }

      if (!olItems.length && !wsAll.length && !(wikiZh?.extract || wikiEn?.extract)) {
        resultsBox.append(
          el("div", {
            class: "muted",
            text:
              fullTextOnly.value === "1"
                ? "没有找到“可免费合规阅读全文”的来源。你可以切回“书目/简介（推荐）”先确认正确的书名和作者。"
                : "没查到结果（可能是网络限制或该关键词不匹配）。可试试：加副标题/作者/英文名，例如“海明威 老人与海 / Hemingway The Old Man and the Sea”。"
          })
        );
        resultsBox.append(
          el("details", { class: "details" }, [
            el("summary", { class: "btn ghost", text: "展开诊断（为什么查不到）" }),
            el("div", {
              class: "muted small",
              text:
                `维基文库(zh)：${wsZhErr || "ok"}\n` +
                `维基文库(en)：${wsEnErr || "ok"}\n` +
                `Open Library：${olErr || "ok"}\n` +
                `Wikipedia：${wikiErr || "ok"}`
            })
          ])
        );
        return;
      }

      if (fullTextOnly.value === "1" || !olItems.length) return;
      for (const it of olItems) {
        const details = el("details", { class: "details" }, [
          el("summary", { class: "btn ghost", text: "加载简介（中/英）" }),
          el("div", { class: "muted", text: "加载中…" })
        ]);

        details.addEventListener("toggle", async () => {
          if (!details.open) return;
          const box = details.lastChild;
          if (box && box.getAttribute?.("data-loaded") === "1") return;
          try {
            const d = await openLibraryWorkDetail(it.workKey, { signal: abort.signal });
            const desc = (d.description || "").trim();
            const [wz, we] = await Promise.allSettled([
              wikipediaBestSummary(it.title, "zh", { signal: abort.signal }),
              wikipediaBestSummary(it.title, "en", { signal: abort.signal })
            ]);
            const z = wz.status === "fulfilled" ? wz.value : null;
            const e = we.status === "fulfilled" ? we.value : null;
            const parts = [];
            parts.push(`Open Library：${desc || "暂无简介"}`);
            parts.push(`中文：${z?.extract || "未找到"}`);
            parts.push(`English: ${e?.extract || "not found"}`);
            box.textContent = parts.join("\n\n");
            box.setAttribute("data-loaded", "1");
          } catch {
            box.textContent = "简介加载失败（可能被网络限制）。";
            box.setAttribute("data-loaded", "1");
          }
        });

        resultsBox.append(
          el("div", { class: "card" }, [
            el("div", { class: "cardTop" }, [
              el("div", { class: "cardTitle", text: it.title || "未命名" }),
              el("div", { class: "badge", text: it.year ? String(it.year) : "OL" })
            ]),
            el("div", { class: "cardMeta muted", text: it.author || "" }),
            it.cover ? el("img", { class: "cover", src: it.cover, alt: it.title || "cover", loading: "lazy" }) : el("div"),
            details,
            el("div", { class: "cardActions" }, [
              el(
                "button",
                {
                  class: "btn",
                  type: "button",
                  onClick: async () => {
                    let desc = "";
                    try {
                      const d = await openLibraryWorkDetail(it.workKey, { signal: abort.signal });
                      desc = (d.description || "").trim();
                    } catch {
                      desc = "";
                    }
                    await addLinkBook({ ...it, description: desc });
                  }
                },
                [el("span", { text: "加入书架（简介/外链）" })]
              ),
              it.externalUrl
                ? el("a", { class: "btn ghost", href: it.externalUrl, target: "_blank", rel: "noreferrer" }, [
                    el("span", { text: "打开 Open Library" })
                  ])
                : el("div")
              ,
              it.externalUrl
                ? el("a", { class: "btn ghost", href: toProxyUrl(it.externalUrl), target: "_blank", rel: "noreferrer" }, [
                    el("span", { text: "代理打开" })
                  ])
                : el("div")
            ])
          ])
        );
      }
    })();
  }
  function doSearch() {
    hasSearched = true;
    renderResults();
  }
  searchBtn.addEventListener("click", () => doSearch());
  qInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSearch();
  });
  langSelect.addEventListener("change", () => {
    if (hasSearched) doSearch();
  });

  renderResults();
  renderShelf();
  renderRecent();

  const content = el("div", { class: "grid" }, [
    el("section", { class: "panel panel--wide" }, [
      el("div", { class: "h", text: "搜索书籍" }),
      searchRow,
      el("div", { class: "row row--filters" }, [langSelect, fullTextOnly]),
      hintBar,
      resultsBox
    ]),
    el("section", { class: "panel panel--side" }, [
      el("div", { class: "h", text: "最近阅读" }),
      recentBox,
      el("div", { class: "h", text: "书架" }),
      shelfBox,
      el("div", { class: "h", text: "备份 / 恢复" }),
      el("div", { class: "row" }, [
        el("button", { class: "btn", type: "button", onClick: backupCopy }, [el("span", { text: "备份（复制）" })]),
        el("button", { class: "btn ghost", type: "button", onClick: backupRestore }, [el("span", { text: "恢复（粘贴）" })])
      ]),
      el("div", { class: "muted small", text: "备份可用于换手机/清缓存后恢复书架与进度。" })
    ])
  ]);

  return layout({ title: "主页 / 书架", content });
}

function readerView(state, bookId) {
  const b = state.books[bookId];
  if (!b) {
    return layout({
      title: "未找到该书",
      actions: el("button", { class: "btn ghost", type: "button", onClick: () => navTo("/") }, [el("span", { text: "返回" })]),
      content: el("div", { class: "panel" }, [el("div", { class: "muted", text: "这本书可能已被删除或未导入。" })])
    });
  }

  const topActions = el("div", { class: "row" }, [
    el("button", { class: "btn ghost", type: "button", onClick: () => navTo("/") }, [el("span", { text: "返回书架" })]),
    el(
      "button",
      {
        class: "btn ghost",
        type: "button",
        onClick: () => {
          if (state.bookshelf.includes(bookId)) {
            removeFromBookshelf(state, bookId);
            saveState(state);
            toast("已移出书架");
          } else {
            addToBookshelf(state, bookId);
            saveState(state);
            toast("已加入书架");
          }
          renderApp();
        }
      },
      [el("span", { text: state.bookshelf.includes(bookId) ? "移出书架" : "加入书架" })]
    )
  ]);

  // Record open for history
  recordOpen(state, bookId);
  saveState(state);

  const title = el("div", { class: "readTitle", text: b.title || "未命名" });
  const meta = el("div", { class: "muted", text: [b.author, b.lang].filter(Boolean).join(" · ") });
  const sourceRow = el("div", { class: "row" }, [
    el("div", { class: "badge", text: b.kind === "wikisource" ? "Wikisource" : b.kind === "remote" ? "公版全文" : "书架" }),
    b.externalUrl
      ? el("a", { class: "btn ghost", href: b.externalUrl, target: "_blank", rel: "noreferrer" }, [el("span", { text: "打开来源页" })])
      : el("div"),
    b.externalUrl
      ? el("a", { class: "btn ghost", href: b.proxyUrl || toProxyUrl(b.externalUrl), target: "_blank", rel: "noreferrer" }, [el("span", { text: "代理打开" })])
      : el("div")
  ]);
  const progress = el("div", { class: "progressRow" }, [
    el("div", { class: "muted small", text: "进度" }),
    el("div", { class: "bar" }, [el("div", { class: "barFill", style: `width:${Math.round((b.progress?.pct ?? 0) * 100)}%` })]),
    el("div", { class: "muted small", text: formatPct(b.progress?.pct ?? 0) })
  ]);

  // Simplified/Original toggle for Chinese text
  const simpKey = "sfr:pref:simplifyZh";
  const simpDefault = localStorage.getItem(simpKey);
  const simplifyZh = el(
    "select",
    { class: "input" },
    [el("option", { value: "1", text: "中文显示：简体" }), el("option", { value: "0", text: "中文显示：原文" })]
  );
  simplifyZh.value = simpDefault == null ? "1" : simpDefault;
  simplifyZh.addEventListener("change", () => {
    localStorage.setItem(simpKey, simplifyZh.value);
    // rerender current view to re-apply conversion
    renderApp();
  });

  if (b.kind === "link") {
    const searchQ = [b.title, b.author].filter(Boolean).join(" ").trim() || b.title || "";
    const content = el("div", { class: "readWrap" }, [
      el("div", { class: "panel" }, [
        title,
        meta,
        el("div", { class: "muted", text: (b.description || "").trim() || "当前条目只有简介与外链。全文请在浏览器中通过下方搜索或原站阅读。" }),
        el("div", { class: "row" }, [
          b.externalUrl
            ? el("a", { class: "btn", href: b.externalUrl, target: "_blank", rel: "noreferrer" }, [el("span", { text: "打开外部页面" })])
            : el("div"),
          b.externalUrl
            ? el("a", { class: "btn ghost", href: b.proxyUrl || toProxyUrl(b.externalUrl), target: "_blank", rel: "noreferrer" }, [
                el("span", { text: "代理打开" })
              ])
            : el("div")
        ]),
        externalSearchCard(searchQ),
        el("div", { class: "muted small", text: "说明：受版权限制，本应用不提供自动抓取、搬运小说全文；仅保存书架与阅读进度（若你在浏览器里阅读，进度无法跨站同步）。" })
      ])
    ]);
    return layout({ title: "阅读（简介/外链）", actions: topActions, content });
  }

  const reader = el("div", { class: "reader", id: "reader" });
  const status = el("div", { class: "muted small", text: "" });

  let saveTimer = null;
  function scheduleSave(pct) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      setProgress(state, bookId, { pct });
      saveState(state);
      const fill = progress.querySelector(".barFill");
      if (fill) fill.style.width = `${Math.round(pct * 100)}%`;
      progress.lastChild.textContent = formatPct(pct);
    }, 250);
  }

  function computePct() {
    const max = reader.scrollHeight - reader.clientHeight;
    if (max <= 0) return 0;
    return Math.max(0, Math.min(1, reader.scrollTop / max));
  }

  async function ensureTextLoaded() {
    if (b.kind === "local") return;
    if (b.text && b.paragraphs?.length) return;
    status.textContent = "正在加载全文…";
    try {
      let raw = "";
      if (b.kind === "wikisource") {
        raw = await wikisourceFetchPlainText(b.wsTitle || b.title, b.wsLang || b.lang || "zh");
      } else {
        raw = await fetchText(b.url);
      }
      if (!raw || !raw.trim()) {
        throw new Error("empty");
      }
      let text = normalizeText(raw);
      const shouldSimplify = (b.wsLang || b.lang) === "zh" && localStorage.getItem(simpKey) !== "0";
      if (shouldSimplify) text = normalizeText(await toSimplifiedChinese(text));
      const paragraphs = splitParagraphs(text);
      upsertBook(state, { id: bookId, text, paragraphs });
      saveState(state);
    } catch (e) {
      const msg = e?.message === "timeout" ? "加载超时（网络较慢/被限制）" : "加载失败（可能来源页不含可提取的正文）";
      status.textContent = msg;
    } finally {
      if (status.textContent === "正在加载全文…") status.textContent = "";
    }
  }

  function renderParagraphs() {
    const paragraphs = state.books[bookId].paragraphs || [];
    reader.replaceChildren();
    if (!paragraphs.length) {
      reader.append(el("div", { class: "muted", text: "暂无内容。" }));
      return;
    }
    const frag = document.createDocumentFragment();
    for (let i = 0; i < paragraphs.length; i++) {
      frag.append(el("p", { class: "p", "data-i": String(i), text: paragraphs[i] }));
    }
    reader.append(frag);
  }

  function restoreProgress() {
    const pct = state.books[bookId].progress?.pct ?? 0;
    const max = reader.scrollHeight - reader.clientHeight;
    if (max > 0 && pct > 0) reader.scrollTop = Math.round(max * pct);
  }

  reader.addEventListener(
    "scroll",
    () => {
      scheduleSave(computePct());
    },
    { passive: true }
  );

  const content = el("div", { class: "readWrap" }, [
    el("div", { class: "panel" }, [
      title,
      meta,
      sourceRow,
      ((b.wsLang || b.lang) === "zh") ? el("div", { class: "row" }, [simplifyZh]) : el("div"),
      progress,
      status
    ]),
    reader
  ]);

  const view = layout({ title: "阅读", actions: topActions, content });

  queueMicrotask(async () => {
    await ensureTextLoaded();
    renderParagraphs();
    restoreProgress();
  });

  return view;
}

export function renderApp() {
  const state = loadState();
  const r = route();

  let view = null;
  if (r.path === "/read") {
    const id = r.params.get("id");
    view = readerView(state, id);
  } else {
    view = homeView(state);
  }

  app.replaceChildren(view);
}

window.addEventListener("hashchange", () => renderApp());

