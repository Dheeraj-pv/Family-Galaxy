// The star map's canvas draw orchestrator. Owns turning a resolved click/tap into a selection
// (it already has the layout data from computeStarMapLayout, so hit-testing lives here rather
// than in starMapInput.js, which only knows raw pointer geometry) and owns the motion pass:
// per-star twinkle and the staggered orbit-ring draw-in on first load, both driven by a
// requestAnimationFrame loop that respects prefers-reduced-motion (see CLAUDE.md "Motion").

import { getPeople, getViewportTransform, setViewportTransform, setSelectedPersonId, getReducedMotion, getPlayheadYear } from '../state.js';
import { on, emit } from '../utils/events.js';
import { clamp, lerp } from '../utils/math.js';
import { computeStarMapLayout, layoutBounds, fitViewForBounds } from './orbitMath.js';
import { drawOrbitRing } from './orbitRingRenderer.js';
import { drawBlackHole } from './blackHoleRenderer.js';
import { drawStar, twinkleGlowStrength } from './starRenderer.js';
import { drawPlanet } from './planetRenderer.js';
import { drawPostcardMarker } from './postcardMarkers.js';
import { drawSelectRipple, isRippleActive } from './selectRipple.js';
import { starfieldOffset } from './parallax.js';
import { personOpacityForYear, FADED_OPACITY, PRESENT_OPACITY, TIMELINE_FADE_MS } from '../timeline/timelineFilter.js';
import { relatedIds, describeRelations, FOCUS_DIM } from './relations.js';
import { announce } from '../a11y/announcer.js';
import { drawShootingStars } from './shootingStar.js';

// Manual zoom limits, shared with starMapInput.js and zoomControls.js.
export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 3;

const ORBIT_DRAW_IN_DURATION_MS = 1100;
const ORBIT_DRAW_IN_STAGGER_MS = 150;
const REDUCED_MOTION_FADE_MS = 120;
const STATIC_GLOW_STRENGTH = 0.85; // fixed star glow when twinkle is disabled

const FOLLOW_ZOOM_SCALE = 2.4; // how far in the camera zooms when following a clicked star/planet
const FOLLOW_TRANSITION_MS = 700; // flight time to/from a followed target — new motion, on request

let canvas = null;
let ctx = null;
let lastPositions = new Map();
let focusedPersonId = null;
let revealStartTime = null;
let rafHandle = null;
let selectRipple = null; // { personId, startTime } while the 400ms select ripple is playing
// Until the user pans/zooms themselves (input modules announce that via `viewportChanged`; the
// follow camera never does), the map re-fits the whole tree to the canvas on load and on resize.
let userAdjustedView = false;

// Timeline lens: each person's on-screen opacity eases toward what the playhead year says it
// should be (present -> 1, absent -> 0.15) instead of snapping. First sight of a person starts
// at their target so nothing fades in on load.
const displayOpacity = new Map();
let lastFadeTime = null;
let fadeInProgress = false;

// Relationship highlight: while a star is selected, its parents/children/spouse(s) stay lit and
// everyone else eases down to FOCUS_DIM. A second multiplier on top of the timeline opacity, eased
// on the same 300ms (120ms reduced-motion) clock. highlightIds is null when nothing is selected.
let highlightIds = null;
// A relationship path ("how are we related?") lights exactly these people and, while set, wins over
// the selection highlight above. Set/cleared through setPathHighlight (exported below).
let pathIds = null;
const displayFocus = new Map();

// Camera-follow state. followTarget is the personId the camera is actively tracking (re-centers
// on it every frame, since it may be orbiting); followTransition drives the eased fly-to/fly-back
// animation. preFollowTransform snapshots the camera from before following started, so releasing
// (clicking empty space) can fly back to it rather than just stopping wherever it drifted to.
let followTarget = null;
let followTransition = null;
let preFollowTransform = null;
// While the profile card is open it covers the lower-middle of the map, which is exactly where a
// followed star would sit if it were centered. So the follow camera parks the star higher up,
// in the clear sky above the card, by this fraction of the map's height.
const FOLLOW_LIFT_WHEN_CARD_OPEN = 0.2;
let followLiftFraction = 0;

