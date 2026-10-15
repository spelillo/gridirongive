import { ImageResponse } from 'next/og';

/**
 * Default share image for every page that doesn't set its own. Plain text
 * only: it never carries a team photo or an athlete's name or photo
 * (ui-ux-spec 10.6). Colors are the tokens in globals.css.
 */
export const alt = 'Gridiron Give: fund specific gear for high school and youth athletes';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const PRIMARY = '#0057d2';
const NAVY = '#022879';
const CHROME = '#f5f6f7';
const INK_BODY = '#223548';

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: CHROME }}>
        <div style={{ height: 16, width: '100%', background: PRIMARY, display: 'flex' }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 96px' }}>
          <div style={{ fontSize: 96, fontWeight: 600, color: NAVY, letterSpacing: -2, display: 'flex' }}>Gridiron Give</div>
          <div style={{ fontSize: 40, color: INK_BODY, marginTop: 24, lineHeight: 1.3, maxWidth: 900, display: 'flex' }}>
            Fund specific gear for high school and youth athletes. Coaches buy it and post the receipt.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
