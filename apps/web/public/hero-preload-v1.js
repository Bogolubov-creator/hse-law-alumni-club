(function () {
  const script = document.currentScript;
  if (!script || !script.src) return;
  const base = new URL(".", script.src);
  if (location.pathname.replace(/\/$/, "") !== base.pathname.replace(/\/$/, "")) return;

  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  link.type = "image/avif";
  link.href = new URL("assets/photos/themis-facade-full.avif", base).href;
  link.fetchPriority = "high";
  document.head.appendChild(link);
})();
