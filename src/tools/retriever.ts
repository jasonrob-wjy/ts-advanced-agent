import fs from "node:fs";
import path from "node:path";
import { OpenAIEmbeddings } from "@langchain/openai";

type Doc = { content: string; score: number };

function splitText(text: string, size: number): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + size));
    i += size;
  }
  return chunks;
}

export function setupRetriever(filePath: string) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const docs = splitText(raw, 1000);
  const apiKey = process.env.ZHIPUAI_API_KEY;
  const baseURL = "https://open.bigmodel.cn/api/paas/v4/";
  const embedder = new OpenAIEmbeddings({
    model: "embedding-2",
    apiKey,
    configuration: { baseURL },
  });
  let vectors: number[][] | null = null;
  async function ensureIndexed() {
    if (vectors) return;
    if (!apiKey) {
      vectors = [];
      return;
    }
    vectors = await embedder.embedDocuments(docs);
  }
  function cosine(a: number[], b: number[]) {
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      const y = b[i];
      dot += x * y;
      na += x * x;
      nb += y * y;
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? 0 : dot / denom;
  }
  return {
    async search(query: string, k = 4): Promise<string[]> {
      if (!apiKey) {
        return docs.slice(0, k);
      }
      await ensureIndexed();
      const qv = await embedder.embedQuery(query);
      const scored = (vectors ?? []).map((vec, i) => ({
        content: docs[i],
        score: cosine(qv, vec),
      }));
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, k).map((d) => d.content);
    },
  };
}
