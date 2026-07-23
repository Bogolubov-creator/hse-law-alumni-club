import { describe, it, expect } from "vitest";
import { isYookassaIp, loginLocked, registerLoginFail, registerLoginSuccess } from "./security.js";

describe("isYookassaIp — подсети вебхука ЮKassa", () => {
  it("адрес внутри /27 (185.71.76.0/27 покрывает .0–.31)", () => {
    expect(isYookassaIp("185.71.76.0")).toBe(true);
    expect(isYookassaIp("185.71.76.5")).toBe(true);
    expect(isYookassaIp("185.71.76.31")).toBe(true);
  });
  it("адрес сразу за границей /27 отклоняется", () => {
    expect(isYookassaIp("185.71.76.32")).toBe(false);
  });
  it("/25 (77.75.153.0/25 покрывает .0–.127)", () => {
    expect(isYookassaIp("77.75.153.100")).toBe(true);
    expect(isYookassaIp("77.75.153.200")).toBe(false);
  });
  it("точечные /32", () => {
    expect(isYookassaIp("77.75.156.11")).toBe(true);
    expect(isYookassaIp("77.75.156.35")).toBe(true);
    expect(isYookassaIp("77.75.156.12")).toBe(false);
  });
  it("IPv4-mapped IPv6 нормализуется", () => {
    expect(isYookassaIp("::ffff:185.71.76.5")).toBe(true);
  });
  it("посторонние и мусорные адреса — false", () => {
    expect(isYookassaIp("8.8.8.8")).toBe(false);
    expect(isYookassaIp("127.0.0.1")).toBe(false);
    expect(isYookassaIp("not-an-ip")).toBe(false);
    expect(isYookassaIp("999.1.1.1")).toBe(false); // октет > 255
    expect(isYookassaIp("")).toBe(false);
  });
});

describe("login lockout — блокировка аккаунта после серии неудач", () => {
  it("неизвестный email не заблокирован", () => {
    expect(loginLocked("nobody@a.test")).toBe(false);
  });
  it("блокируется после 10 неудач, не раньше", () => {
    const email = "lock-a@a.test";
    for (let i = 0; i < 9; i++) registerLoginFail(email);
    expect(loginLocked(email)).toBe(false); // 9 попыток — ещё не заблокирован
    registerLoginFail(email); // 10-я
    expect(loginLocked(email)).toBe(true);
  });
  it("успешный вход сбрасывает счётчик и снимает блокировку", () => {
    const email = "lock-b@a.test";
    for (let i = 0; i < 10; i++) registerLoginFail(email);
    expect(loginLocked(email)).toBe(true);
    registerLoginSuccess(email);
    expect(loginLocked(email)).toBe(false);
  });
  it("ключ нечувствителен к регистру", () => {
    const email = "Lock-C@A.Test";
    for (let i = 0; i < 10; i++) registerLoginFail(email);
    expect(loginLocked("lock-c@a.test")).toBe(true);
    registerLoginSuccess("lock-c@a.test");
  });
});
