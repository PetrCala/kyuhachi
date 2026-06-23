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
// (Pure-vector SVGs are rasterised with sharp; the onsen ♨ mark is reused from
// app/assets/onsen-symbol*.png, recoloured to the deep metal shade and composited
// in — sharp's SVG renderer drops embedded raster images, so we composite instead.)
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

const INCLUDE_KYUSHU = false; // tone-on-tone island reads as a smudge at this size; omitted per brief

// hex -> "r g b" normalized 0..1 for feColorMatrix (used only in preview SVG)
function hexNorm(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]
    .map((v) => v.toFixed(4)).join(' ');
}

// --- medallion geometry (designed in a 240-unit viewBox) -------------------
// A clean geometric "8" = two slightly-overlapping stroked rings.
function digit8(cx) {
  const top = { y: 46, r: 7 };
  const bot = { y: 61, r: 9 };
  const sw = 4.5;
  return `
    <circle cx="${cx}" cy="${top.y}" r="${top.r}" fill="none" stroke="DEEP" stroke-width="${sw}"/>
    <circle cx="${cx}" cy="${bot.y}" r="${bot.r}" fill="none" stroke="DEEP" stroke-width="${sw}"/>`;
}

// Stylised Kyushu silhouette (approximate, NE–SW oriented blob), low-relief.
const KYUSHU_PATH =
  'M132 70 C150 72 162 86 160 104 C159 118 168 126 166 140 ' +
  'C164 156 150 168 150 182 C150 196 138 204 126 200 ' +
  'C116 197 116 184 108 176 C99 167 86 168 82 156 ' +
  'C78 145 88 136 88 124 C88 112 80 104 86 94 ' +
  'C92 83 106 86 114 80 C121 75 123 69 132 70 Z';

function medallionSVG(metal) {
  const { fill, deep, sheen } = METALS[metal];
  const sheenArc = 'M29.4 77.7 A100 100 0 0 1 210.6 77.7';
  const kyushu = INCLUDE_KYUSHU
    ? `<path d="${KYUSHU_PATH}" fill="${deep}" opacity="0.10"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="WIDTH" height="WIDTH" viewBox="0 0 240 240">
  <!-- rim -->
  <circle cx="120" cy="120" r="112" fill="${deep}"/>
  <!-- metal face -->
  <circle cx="120" cy="120" r="104" fill="${fill}"/>
  ${kyushu}
  <!-- struck concentric ring -->
  <circle cx="120" cy="120" r="95" fill="none" stroke="${deep}" stroke-width="2" opacity="0.45"/>
  <!-- soft upper sheen -->
  <path d="${sheenArc}" fill="none" stroke="${sheen}" stroke-width="3.5" stroke-linecap="round" opacity="0.55"/>
  <!-- embossed "88" (upper portion) -->
  <g>${(digit8(105.75) + digit8(134.25)).replaceAll('DEEP', deep)}</g>
</svg>`;
}

// --- transport pin geometry (designed in a 32-unit viewBox) ----------------
const GLYPHS = {
  // side-on walking person
  foot: `
    <circle cx="14.6" cy="8.8" r="2.5" fill="${PIN.glyph}"/>
    <path d="M15 11.8 L16.2 17" stroke="${PIN.glyph}" stroke-width="2.3" stroke-linecap="round"/>
    <path d="M16.2 17 L19.6 23.2" stroke="${PIN.glyph}" stroke-width="2.3" stroke-linecap="round"/>
    <path d="M16.2 17 L12.4 22.8" stroke="${PIN.glyph}" stroke-width="2.3" stroke-linecap="round"/>
    <path d="M15.4 13.2 L19.2 15" stroke="${PIN.glyph}" stroke-width="2.3" stroke-linecap="round"/>
    <path d="M15.4 13.2 L11.8 15.4" stroke="${PIN.glyph}" stroke-width="2.3" stroke-linecap="round"/>`,
  // side-on bicycle
  bicycle: `
    <circle cx="9.5" cy="20" r="4.2" fill="none" stroke="${PIN.glyph}" stroke-width="1.6"/>
    <circle cx="22.5" cy="20" r="4.2" fill="none" stroke="${PIN.glyph}" stroke-width="1.6"/>
    <path d="M9.5 20 L15 12 L20 20" fill="none" stroke="${PIN.glyph}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M15 12 L22.5 20" fill="none" stroke="${PIN.glyph}" stroke-width="1.6"/>
    <path d="M12.5 12 L16 12" stroke="${PIN.glyph}" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M19.5 11.5 L23 11.5" stroke="${PIN.glyph}" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M21 11.5 L22.5 20" stroke="${PIN.glyph}" stroke-width="1.6"/>`,
  // front-on bus
  public: `
    <rect x="8" y="7" width="16" height="18" rx="3" fill="${PIN.glyph}"/>
    <rect x="10.5" y="10" width="11" height="5" rx="1.2" fill="${PIN.ink}"/>
    <circle cx="11.5" cy="19.5" r="1.5" fill="${PIN.ink}"/>
    <circle cx="20.5" cy="19.5" r="1.5" fill="${PIN.ink}"/>
    <rect x="8" y="24.5" width="3" height="2.2" rx="0.6" fill="${PIN.glyph}"/>
    <rect x="21" y="24.5" width="3" height="2.2" rx="0.6" fill="${PIN.glyph}"/>`,
  // side-on car: solid white body + white wheels (visible on the ink field) with ink hubs
  car: `
    <path d="M4.5 19.2 C4.5 17.3 5.6 16.8 7.2 16.6 L10.8 12.8 C11.4 12.2 12.2 11.8 13.2 11.8 L19.6 11.8 C20.7 11.8 21.6 12.3 22.2 13.2 L24.4 16.4 C25.9 16.7 27.5 17.4 27.5 19.4 L27.5 20.2 C27.5 20.7 27.1 21 26.6 21 L5.4 21 C4.9 21 4.5 20.7 4.5 20.2 Z" fill="${PIN.glyph}"/>
    <circle cx="10.2" cy="21.4" r="3.1" fill="${PIN.glyph}"/>
    <circle cx="10.2" cy="21.4" r="1.25" fill="${PIN.ink}"/>
    <circle cx="21.8" cy="21.4" r="3.1" fill="${PIN.glyph}"/>
    <circle cx="21.8" cy="21.4" r="1.25" fill="${PIN.ink}"/>`,
};

