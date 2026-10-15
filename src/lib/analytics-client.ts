/** Fire-and-forget analytics (ui-ux-spec 10.8). No personal data goes in props. */
export function track(name: string, props: Record<string, string | number | boolean | null> = {}) {
  if (typeof window === 'undefined') return;
  try {
    const body = JSON.stringify({ name, props });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }));
    else void fetch('/api/events', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true });
  } catch {
    /* analytics must never break the page */
  }
}
