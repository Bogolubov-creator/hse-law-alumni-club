import { officeRequest } from "./office-api.js";
try {
  await officeRequest("dpo-sync", { method: "POST" });
  console.log("Синхронизация каталога завершена");
} catch {
  console.error("Синхронизация не завершена; проверьте адрес сайта, сессию офиса и журнал API");
  process.exitCode = 1;
}