function pinSVG(mode) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="WIDTH" height="WIDTH" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="15.2" fill="${PIN.rim}"/>
  <circle cx="16" cy="16" r="13.8" fill="${PIN.ink}"/>
  ${GLYPHS[mode]}
</svg>`;
}

// --- recolor the onsen symbol to the deep metal shade (exact, via dest-in) -
async function recoloredSymbol(metal, density, targetW) {
  const deep = METALS[metal].deep;
  // trim the white glyph to content, then resize to target width
  const glyph = await sharp(SYMBOL[density]).trim().resize({ width: targetW }).toBuffer();
  const meta = await sharp(glyph).metadata();
  // solid deep box masked by the glyph's alpha
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

async function buildMedallion(metal, density) {
  const S = MED_SIZES[density];
  const base = await renderSVG(medallionSVG(metal), S);
  const glyphW = Math.round(S * 0.42);
  const { buf, w, h } = await recoloredSymbol(metal, density, glyphW);
  const cx = S / 2, cy = S * 0.55; // slightly below centre; leaves lower field calm
  const left = Math.round(cx - w / 2);
  const top = Math.round(cy - h / 2);
  const out = await sharp(base).composite([{ input: buf, left, top }]).png().toBuffer();
  const suffix = density === 1 ? '' : `@${density}x`;
  fs.writeFileSync(path.join(OUT, `badge-base-${metal}${suffix}.png`), out);
}

async function buildPin(mode, density) {
  const P = PIN_SIZES[density];
  const out = await renderSVG(pinSVG(mode), P);
  const suffix = density === 1 ? '' : `@${density}x`;
  fs.writeFileSync(path.join(OUT, `transport-${mode}${suffix}.png`), out);
}

// --- editable source SVGs --------------------------------------------------
function writeSources() {
  for (const metal of Object.keys(METALS)) {
    // pure-vector base (rendered output composites the symbol separately)
    fs.writeFileSync(
      path.join(SRC, `badge-base-${metal}.svg`),
      medallionSVG(metal).replaceAll('WIDTH', '240'),
    );
    // self-contained preview (symbol embedded + recoloured) for human editing
    const sym = fs.readFileSync(SYMBOL[3]).toString('base64');
    const [r, g, b] = hexNorm(METALS[metal].deep).split(' ');
    const preview = medallionSVG(metal)
      .replaceAll('WIDTH', '240')
      .replace('<svg ', '<svg xmlns:xlink="http://www.w3.org/1999/xlink" ')
      .replace('</svg>',
        `<defs><filter id="d"><feColorMatrix type="matrix" values="0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  0 0 0 1 0"/></filter></defs>` +
        `<image x="69" y="80" width="100" height="100" preserveAspectRatio="xMidYMid meet" filter="url(#d)" xlink:href="data:image/png;base64,${sym}"/></svg>`);
    fs.writeFileSync(path.join(SRC, `badge-base-${metal}.preview.svg`), preview);
  }
  for (const mode of Object.keys(GLYPHS)) {
    fs.writeFileSync(path.join(SRC, `transport-${mode}.svg`), pinSVG(mode).replaceAll('WIDTH', '32'));
  }
}

// --- contact sheet ---------------------------------------------------------
async function contactSheet() {
  const W = 1000, H = 600;
  const bg = '#f4f4f6';
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
  // medallions at 160 across the top row
  const metals = ['gold', 'silver', 'bronze'];
  for (let i = 0; i < metals.length; i++) {
    const m = await sharp(path.join(OUT, `badge-base-${metals[i]}@2x.png`)).toBuffer();
    comp.push({ input: m, left: 40 + i * 180, top: 140 });
  }
  // pins at 64 in the lower-left
  const modes = ['foot', 'bicycle', 'public', 'car'];
  for (let i = 0; i < modes.length; i++) {
    const p = await sharp(path.join(OUT, `transport-${modes[i]}@2x.png`)).toBuffer();
    comp.push({ input: p, left: 58 + i * 100, top: 370 });
  }
  // composited example: gold medallion (240) + public pin overlaid bottom-centre
  const med = await sharp(path.join(OUT, `badge-base-gold@3x.png`)).toBuffer();
  const pinD = Math.round(medD * 0.36); // ~36% of medallion diameter
  const pin = await sharp(path.join(OUT, `transport-public@3x.png`)).resize(pinD, pinD).toBuffer();
  comp.push({ input: med, left: exX, top: exY });
  // pin centred horizontally, mostly inside the lower rim (~72% inside)
  comp.push({ input: pin, left: Math.round(exX + medD / 2 - pinD / 2), top: Math.round(exY + medD - pinD * 0.72) });

  await sharp(Buffer.from(labels)).composite(comp).png().toFile(path.join(OUT, 'contact-sheet.png'));
}

// --- run -------------------------------------------------------------------
(async () => {
  for (const metal of Object.keys(METALS)) for (const d of [1, 2, 3]) await buildMedallion(metal, d);
  for (const mode of Object.keys(GLYPHS)) for (const d of [1, 2, 3]) await buildPin(mode, d);
  writeSources();
  await contactSheet();
  console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });
