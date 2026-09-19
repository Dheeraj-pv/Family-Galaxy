// A small celebration when a postcard is sent: a warm shooting star streaks in from the edge of
// the sky and lands on the recipient's envelope, ending in a soft gold bloom. New motion, not in
// the design mockup (the motion table has no row for it) — the timings below are tunable.
//
// The maths (timing, easing, path, trail, bloom) is pure so tests/test-shooting-star.html can check
// it; drawShootingStars only paints. starMapRender.js calls it every frame from inside the
// camera-transformed (layout-space) canvas context, so it must stay cheap when nothing is flying.
// Timing is timestamp-based off the render loop's clock (performance.now), never setTimeout, so it
// stays in step with the frames even when a tab throttles timers.

import { on } from '../utils/events.js';
import { getReducedMotion } from '../state.js';
import { hashStringToRange } from '../utils/math.js';
import { envelopeCenter } from './postcardMarkers.js';

// Re-exported so tests (and callers) can reach the landing spot from here; the placement itself
// lives with the envelope drawing in postcardMarkers.js, so the two can never drift apart.
export { envelopeCenter };

export const SHOOTING_STAR_DELAY_MS = 350; // lets the "Add postcard" modal fade before the streak starts
export const SHOOTING_STAR_DURATION_MS = 1600; // the flight itself — ease-in-out, so it enters gently and settles
export const SHOOTING_STAR_BLOOM_MS = 700; // the gold bloom on the envelope after landing (ease-out)
export const SHOOTING_STAR_MAX_CONCURRENT = 5; // a burst of postcards never floods the sky
export const SHOOTING_STAR_TOTAL_MS = SHOOTING_STAR_DELAY_MS + SHOOTING_STAR_DURATION_MS + SHOOTING_STAR_BLOOM_MS;

const START_DISTANCE_PX = 520; // on-screen distance the streak begins from; divided by zoom so it always enters "from the edge"
const START_DIRECTION = { x: 0.62, y: -0.78 }; // up and to the right (mirrored for half the streaks)
const CURVE = 0.16; // how far the path bows sideways, as a fraction of its length
const TRAIL_SPAN = 0.17; // trail length as a fraction of the path
const TRAIL_SEGMENTS = 14;
const HEAD_RADIUS_PX = 4.5; // head size on screen, kept constant under zoom
const TRAIL_WIDTH_PX = 3;
const BLOOM_MAX_RADIUS_PX = 38;


// ---- pure math -------------------------------------------------------------------------

// Where in its life a streak is `elapsedMs` after launch: waiting (delay), flying, blooming, done.
export function shootingStarPhase(elapsedMs) {
  if (elapsedMs < SHOOTING_STAR_DELAY_MS) return 'waiting';
  if (elapsedMs < SHOOTING_STAR_DELAY_MS + SHOOTING_STAR_DURATION_MS) return 'flying';
  if (elapsedMs < SHOOTING_STAR_TOTAL_MS) return 'blooming';
  return 'done';
}

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// 0 while waiting, then eases 0 -> 1 across the flight, and stays 1 afterwards.
export function shootingStarProgress(elapsedMs) {
  const t = (elapsedMs - SHOOTING_STAR_DELAY_MS) / SHOOTING_STAR_DURATION_MS;
  return easeInOutCubic(Math.min(1, Math.max(0, t)));
}

// 0 until the star lands, then 0 -> 1 across the bloom (linear; the drawing eases it out).
export function bloomProgress(elapsedMs) {
  const t = (elapsedMs - SHOOTING_STAR_DELAY_MS - SHOOTING_STAR_DURATION_MS) / SHOOTING_STAR_BLOOM_MS;
  return Math.min(1, Math.max(0, t));
}

// Where a streak begins, in layout space: a fixed diagonal from the target, a fixed number of
// SCREEN pixels away (so `scale` keeps it just off toward the edge at any zoom). Half the streaks
// (chosen by `side`, 0 or 1) come from the top-left instead, so a burst doesn't stack on one line.
export function shootingStarStart(target, scale, side = 0) {
  const distance = START_DISTANCE_PX / Math.max(scale, 0.05);
  const dirX = side === 1 ? -START_DIRECTION.x : START_DIRECTION.x;
  return { x: target.x + dirX * distance, y: target.y + START_DIRECTION.y * distance };
}

// A point `t` (0..1) along the gently bowed path from `start` to `end` (a quadratic curve whose
// control point is pushed sideways from the midpoint). `bow` flips the side it curves toward.
export function shootingStarPoint(start, end, t, bow = 1) {
  const mx = (start.x + end.x) / 2;
  const my = (start.y + end.y) / 2;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const cx = mx - dy * CURVE * bow; // perpendicular to the path
  const cy = my + dx * CURVE * bow;
  const u = 1 - t;
  return {
    x: u * u * start.x + 2 * u * t * cx + t * t * end.x,
    y: u * u * start.y + 2 * u * t * cy + t * t * end.y,
  };
}

