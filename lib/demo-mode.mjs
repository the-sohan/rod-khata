// Explicit opt-in: the normal PC installation keeps its loopback-only behavior.
export const isHostedDemo = () => process.env.ROD_SHOP_DEMO === '1';
export function demoOrigin() {
  const value = process.env.RENDER_EXTERNAL_URL || process.env.ROD_SHOP_DEMO_ORIGIN;
  if (!isHostedDemo() || !value) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}
export function isDemoRequest(request, write = false) {
  const origin = demoOrigin();
  if (!origin || request.headers.get('host') !== new URL(origin).host) return false;
  const supplied = request.headers.get('origin');
  return write ? supplied === origin : !supplied || supplied === origin;
}
export const demoUnavailable = () => Response.json({error:'অনলাইন ডেমোতে Google Drive, ব্যক্তিগত backup ও PC সংযোগ বন্ধ আছে।'},{status:403,headers:{'Cache-Control':'no-store'}});
