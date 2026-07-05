/**
 * generate-logo.js
 * Regenerates all app icon assets from logo_loderer.svg
 * Run: node scripts/generate-logo.js
 */

const { Resvg } = require('@resvg/resvg-js');
const fs        = require('fs');
const path      = require('path');

const ROOT = path.join(__dirname, '..', '..');   // Loderer_Dental_App/
const OUT  = path.join(__dirname, '..', 'assets', 'images');

// ── Tooth path (filled, premium) ────────────────────────────────────────────
const TOOTH = `
  M 512 218
  C 452 218 400 238 368 272
  C 336 306 322 352 325 396
  C 328 435 345 470 365 500
  C 382 526 390 554 384 582
  C 376 614 362 656 367 696
  C 371 730 392 756 418 754
  C 442 752 455 730 461 700
  C 468 666 472 632 488 610
  C 499 595 505 588 512 588
  C 519 588 525 595 536 610
  C 552 632 556 666 563 700
  C 569 730 582 752 606 754
  C 632 756 653 730 657 696
  C 662 656 648 614 640 582
  C 634 554 642 526 659 500
  C 679 470 696 435 699 396
  C 702 352 688 306 656 272
  C 624 238 572 218 512 218 Z
`.trim();

// ── Build SVG string ─────────────────────────────────────────────────────────
function buildSVG({ size = 1024, transparentBg = false }) {
  const bg = transparentBg ? '' : `
    <rect width="1024" height="1024" rx="220" fill="#111827"/>
    <radialGradient id="vg" cx="50%" cy="40%" r="55%">
      <stop offset="0%" stop-color="#3D2C1E"/>
      <stop offset="100%" stop-color="#1A110A"/>
    </radialGradient>
    <rect width="1024" height="1024" rx="220" fill="url(#vg)" opacity="0.6"/>
  `;

  return `<svg xmlns="http://www.w3.org/2000/svg"
    width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="vg" cx="50%" cy="40%" r="55%">
      <stop offset="0%" stop-color="#3D2C1E"/>
      <stop offset="100%" stop-color="#1A110A"/>
    </radialGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  ${bg}

  <!-- Decorative gold lines -->
  <rect x="332" y="158" width="360" height="3" rx="1.5" fill="#3A4256" opacity="0.7"/>
  <rect x="332" y="863" width="360" height="3" rx="1.5" fill="#3A4256" opacity="0.7"/>

  <!-- Tooth — filled gold with glow -->
  <path fill="#3A4256" d="${TOOTH}" filter="url(#glow)"/>

  <!-- Tooth shine highlight -->
  <path fill="#E8D5B0" opacity="0.18" d="
    M 415 262
    C 388 282 370 310 362 342
    C 375 316 394 294 418 280
    C 438 268 460 262 478 260
    C 458 256 435 256 415 262 Z
  "/>

  <!-- LODERER -->
  <text x="512" y="810"
    font-family="Georgia, 'Times New Roman', serif"
    font-size="62" font-weight="700"
    letter-spacing="14" text-anchor="middle"
    fill="#3A4256" opacity="0.95">LODERER</text>

  <!-- DENTAL -->
  <text x="512" y="856"
    font-family="Georgia, 'Times New Roman', serif"
    font-size="34" font-weight="400"
    letter-spacing="18" text-anchor="middle"
    fill="#BBACA0" opacity="0.75">DENTAL</text>
</svg>`;
}

// ── Render helper ─────────────────────────────────────────────────────────────
function renderPNG(svgStr, outPath) {
  const resvg  = new Resvg(svgStr, { fitTo: { mode: 'original' }, font: { loadSystemFonts: false } });
  const png    = resvg.render().asPng();
  fs.writeFileSync(outPath, png);
  console.log(`  ✓ ${path.basename(outPath).padEnd(36)} ${(png.length / 1024).toFixed(1)} KB`);
}

// ── Generate all assets ───────────────────────────────────────────────────────
console.log('\n🦷  Generating Loderer Dental logo assets…\n');

renderPNG(buildSVG({ size: 1024 }),                       path.join(OUT, 'icon.png'));
renderPNG(buildSVG({ size: 1024 }),                       path.join(OUT, 'splash-icon.png'));
renderPNG(buildSVG({ size: 64  }),                        path.join(OUT, 'favicon.png'));
renderPNG(buildSVG({ size: 1024, transparentBg: true }),  path.join(OUT, 'android-icon-foreground.png'));

console.log('\n✅  Done — all assets written to app/assets/images/\n');
console.log('   Next: eas build --platform android --profile preview\n');
