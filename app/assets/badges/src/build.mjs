import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

// ---------------------------------------------------------------------------
// Kyuhachi challenge-badge asset builder
// Produces struck-metal tier medallions (3 colorways) + enamel transport pins
// (4 glyphs), each at @1x/@2x/@3x, plus editable source SVGs and a contact sheet.
//
// Run from anywhere:  cd app/assets/badges/src && npm i sharp && node build.mjs
//
// Glyph provenance (baked in as path data so the build needs only `sharp`):
//   - 九 / 八  — outlines extracted from Klee One SemiBold (the app's brand font,
//                @expo-google-fonts/klee-one), the same mark as the app logo.
//   - transport icons — Google Material Icons (Apache-2.0): directions_walk,
//                directions_bike, directions_bus, directions_car.
//   - the ♨ mark is reused from app/assets/onsen-symbol*.png, recoloured to the
//                deep metal shade and composited in (sharp's SVG renderer drops
//                embedded raster images, so we composite instead).
// ---------------------------------------------------------------------------

const SRC = path.dirname(fileURLToPath(import.meta.url)); // app/assets/badges/src
const OUT = path.resolve(SRC, '..'); // app/assets/badges
const ASSETS = path.resolve(OUT, '..'); // app/assets
const SYMBOL = {
  1: path.join(ASSETS, 'onsen-symbol.png'),
  2: path.join(ASSETS, 'onsen-symbol@2x.png'),
  3: path.join(ASSETS, 'onsen-symbol@3x.png'),
};
fs.mkdirSync(SRC, { recursive: true });

// --- metal colorways (match app theme tokens) ------------------------------
const METALS = {
  gold:   { fill: '#b8893b', deep: '#7a5a23', sheen: '#d9b066' },
  silver: { fill: '#8a8a8f', deep: '#5b5b60', sheen: '#b9b9be' },
  bronze: { fill: '#a9663a', deep: '#7a4527', sheen: '#c98a5c' },
};

const PIN = {
  ink:  '#262837', // deep-indigo enamel field (brand ink)
  rim:  '#e8e9ee', // thin light rim
  glyph:'#ffffff', // white glyph
};

// --- 九 / 八 outlines (Klee One SemiBold, em=1000, baseline y=0) ------------
const KANJI = {
  kyu: {
    bbox: { x1: 45, y1: -799, x2: 963, y2: 71 },
    d: 'M963-167L963-187Q962-238 948-238Q935-238 927-190Q923-162 914-127.50Q905-93 898-74Q891-54 881.50-40.50Q872-27 849-21Q826-15 778-15Q738-15 718-20.50Q698-26 692-37Q686-48 686-63Q686-70 686.50-77.50Q687-85 688-94L729-483Q730-490 732.50-498Q735-506 735-514Q735-528 720.50-539.50Q706-551 688-551Q684-551 680.50-550.50Q677-550 673-550L483-532Q491-587 496-642.50Q501-698 503-751L503-753Q503-766 492-774.50Q481-783 466-788.50Q451-794 439.50-796.50Q428-799 427-799Q413-799 413-790Q413-787 414-785Q419-769 423-754Q427-739 427-720L427-714Q426-674 422.50-625.50Q419-577 411-525L215-507Q208-506 201.50-506Q195-506 189-506Q176-506 164-507.50Q152-509 138-511Q137-511 136-511.50Q135-512 134-512Q128-512 128-506Q128-502 129-500Q130-499 135.50-485.50Q141-472 153.50-459Q166-446 185-446Q193-446 201-447Q209-448 219-449L400-465Q382-371 346-283.50Q310-196 244-115.50Q178-35 67 40Q45 55 45 64Q45 71 56 71Q63 71 91.50 59Q120 47 162 22Q204-3 251-43.50Q298-84 342-141.50Q386-199 417-275Q436-320 449.50-370Q463-420 473-472L661-489L620-78Q619-71 619-64.50Q619-58 619-52Q619 3 651.50 27Q684 51 773 51Q831 51 868 46Q905 41 926 21Q947 1 955-43.50Q963-88 963-167',
  },
  hachi: {
    bbox: { x1: 40, y1: -735, x2: 987, y2: 35 },
    d: 'M987-14Q987-21 975-28Q900-80 840.50-150.50Q781-221 735.50-300Q690-379 658-458Q626-537 605-606Q598-632 591.50-655Q585-678 580-695Q577-707 570.50-716Q564-725 547.50-730Q531-735 496-735Q468-735 468-726Q468-719 485-708Q498-699 505.50-690Q513-681 521-659Q529-637 542-590Q580-455 629.50-352Q679-249 729.50-175.50Q780-102 823.50-55.50Q867-9 896 13Q925 35 930 35Q938 35 951.50 24Q965 13 976 1Q987-11 987-14M79 18Q210-74 286.50-217Q363-360 401-536Q402-540 402.50-543.50Q403-547 403-550Q403-563 389.50-575Q376-587 359.50-594.50Q343-602 333-602Q323-602 323-590Q323-589 323.50-587.50Q324-586 324-584Q327-569 327-559Q327-555 321-518Q315-481 298.50-422Q282-363 252.50-291.50Q223-220 175.50-146Q128-72 60-6Q40 14 40 26Q40 32 47 32Q59 32 79 18',
  },
};

