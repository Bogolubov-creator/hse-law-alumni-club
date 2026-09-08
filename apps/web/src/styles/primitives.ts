import { type CSSProperties } from "react";

/**
 * Общие примитивы стиля: единственное определение на весь проект.
 *
 * До этого `mono`, `disp`, `label`, `action`, `actionGhost` и `field` жили
 * двумя копиями – в `v2/Shell.tsx` плюс `v2/cabinet.tsx` и отдельно в
 * `admin/ui.tsx`. Копии уже разошлись: кнопка 8px 14px против 9px 15px, поле
 * 12px 14px / 15px против 10px 13px / 14px. Ни одна из этих разниц не была
 * решением – просто правили в одном файле и забывали про второй.
 *
 * Здесь только объекты стиля, без React-компонентов: модуль импортируют и
 * витрины, и кабинет, и админка, и тянуть за собой роутер им незачем.
 */

/** Совместимое имя примитива: HSE Sans с табличными цифрами. */
export const mono: CSSProperties = {
  fontFamily: "var(--f-data)",
  fontVariantNumeric: "tabular-nums",
};

/** Заголовок раздела: фирменный гротеск. */
export const disp: CSSProperties = {
  fontFamily: "var(--f-head)",
  letterSpacing: "var(--tr-display)",
};

/**
 * Титул страницы: фирменная плита ВШЭ. Реальное начертание 400 – промежуточных
 * начертаний у HSE Slab нет, браузер их синтезирует и размазывает штрихи.
 */
export const pageTitle: CSSProperties = {
  fontFamily: "var(--f-display)",
  fontWeight: 400,
  letterSpacing: "var(--tr-display)",
};

/** Подпись: обычный регистр, спокойный вторичный цвет. */
export const label: CSSProperties = {
  ...mono,
  fontSize: "var(--t-caption)",
  letterSpacing: "var(--tr-data)",
  textTransform: "none",
  color: "var(--c-text-3)",
};

/** Действие. Один акцент на весь проект – охра с тёмным текстом (5,12:1). */
export const action: CSSProperties = {
  ...mono,
  fontSize: "var(--t-caption)",
  letterSpacing: "var(--tr-data)",
  textTransform: "none",
  padding: "9px 15px",
  borderRadius: "var(--r-sm)",
  border: "none",
  background: "var(--c-accent)",
  color: "var(--c-on-accent)",
  cursor: "pointer",
};

/** Второстепенное действие: та же геометрия, обводка вместо заливки. */
export const actionGhost: CSSProperties = {
  ...action,
  background: "transparent",
  color: "var(--c-text-2)",
  border: "1px solid var(--c-line-control)",
};

/** Поле ввода. Просторное: формы кабинета и заявки, куда вводят с телефона. */
export const field: CSSProperties = {
  width: "100%",
  marginTop: 7,
  padding: "12px 14px",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--c-line-control)",
  background: "var(--c-bg)",
  color: "var(--c-text)",
  fontSize: 15,
  fontFamily: "inherit",
};

/**
 * Плотный вариант поля – для админки. Это осознанная разница, а не расхождение:
 * у панели учебного офиса плотность 7+ и ввод с клавиатуры, у кабинета – с
 * телефона. Ширину поле не задаёт: в панели оно живёт в сетке.
 */
export const fieldCompact: CSSProperties = {
  padding: "10px 13px",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--c-line-control)",
  background: "var(--c-bg)",
  color: "var(--c-text)",
  fontSize: 14,
  fontFamily: "inherit",
};
