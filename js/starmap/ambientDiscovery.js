// Ambient discovery (added on request): every so often, when nobody is doing anything in
// particular, a soft shooting star drifts to a random person who's actually in the sky that year
// and a quiet caption surfaces one of their memories or postcards — so the galaxy feels alive and
// worth wandering even when no one is driving it, not just a backdrop that waits for clicks.
//
// Reuses the exact shooting-star visual from postcards (js/starmap/shootingStar.js) rather than
// inventing new motion — the same warm streak-and-bloom, just launched by a timer instead of a
// `postcardAdded` event. The picking logic below is pure (no timers/DOM), so
// tests/test-ambient-discovery.html can check it with a seeded rng; initAmbientDiscovery owns the
// scheduling and the caption pill.

import { on, emit } from '../utils/events.js';
import { getPeople, getPlayheadYear, getReducedMotion, setSelectedPersonId } from '../state.js';
import { isPersonPresent } from '../timeline/timelineFilter.js';
import { announce } from '../a11y/announcer.js';
import { launchShootingStar, activeShootingStarCount, SHOOTING_STAR_TOTAL_MS } from './shootingStar.js';

export const AMBIENT_MIN_DELAY_MS = 45000; // wanders every 45-90s — frequent enough to notice,
export const AMBIENT_MAX_DELAY_MS = 90000; // rare enough to stay a surprise, not a metronome
export const AMBIENT_CAPTION_MS = 6000; // how long the discovery caption stays up

// ---- pure picking -----------------------------------------------------------------------

// Every discoverable moment a person has: their Then & Now captions and their postcards' notes,
// tagged with which kind so the caption can say "A memory:" vs. a sender.
export function personMoments(person) {
  const memories = (person.memories ?? [])
    .filter((m) => m.caption)
    .map((m) => ({ kind: 'memory', text: m.caption }));
  const postcards = (person.postcards ?? [])
    .filter((p) => p.note)
    .map((p) => ({ kind: 'postcard', text: p.note, from: p.from }));
  return [...memories, ...postcards];
}

// A uniformly random person who is present in `year`, isn't `excludeId`, and actually has
// something to discover — or null if nobody qualifies. `rng` defaults to Math.random but takes a
// seeded function in tests for a deterministic pick.
export function pickAmbientCandidate(people, year, excludeId, rng = Math.random) {
  const candidates = people.filter(
    (p) => p.id !== excludeId && isPersonPresent(p, year) && personMoments(p).length > 0,
  );
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}

// One of `person`'s moments, uniformly at random, or null if they have none.
export function pickAmbientMoment(person, rng = Math.random) {
  const moments = personMoments(person);
  if (moments.length === 0) return null;
  return moments[Math.floor(rng() * moments.length)];
}

function captionText(person, moment) {
  if (moment.kind === 'memory') return `A memory of ${person.name}: “${moment.text}”`;
  return `A postcard to ${person.name}: “${moment.text}”`;
}

// ---- scheduling + DOM ---------------------------------------------------------------------

let captionEl = null;
let timer = null;
let hideTimer = null;
let cardOpen = false;
let storyPlaying = false;

function randomDelay() {
  return AMBIENT_MIN_DELAY_MS + Math.random() * (AMBIENT_MAX_DELAY_MS - AMBIENT_MIN_DELAY_MS);
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(tick, randomDelay());
}

// Quiet on purpose: skipped entirely (never even attempted) whenever something more deliberate
// already has the user's attention, so this never competes with something the user actually did.
function shouldSkip() {
  return getReducedMotion()
    || document.hidden
    || cardOpen
    || storyPlaying
    || activeShootingStarCount() > 0;
}

function tick() {
  schedule(); // always line up the next attempt, whether or not this one fires
  if (shouldSkip()) return;

  const people = getPeople();
  const year = getPlayheadYear();
  const person = pickAmbientCandidate(people, year, null);
  if (!person) return;
  const moment = pickAmbientMoment(person);
  if (!moment) return;

  launchShootingStar(person.id);
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => showCaption(person, moment), SHOOTING_STAR_TOTAL_MS);
}

function showCaption(person, moment) {
  if (!captionEl || shouldSkip()) return; // the moment passed (a card opened, the tab hid, ...)
  const text = captionText(person, moment);
  captionEl.textContent = '';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ambient-caption__text';
  button.textContent = text;
  button.addEventListener('click', () => {
    hideCaption();
    setSelectedPersonId(person.id);
    emit('starSelected', { personId: person.id });
  });
  captionEl.appendChild(button);
  captionEl.hidden = false;
  void captionEl.offsetWidth;
  captionEl.classList.add('is-open');
  announce(text, { delay: 400 });
  clearTimeout(hideTimer);
  hideTimer = setTimeout(hideCaption, AMBIENT_CAPTION_MS);
}

function hideCaption() {
  if (!captionEl || captionEl.hidden) return;
  captionEl.classList.remove('is-open');
  const ms = parseFloat(getComputedStyle(captionEl).transitionDuration) * 1000 || 0;
  setTimeout(() => { captionEl.hidden = true; captionEl.textContent = ''; }, ms + 20);
}

export function initAmbientDiscovery(mountEl) {
  captionEl = mountEl;
  if (!captionEl) return;

  on('profileCardOpened', () => { cardOpen = true; hideCaption(); });
  on('profileCardClosed', () => { cardOpen = false; });
  on('storyPlaybackChanged', ({ detail }) => { storyPlaying = detail.playing; if (storyPlaying) hideCaption(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) hideCaption(); });

  on('dataReady', () => schedule());
}
