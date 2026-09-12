import { publicUrl } from "../lib/public-url.js";

/** Оригинальные материалы маскота клуба, предоставленные заказчиком. */
export const mascot = {
  hero: publicUrl("assets/crow/rest.png"),
  support: publicUrl("assets/crow/rest.png"),
  alt: "Ворона с лупой – маскот клуба выпускников",
} as const;
