#!/usr/bin/env node
/**
 * Generates the illustrated demo imagery in public/demo: one full-length
 * player illustration per demo athlete and one cover per demo team.
 *
 * Every demo player is a fictional minor, so the demo uses illustrations
 * rather than photos of real kids. The output is committed; run this again
 * after changing the art or the demo roster:
 *
 *   node scripts/demo-art.mjs
 *
 * Gear pins in src/lib/db/demo-seed.ts (PINS) line up with this figure.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'public', 'demo');

// ---------------------------------------------------------------------------
// Varsity block digits, drawn as rectangles so they render the same
// everywhere (an SVG served as an image can't load web fonts).
// Seven segments on a w x h box with bar thickness t.
const SEGMENTS = {
  0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
};

function digitRects(d, x, y, w, h, t) {
  const half = h / 2;
  const r = {
    a: [x, y, w, t],
    b: [x + w - t, y, t, half + t / 2],
    c: [x + w - t, y + half - t / 2, t, half + t / 2],
    d: [x, y + h - t, w, t],
    e: [x, y + half - t / 2, t, half + t / 2],
    f: [x, y, t, half + t / 2],
    g: [x, y + half - t / 2, w, t],
  };
  if (d === '1') {
    // A centred bar with a small flag reads as a jersey 1.
    const cx = x + w / 2 - t / 2;
    return [[cx, y, t, h], [cx - t * 0.6, y, t * 0.9, t * 0.9]];
  }
  return [...SEGMENTS[d]].map((s) => r[s]);
}

/** Jersey number centred on cx, top at y. */
function number(n, cx, y, h, fill, outline, opts = {}) {
  const digits = String(n).split('');
  const w = h * 0.56;
  const t = h * 0.19;
  const gap = h * 0.12;
  const total = digits.length * w + (digits.length - 1) * gap;
  let x = cx - total / 2;
  const rects = [];
  for (const d of digits) {
    rects.push(...digitRects(d, x, y, w, h, t));
    x += w + gap;
  }
  const rect = ([rx, ry, rw, rh]) => `<rect x="${rx.toFixed(1)}" y="${ry.toFixed(1)}" width="${rw.toFixed(1)}" height="${rh.toFixed(1)}"/>`;
  const sw = opts.stroke ?? h * 0.09;
  return [
    outline ? `<g fill="${outline}" stroke="${outline}" stroke-width="${sw}" stroke-linejoin="miter">${rects.map(rect).join('')}</g>` : '',
    `<g fill="${fill}"${opts.opacity ? ` opacity="${opts.opacity}"` : ''}>${rects.map(rect).join('')}</g>`,
  ].join('');
}