const MIN_HIT_RADIUS = 14; // px, in layout space — keeps the smallest (gen3+) stars tappable

export function initStarMap(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext('2d');
  resizeCanvasToContainer();

  window.addEventListener('resize', () => {
    resizeCanvasToContainer();
    applyFitViewIfPristine();
    render();
  });
  on('dataReady', () => {
    applyFitViewIfPristine();
    revealStartTime = performance.now();
    startAnimationLoop();
  });
  on('viewportChanged', () => { userAdjustedView = true; render(); });
  on('playheadChanged', () => startAnimationLoop());
  on('postcardAdded', () => render());
  on('postcardEdited', () => render());
  on('postcardDeleted', () => render());
  on('starMapClicked', ({ detail }) => handleStarMapClicked(detail));
  on('motionPrefChanged', () => startAnimationLoop());
  on('starSelected', ({ detail }) => {
    startFollowing(detail.personId);
    setHighlight(detail.personId);
    // Reduced motion: no expanding ring (entrances collapse to the plain fade instead).
    if (!getReducedMotion()) {
      selectRipple = { personId: detail.personId, startTime: performance.now() };
      startAnimationLoop();
    }
  });
  on('profileCardOpened', () => { followLiftFraction = FOLLOW_LIFT_WHEN_CARD_OPEN; });
  on('profileCardClosed', () => { followLiftFraction = 0; clearHighlight(); });

  render();
}

// Lights exactly `personIds` (an array/Set) and dims everyone else, or restores the normal
// selection highlight when given null/empty. Used by the "how are we related?" picker.
export function setPathHighlight(personIds) {
  pathIds = personIds && (personIds.size ?? personIds.length) > 0 ? new Set(personIds) : null;
  startAnimationLoop();
}

function setHighlight(personId) {
  const people = getPeople();
  const { all } = relatedIds(people, personId);
  highlightIds = all.size > 0 ? all : null;
  // A card that opens already tells screen readers who this is; this adds who they're related to.
  const sentence = describeRelations(people, personId);
  if (sentence) announce(sentence, { delay: 900 });
  startAnimationLoop();
}

function clearHighlight() {
  highlightIds = null;
  startAnimationLoop();
}

// Frames the whole tree in the canvas (see fitViewForBounds in orbitMath.js). If a follow is in
// progress, the framing it will fly back to is updated instead of yanking the camera.
function applyFitViewIfPristine() {
  if (userAdjustedView) return;
  const people = getPeople();
  if (people.length === 0) return;
  const rect = canvas.getBoundingClientRect();
  const fit = fitViewForBounds(layoutBounds(people), { width: rect.width, height: rect.height }, { minScale: ZOOM_MIN });
  if (followTarget !== null) { preFollowTransform = fit; return; }
  if (followTransition?.releaseTo) { followTransition.releaseTo = fit; return; }
  setViewportTransform(fit);
}

function startAnimationLoop() {
  if (rafHandle !== null) return; // already running — the loop below re-checks reducedMotion itself
  function loop() {
    render();
    const elapsed = revealStartTime === null ? 0 : performance.now() - revealStartTime;
    const revealFinished = getReducedMotion() && elapsed > REDUCED_MOTION_FADE_MS;
    // Non-reduced-motion never "finishes": twinkle keeps the loop alive indefinitely. Under
    // reduced motion, a released (returning) follow transition also needs to run to completion
    // before the loop can stop — an active (non-released) follow deliberately never clears
    // followTransition, since re-centering on a moving target IS the ongoing follow behavior.
    if (!revealFinished || followTransition || fadeInProgress || selectRipple) {
      rafHandle = requestAnimationFrame(loop);
    } else {
      rafHandle = null;
    }
  }
  rafHandle = requestAnimationFrame(loop);
}

// Starts (or retargets) the camera following a person. The very first time following begins,
// the pre-follow camera is remembered so releasing later can fly back to it.
function startFollowing(personId) {
  const current = getViewportTransform();
  if (followTarget === null) {
    preFollowTransform = { ...current };
  }
  followTarget = personId;
  followTransition = {
    fromScale: current.scale,
    fromPan: { x: current.x, y: current.y },
    startTime: performance.now(),
    duration: getReducedMotion() ? REDUCED_MOTION_FADE_MS : FOLLOW_TRANSITION_MS,
    releaseTo: null,
  };
  startAnimationLoop();
}

