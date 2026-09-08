/**
 * Загрузка выпусков «Правовая грамотность» в локальный Directus стенда.
 *
 * Только http://127.0.0.1:8255. Аудио остаётся в томе Directus, не в git.
 * Запуск:
 *   node /Users/macbook/alumni-staged-evidence/run-local.cjs \
 *     pnpm --filter @club/scripts exec tsx src/load-pravovaya-gramotnost.ts
 */
import { spawnSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

const DIRECTUS_URL = process.env.DIRECTUS_URL ?? "";
const TOKEN = process.env.DIRECTUS_SERVICE_TOKEN ?? "";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Episode = {
  key: string;
  title: string;
  description: string;
  file: string;
  is_free: boolean;
  sort: number;
};

const EPISODES: Episode[] = [
  {
    key: "danyukov",
    title: "Правовая грамотность с Данилом Данюковым",
    description:
      "Гость Данил Данюков. Ведущие Виолетта Трубина и Валентин. Серия «Правовая грамотность».",
    file: "/Users/macbook/Downloads/Данил_Данюков_Правовая_грамотность_с_Виолеттой_Трубиной_и_Валентином.mp3",
    is_free: true,
    sort: 1,
  },
  {
    key: "volos",
    title: "Правовая грамотность с Алексеем Волосом",
    description:
      "Гость Алексей Александрович Волос. Ведущая Татьяна Архипова. Серия «Правовая грамотность».",
    file: "/Users/macbook/Downloads/Волос Алексей Александрович Правовая грамотность (Ведущая Татьяна Архипова).mp3",
    is_free: false,
    sort: 2,
  },
  {
    key: "besedin",
    title: "Правовая грамотность с Глебом Бесединым",
    description:
      "Гость Глеб Евгеньевич Беседин. Ведущий Богдан Карапетян. Серия «Правовая грамотность».",
    file: "/Users/macbook/Downloads/molparlam-download-2026-09-08/Глеб Беседин/Глеб Евгеньевич Беседин Правовая грамотность (Ведущий Богдан Карапетян).mp3",
    is_free: false,
    sort: 3,
  },
  {
    key: "balashov",
    title: "Правовая грамотность с Дмитрием Балашовым",
    description:
      "Гость Дмитрий Викторович Балашов. Ведущий Рафаэль Тумасов. Серия «Правовая грамотность».",
    file: "/Users/macbook/Downloads/molparlam-download-2026-09-08/Дмитрий Балашов/Дмитрий Викторович Балашов-Правовая грамотность(Ведущий Тумасов Рафаэль).mp3",
    is_free: false,
    sort: 4,
  },
  {
    key: "matveeva",
    title: "Правовая грамотность с Марией Матвеевой",
    description:
      "Гость Мария Витальевна Матвеева. Ведущая Ирина Аникина. Серия «Правовая грамотность».",
    file: "/Users/macbook/Downloads/molparlam-download-2026-09-08/Мария Матвеева/Мария Витальевна Матвеева Правовая Грамотност (Ведущая Ирина Аникина).mp3",
    is_free: false,
    sort: 5,
  },
  {
    key: "dzgoeva",
    title: "Правовая грамотность с Фатимой Дзгоевой",
    description:
      "Гость Фатима Олеговна Дзгоева. Ведущий Сергей Горбатюк. Серия «Правовая грамотность».",
    file: "/Users/macbook/Downloads/molparlam-download-2026-09-08/Фатима Дзгоева/Фатима Олеговна Дзгоева Правовая грамотность (Ведущий Сергей Горбатюк).mp3",
    is_free: false,
    sort: 6,
  },
  {
    key: "nikolaev",
    title: "Правовая грамотность с Николаем Николаевым",
    description:
      "Гость Николай Петрович Николаев. Ведущая Анастасия Полюляк. Серия «Правовая грамотность».",
    file: "/Users/macbook/Downloads/molparlam-download-2026-09-08/Николай Николаев/Николаев Николай Петрович Правовая грамотность (Ведущая Анастасия Полюляк).mp3",
    is_free: false,
    sort: 7,
  },
];

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${TOKEN}`, ...extra };
}

/** macOS часто хранит имена в NFD – ищем файл по директории, если прямой путь не открылся. */
async function resolveAudio(file: string): Promise<string> {
  if (existsSync(file)) return file;
  const dir = path.dirname(file);
  const base = path.basename(file).normalize("NFC");
  const entries = await readdir(dir);
  const hit = entries.find((name) => name.normalize("NFC") === base || name.includes(base.slice(0, 12)));
  if (!hit) throw new Error(`file not found: ${file}`);
  return path.join(dir, hit);
}

function durationLabel(file: string): string {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file],
    { encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`ffprobe failed for ${file}: ${r.stderr}`);
  const sec = Math.round(Number(r.stdout.trim()));
  if (!Number.isFinite(sec) || sec <= 0) throw new Error(`bad duration for ${file}`);
  const m = Math.round(sec / 60);
  return `${m} мин`;
}

async function uploadAudio(file: string, title: string): Promise<string> {
  const buf = await readFile(file);
  const form = new FormData();
  form.set("title", title);
  form.set("file", new Blob([buf], { type: "audio/mpeg" }), path.basename(file));
  const res = await fetch(`${DIRECTUS_URL}/files`, { method: "POST", headers: authHeaders(), body: form });
  if (!res.ok) throw new Error(`upload ${res.status}: ${await res.text()}`);
  const id = (await res.json() as { data: { id: string } }).data.id;
  if (!UUID_RE.test(id)) throw new Error(`unexpected file id ${id}`);
  return id;
}

async function listPodcasts(): Promise<Array<{ id: string; title: string; status: string }>> {
  const res = await fetch(`${DIRECTUS_URL}/items/podcasts?limit=-1&fields=id,title,status`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`list podcasts ${res.status}`);
  return (await res.json() as { data: Array<{ id: string; title: string; status: string }> }).data;
}

async function unpublishDemo(rows: Array<{ id: string; title: string; status: string }>): Promise<void> {
  for (const row of rows) {
    if (row.title.startsWith("Правовая грамотность")) continue;
    if (row.status === "draft") continue;
    const res = await fetch(`${DIRECTUS_URL}/items/podcasts/${row.id}`, {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ status: "draft" }),
    });
    if (!res.ok) throw new Error(`unpublish ${row.id} ${res.status}`);
    console.log(`draft ← ${row.title}`);
  }
}

async function upsertEpisode(
  ep: Episode,
  fileId: string,
  duration: string,
  existing: Array<{ id: string; title: string }>,
): Promise<string> {
  const body = {
    title: ep.title,
    description: ep.description,
    cover: null,
    audio_url: fileId,
    duration,
    is_free: ep.is_free,
    sort: ep.sort,
    status: "published",
  };
  const found = existing.find((r) => r.title === ep.title);
  if (found) {
    const res = await fetch(`${DIRECTUS_URL}/items/podcasts/${found.id}`, {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`patch ${ep.key} ${res.status}: ${await res.text()}`);
    return found.id;
  }
  const res = await fetch(`${DIRECTUS_URL}/items/podcasts`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`create ${ep.key} ${res.status}: ${await res.text()}`);
  return (await res.json() as { data: { id: string } }).data.id;
}

async function main() {
  if (DIRECTUS_URL !== "http://127.0.0.1:8255" && DIRECTUS_URL !== "http://localhost:8255") {
    throw new Error(`refusing non-local Directus: ${DIRECTUS_URL || "(empty)"}`);
  }
  if (!TOKEN) throw new Error("DIRECTUS_SERVICE_TOKEN missing");

  const existing = await listPodcasts();
  await unpublishDemo(existing);

  const manifest: Array<Record<string, unknown>> = [];
  for (const ep of EPISODES) {
    console.log(`→ ${ep.title}`);
    const source = await resolveAudio(ep.file);
    const duration = durationLabel(source);
    const fileId = await uploadAudio(source, ep.title);
    const podcastId = await upsertEpisode(ep, fileId, duration, existing);
    manifest.push({
      key: ep.key,
      title: ep.title,
      podcastId,
      fileId,
      duration,
      is_free: ep.is_free,
      sort: ep.sort,
      source,
    });
    console.log(`  ok podcast=${podcastId} file=${fileId} ${duration}${ep.is_free ? " · free" : ""}`);
  }

  const out = "/Users/macbook/alumni-staged-evidence/pravovaya-gramotnost-manifest.json";
  await writeFile(out, JSON.stringify({ loaded_at: new Date().toISOString(), items: manifest }, null, 2));
  console.log(`manifest → ${out}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
