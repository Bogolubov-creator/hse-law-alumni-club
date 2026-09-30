import { type CSSProperties } from "react";

/**
 * Знак клуба. Векторный, инлайновый, на currentColor – работает в обеих темах,
 * в режиме для слабовидящих и не тянет отдельный запрос (DESIGN.md: новых
 * зависимостей не берём, иконки инлайн-SVG).
 *
 * Идея знака: коромысло весов – это та же тонкая черта, что и сигнатура
 * «поле бланка». Знак не приклеен к системе, а вырос из неё.
 *
 * Два начертания:
 *  • `scales` – одни весы. Держит мелкие размеры вплоть до 16px (фавикон,
 *    шапка, список), поэтому это основной знак.
 *  • `themis` – Фемида: фигура в мантии с повязкой, держащая те же весы.
 *    Для крупных мест – иконка приложения, герой, экран запуска.
 *
 * Толщина штриха задана в единицах viewBox и масштабируется вместе со знаком;
 * `vectorEffect` не используем – при уменьшении линия должна утончаться,
 * иначе на 16px знак заплывает.
 */

export type MarkKind = "scales" | "themis";

const common = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export function Mark({ kind = "scales", size = 36, title, style, className }: {
  kind?: MarkKind;
  /** Число – пиксели; строка – любая единица CSS (в герое знак тянется за колонкой). */
  size?: number | string;
  /** Задать, только если знак несёт смысл сам по себе; рядом с текстом «Клуб выпускников» знак декоративен. */
  title?: string;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      style={{ display: "block", flexShrink: 0, ...style }}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {kind === "themis" ? <ThemisPaths /> : <ScalesPaths />}
    </svg>
  );
}

/**
 * Весы: стойка на постаменте, коромысло-черта, две чаши.
 *
 * Пропорции подобраны под мелкий кегль: подвесы длиной 6,5 единиц (иначе чаши
 * слипаются с коромыслом уже на 24px), чаши шире коромысла, нога короткая –
 * длинная нога превращала знак в антенну.
 */
function ScalesPaths() {
  return (
    <g {...common} strokeWidth={2.1}>
      {/* точка опоры */}
      <circle cx={24} cy={10.5} r={1.9} />
      {/* стойка и постамент */}
      <path d="M24 12.4v27.1" />
      <path d="M16 39.5h16" />
      {/* коромысло – та же черта, что в сигнатуре бланка */}
      <path d="M7.5 15.5h33" />
      {/* подвесы */}
      <path d="M12 15.5V22M36 15.5V22" />
      {/* чаши */}
      <path d="M4.5 22c0 4.4 3.4 6.9 7.5 6.9s7.5-2.5 7.5-6.9" />
      <path d="M28.5 22c0 4.4 3.4 6.9 7.5 6.9s7.5-2.5 7.5-6.9" />
    </g>
  );
}

/**
 * Фемида: голова с повязкой, мантия, руки – коромысло тех же весов.
 * Повязка – одна черта: без неё фигура читается просто как человек с шестом.
 */
function ThemisPaths() {
  return (
    <g {...common} strokeWidth={2.1}>
      {/* голова и повязка на глазах */}
      <circle cx={24} cy={9.5} r={3.3} />
      {/* Повязка выходит за края лица: вписанная внутрь круга читается как
          перечёркивание, а не как повязка на глазах. */}
      <path d="M20 9.1h8" />
      {/* мантия: расширяется книзу, стоит на постаменте */}
      <path d="M20.8 15.6 18.5 40M27.2 15.6 29.5 40" />
      <path d="M16 40h16" />
      {/* коромысло на уровне рук */}
      <path d="M7.5 17.2h33" />
      {/* подвесы и чаши */}
      <path d="M12 17.2v5.4M36 17.2v5.4" />
      <path d="M5.5 22.6c0 4 3.1 6.3 6.5 6.3s6.5-2.3 6.5-6.3" />
      <path d="M29.5 22.6c0 4 3.1 6.3 6.5 6.3s6.5-2.3 6.5-6.3" />
    </g>
  );
}

/**
 * Локап: знак и название в две строки. Используется в шапках – там, где
 * логотип обязан быть ссылкой на главную и читаться как подпись документа.
 */
export function Lockup({ size = 36, mono, disp }: { size?: number; mono: CSSProperties; disp: CSSProperties }) {
  return (
    <>
      <Mark kind="scales" size={size} style={{ color: "var(--c-accent-text)" }} />
      <span style={{ ...disp, fontWeight: 800, fontSize: 15, lineHeight: 1.1 }}>
        Клуб выпускников
        <span style={{ ...mono, display: "block", fontSize: "var(--t-micro)", letterSpacing: "0.1em", color: "var(--c-text-3)", fontWeight: 400, marginTop: 3, textTransform: "uppercase" }}>
          факультета права Вышки
        </span>
      </span>
    </>
  );
}
