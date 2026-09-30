/** Импорт из локального JSON-манифеста. Пути к аудио и учётные данные не входят в репозиторий. */
import { openAsBlob } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { z } from "zod";
import { officeRequest } from "./office-api.js";

const manifestSchema = z.array(z.object({
  file: z.string().min(1), title: z.string().min(1).max(255), description: z.string().default(""),
  duration: z.string().max(100).default(""), is_free: z.boolean().default(false),
  sort: z.number().int().default(0), status: z.enum(["draft", "published"]).default("draft"),
})).min(1).max(100);

async function main() {
  const manifest = process.argv[2];
  if (!manifest) throw new Error("Укажите путь к JSON-манифесту после import-podcasts");
  const episodes = manifestSchema.parse(JSON.parse(await readFile(manifest, "utf8")));
  const existing = await officeRequest<Array<{ id: string; title: string }>>("podcasts");
  for (const episode of episodes) {
    const file = resolve(dirname(manifest), episode.file);
    if ((await stat(file)).size > 128 * 1024 * 1024) throw new Error("Аудиофайл превышает 128 MiB");
    const form = new FormData();
    form.set("file", await openAsBlob(file), basename(file));
    const media = await officeRequest<{ id: string }>("media", { method: "POST", body: form });
    const found = existing.find(row => row.title === episode.title);
    const { file: _source, ...fields } = episode;
    try {
      await officeRequest(found ? `podcasts/${found.id}` : "podcasts", {
        method: found ? "PATCH" : "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...fields, audio_url: media.id }),
      });
    } catch (error) {
      await officeRequest(`media/${media.id}`, { method: "DELETE" }).catch(() => {
        console.error("Загруженный файл остался в панели офиса; удалите его после проверки");
      });
      throw error;
    }
    console.log("Выпуск сохранён");
  }
}
main().catch(() => { console.error("Импорт не завершён. Проверьте манифест, файлы и сессию офиса"); process.exitCode = 1; });
