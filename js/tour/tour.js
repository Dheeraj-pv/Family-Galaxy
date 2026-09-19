// The first-visit tour (CLAUDE.md, "First-visit tour"): a handful of small coach-mark cards that
// walk a newcomer round the galaxy, each with a soft gold glow around the thing it is talking
// about. Non-modal on purpose — the sky stays usable underneath, and nothing is dimmed or made
// inert. Shown once (finished or skipped is remembered), replayable from the stats card, or with
// ?tour=1. The script and the layout maths live in tourSteps.js (pure, tested); this file only
// touches the page.

import { on } from '../utils/events.js';
import { announce } from '../a11y/announcer.js';
import { getPrefs, setPref } from '../data/localStorageStore.js';
import {
  TOUR_STEPS, playableSteps, nextIndex, prevIndex, isLastStep, progressLabel, shouldAutoStart, placeCoach,
} from './tourSteps.js';

const SEEN_PREF = 'tourSeen';
const SETTLE_MS = 900; // after dataReady: let the map reveal and the greeting pill fade in first
const RING_PADDING = 6;
const FADE_MS = 300; // the timeline-fade token's value; reduced motion collapses it in css/a11y.css
const REPOSITION_AFTER_CARD_MS = 520; // the profile card's entrance (450ms) settles before we re-measure

let steps = [];
let index = 0;
let cardEl = null;
let ringEl = null;
let parts = null; // { counter, title, body, hand, dots, skip, back, next }
let previousFocus = null;
let resizeObserver = null;
let unsubscribers = [];
let shellObserver = null;
let autoStartArmed = false;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function isVisible(node) {
  return !!node && node.getClientRects().length > 0;
}

function hasVisibleAnchor(selector) {
  return isVisible(document.querySelector(selector));
}

function rectOf(node) {
  const r = node.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

// ---- starting -----------------------------------------------------------------------------

export function initTour() {
  if (autoStartArmed) return;
  autoStartArmed = true;
  on('dataReady', () => {
    let forced = false;
    let seen = false;
    try { forced = new URLSearchParams(window.location.search).get('tour') === '1'; } catch (err) { /* no URL access */ }
    try { seen = getPrefs()[SEEN_PREF] === true; } catch (err) { /* storage unavailable: offer it, it just may repeat */ }
    if (!shouldAutoStart({ seen, forced })) return;
    setTimeout(() => whenSkyIsClear(() => { if (!cardEl) startTour(); }), SETTLE_MS);
  });
}

// Don't talk over an open profile card or modal: wait for the card to close, skip for a modal.
function whenSkyIsClear(begin) {
  if (document.getElementById('app-shell')?.inert) return; // a modal is open: leave the tour for another visit
  if (document.querySelector('#profile-card.is-open')) {
    const stop = on('profileCardClosed', () => { stop(); setTimeout(begin, SETTLE_MS / 2); });
    return;
  }
  begin();
}

export function startTour() {
  endTour({ remember: false, quiet: true }); // a replay restarts cleanly
  steps = playableSteps(TOUR_STEPS, hasVisibleAnchor);
  if (steps.length === 0) return;
  index = 0;
  previousFocus = document.activeElement;
  buildCard();
  listen();
  showStep({ focus: true, first: true });
}

// ---- the card ------------------------------------------------------------------------------

function buildCard() {
  ringEl = el('div', 'tour-ring');
  ringEl.setAttribute('aria-hidden', 'true');

  cardEl = el('div', 'tour-card');
  cardEl.setAttribute('role', 'dialog');
  cardEl.setAttribute('aria-modal', 'false'); // a guide, not a gate: the sky behind stays live
  cardEl.tabIndex = -1;

  const counter = el('p', 'tour-card__counter small-caps');
  const title = el('h2', 'tour-card__title');
  title.id = 'tour-card-title';
  const body = el('p', 'tour-card__body');
  body.id = 'tour-card-body';
  const hand = el('p', 'tour-card__hand');
  hand.setAttribute('aria-hidden', 'true'); // a flourish; the same words are not needed to follow the tour
  const dots = el('div', 'tour-card__dots');
  dots.setAttribute('aria-hidden', 'true');

  const footer = el('div', 'tour-card__footer');
  const skip = el('button', 'tour-card__skip', 'Skip');
  skip.type = 'button';
  const back = el('button', 'tour-card__back', 'Back');
  back.type = 'button';
  const next = el('button', 'cta-button tour-card__next', 'Next');
  next.type = 'button';
  footer.append(skip, back, next);

  cardEl.setAttribute('aria-labelledby', title.id);
  cardEl.setAttribute('aria-describedby', body.id);
  cardEl.append(counter, title, body, hand, dots, footer);
  parts = { counter, title, body, hand, dots, skip, back, next };

  skip.addEventListener('click', () => endTour({ remember: true }));
  back.addEventListener('click', () => go(prevIndex(index, steps.length)));
  next.addEventListener('click', () => {
    if (isLastStep(index, steps.length)) endTour({ remember: true, finished: true });
    else go(nextIndex(index, steps.length));
  });
  // Escape while focus is in the card skips the tour; elsewhere Escape keeps its usual jobs
  // (closing the profile card, a search list…) and the tour carries on.
  cardEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    endTour({ remember: true });
  });

  // First in the tab order after the skip link: focus lands on the card and Tab reaches its
  // buttons straight away (the card is fixed-position, so where it sits in the DOM is invisible).
  document.body.prepend(ringEl, cardEl);
}