// Releases the camera (clicking empty space while following) — flies back to wherever the
// camera was framed before following started.
function stopFollowing() {
  const current = getViewportTransform();
  followTransition = {
    fromScale: current.scale,
    fromPan: { x: current.x, y: current.y },
    startTime: performance.now(),
    duration: getReducedMotion() ? REDUCED_MOTION_FADE_MS : FOLLOW_TRANSITION_MS,
    releaseTo: preFollowTransform,
  };
  followTarget = null;
  preFollowTransform = null;
  startAnimationLoop();
}

// Same as clicking empty map space: fly back to the framing from before following began. A
// no-op when nothing is being followed. (cancelFollow below is different — it just stops.)
export function releaseFollow() {
  if (followTarget !== null) stopFollowing();
}

// Called by starMapInput.js the moment a manual pan/zoom begins, so the user immediately regains
// full control instead of fighting an auto-recentering camera. No fly-back animation here — the
// camera simply stops being touched by the follow system, right where it currently is.
export function cancelFollow() {
  followTarget = null;
  followTransition = null;
  preFollowTransform = null;
}

// Advances the follow fly-to/fly-back animation by one frame and writes the result into
// viewportTransform. Re-targets every call using the LIVE position of followTarget (from the
// positions just computed this frame), so a still-moving (orbiting) target is tracked
// continuously rather than flown to a single stale point.
function updateFollowCamera(positions, now) {
  if (!followTransition) return;
  const t = clamp((now - followTransition.startTime) / followTransition.duration, 0, 1);
  const eased = easeOutCubic(t);

  let destScale;
  let destX;
  let destY;
  if (followTransition.releaseTo) {
    destScale = followTransition.releaseTo.scale;
    destX = followTransition.releaseTo.x;
    destY = followTransition.releaseTo.y;
  } else {
    const targetPos = positions.get(followTarget);
    if (!targetPos) return; // target not in this layout (shouldn't normally happen) — hold camera as-is
    destScale = FOLLOW_ZOOM_SCALE;
    destX = -targetPos.x * destScale;
    destY = -targetPos.y * destScale - canvas.getBoundingClientRect().height * followLiftFraction;
  }

  setViewportTransform({
    scale: lerp(followTransition.fromScale, destScale, eased),
    x: lerp(followTransition.fromPan.x, destX, eased),
    y: lerp(followTransition.fromPan.y, destY, eased),
  });

  if (t >= 1 && followTransition.releaseTo) {
    followTransition = null; // release complete — hand the camera back for free manual control
  }
}

// Exported (alongside twinkleGlowStrength in starRenderer.js) so this pure timing math can be
// unit-tested directly — see /tests/test-motion.html — rather than inferred from canvas pixels,
// which is unreliable to observe at sub-1.5s precision through browser automation round-trips.
export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// Ring reveal on first load: staggered ease-out draw-in per generation depth normally, or a
// single fast uniform fade when the user has asked for reduced motion.
export function ringRevealOpacity(ringDepth, elapsedMs, reducedMotion) {
  if (reducedMotion) {
    return clamp(elapsedMs / REDUCED_MOTION_FADE_MS, 0, 1);
  }
  const delay = ringDepth * ORBIT_DRAW_IN_STAGGER_MS;
  const t = clamp((elapsedMs - delay) / ORBIT_DRAW_IN_DURATION_MS, 0, 1);
  return easeOutCubic(t);
}

function handleStarMapClicked(layoutPoint) {
  const personId = hitTest(layoutPoint);
  if (personId) {
    setSelectedPersonId(personId);
    emit('starSelected', { personId }); // startFollowing() runs via this event, see initStarMap
  } else if (followTarget) {
    stopFollowing();
  }
}

