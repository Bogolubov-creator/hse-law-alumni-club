// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiPost, ApiError } from "./api.js";
import { adminReq } from "./admin.js";
import { requestJson } from "./http.js";

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe("Общий HTTP-транспорт", () => {
  it("сохраняет сообщение и статус JSON-ошибки", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"error":"Недоступно"}', { status: 409 })));
    await expect(apiPost("/orders", {})).rejects.toMatchObject({ status: 409, message: "Недоступно" });
  });
  it("при HTML-ошибке GET сохраняет HTTP-статус вместо SyntaxError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>error</html>", { status: 503 })));
    await expect(apiGet("/me")).rejects.toMatchObject({ status: 503, message: "API 503: /me" });
  });
  it("успешный GET с битым JSON не маскируется пустым объектом", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json")));
    await expect(apiGet("/me")).rejects.not.toBeInstanceOf(ApiError);
  });
  it("204 поддерживается у мутаций", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(apiPost("/test", {})).resolves.toEqual({});
  });
  it("офисный 401 не завершает сессию выпускника; POST без тела не объявляет JSON", async () => {
    const listener = vi.fn(); window.addEventListener("club:unauthorized", listener);
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock); localStorage.setItem("club_admin_token", "office-token");
    await expect(adminReq("POST", "/admin/action")).rejects.toMatchObject({ status: 401 });
    expect(listener).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0]![1].headers).toEqual({ accept: "application/json", authorization: "Bearer office-token" });
    window.removeEventListener("club:unauthorized", listener);
  });
  it("401 выпускника сигнализирует только при переданном токене", async () => {
    const listener = vi.fn(); window.addEventListener("club:unauthorized", listener);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response("{}", { status: 401 })));
    await expect(apiGet("/me")).rejects.toBeInstanceOf(ApiError);
    expect(listener).not.toHaveBeenCalled();
    await expect(apiGet("/me", "member-token")).rejects.toBeInstanceOf(ApiError);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("club:unauthorized", listener);
  });
  it("не поглощает сетевую ошибку и сохраняет настройки доступа поддержки", async () => {
    const error = new TypeError("offline"); const fetchMock = vi.fn().mockRejectedValue(error);
    vi.stubGlobal("fetch", fetchMock);
    await expect(requestJson("/support/t", { cache: "no-store", headers: { "x-support-key": "test-key" } })).rejects.toBe(error);
    expect(fetchMock).toHaveBeenCalledWith("/api/support/t", { cache: "no-store", headers: { "x-support-key": "test-key" } });
  });
  it("проверяет успешный ответ схемой", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"value":3}')));
    await expect(apiGet("/test", undefined, { parse: (data: any) => data.value * 2 })).resolves.toBe(6);
  });
});
