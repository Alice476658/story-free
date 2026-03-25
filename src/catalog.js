export const CATALOG = [
  {
    id: "gutenberg-alice-en",
    title: "Alice's Adventures in Wonderland",
    author: "Lewis Carroll",
    lang: "en",
    // Many public sources block CORS. Use jina.ai as a CORS-friendly fetch proxy.
    url: "https://r.jina.ai/http://www.gutenberg.org/cache/epub/11/pg11.txt"
  },
  {
    id: "gutenberg-sherlock-en",
    title: "The Adventures of Sherlock Holmes",
    author: "Arthur Conan Doyle",
    lang: "en",
    url: "https://r.jina.ai/http://www.gutenberg.org/cache/epub/1661/pg1661.txt"
  },
  {
    id: "gutenberg-pride-en",
    title: "Pride and Prejudice",
    author: "Jane Austen",
    lang: "en",
    url: "https://r.jina.ai/http://www.gutenberg.org/cache/epub/1342/pg1342.txt"
  }
];

export function searchCatalog(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return [];
  return CATALOG.filter((b) => {
    return (
      b.title.toLowerCase().includes(q) ||
      (b.author || "").toLowerCase().includes(q) ||
      (b.lang || "").toLowerCase().includes(q)
    );
  });
}