function hitTest(layoutPoint) {
  let closestId = null;
  let closestDist = Infinity;
  lastPositions.forEach((pos, personId) => {
    const hitRadius = Math.max(pos.size / 2, MIN_HIT_RADIUS);
    const dist = Math.hypot(layoutPoint.x - pos.x, layoutPoint.y - pos.y);
    if (dist <= hitRadius && dist < closestDist) {
      closestId = personId;
      closestDist = dist;
    }
  });
  return closestId;
}

// Called by starMapA11yMirror.js on focus/blur of its mirrored buttons, so keyboard users get
// the same visible feedback mouse users get by hovering — a ring drawn around the focused star.
export function setFocusedPersonId(personId) {
  focusedPersonId = personId;
  render();
}

function resizeCanvasToContainer() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function render() {
  if (!ctx) return;
  const people = getPeople();
  if (people.length === 0) return;

  const reducedMotion = getReducedMotion();
  const now = performance.now();
  // Orbital drift is continuous ambient motion, same category as twinkle/parallax — frozen
  // under reduced motion by passing timeMs=0 (every orbit sits at its static base angle).
  const { positions, founderGroups } = computeStarMapLayout(people, reducedMotion ? 0 : now);
  lastPositions = positions;

  updateFollowCamera(positions, now);
  advanceTimelineFade(people, now, reducedMotion);
  advanceFocusFade(people, reducedMotion);

  const { x: panX, y: panY, scale } = getViewportTransform();
  applyStarfieldParallax({ x: panX, y: panY }, reducedMotion);
  const rect = canvas.getBoundingClientRect();
  const originX = rect.width / 2 + panX;
  const originY = rect.height / 2 + panY;
  const elapsedSinceReveal = revealStartTime === null ? 0 : now - revealStartTime;

  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.save();
  ctx.translate(originX, originY);
  ctx.scale(scale, scale);

  // A ring stays as bright as the brightest body sharing it (siblings on one ring), so a ring
  // only dims once everyone on it is absent from the playhead year.
  const ringPresence = new Map();
  positions.forEach((pos, id) => {
    if (pos.orbitRadius <= 0) return;
    const key = `${pos.orbitKind}:${pos.orbitCenter.x},${pos.orbitCenter.y},${pos.orbitRadius}`;
    ringPresence.set(key, Math.max(ringPresence.get(key) ?? 0, opacityOf(id)));
  });
  const drawnRings = new Set();
  positions.forEach((pos) => {
    if (pos.orbitRadius <= 0) return;
    const key = `${pos.orbitKind}:${pos.orbitCenter.x},${pos.orbitCenter.y},${pos.orbitRadius}`;
    if (drawnRings.has(key)) return;
    drawnRings.add(key);
    const opacity = ringRevealOpacity(pos.ringDepth ?? 0, elapsedSinceReveal, reducedMotion) * ringPresence.get(key);
    drawOrbitRing(ctx, pos.orbitCenter.x, pos.orbitCenter.y, pos.orbitRadius, pos.orbitKind, opacity);
  });

  founderGroups.forEach((group) => {
    ctx.save();
    ctx.globalAlpha = Math.max(...group.personIds.map(opacityOf));
    drawBlackHole(ctx, group);
    ctx.restore();
  });

  people.forEach((person) => {
    const pos = positions.get(person.id);
    if (!pos || pos.isBlackHole) return;
    ctx.save();
    ctx.globalAlpha = opacityOf(person.id);
    if (person.role === 'blood') {
      const glowStrength = reducedMotion ? STATIC_GLOW_STRENGTH : twinkleGlowStrength(person.id, now);
      drawStar(ctx, pos, { glowStrength });
    } else {
      drawPlanet(ctx, { ...pos, id: person.id, color: person.color });
    }
    ctx.restore();
  });

  // Envelopes for anyone with postcards; a founding couple shares one black hole, so it gets one.
  const markedGroups = new Set();
  people.forEach((person) => {
    if (person.postcards.length === 0) return;
    const pos = positions.get(person.id);
    if (!pos) return;
    if (pos.isBlackHole) {
      if (markedGroups.has(pos.groupId)) return;
      markedGroups.add(pos.groupId);
    }
    ctx.save();
    ctx.globalAlpha = opacityOf(person.id);
    drawPostcardMarker(ctx, pos, person.id, now, reducedMotion);
    ctx.restore();
  });

  drawShootingStars(ctx, positions, now, reducedMotion, scale);

  if (selectRipple) {
    const elapsed = now - selectRipple.startTime;
    const pos = positions.get(selectRipple.personId);
    if (pos && isRippleActive(elapsed)) drawSelectRipple(ctx, pos, elapsed);
    else selectRipple = null;
  }

  if (focusedPersonId) {
    const pos = positions.get(focusedPersonId);
    if (pos) drawFocusRing(ctx, pos);
  }

  ctx.restore();
}