// The trail: `count` points from the head (index 0, at path position `progress`) back along the
// same curve. Trailing points that would fall before the start are clamped to the start.
export function shootingStarTrail(start, end, progress, bow = 1, count = TRAIL_SEGMENTS) {
  const points = [];
  for (let i = 0; i < count; i += 1) {
    const t = Math.max(0, progress - (i / (count - 1)) * TRAIL_SPAN);
    points.push(shootingStarPoint(start, end, t, bow));
  }
  return points;
}

// Bloom on the envelope: radius (screen px) and alpha at bloomProgress b. Ease-out, so it leaps
// open and then fades away softly.
export function bloomShape(b) {
  const eased = 1 - Math.pow(1 - b, 3);
  return { radiusPx: 9 + eased * (BLOOM_MAX_RADIUS_PX - 9), alpha: 0.6 * (1 - eased) };
}

// ---- state + drawing ---------------------------------------------------------------------

let streaks = []; // { personId, launchedAt, side, start }  — start is fixed on the first flying frame
let launchCount = 0;

export function launchShootingStar(personId, launchedAt = performance.now(), postcardId = '') {
  launchCount += 1;
  // Alternate/scatter which side it comes from, deterministically per postcard where we can.
  const side = postcardId ? Math.round(hashStringToRange(postcardId, 0, 1, 'shootingSide')) : launchCount % 2;
  streaks.push({ personId, launchedAt, side, start: null });
  if (streaks.length > SHOOTING_STAR_MAX_CONCURRENT) streaks = streaks.slice(-SHOOTING_STAR_MAX_CONCURRENT);
}

export function activeShootingStarCount() {
  return streaks.length;
}

export function resetShootingStars() {
  streaks = [];
}

export function initShootingStar() {
  on('postcardAdded', ({ detail }) => {
    if (getReducedMotion()) return; // reduced motion: no streak at all
    launchShootingStar(detail.personId, performance.now(), detail.postcard?.id ?? '');
  });
}

export function drawShootingStars(ctx, positions, now, reducedMotion, scale) {
  if (streaks.length === 0) return;
  if (reducedMotion) { streaks = []; return; }

  streaks = streaks.filter((streak) => {
    const elapsed = now - streak.launchedAt;
    const phase = shootingStarPhase(elapsed);
    if (phase === 'done') return false;
    const pos = positions.get(streak.personId);
    if (!pos) return false; // recipient isn't on the map — nothing to land on
    if (phase === 'waiting') return true;

    const end = envelopeCenter(pos, streak.personId, now); // live: the recipient keeps orbiting
    if (!streak.start) streak.start = shootingStarStart(end, scale, streak.side);
    const bow = streak.side === 1 ? -1 : 1;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter'; // light adding to light — a glow, not a sticker
    ctx.lineCap = 'round';
    if (phase === 'flying') drawFlight(ctx, streak.start, end, shootingStarProgress(elapsed), bow, scale);
    else drawBloom(ctx, end, bloomProgress(elapsed), scale);
    ctx.restore();
    return true;
  });
}

function drawFlight(ctx, start, end, progress, bow, scale) {
  const trail = shootingStarTrail(start, end, progress, bow);
  const last = trail.length - 1;
  for (let i = 0; i < last; i += 1) {
    const fade = 1 - i / last; // 1 at the head, 0 at the tail tip
    ctx.strokeStyle = `rgba(255, 216, 155, ${(0.85 * fade * fade).toFixed(3)})`;
    ctx.lineWidth = (TRAIL_WIDTH_PX * (0.25 + 0.75 * fade)) / scale;
    ctx.beginPath();
    ctx.moveTo(trail[i].x, trail[i].y);
    ctx.lineTo(trail[i + 1].x, trail[i + 1].y);
    ctx.stroke();
  }

  const head = trail[0];
  const r = HEAD_RADIUS_PX / scale;
  const glow = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, r * 4);
  glow.addColorStop(0, 'rgba(255, 248, 231, 0.95)');
  glow.addColorStop(0.35, 'rgba(255, 216, 155, 0.45)');
  glow.addColorStop(1, 'rgba(255, 216, 155, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(head.x, head.y, r * 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff8e7';
  ctx.beginPath();
  ctx.arc(head.x, head.y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawBloom(ctx, at, b, scale) {
  const { radiusPx, alpha } = bloomShape(b);
  const r = radiusPx / scale;
  const bloom = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, r);
  bloom.addColorStop(0, `rgba(255, 248, 231, ${alpha.toFixed(3)})`);
  bloom.addColorStop(0.4, `rgba(255, 216, 155, ${(alpha * 0.55).toFixed(3)})`);
  bloom.addColorStop(1, 'rgba(255, 216, 155, 0)');
  ctx.fillStyle = bloom;
  ctx.beginPath();
  ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
  ctx.fill();
}
