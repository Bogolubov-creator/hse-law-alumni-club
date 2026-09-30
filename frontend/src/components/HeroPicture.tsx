import { modernRasterSources, publicUrl } from "../lib/public-url.js";

type Props = {
  path: string;
  className?: string;
  alt: string;
  width: number;
  height: number;
};

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
      {...{ fetchpriority: "high" }}
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
