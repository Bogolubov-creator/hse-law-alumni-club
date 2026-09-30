export function safeRequestLog(req: { method?: string; url?: string; ip?: string }) {
  return { method: req.method, url: req.url?.split("?")[0], remoteAddress: req.ip };
}
