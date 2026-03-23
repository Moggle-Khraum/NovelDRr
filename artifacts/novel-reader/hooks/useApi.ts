import { setBaseUrl } from "@workspace/api-client-react";

if (process.env.EXPO_PUBLIC_DOMAIN) {
  setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);
}

const BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";

async function apiPost<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error((err as any).error || "Request failed");
  }
  return res.json() as Promise<T>;
}

export type NovelMeta = {
  title: string;
  author: string;
  synopsis: string;
  coverUrl: string;
  firstChapterUrl: string | null;
};

export type ChapterData = {
  url: string;
  title: string;
  content: string;
  nextUrl: string | null;
};

export async function fetchNovelMeta(url: string): Promise<NovelMeta> {
  return apiPost<NovelMeta>("/api/novel/meta", { url });
}

export async function fetchChapter(
  url: string,
  chapterNum: number
): Promise<ChapterData> {
  return apiPost<ChapterData>("/api/novel/next-chapter", { url, chapterNum });
}
