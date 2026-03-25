const LS_KEY = "sfr:v1";

function nowIso() {
  return new Date().toISOString();
}

function safeParse(json, fallback) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

export function loadState() {
  const raw = localStorage.getItem(LS_KEY);
  const state = safeParse(raw, null);
  const base =
    state && typeof state === "object"
      ? state
      : {
          bookshelf: [],
          books: {},
          ui: { lastOpenBookId: null }
        };
  if (!Array.isArray(base.bookshelf)) base.bookshelf = [];
  if (!base.books || typeof base.books !== "object") base.books = {};
  if (!base.ui || typeof base.ui !== "object") base.ui = {};
  if (!Array.isArray(base.ui.history)) base.ui.history = [];
  if (typeof base.ui.lastOpenBookId !== "string" && base.ui.lastOpenBookId != null) base.ui.lastOpenBookId = null;
  return base;
}

export function saveState(state) {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

export function upsertBook(state, book) {
  const id = book.id;
  state.books[id] = {
    ...(state.books[id] || {}),
    ...book,
    updatedAt: nowIso()
  };
  if (!state.books[id].createdAt) state.books[id].createdAt = nowIso();
  return state;
}

export function addToBookshelf(state, bookId) {
  if (!state.bookshelf.includes(bookId)) state.bookshelf.unshift(bookId);
  return state;
}

export function removeFromBookshelf(state, bookId) {
  state.bookshelf = state.bookshelf.filter((id) => id !== bookId);
  return state;
}

export function setProgress(state, bookId, progress) {
  const b = state.books[bookId];
  if (!b) return state;
  b.progress = {
    ...(b.progress || {}),
    ...progress,
    updatedAt: nowIso()
  };
  b.updatedAt = nowIso();
  return state;
}

export function recordOpen(state, bookId) {
  if (!bookId) return state;
  if (!state.ui) state.ui = {};
  state.ui.lastOpenBookId = bookId;
  const ts = nowIso();
  const hist = Array.isArray(state.ui.history) ? state.ui.history : [];
  const next = [{ bookId, ts }, ...hist.filter((h) => h?.bookId !== bookId)].slice(0, 50);
  state.ui.history = next;
  const b = state.books?.[bookId];
  if (b) b.lastReadAt = ts;
  return state;
}

export function exportBackup(state) {
  // Keep only needed fields; avoid caching huge texts if not present.
  return {
    v: 1,
    exportedAt: nowIso(),
    bookshelf: state.bookshelf || [],
    books: state.books || {},
    ui: state.ui || {}
  };
}

export function importBackup(state, backup) {
  if (!backup || typeof backup !== "object") return state;
  if (!Array.isArray(backup.bookshelf) || !backup.books || typeof backup.books !== "object") return state;
  const next = loadState();
  next.bookshelf = backup.bookshelf;
  next.books = backup.books;
  next.ui = backup.ui && typeof backup.ui === "object" ? backup.ui : next.ui;
  if (!Array.isArray(next.ui.history)) next.ui.history = [];
  return next;
}