// 九 八 laid out horizontally, baseline-aligned, scaled to combined width TW and
// centred at (cx, cy) in medallion (240-unit) space.
function kanjiGroup(deep, cx, cy, TW) {
  const { kyu, hachi } = KANJI;
  const kw = kyu.bbox.x2 - kyu.bbox.x1;
  const gap = 90; // em units between the two glyphs
  const dxKyu = -kyu.bbox.x1; // 九 left edge -> 0
  const dxHachi = kw + gap - hachi.bbox.x1; // 八 placed after 九 + gap
  const W = kw + gap + (hachi.bbox.x2 - hachi.bbox.x1); // combined width
  const top = Math.min(kyu.bbox.y1, hachi.bbox.y1);
  const bottom = Math.max(kyu.bbox.y2, hachi.bbox.y2);
  const s = TW / W;
  const tx = cx - s * (W / 2);
  const ty = cy - s * ((top + bottom) / 2);
  return `<g transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${s.toFixed(5)})" fill="${deep}">` +
    `<path transform="translate(${dxKyu} 0)" d="${kyu.d}"/>` +
    `<path transform="translate(${dxHachi} 0)" d="${hachi.d}"/></g>`;
}

function medallionSVG(metal) {
  const { fill, deep, sheen } = METALS[metal];
  const sheenArc = 'M29.4 77.7 A100 100 0 0 1 210.6 77.7';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="WIDTH" height="WIDTH" viewBox="0 0 240 240">
  <!-- rim -->
  <circle cx="120" cy="120" r="112" fill="${deep}"/>
  <!-- metal face -->
  <circle cx="120" cy="120" r="104" fill="${fill}"/>
  <!-- struck concentric ring -->
  <circle cx="120" cy="120" r="95" fill="none" stroke="${deep}" stroke-width="2" opacity="0.45"/>
  <!-- soft upper sheen -->
  <path d="${sheenArc}" fill="none" stroke="${sheen}" stroke-width="3.5" stroke-linecap="round" opacity="0.55"/>
  <!-- embossed 九八 (upper portion) -->
  ${kanjiGroup(deep, 120, 55, 86)}
</svg>`;
}

// --- transport icons (Google Material Icons, Apache-2.0; 24x24 viewBox) -----
const ICONS = {
  // directions_walk
  foot: 'M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9 7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7',
  // directions_bike
  bicycle: 'M15.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM5 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5zm5.8-10 2.4-2.4.8.8c1.3 1.3 3 2.1 5.1 2.1V9c-1.5 0-2.7-.6-3.6-1.5l-1.9-1.9c-.5-.4-1-.6-1.6-.6s-1.1.2-1.4.6L7.8 8.4c-.4.4-.6.9-.6 1.4 0 .6.2 1.1.6 1.4L11 14v5h2v-6.2l-2.2-2.3zM19 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5z',
  // directions_bus
  public: 'M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z',
  // directions_car
  car: 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z',
};

// Centre a 24x24 icon's content bbox at (16,16) in the 32-unit pin, scaling its
// longest side to `target`. Content bbox is measured by rasterise-and-trim.
async function iconTransform(d, target) {
  const R = 480, s = R / 24;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${R}" height="${R}" viewBox="0 0 24 24"><path d="${d}" fill="#fff"/></svg>`;
  const { info } = await sharp(Buffer.from(svg)).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
  const bx = -info.trimOffsetLeft / s, by = -info.trimOffsetTop / s;
  const bw = info.width / s, bh = info.height / s;
  const sc = target / Math.max(bw, bh);
  const tx = 16 - sc * (bx + bw / 2), ty = 16 - sc * (by + bh / 2);
  return `translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${sc.toFixed(5)})`;
}

