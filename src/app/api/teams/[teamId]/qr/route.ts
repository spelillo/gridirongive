import QRCode from 'qrcode';
import { getUser } from '@/lib/auth/session';
import { teamShare } from '@/lib/app/team-share';

/** QR code for the team link, as PNG or SVG (ui-ux-spec 8.11). Coach and staff only: the link unlocks the roster. */
export async function GET(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const user = await getUser();
  if (!user) return new Response('Sign in first.', { status: 401 });
  if (!/^[0-9a-f-]{36}$/.test(teamId)) return new Response('Not found', { status: 404 });
  const share = await teamShare(user.id, teamId).catch(() => null);
  if (!share?.url) return new Response('Not found', { status: 404 });
  const format = new URL(req.url).searchParams.get('format') === 'svg' ? 'svg' : 'png';
  const headers = {
    'Cache-Control': 'private, no-store',
    'Content-Disposition': `attachment; filename="${share.slug}-qr.${format}"`,
    'X-Robots-Tag': 'noindex',
  };
  if (format === 'svg') {
    const svg = await QRCode.toString(share.url, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
    return new Response(svg, { headers: { ...headers, 'Content-Type': 'image/svg+xml' } });
  }
  const png = await QRCode.toBuffer(share.url, { type: 'png', margin: 2, width: 1200, errorCorrectionLevel: 'M' });
  return new Response(new Uint8Array(png), { headers: { ...headers, 'Content-Type': 'image/png' } });
}