function go(nextStepIndex) {
  index = nextStepIndex;
  showStep({ focus: false });
}

// Fills the card for the current step and puts card + ring where they belong.
function showStep({ focus, first = false, announceDelayMs = 0 }) {
  const step = steps[index];
  parts.counter.textContent = progressLabel(index, steps.length);
  parts.title.textContent = step.title;
  parts.body.textContent = step.body;
  parts.hand.textContent = step.hand ?? '';
  parts.hand.hidden = !step.hand;
  parts.back.hidden = index === 0;
  parts.next.textContent = isLastStep(index, steps.length) ? 'Done' : 'Next';
  parts.skip.hidden = isLastStep(index, steps.length);
  parts.dots.textContent = '';
  steps.forEach((_, i) => parts.dots.appendChild(el('span', i === index ? 'tour-card__dot is-current' : 'tour-card__dot')));

  reposition();
  if (first) {
    // Two frames so the browser paints the hidden state before the fade, with a timeout as a
    // backstop (rAF is throttled in background tabs).
    const show = () => { cardEl?.classList.add('is-open'); };
    requestAnimationFrame(() => requestAnimationFrame(show));
    setTimeout(show, 60);
  }
  if (focus) cardEl.focus({ preventScroll: true });

  const spoken = `${progressLabel(index, steps.length)}. ${step.title}. ${step.body}`;
  if (announceDelayMs > 0) setTimeout(() => { if (cardEl) announce(spoken, { delay: 300 }); }, announceDelayMs);
  else announce(spoken, { delay: first ? 600 : 300 });
}

// ---- placement on the page -----------------------------------------------------------------

function reposition() {
  if (!cardEl) return;
  const step = steps[index];
  const anchorEl = step.selector ? document.querySelector(step.selector) : null;
  const anchor = anchorEl && isVisible(anchorEl) ? rectOf(anchorEl) : null;
  const viewport = { width: window.innerWidth, height: window.innerHeight };

  // The card's size depends on its (just updated) text and on the viewport width.
  const card = { width: cardEl.offsetWidth, height: cardEl.offsetHeight };

  const obstacles = [];
  const add = (node) => { if (isVisible(node)) obstacles.push(rectOf(node)); };
  add(document.getElementById('app-header'));
  add(document.getElementById('timeline-container'));
  add(document.querySelector('#anniversary-banner:not([hidden]) .greeting__pill'));
  add(document.querySelector('#profile-card.is-open'));

  const header = document.getElementById('app-header');
  const ribbon = document.getElementById('timeline-container');
  const fieldTop = header ? rectOf(header).top + rectOf(header).height : 0;
  const fieldBottom = ribbon ? rectOf(ribbon).top : viewport.height;
  const field = { left: 0, top: fieldTop, width: viewport.width, height: Math.max(0, fieldBottom - fieldTop) };

  const spot = placeCoach({ anchor, viewport, card, obstacles, field, prefer: step.prefer });
  cardEl.style.left = `${spot.left}px`;
  cardEl.style.top = `${spot.top}px`;
  cardEl.dataset.placement = spot.placement;

  if (anchor && step.ring !== false) {
    ringEl.style.left = `${anchor.left - RING_PADDING}px`;
    ringEl.style.top = `${anchor.top - RING_PADDING}px`;
    ringEl.style.width = `${anchor.width + 2 * RING_PADDING}px`;
    ringEl.style.height = `${anchor.height + 2 * RING_PADDING}px`;
    // Follow the anchor's own roundness (a pill search box, a round Play button), never sharper
    // than a soft 14px.
    const ownRadius = parseFloat(getComputedStyle(anchorEl).borderTopLeftRadius) || 0;
    const radius = Math.min((anchor.height + 2 * RING_PADDING) / 2, Math.max(14, ownRadius + RING_PADDING));
    ringEl.style.borderRadius = `${radius}px`;
    ringEl.classList.add('is-open');
  } else {
    ringEl.classList.remove('is-open');
  }

  // Follow the anchor if it moves or resizes (the ribbon reflows, the header wraps…).
  resizeObserver?.disconnect();
  if (anchorEl && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => reposition());
    resizeObserver.observe(anchorEl);
  }
}

