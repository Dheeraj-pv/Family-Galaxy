// A small envelope that floats beside any star/planet that has postcards waiting, bobbing
// +/-4px on a 6s ease-in-out loop (CLAUDE.md motion table). Decorative only — the postcards
// themselves live on that person's corkboard, reachable by selecting the star. Each envelope
// sits at a stable, id-derived angle on a ~62px "postcard orbit", so they never share a spot.

import { hashStringToRange } from '../utils/math.js';
import { SIZE_SCALE } from './orbitMath.js';

const POSTCARD_ORBIT_RADIUS = 62; // mockup value, before SIZE_SCALE (mockup range was 55-70)
const BOB_DISTANCE = 4;
const BOB_PERIOD_MS = 6000;
const ENVELOPE_WIDTH = 24 * SIZE_SCALE;

// Vertical bob offset in px at a given time; 0 when reduced motion freezes it.
export function postcardBobOffset(id, timeMs, reducedMotion) {
  if (reducedMotion) return 0;
  const phase = hashStringToRange(id, 0, Math.PI * 2, 'postcardBob');
  return Math.sin((timeMs / BOB_PERIOD_MS) * Math.PI * 2 + phase) * BOB_DISTANCE;
}

// Where the envelope for person `id` sits at `timeMs`. Shared with shootingStar.js so a streak
// always lands exactly on the envelope it is delivering to.
export function envelopeCenter(pos, id, timeMs, reducedMotion = false) {
  const angle = hashStringToRange(id, 0, Math.PI * 2, 'postcardAngle');
  const distance = Math.max(pos.size / 2 + 14, POSTCARD_ORBIT_RADIUS * SIZE_SCALE);
  return {
    x: pos.x + Math.cos(angle) * distance,
    y: pos.y + Math.sin(angle) * distance + postcardBobOffset(id, timeMs, reducedMotion),
  };
}

export function drawPostcardMarker(ctx, pos, id, timeMs, reducedMotion) {
  const { x: cx, y: cy } = envelopeCenter(pos, id, timeMs, reducedMotion);

  const w = ENVELOPE_WIDTH;
  const h = w * 0.68;
  const x = cx - w / 2;
  const y = cy - h / 2;

  ctx.save();
  ctx.shadowColor = 'rgba(255, 216, 155, 0.6)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#f5ecd9';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(10, 14, 39, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(cx, cy + h * 0.1);
  ctx.lineTo(x + w, y);
  ctx.stroke();
  ctx.restore();
}