// ---------------------------------------------------------------------------
// Colour helpers
function hex(c) {
  const v = c.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
}
function toHex(rgb) {
  return `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}
function mix(a, b, t) {
  const A = hex(a);
  const B = hex(b);
  return toHex(A.map((v, i) => v + (B[i] - v) * t));
}
const shade = (c, t) => mix(c, '#000000', t);
const tint = (c, t) => mix(c, '#ffffff', t);

export const SKIN = ['#f1c7a5', '#e0a882', '#c68a5f', '#a96e45', '#8a5433', '#5e3a22'];
const HAIR = ['#1f1a17', '#2b1d14', '#4a2f1d', '#6b4426', '#14100e', '#8a5a2b'];

// ---------------------------------------------------------------------------
// Hair styles, drawn over a head centred at (450, 255).
function hair(style, c) {
  const d = shade(c, 0.25);
  switch (style) {
    case 'fade':
      return `<path d="M392 262 C388 205 412 178 450 176 C488 178 512 205 508 262 C503 236 498 222 488 214 L412 214 C402 222 397 236 392 262Z" fill="${c}"/>
        <path d="M404 214 C410 190 430 172 452 172 C478 172 496 190 498 214 Z" fill="${c}"/>
        <path d="M392 262 C390 248 392 236 396 228 L398 266Z" fill="${d}" opacity=".55"/><path d="M508 262 C510 248 508 236 504 228 L502 266Z" fill="${d}" opacity=".55"/>`;
    case 'curly': {
      const dots = [];
      for (let i = 0; i < 13; i++) {
        const a = Math.PI * (1.02 + (i / 12) * 0.96);
        dots.push(`<circle cx="${(450 + Math.cos(a) * 58).toFixed(1)}" cy="${(250 + Math.sin(a) * 66).toFixed(1)}" r="${i % 2 ? 19 : 22}"/>`);
      }
      return `<g fill="${c}">${dots.join('')}<ellipse cx="450" cy="214" rx="54" ry="34"/></g>`;
    }
    case 'buzz':
      return `<path d="M393 258 C390 206 416 184 450 184 C484 184 510 206 507 258 C500 230 484 212 450 210 C416 212 400 230 393 258Z" fill="${c}" opacity=".85"/>`;
    case 'locs':
      return `<g fill="${c}">
        <path d="M388 270 C384 200 414 174 450 174 C486 174 516 200 512 270 C504 232 486 214 450 212 C414 214 396 232 388 270Z"/>
        <rect x="378" y="232" width="16" height="96" rx="8"/><rect x="396" y="246" width="14" height="92" rx="7"/>
        <rect x="506" y="232" width="16" height="96" rx="8"/><rect x="490" y="246" width="14" height="92" rx="7"/>
      </g><path d="M410 200 L410 228 M432 190 L432 222 M454 188 L454 220 M476 192 L476 222 M494 204 L494 230" stroke="${d}" stroke-width="5" stroke-linecap="round"/>`;
    case 'swoop':
      return `<path d="M390 262 C384 204 414 176 452 176 C492 176 516 204 510 256 C502 228 490 220 470 218 C444 216 420 226 404 236 C398 244 394 252 390 262Z" fill="${c}"/>
        <path d="M404 236 C430 206 470 198 506 222" stroke="${d}" stroke-width="5" fill="none" stroke-linecap="round" opacity=".6"/>`;
    case 'crop':
    default:
      return `<path d="M391 258 C388 204 414 178 450 178 C486 178 512 204 509 258 C503 234 494 222 480 220 C466 226 444 224 430 218 C410 222 398 236 391 258Z" fill="${c}"/>`;
  }
}

// Equipment held in the front hand for sports other than football.
function sportProp(sport, trim) {
  if (sport === 'lacrosse') {
    return `<path d="M606 610 L640 196" stroke="#2a2f3a" stroke-width="12" stroke-linecap="round"/>
      <path d="M624 200 C600 150 618 100 650 92 C684 86 700 126 686 170 C676 196 660 206 640 206Z" fill="none" stroke="${trim}" stroke-width="9"/>
      <path d="M632 120 L680 140 M626 150 L684 166 M650 96 L640 200 M668 100 L662 196" stroke="#e5e7eb" stroke-width="3" opacity=".8"/>`;
  }
  if (sport === 'hockey') {
    return `<path d="M604 606 L642 1050" stroke="#2a2f3a" stroke-width="13" stroke-linecap="round"/>
      <path d="M636 1040 L640 1074 C640 1084 648 1090 660 1090 L744 1090 C756 1090 760 1074 748 1070 L676 1060 C664 1058 656 1050 654 1040Z" fill="#2a2f3a"/>
      <rect x="615" y="760" width="16" height="44" fill="${trim}" transform="rotate(-5 623 782)"/>`;
  }
  // baseball: bat held barrel-down by the leg
  return `<path d="M604 606 L640 1020" stroke="#c8a16a" stroke-width="12" stroke-linecap="round"/>
    <path d="M622 820 L648 1060" stroke="#c8a16a" stroke-width="30" stroke-linecap="round"/>
    <path d="M626 846 L648 1052" stroke="#000" stroke-width="6" opacity=".12" stroke-linecap="round"/>`;
}

// ---------------------------------------------------------------------------
/**
 * The full-length player. 900 x 1200 artboard; the figure stands on y=1100.
 * Gear pin positions (fractions of the artboard) are in demo-seed PINS.
 */
function figure(p) {
  const { skin, hairColor, hairStyle, primary, secondary, pants, jersey, build = 1, sport = 'football' } = p;
  const skinShade = shade(skin, 0.14);
  const primaryShade = shade(primary, 0.28);
  const trim = secondary;
  const pantsShade = shade(pants, 0.12);
  const sock = primary;
  const glove = p.glove ?? '#1b1f27';
  const sx = build;
  const body = `
    <!-- legs -->
    <path d="M352 650 L548 650 L556 880 L462 884 L452 742 L448 742 L438 884 L344 880 Z" fill="${pants}"/>
    <path d="M352 650 L360 880 L344 880 Z M548 650 L540 880 L556 880 Z" fill="${pantsShade}"/>
    <rect x="345" y="660" width="10" height="214" fill="${trim}"/>
    <rect x="545" y="660" width="10" height="214" fill="${trim}"/>
    <path d="M372 812 C390 800 418 800 432 812" stroke="${pantsShade}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M468 812 C482 800 510 800 528 812" stroke="${pantsShade}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <!-- socks -->
    <path d="M350 878 L436 878 L432 1056 L360 1056 Z" fill="${sock}"/>
    <path d="M464 878 L550 878 L540 1056 L468 1056 Z" fill="${sock}"/>
    <rect x="351" y="928" width="83" height="14" fill="${trim}"/><rect x="465" y="928" width="83" height="14" fill="${trim}"/>
    <rect x="352" y="952" width="81" height="8" fill="${trim}"/><rect x="466" y="952" width="81" height="8" fill="${trim}"/>
    <!-- cleats -->
    <path d="M356 1048 L434 1048 L438 1084 C438 1096 430 1102 418 1102 L332 1102 C318 1102 314 1088 326 1080 C340 1072 352 1064 356 1048Z" fill="#14171d"/>
    <path d="M466 1048 L544 1048 C548 1064 560 1072 574 1080 C586 1088 582 1102 568 1102 L482 1102 C470 1102 462 1096 462 1084Z" fill="#14171d"/>
    <path d="M340 1084 L420 1080 M480 1080 L560 1084" stroke="#f5f7fb" stroke-width="5" stroke-linecap="round"/>
    <!-- belt -->
    <rect x="350" y="636" width="200" height="22" rx="4" fill="${shade(pants, 0.35)}"/>
    <!-- back arm (hangs at the side, gloved hand) -->
    <path d="M286 410 C268 450 262 500 264 548 C266 590 272 622 278 650 L316 646 C312 606 310 566 312 530 C314 494 318 466 326 440Z" fill="${skin}"/>
    <path d="M300 600 C296 620 300 640 306 650 L316 646 C312 626 310 612 312 596Z" fill="${skinShade}"/>
    <path d="M270 636 C262 660 264 690 278 706 C292 720 316 716 324 700 C330 684 326 660 318 640Z" fill="${glove}"/>
    <path d="M282 666 L314 664" stroke="${tint(glove, 0.25)}" stroke-width="4" stroke-linecap="round"/>
    <!-- jersey with shoulder pads underneath -->
    <path d="M300 372 C330 352 380 344 418 340 L482 340 C520 344 570 352 600 372 C626 388 640 414 646 446 L652 494 L590 506 L572 450 L566 640 L334 640 L328 450 L310 506 L248 494 L254 446 C260 414 274 388 300 372Z" fill="${primary}"/>
    <path d="M334 640 L566 640 L566 620 L334 620Z" fill="${primaryShade}" opacity=".5"/>
    <path d="M248 494 L310 506 L314 488 L252 476Z M652 494 L590 506 L586 488 L648 476Z" fill="${trim}"/>
    <path d="M252 466 L314 478 L316 470 L254 458Z M648 466 L586 478 L584 470 L646 458Z" fill="${trim}"/>
    <path d="M328 450 L334 640 L352 640 L344 470Z M572 450 L566 640 L548 640 L556 470Z" fill="${primaryShade}" opacity=".55"/>
    <!-- collar -->
    <path d="M414 340 C420 372 480 372 486 340 L470 340 C466 356 434 356 430 340Z" fill="${trim}"/>
    ${number(jersey, 450, 420, 120, '#ffffff', trim)}
    <!-- front arm, bent, holding the helmet at the hip -->
    <path d="M604 410 C628 446 640 490 640 530 C640 560 632 586 614 604 L578 586 C592 566 598 546 598 524 C598 494 590 466 578 444Z" fill="${skin}"/>
    <path d="M622 560 C628 580 624 596 614 604 L600 596 C610 584 616 572 618 556Z" fill="${skinShade}"/>
  `;
  const prop = sport === 'football' ? null : sportProp(sport, trim);
  const helmet = `
    <g transform="translate(548 556)">
      <path d="M14 82 C14 30 56 -2 108 -2 C152 -2 182 30 184 72 L184 104 L156 110 L156 142 L66 142 C36 138 14 114 14 82Z" fill="${primary}"/>
      <path d="M14 82 C14 30 56 -2 108 -2 C70 10 44 40 42 84 C40 112 50 132 66 142 C36 138 14 114 14 82Z" fill="#000" opacity=".14"/>
      <path d="M60 10 C96 -6 140 -4 170 22" stroke="${trim}" stroke-width="12" fill="none" stroke-linecap="round"/>
      <path d="M118 -2 C130 40 134 90 132 142" stroke="${trim}" stroke-width="9" fill="none" opacity=".9"/>
      <path d="M150 20 C164 30 172 44 176 58" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" opacity=".35"/>
      <circle cx="88" cy="92" r="13" fill="${primaryShade}"/>
      <path d="M156 70 L206 70 C214 70 218 76 218 84 L218 132 C218 142 212 148 202 148 L156 148" stroke="#c7ced8" stroke-width="9" fill="none" stroke-linejoin="round"/>
      <path d="M156 96 L216 96 M156 122 L216 122 M188 70 L188 148" stroke="#c7ced8" stroke-width="8" stroke-linecap="round"/>
    </g>
    <!-- hand over the helmet -->
    <path d="M572 578 C566 600 572 626 590 636 C606 644 626 636 630 620 C634 602 626 584 612 576Z" fill="${glove}"/>
  `;
  const head = `
    <rect x="424" y="300" width="52" height="56" rx="10" fill="${skinShade}"/>
    <ellipse cx="392" cy="266" rx="12" ry="18" fill="${skin}"/>
    <ellipse cx="508" cy="266" rx="12" ry="18" fill="${skin}"/>
    <ellipse cx="450" cy="256" rx="58" ry="72" fill="${skin}"/>
    <path d="M404 296 C420 324 480 324 496 296 C484 318 416 318 404 296Z" fill="${skinShade}" opacity=".6"/>
    ${hair(hairStyle, hairColor)}
    <path d="M418 240 C424 235 434 235 440 239 M460 239 C466 235 476 235 482 240" stroke="${shade(hairColor, 0.1)}" stroke-width="6" fill="none" stroke-linecap="round"/>
    <ellipse cx="429" cy="258" rx="5.5" ry="6.5" fill="#1b1f27"/>
    <ellipse cx="471" cy="258" rx="5.5" ry="6.5" fill="#1b1f27"/>
    <path d="M449 262 C446 274 446 280 452 282" stroke="${skinShade}" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M434 296 C444 304 458 304 468 296" stroke="${shade(skin, 0.4)}" stroke-width="5" fill="none" stroke-linecap="round"/>
  `;
  const hand = `<path d="M572 578 C566 600 572 626 590 636 C606 644 626 636 630 620 C634 602 626 584 612 576Z" fill="${glove}"/>`;
  const cap = sport === 'baseball' ? `<path d="M390 236 C390 186 418 168 452 168 C488 168 512 190 512 236Z" fill="${primary}"/><path d="M500 228 C530 226 552 232 560 242 L506 244Z" fill="${shade(primary, 0.3)}"/><rect x="388" y="228" width="124" height="12" rx="4" fill="${trim}"/>` : '';
  return `<g transform="translate(${450 - 450 * sx} 0) scale(${sx} 1)">${body}${prop ? prop + hand : helmet}</g>${head}${cap}`;
}

function backdrop(primary, secondary, jersey, id) {
  const dark = shade(primary, 0.55);
  const mid = shade(primary, 0.25);
  return `
  <defs>
    <linearGradient id="bg${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/>
    </linearGradient>
    <radialGradient id="spot${id}" cx=".5" cy=".42" r=".55">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".22"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="900" height="1200" fill="url(#bg${id})"/>
  <rect width="900" height="1200" fill="url(#spot${id})"/>
  <g opacity=".07">${number(jersey, 450, 150, 640, '#ffffff', null)}</g>
  <path d="M0 1010 L900 1010 L900 1200 L0 1200Z" fill="${shade(primary, 0.68)}"/>
  <path d="M0 1010 L900 1010" stroke="${secondary}" stroke-width="6" opacity=".7"/>
  <g stroke="#ffffff" stroke-opacity=".08" stroke-width="4">
    <path d="M60 1200 L230 1010 M300 1200 L360 1010 M600 1200 L540 1010 M840 1200 L670 1010"/>
  </g>
  <ellipse cx="450" cy="1104" rx="240" ry="20" fill="#000" opacity=".35"/>`;
}

function playerSvg(p, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1200" width="900" height="1200" role="img" aria-label="${label}">
${backdrop(p.primary, p.secondary, p.jersey, '')}
${figure(p)}
</svg>
`;
}