function pinSVG(mode, tf) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="WIDTH" height="WIDTH" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="15.2" fill="${PIN.rim}"/>
  <circle cx="16" cy="16" r="13.8" fill="${PIN.ink}"/>
  <g transform="${tf}" fill="${PIN.glyph}"><path d="${ICONS[mode]}"/></g>
</svg>`;
}

// --- recolor the onsen symbol to the deep metal shade (exact, via dest-in) -
async function recoloredSymbol(metal, density, targetW) {
  const deep = METALS[metal].deep;
  const glyph = await sharp(SYMBOL[density]).trim().resize({ width: targetW }).toBuffer();
  const meta = await sharp(glyph).metadata();
  return sharp({ create: { width: meta.width, height: meta.height, channels: 4, background: deep } })
    .composite([{ input: glyph, blend: 'dest-in' }])
    .png()
    .toBuffer()
    .then((buf) => ({ buf, w: meta.width, h: meta.height }));
}

function renderSVG(svg, size) {
  return sharp(Buffer.from(svg.replaceAll('WIDTH', String(size)))).png().toBuffer();
}

const MED_SIZES = { 1: 80, 2: 160, 3: 240 };
const PIN_SIZES = { 1: 32, 2: 64, 3: 96 };
const PIN_TF = {}; // mode -> centring transform (computed once)

async function buildMedallion(metal, density) {
  const S = MED_SIZES[density];
  const base = await renderSVG(medallionSVG(metal), S);
  const glyphW = Math.round(S * 0.36);
  const { buf, w, h } = await recoloredSymbol(metal, density, glyphW);
  const cx = S / 2, cy = S * 0.545; // hero ♨, below the 九八 mark, calm field beneath
  const left = Math.round(cx - w / 2);
  const top = Math.round(cy - h / 2);
  const out = await sharp(base).composite([{ input: buf, left, top }]).png().toBuffer();
  const suffix = density === 1 ? '' : `@${density}x`;
  fs.writeFileSync(path.join(OUT, `badge-base-${metal}${suffix}.png`), out);
}

async function buildPin(mode, density) {
  const P = PIN_SIZES[density];
  const out = await renderSVG(pinSVG(mode, PIN_TF[mode]), P);
  const suffix = density === 1 ? '' : `@${density}x`;
  fs.writeFileSync(path.join(OUT, `transport-${mode}${suffix}.png`), out);
}

// --- editable source SVGs --------------------------------------------------
function hexNorm(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]
    .map((v) => v.toFixed(4)).join(' ');
}

function writeSources() {
  for (const metal of Object.keys(METALS)) {
    fs.writeFileSync(path.join(SRC, `badge-base-${metal}.svg`), medallionSVG(metal).replaceAll('WIDTH', '240'));
    // self-contained preview (♨ embedded + recoloured) for human editing
    const sym = fs.readFileSync(SYMBOL[3]).toString('base64');
    const [r, g, b] = hexNorm(METALS[metal].deep).split(' ');
    const gw = Math.round(240 * 0.36), gx = 120 - gw / 2, gy = 240 * 0.545 - gw / 2;
    const preview = medallionSVG(metal)
      .replaceAll('WIDTH', '240')
      .replace('<svg ', '<svg xmlns:xlink="http://www.w3.org/1999/xlink" ')
      .replace('</svg>',
        `<defs><filter id="d"><feColorMatrix type="matrix" values="0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  0 0 0 1 0"/></filter></defs>` +
        `<image x="${gx}" y="${gy}" width="${gw}" height="${gw}" preserveAspectRatio="xMidYMid meet" filter="url(#d)" xlink:href="data:image/png;base64,${sym}"/></svg>`);
    fs.writeFileSync(path.join(SRC, `badge-base-${metal}.preview.svg`), preview);
  }
  for (const mode of Object.keys(ICONS)) {
    fs.writeFileSync(path.join(SRC, `transport-${mode}.svg`), pinSVG(mode, PIN_TF[mode]).replaceAll('WIDTH', '32'));
  }
}

// --- contact sheet ---------------------------------------------------------
async function contactSheet() {
  const W = 1000, H = 600, bg = '#f4f4f6';
  const exX = 640, exY = 150, medD = 240;
  const labels = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="${bg}"/>
    <text x="40" y="46" font-family="Helvetica,Arial" font-size="24" font-weight="700" fill="#262837">Kyuhachi — challenge badges (vector draft)</text>
    <text x="40" y="74" font-family="Helvetica,Arial" font-size="13" fill="#999">struck-metal tier medallion + enamel transport pin, composited at runtime</text>
    <text x="40" y="120" font-family="Helvetica,Arial" font-size="15" fill="#555">Tier medallions (shown @2x · 160px)</text>
    <text x="40" y="350" font-family="Helvetica,Arial" font-size="15" fill="#555">Transport pins (shown @2x · 64px)</text>
    <text x="${exX}" y="120" font-family="Helvetica,Arial" font-size="15" fill="#555">Composited badge (gold + public)</text>
    <text x="120" y="300" font-family="Helvetica,Arial" font-size="13" fill="#888" text-anchor="middle">gold</text>
    <text x="300" y="300" font-family="Helvetica,Arial" font-size="13" fill="#888" text-anchor="middle">silver</text>
    <text x="480" y="300" font-family="Helvetica,Arial" font-size="13" fill="#888" text-anchor="middle">bronze</text>
    <text x="90"  y="520" font-family="Helvetica,Arial" font-size="12" fill="#888" text-anchor="middle">foot</text>
    <text x="190" y="520" font-family="Helvetica,Arial" font-size="12" fill="#888" text-anchor="middle">bicycle</text>
    <text x="290" y="520" font-family="Helvetica,Arial" font-size="12" fill="#888" text-anchor="middle">public</text>
    <text x="390" y="520" font-family="Helvetica,Arial" font-size="12" fill="#888" text-anchor="middle">car</text>
  </svg>`;
  const comp = [];
  const metals = ['gold', 'silver', 'bronze'];
  for (let i = 0; i < metals.length; i++) {
    comp.push({ input: await sharp(path.join(OUT, `badge-base-${metals[i]}@2x.png`)).toBuffer(), left: 40 + i * 180, top: 140 });
  }
  const modes = ['foot', 'bicycle', 'public', 'car'];
  for (let i = 0; i < modes.length; i++) {
    comp.push({ input: await sharp(path.join(OUT, `transport-${modes[i]}@2x.png`)).toBuffer(), left: 58 + i * 100, top: 370 });
  }
  // composited example: gold medallion + public pin, small + low so the ♨ is clear
  const med = await sharp(path.join(OUT, `badge-base-gold@3x.png`)).toBuffer();
  const pinD = Math.round(medD * 0.30); // ~30% of medallion diameter
  const pin = await sharp(path.join(OUT, `transport-public@3x.png`)).resize(pinD, pinD).toBuffer();
  comp.push({ input: med, left: exX, top: exY });
  const pinCY = Math.round(medD * 0.88); // sits low, overlapping the bottom rim
  comp.push({ input: pin, left: Math.round(exX + medD / 2 - pinD / 2), top: Math.round(exY + pinCY - pinD / 2) });

  await sharp(Buffer.from(labels)).composite(comp).png().toFile(path.join(OUT, 'contact-sheet.png'));
}

// --- run -------------------------------------------------------------------
(async () => {
  for (const mode of Object.keys(ICONS)) PIN_TF[mode] = await iconTransform(ICONS[mode], 20);
  for (const metal of Object.keys(METALS)) for (const d of [1, 2, 3]) await buildMedallion(metal, d);
  for (const mode of Object.keys(ICONS)) for (const d of [1, 2, 3]) await buildPin(mode, d);
  writeSources();
  await contactSheet();
  console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });
