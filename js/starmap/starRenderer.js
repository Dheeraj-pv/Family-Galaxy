// Draws a blood relative's glowing star, with an optional twinkle (opacity pulse).

import { hashStringToRange } from '../utils/math.js';

const TWINKLE_MIN_OPACITY = 0.55;
const TWINKLE_MAX_OPACITY = 1;

// Per-star period (2-5s) and phase, both derived deterministically from the person's id so
// twinkle is stable across renders but decorrelated between stars — no two stars share a period
// or phase, so "the sky never breathes as one" (see CLAUDE.md motion table).
export function twinkleGlowStrength(id, timeMs) {
  const periodMs = hashStringToRange(id, 2000, 5000, 'period');
  const phase = hashStringToRange(id, 0, Math.PI * 2, 'phase');
  const wave = Math.sin((timeMs / periodMs) * Math.PI * 2 + phase); // -1..1
  const unit = (wave + 1) / 2; // 0..1
  return TWINKLE_MIN_OPACITY + unit * (TWINKLE_MAX_OPACITY - TWINKLE_MIN_OPACITY);
}

export function drawStar(ctx, { x, y, size }, { glowStrength = 1 } = {}) {
  const r = size / 2;

  // Outer bloom halo — canvas shadowBlur alone reads thin/flat compared to the mockup's soft
  // multi-layer box-shadow glow, so the bloom is an explicit large soft gradient layer, same
  // technique as the black hole's halo, not just a shadow on the core circle.
  const haloR = r * 3.2;
  const halo = ctx.createRadialGradient(x, y, 0, x, y, haloR);
  halo.addColorStop(0, `rgba(255,216,155,${0.38 * glowStrength})`);
  halo.addColorStop(0.45, `rgba(255,216,155,${0.14 * glowStrength})`);
  halo.addColorStop(1, 'rgba(255,216,155,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, haloR, 0, Math.PI * 2);
  ctx.fill();

  // Core star, with its own tighter shadow on top of the halo for a bright hot center.
  ctx.save();
  ctx.shadowColor = `rgba(255,216,155,${0.55 * glowStrength})`;
  ctx.shadowBlur = r * 1.3 * glowStrength;
  const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.05, x, y, r);
  grad.addColorStop(0, '#fff8e7');
  grad.addColorStop(0.45, '#ffd89b');
  grad.addColorStop(0.8, 'rgba(255,216,155,0.15)');
  grad.addColorStop(1, 'rgba(255,216,155,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