// ---- listening -----------------------------------------------------------------------------

function listen() {
  const onResize = () => reposition();
  window.addEventListener('resize', onResize);
  unsubscribers.push(() => window.removeEventListener('resize', onResize));

  // Picking a star answers the "try clicking one" step; and the profile card that rises then (or
  // leaves) is an obstacle, so the card re-places itself once its entrance has settled.
  unsubscribers.push(on('starSelected', () => {
    if (!cardEl) return;
    if (steps[index].advanceOn === 'starSelected' && !isLastStep(index, steps.length)) {
      index = nextIndex(index, steps.length);
      // The star's own "highlighting…" announcement comes first; ours follows once it is spoken.
      showStep({ focus: false, announceDelayMs: 1500 });
    }
    setTimeout(reposition, REPOSITION_AFTER_CARD_MS);
  }));
  unsubscribers.push(on('profileCardOpened', () => { reposition(); setTimeout(reposition, REPOSITION_AFTER_CARD_MS); }));
  unsubscribers.push(on('profileCardClosed', () => { reposition(); setTimeout(reposition, REPOSITION_AFTER_CARD_MS); }));

  // A modal (add postcard, Then & Now…) makes the app inert: tuck the guide away until it closes.
  const shell = document.getElementById('app-shell');
  if (shell && typeof MutationObserver !== 'undefined') {
    shellObserver = new MutationObserver(() => {
      const paused = shell.inert;
      cardEl?.classList.toggle('is-paused', paused);
      ringEl?.classList.toggle('is-paused', paused);
      if (!paused) reposition();
    });
    shellObserver.observe(shell, { attributes: true, attributeFilter: ['inert'] });
  }
}

// ---- ending ---------------------------------------------------------------------------------

// `remember`: store that the tour has been seen (finished or skipped). `quiet`: no farewell.
function endTour({ remember, finished = false, quiet = false }) {
  if (!cardEl) return;
  if (remember) {
    try { setPref(SEEN_PREF, true); } catch (err) { /* storage unavailable: it may greet them again next time */ }
  }

  const leaving = cardEl;
  const leavingRing = ringEl;
  // Give focus back only if the tour card still has it (the user may have moved on to a star).
  const restoreTo = leaving.contains(document.activeElement) ? previousFocus : null;

  resizeObserver?.disconnect();
  resizeObserver = null;
  shellObserver?.disconnect();
  shellObserver = null;
  unsubscribers.forEach((stop) => stop());
  unsubscribers = [];
  cardEl = null;
  ringEl = null;
  parts = null;

  leaving.classList.remove('is-open');
  leavingRing.classList.remove('is-open');
  const remove = () => { leaving.remove(); leavingRing.remove(); };
  if (quiet) remove();
  else setTimeout(remove, FADE_MS + 20); // a timeout rather than transitionend: it also fires in a throttled tab

  if (restoreTo && restoreTo !== document.body && document.contains(restoreTo)) restoreTo.focus({ preventScroll: true });
  if (finished && !quiet) announce('That’s the tour — enjoy the galaxy.', { delay: 300 });
}
