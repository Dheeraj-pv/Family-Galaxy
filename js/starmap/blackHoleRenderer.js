// Draws a founder couple's combined black-hole visual: a soft outer halo, a spinning-in-later
// (see the motion pass, build-order step 8) conic accretion ring, and a dark core. Proportions
// taken from the mockup's 260px-diameter version — see CLAUDE.md "Star map rendering mechanics".

export function drawBlackHole(ctx, { x, y, diameter }) {
  const outerRadius = diameter / 2; // 130 at the mockup's reference size
  const ringOuter = outerRadius * 0.5; // 65
  const ringInner = ringOuter * 0.6; // 39
  const coreRadius = ringOuter * (31 / 65); // ~31

  // Outer halo
  const halo = ctx.createRadialGradient(x, y, 0, x, y, outerRadius);
  halo.addColorStop(0, 'rgba(255,216,155,0.28)');
  halo.addColorStop(0.4, 'rgba(251,140,105,0.14)');
  halo.addColorStop(0.7, 'rgba(251,140,105,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, outerRadius, 0, Math.PI * 2);
  ctx.fill();

  // Accretion ring (annulus) — conic gradient cut into a ring via an even-odd fill.
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, ringOuter, 0, Math.PI * 2);
  ctx.arc(x, y, ringInner, 0, Math.PI * 2, true);
  const conic = ctx.createConicGradient(0, x, y);
  conic.addColorStop(0, '#fff8e7');
  conic.addColorStop(0.25, '#ffd89b');
  conic.addColorStop(0.5, '#fb7185');
  conic.addColorStop(0.75, '#ffd89b');
  conic.addColorStop(1, '#fff8e7');
  ctx.fillStyle = conic;
  ctx.fill('evenodd');
  ctx.restore();

  // Dark core
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 30;
  const core = ctx.createRadialGradient(
    x - coreRadius * 0.2, y - coreRadius * 0.25, coreRadius * 0.1,
    x, y, coreRadius
  );
  core.addColorStop(0, '#1a0f05');
  core.addColorStop(0.7, '#000000');
  core.addColorStop(1, '#000000');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(x, y, coreRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
