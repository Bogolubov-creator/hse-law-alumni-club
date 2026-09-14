import { modernRasterSources, publicUrl } from "../lib/public-url.js";

type Props = {
  /** Путь относительно public/, напр. `assets/themis.jpeg`. */
  path: string;
  className?: string;
  alt: string;
  width: number;
  height: number;
};

/**
 * LCP-герой: avif → webp → jpeg/png. Оригинал в public не удаляем.
 * `fetchpriority=high` + `loading=eager` для первого экрана.
 */
export function HeroPicture({ path, className, alt, width, height }: Props) {
  const modern = modernRasterSources(path);
  const fallback = publicUrl(path);
  const img = (
    <img
      className={className}
      src={fallback}
      alt={alt}
      width={width}
      height={height}
      decoding="async"
      loading="eager"
      fetchPriority="high"
    />
  );
  if (!modern) return img;
  return (
    <picture className={className ? `${className}-picture` : undefined}>
      <source type="image/avif" srcSet={modern.avif} />
      <source type="image/webp" srcSet={modern.webp} />
      {img}
    </picture>
  );
}
