// Hosts permitidos para los proxies server-side de media de Chatwoot
// (audio + imágenes/video/PDF). Se DERIVAN de CHATWOOT_BASE_URL — no se hardcodea
// ningún dominio: el viejo `ruzzi-chatwoot.az23sf.easypanel.host` quedó muerto tras
// la migración Hostinger → Contabo (los `*.az23sf.easypanel.host` ya no rutean).
//
// Si CHATWOOT_BASE_URL no está configurado, la allowlist queda vacía y el proxy
// rechaza todo (deny-by-default, falla seguro).
export function buildAllowedMediaHosts(): Set<string> {
  const hosts = new Set<string>()

  const chatwootBaseUrl = process.env.CHATWOOT_BASE_URL
  if (chatwootBaseUrl) {
    try {
      const { hostname } = new URL(chatwootBaseUrl)
      if (hostname) hosts.add(hostname)
    } catch {
      // URL inválida — ignorar
    }
  }

  return hosts
}