// ---------------------------------------------------------------------------
// Team covers: a wide night-game scene in team colours with the team's
// mascot name and a line of players.
function coverSvg(t) {
  const dark = shade(t.primary, 0.62);
  const mid = shade(t.primary, 0.3);
  const lights = [140, 420, 1180, 1460]
    .map((x) => `<g transform="translate(${x} 70)"><rect x="-6" y="40" width="12" height="260" fill="#0b0f18" opacity=".55"/>
      <rect x="-56" y="0" width="112" height="46" rx="6" fill="#0b0f18" opacity=".7"/>
      ${[0, 1, 2, 3].map((i) => `<circle cx="${-40 + i * 27}" cy="23" r="9" fill="#fff8e1"/>`).join('')}</g>`)
    .join('');
  // A shallow V: the middle player stands closest.
  const spots = [[300, 0.42, 800], [1300, 0.42, 800], [540, 0.48, 830], [1060, 0.48, 830], [800, 0.55, 860]];
  const players = spots
    .map(([x, sc, feet], i) => {
      const pl = t.lineup[i];
      return `<g transform="translate(${x - 450 * sc} ${feet - 1100 * sc}) scale(${sc})">${figure({ ...pl, primary: t.primary, secondary: t.secondary, pants: t.pants, sport: t.sport })}</g>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900" role="img" aria-label="Illustration of ${t.name} players under stadium lights">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${dark}"/><stop offset="1" stop-color="${mid}"/></linearGradient>
    <radialGradient id="glow" cx=".5" cy=".1" r=".8"><stop offset="0" stop-color="#ffffff" stop-opacity=".28"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
    <linearGradient id="turf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d6b3a"/><stop offset="1" stop-color="#0f3f22"/></linearGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#sky)"/>
  <rect width="1600" height="900" fill="url(#glow)"/>
  ${lights}
  <path d="M0 330 L1600 330 L1600 470 L0 470Z" fill="${shade(t.primary, 0.7)}"/>
  <g fill="#ffffff" opacity=".07">${Array.from({ length: 60 }, (_, i) => `<rect x="${i * 27 + 4}" y="${340 + (i % 3) * 40}" width="18" height="22" rx="4"/>`).join('')}</g>
  <path d="M0 470 L1600 470 L1600 900 L0 900Z" fill="url(#turf)"/>
  <g stroke="#ffffff" stroke-opacity=".35" stroke-width="5">
    ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<path d="M${-200 + i * 330} 900 L${200 + i * 200} 470"/>`).join('')}
  </g>
  <rect x="0" y="466" width="1600" height="10" fill="${t.secondary}" opacity=".8"/>
  ${players}
</svg>
`;
}

// ---------------------------------------------------------------------------
// Demo teams and rosters. Keep in step with src/lib/db/demo-seed.ts.
export const TEAM_ART = {
  'central-high-football': { name: 'Central High Bobcats', primary: '#4c1d95', secondary: '#f5b301', pants: '#f3efe2' },
  'westview-lacrosse': { name: 'Westview Wolves', primary: '#0f766e', secondary: '#e2e8f0', pants: '#e8edf2', sport: 'lacrosse' },
  'farragut-football': { name: 'Farragut Admirals', primary: '#1e3a8a', secondary: '#dc2626', pants: '#e8edf2' },
  'maryville-youth-football': { name: 'Maryville Rebels', primary: '#b91c1c', secondary: '#f8fafc', pants: '#e5e7eb' },
  'bearden-jv-football': { name: 'Bearden Bulldogs', primary: '#1d4ed8', secondary: '#facc15', pants: '#e8edf2' },
  'lincoln-football': { name: 'Lincoln Cardinals', primary: '#9f1239', secondary: '#fbbf24', pants: '#f3efe2' },
  'riverside-hockey': { name: 'Riverside Pirates', primary: '#18181b', secondary: '#eab308', pants: '#27272a', sport: 'hockey' },
  'eastside-baseball': { name: 'Eastside Panthers', primary: '#166534', secondary: '#f8fafc', pants: '#e5e7eb', sport: 'baseball' },
  'hillcrest-football': { name: 'Hillcrest Hawks', primary: '#0e7490', secondary: '#f97316', pants: '#e8edf2' },
};

const STYLES = ['crop', 'fade', 'curly', 'buzz', 'locs', 'swoop'];

/** Deterministic look for an athlete from its slug. */
export function lookFor(slug, jersey, team) {
  let h = 2166136261;
  for (const ch of slug) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const pick = (arr, k) => arr[(h >>> k) % arr.length];
  return {
    skin: pick(SKIN, 3),
    hairColor: pick(HAIR, 7),
    hairStyle: pick(STYLES, 11),
    build: 0.94 + ((h >>> 17) % 13) / 100,
    primary: team.primary,
    secondary: team.secondary,
    pants: team.pants,
    sport: team.sport ?? 'football',
    jersey,
  };
}

// Central High's roster (first, last initial slug, jersey), as seeded.
const CENTRAL = [
  ['jayden-s-12', '12'], ['liam-j-22', '22'], ['noah-w-81', '81'], ['mason-b-88', '88'], ['elijah-j-74', '74'], ['logan-g-95', '95'],
  ['lucas-m-44', '44'], ['ethan-d-3', '3'], ['aiden-r-21', '21'], ['james-m-17', '17'], ['benjamin-h-19', '19'], ['alexander-l-7', '7'],
  ['michael-g-28', '28'], ['daniel-w-84', '84'], ['matthew-a-86', '86'], ['henry-t-66', '66'], ['sebastian-t-91', '91'], ['jack-m-52', '52'],
  ['owen-j-24', '24'], ['wyatt-m-31', '31'], ['carter-l-39', '39'],
];

// Other teams' rosters come from the same name list in the seed.
// The seed names player i of a team OTHER_NAMES[(i + act) % 8] with jersey 10 + 7i.
const OTHER_ACT = { 'westview-lacrosse': 3, 'farragut-football': 1, 'maryville-youth-football': 6, 'bearden-jv-football': 9, 'lincoln-football': 2, 'riverside-hockey': 4, 'eastside-baseball': 12 };
const OTHER_NAMES = [['marcus', 'b'], ['tyler', 'w'], ['andre', 'p'], ['caleb', 'r'], ['diego', 'f'], ['nate', 'k'], ['evan', 'c'], ['jalen', 'h']];

async function main() {
  await mkdir(path.join(OUT, 'players'), { recursive: true });
  await mkdir(path.join(OUT, 'teams'), { recursive: true });
  let count = 0;
  const write = async (file, svg) => {
    await writeFile(path.join(OUT, file), svg);
    count += 1;
  };

  const central = TEAM_ART['central-high-football'];
  for (const [slug, jersey] of CENTRAL) {
    await write(`players/central-high-football--${slug}.svg`, playerSvg(lookFor(slug, jersey, central), `Illustration of player number ${jersey}`));
  }
  for (const [teamSlug, act] of Object.entries(OTHER_ACT)) {
    for (let i = 0; i < 7; i++) {
      const [first, last] = OTHER_NAMES[(i + act) % OTHER_NAMES.length];
      const jersey = String(10 + i * 7);
      const slug = `${first}-${last}-${jersey}`;
      await write(`players/${teamSlug}--${slug}.svg`, playerSvg(lookFor(slug, jersey, TEAM_ART[teamSlug]), `Illustration of player number ${jersey}`));
    }
  }
  for (const [teamSlug, team] of Object.entries(TEAM_ART)) {
    const lineup = ['12', '74', '3', '88', '21'].map((j, i) => lookFor(`${teamSlug}-${i}`, j, team));
    await write(`teams/${teamSlug}.svg`, coverSvg({ ...team, lineup }));
  }
  console.log(`Wrote ${count} files to public/demo`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
