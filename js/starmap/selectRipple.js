// "Star select ripple" (CLAUDE.md motion table): a brief expanding ring around whatever was just
// selected, 400ms ease-out, played *before* the profile card rises. The timing math is pure so
// tests/test-motion.html can check it; the draw function only paints a ring.

export const STAR_SELECT_RIPPLE_MS = 400;

// 0 at the start, 1 once finished; ease-out so the ring leaps out and then settles.
export function rippleProgress(elapsedMs) {
  const t = Math.min(1, Math.max(0, elapsedMs / STAR_SELECT_RIPPLE_MS));
  return 1 - Math.pow(1 - t, 3);
}

export function isRippleActive(elapsedMs) {
  return elapsedMs >= 0 && elapsedMs < STAR_SELECT_RIPPLE_MS;
}

// Ring grows from the body's own edge outward and fades as it goes.
export function drawSelectRipple(ctx, pos, elapsedMs) {
  const p = rippleProgress(elapsedMs);
  const r = pos.size / 2;
  const radius = r + p * Math.max(28, r * 0.9);
  ctx.save();
  ctx.strokeStyle = `rgba(255, 216, 155, ${0.75 * (1 - p)})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
