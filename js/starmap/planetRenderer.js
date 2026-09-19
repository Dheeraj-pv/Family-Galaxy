// Draws a spouse's "planet" — smaller, muted, non-glowing (no pulse animation, ever — that's how
// blood vs. married-in reads at a glance). Hue comes from the person's explicit `color` in
// family.json when given (the reference family data specifies a deliberate color per spouse);
// otherwise it's derived from their id. A deterministic ~1-in-3 of planets also get a thin
// decorative ring, matching the one-off ring accessory the mockup drew behind "Husband of Aunty
// 1" — applied by chance here since the mockup didn't tie it to any particular data field.

import { hashStringToHue, hexToHue, hashStringToRange } from '../utils/math.js';

const RING_CHANCE = 0.35;

function hasRing(id) {
  return hashStringToRange(id, 0, 1, 'hasRing') < RING_CHANCE;
}

export function drawPlanet(ctx, { x, y, size, id, color }) {
  const r = size / 2;
  const hue = color ? hexToHue(color) : hashStringToHue(id);

  ctx.save();

  if (hasRing(id)) {
    const ringAngle = hashStringToRange(id, -25, 25, 'ringAngle') * (Math.PI / 180);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ringAngle);
    ctx.scale(1, 0.38);
    ctx.strokeStyle = `hsla(${hue}, 45%, 78%, 0.5)`;
    ctx.lineWidth = Math.max(1, r * 0.1);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.75, r * 1.75, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Body: a richer 4-stop gradient (vs. a flat 3-stop) for more visible sphere shading.
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = r * 0.6;
  const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.05, x, y, r);
  grad.addColorStop(0, `hsl(${hue}, 42%, 87%)`);
  grad.addColorStop(0.4, `hsl(${hue}, 36%, 63%)`);
  grad.addColorStop(0.75, `hsl(${hue}, 30%, 40%)`);
  grad.addColorStop(1, `hsl(${hue}, 28%, 24%)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // Thin rim light along the lit edge, opposite the shadow, for a bit more 3D pop against the
  // flat dark backdrop.
  ctx.beginPath();
  ctx.arc(x, y, r * 0.96, -2.5, -0.5);
  ctx.strokeStyle = `hsla(${hue}, 55%, 92%, 0.4)`;
  ctx.lineWidth = Math.max(1, r * 0.14);
  ctx.stroke();

  ctx.restore();
}
