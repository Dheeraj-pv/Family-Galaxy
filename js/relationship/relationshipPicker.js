// "How are we related?" control inside the profile card: pick another person and a calm sentence
// says how they connect ("Cousin 3 is Me!'s first cousin, through Grandfather & Grandmother."),
// while the whole chain of people between them lights up on the map. The maths is in kinship.js;
// this file is only the little form, the map highlight and the announcements.

import { getPeople, getViewportTransform, setViewportTransform, getReducedMotion } from '../state.js';
import { on } from '../utils/events.js';
import { clamp, lerp } from '../utils/math.js';
import { announce } from '../a11y/announcer.js';
import { setPathHighlight, cancelFollow, render, ZOOM_MIN, easeOutCubic } from '../starmap/starMapRender.js';
import { computeStarMapLayout, layoutBounds, fitViewForBounds } from '../starmap/orbitMath.js';
import { findRelationship } from './kinship.js';

// The card covers the lower middle of the map, so when a path is shown the camera frames it in the
// clear sky above the card. Same flight time as the follow camera (700ms, 120ms reduced motion).
const FRAME_MS = 700;
const REDUCED_FRAME_MS = 120;
const FRAME_PADDING_PX = 64;
const FRAME_MAX_SCALE = 1.8; // a two-person path (parent and child) shouldn't zoom in absurdly far

let selectEl = null;
let resultEl = null;
let subjects = []; // who the open card is about (two people for the founding couple)
let cardEl = null;
let framed = false; // true while the camera is parked on a path (so we owe it a way back)
let cameraTween = null; // rAF handle of the running camera flight

// Registered at import time — before initStarMap() runs — so when another star is selected this
// puts the camera back FIRST; the follow camera then snapshots that (not our path framing) as the
// view to return to when it lets go.
on('starSelected', () => reset({ snap: true }));
// A manual pan/zoom takes the camera back from us.
on('viewportChanged', () => { framed = false; stopTween(); });

export function initRelationshipPicker(containerEl) {
  containerEl.textContent = '';

  const label = document.createElement('label');
  label.className = 'relationship__label small-caps';
  label.htmlFor = 'relationship-select';
  label.textContent = 'How are we related?';

  selectEl = document.createElement('select');
  selectEl.id = 'relationship-select';
  selectEl.className = 'relationship__select';
  selectEl.setAttribute('aria-describedby', 'relationship-result');
  selectEl.addEventListener('change', onPick);

  resultEl = document.createElement('p');
  resultEl.id = 'relationship-result';
  resultEl.className = 'relationship__result';

  containerEl.append(label, selectEl, resultEl);
  cardEl = containerEl.closest('#profile-card');

  // The path belongs to one open card: closing it, or selecting someone else, ends it.
  on('profileCardClosed', () => reset());
}

// Called when the card opens for `people` (the card's subjects). Refills the list with everyone else.
export function setRelationshipSubjects(cardSubjects) {
  subjects = cardSubjects;
  const own = new Set(subjects.map((p) => p.id));
  selectEl.textContent = '';
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = 'Choose someone…';
  selectEl.appendChild(blank);
  getPeople().filter((p) => !own.has(p.id)).forEach((person) => {
    const option = document.createElement('option');
    option.value = person.id;
    option.textContent = person.name; // names are data: textContent, never markup
    selectEl.appendChild(option);
  });
  reset({ snap: true });
}

// Ends the path: clears the sentence and the map highlight, and gives the camera back (flying to
// the fitted view, or snapping there when another star is about to take over the camera).
function reset({ snap = false } = {}) {
  if (selectEl) {
    selectEl.value = '';
    resultEl.textContent = '';
  }
  endPath({ snap });
}

// Drops the map highlight and hands the camera back (see reset).
function endPath({ snap = false } = {}) {
  setPathHighlight(null); // back to the ordinary selection highlight
  if (framed) {
    framed = false;
    const fit = fittedView();
    if (snap || !fit) { stopTween(); if (fit) setViewportTransform(fit); render(); }
    else flyCameraTo(fit);
  }
}

// ---- camera ---------------------------------------------------------------------------------

function canvasRect() {
  return document.getElementById('star-map-canvas').getBoundingClientRect();
}

// The whole tree fitted in the canvas — the same framing the map starts with.
function fittedView() {
  const people = getPeople();
  if (people.length === 0) return null;
  const rect = canvasRect();
  return fitViewForBounds(layoutBounds(people), { width: rect.width, height: rect.height }, { minScale: ZOOM_MIN });
}

// Camera transform (scale + pan, see starMapRender) that puts every lit person in the sky above the card.
function transformForPath(personIds) {
  const { positions } = computeStarMapLayout(getPeople(), getReducedMotion() ? 0 : performance.now());
  const boxes = personIds.map((id) => positions.get(id)).filter(Boolean);
  if (boxes.length === 0) return null;
  const minX = Math.min(...boxes.map((b) => b.x - b.size / 2));
  const maxX = Math.max(...boxes.map((b) => b.x + b.size / 2));
  const minY = Math.min(...boxes.map((b) => b.y - b.size / 2));
  const maxY = Math.max(...boxes.map((b) => b.y + b.size / 2));

  const rect = canvasRect();
  const cardTop = cardEl && !cardEl.hidden ? cardEl.getBoundingClientRect().top - rect.top : rect.height;
  const visibleHeight = clamp(cardTop - 12, rect.height * 0.3, rect.height);
  const scale = clamp(
    Math.min((rect.width - 2 * FRAME_PADDING_PX) / Math.max(1, maxX - minX), (visibleHeight - 2 * FRAME_PADDING_PX) / Math.max(1, maxY - minY)),
    ZOOM_MIN, FRAME_MAX_SCALE,
  );
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  // screen = canvas centre + pan + scale * layout; centre the path's box in the visible strip.
  return { scale, x: -cx * scale, y: visibleHeight / 2 - rect.height / 2 - cy * scale };
}

function stopTween() {
  if (cameraTween !== null) cancelAnimationFrame(cameraTween);
  cameraTween = null;
}

function flyCameraTo(target) {
  stopTween();
  const from = { ...getViewportTransform() };
  const duration = getReducedMotion() ? REDUCED_FRAME_MS : FRAME_MS;
  const start = performance.now();
  function step(now) {
    const t = clamp((now - start) / duration, 0, 1);
    const e = easeOutCubic(t);
    setViewportTransform({ scale: lerp(from.scale, target.scale, e), x: lerp(from.x, target.x, e), y: lerp(from.y, target.y, e) });
    render(); // the animation loop can be idle under reduced motion, so draw every step ourselves
    cameraTween = t < 1 ? requestAnimationFrame(step) : null;
  }
  cameraTween = requestAnimationFrame(step);
}

function onPick() {
  const otherId = selectEl.value;
  if (!otherId || subjects.length === 0) {
    reset();
    return;
  }
  const result = findRelationship(getPeople(), subjects[0].id, otherId, {
    ownerName: subjects.map((p) => p.name).join(' & '),
  });
  resultEl.textContent = result.sentence;
  if (result.path.length > 0) {
    setPathHighlight(result.path);
    // The follow camera is zoomed in on the card's person: stop it and frame the whole chain instead.
    const target = transformForPath(result.path);
    if (target) {
      cancelFollow();
      framed = true;
      flyCameraTo(target);
    }
  } else {
    endPath();
  }
  announce(result.sentence, { delay: 300 });
}