// Publishes the parallax offset as CSS variables on the map container; css/star-map.css shifts
// the starfield layer by them. Only touches the DOM when the value actually changes.
let lastStarfieldKey = '';
function applyStarfieldParallax(pan, reducedMotion) {
  const { x, y } = starfieldOffset(pan, reducedMotion);
  const key = `${x.toFixed(1)},${y.toFixed(1)}`;
  if (key === lastStarfieldKey) return;
  lastStarfieldKey = key;
  const container = canvas.parentElement;
  container.style.setProperty('--starfield-x', `${x.toFixed(1)}px`);
  container.style.setProperty('--starfield-y', `${y.toFixed(1)}px`);
}

// Timeline presence x relationship focus. Rings, the black hole and envelopes all read this, so
// they take "the brightest body they hold" for free.
function opacityOf(personId) {
  return (displayOpacity.get(personId) ?? PRESENT_OPACITY) * (displayFocus.get(personId) ?? 1);
}

// Eases each person's opacity toward the playhead-year target at a constant rate so a full
// 0.15 <-> 1 swing takes TIMELINE_FADE_MS (or the 120ms reduced-motion fade). Sets
// fadeInProgress so the animation loop knows to keep running until everything has settled.
function advanceTimelineFade(people, now, reducedMotion) {
  const year = getPlayheadYear();
  const fadeMs = reducedMotion ? REDUCED_MOTION_FADE_MS : TIMELINE_FADE_MS;
  const maxStep = lastFadeTime === null ? Infinity : ((now - lastFadeTime) / fadeMs) * (PRESENT_OPACITY - FADED_OPACITY);
  lastFadeTime = now;
  fadeInProgress = false;
  people.forEach((person) => {
    const target = personOpacityForYear(person, year);
    const current = displayOpacity.get(person.id);
    if (current === undefined) { displayOpacity.set(person.id, target); return; }
    if (current === target) return;
    const next = current < target ? Math.min(target, current + maxStep) : Math.max(target, current - maxStep);
    displayOpacity.set(person.id, next);
    if (next !== target) fadeInProgress = true;
  });
}

// Eases each person's focus multiplier toward 1 (related, or nothing selected) or FOCUS_DIM. Uses
// the same per-frame delta as advanceTimelineFade (lastFadeTime was just updated there), and keeps
// the animation loop alive via fadeInProgress until every value has settled.
let lastFocusFadeTime = null;
function advanceFocusFade(people, reducedMotion) {
  const now = lastFadeTime;
  const fadeMs = reducedMotion ? REDUCED_MOTION_FADE_MS : TIMELINE_FADE_MS;
  const maxStep = lastFocusFadeTime === null ? Infinity : ((now - lastFocusFadeTime) / fadeMs) * (1 - FOCUS_DIM);
  lastFocusFadeTime = now;
  people.forEach((person) => {
    const lit = pathIds ?? highlightIds;
    const target = lit === null || lit.has(person.id) ? 1 : FOCUS_DIM;
    const current = displayFocus.get(person.id);
    if (current === undefined) { displayFocus.set(person.id, 1); if (target === 1) return; }
    const from = current ?? 1;
    const next = from < target ? Math.min(target, from + maxStep) : Math.max(target, from - maxStep);
    displayFocus.set(person.id, next);
    if (next !== target) fadeInProgress = true;
  });
}

function drawFocusRing(ctx, pos) {
  const r = pos.size / 2 + 6;
  ctx.save();
  ctx.strokeStyle = '#ffd89b';
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
