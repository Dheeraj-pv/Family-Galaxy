// "The family at a glance" (CLAUDE.md, family stats card): a small non-modal popover, toggled by
// the header's stats button, that sums the galaxy up for whatever year the timeline is on. The
// numbers come from familyStats.js (pure); this file only builds the DOM and keeps it fresh.
// Non-modal on purpose: the sky behind stays usable, so nothing is made inert. Escape or a click
// outside closes it; Escape gives focus back to the button that opened it.

import { getPeople, getEvents, getPlayheadYear } from '../state.js';
import { on } from '../utils/events.js';
import { familyStats, describeStats } from './familyStats.js';
import { startTour } from '../tour/tour.js';
import { printFamilySheet } from '../print/printSheet.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const REFRESH_EVENTS = [
  'dataReady', 'playheadChanged',
  'postcardAdded', 'postcardEdited', 'postcardDeleted',
  'eventAdded', 'eventDeleted', // from the add-event feature; harmless if it never fires
];
const BUTTON_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
  '<path d="M5 17 12 7l7 6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>' +
  '<circle cx="5" cy="17" r="2.2" fill="currentColor"/><circle cx="12" cy="7" r="2.8" fill="currentColor"/>' +
  '<circle cx="19" cy="13" r="2" fill="currentColor"/></svg>';

let buttonEl = null;
let cardEl = null;
let bodyEl = null;
let isOpen = false;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function initStatsCard(button, card) {
  buttonEl = button;
  cardEl = card;
  if (!buttonEl || !cardEl) return;

  buttonEl.innerHTML = BUTTON_ICON;
  buttonEl.title = 'The family at a glance';
  buttonEl.addEventListener('click', () => (isOpen ? closeStats({ returnFocus: true }) : openStats()));

  cardEl.setAttribute('role', 'dialog');
  cardEl.setAttribute('aria-modal', 'false'); // a popover, not a modal — the sky behind stays live
  cardEl.setAttribute('aria-labelledby', 'stats-card-title');
  cardEl.tabIndex = -1;

  const close = el('button', 'stats-card__close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close family stats');
  close.addEventListener('click', () => closeStats({ returnFocus: true }));
  const title = el('h2', 'stats-card__title', 'The family at a glance');
  title.id = 'stats-card-title';
  bodyEl = el('div', 'stats-card__body');
  cardEl.append(close, title, bodyEl);

  cardEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); closeStats({ returnFocus: true }); }
  });
  // A click anywhere outside the card (and its button) dismisses it, without stealing focus from
  // whatever was clicked — except on the timeline: scrubbing years while the numbers change is the
  // whole point of keeping the card open.
  document.addEventListener('pointerdown', (e) => {
    if (!isOpen || cardEl.contains(e.target) || buttonEl.contains(e.target)) return;
    if (e.target.closest?.('#timeline-container')) return;
    closeStats({ returnFocus: false });
  });
  // Picking a star raises the profile card, which needs the same corner of a small screen.
  on('starSelected', () => { if (isOpen) closeStats({ returnFocus: false }); });
  REFRESH_EVENTS.forEach((name) => on(name, () => { if (isOpen) render(); }));
}

function openStats() {
  isOpen = true;
  render();
  cardEl.hidden = false;
  buttonEl.setAttribute('aria-expanded', 'true');
  // Two frames so the browser paints the hidden->visible change before the transition starts
  // (a timeout backs it up: rAF is throttled in background tabs).
  const show = () => cardEl.classList.add('is-open');
  requestAnimationFrame(() => requestAnimationFrame(show));
  setTimeout(show, 60);
  cardEl.focus({ preventScroll: true });
}

function closeStats({ returnFocus }) {
  if (!isOpen) return;
  isOpen = false;
  cardEl.classList.remove('is-open');
  buttonEl.setAttribute('aria-expanded', 'false');
  const durationMs = parseFloat(getComputedStyle(cardEl).transitionDuration) * 1000 || 0;
  setTimeout(() => { if (!isOpen) cardEl.hidden = true; }, durationMs);
  if (returnFocus) buttonEl.focus();
}

// ---- rendering ----------------------------------------------------------------------------

function render() {
  const year = getPlayheadYear();
  const people = getPeople();
  const stats = familyStats(people, getEvents(), year);

  bodyEl.textContent = '';
  bodyEl.appendChild(generationDots(stats));

  const list = el('dl', 'stats-card__list');
  describeStats(stats).forEach((item) => {
    const row = el('div', `stats-card__item stats-card__item--${item.key}`);
    row.appendChild(el('dt', 'stats-card__label small-caps', item.label));
    const value = el('dd', 'stats-card__value');
    value.appendChild(el('span', 'stats-card__number', item.value));
    if (item.note) value.appendChild(el('span', 'stats-card__note', item.note));
    row.appendChild(value);
    list.appendChild(row);
  });
  bodyEl.appendChild(list);
  bodyEl.appendChild(el('p', 'stats-card__footnote small-caps', `As the timeline stands in ${year}`));
  bodyEl.appendChild(actions());
}

// Two quiet text actions at the foot of the card: replay the first-visit tour, and print a
// family sheet. The card closes first so neither has to work around it.
function actions() {
  const row = el('div', 'stats-card__actions');
  [
    ['Take the tour again', () => startTour()],
    ['Print a family sheet', () => printFamilySheet()],
  ].forEach(([label, run]) => {
    const button = el('button', 'stats-card__action', label);
    button.type = 'button';
    button.addEventListener('click', () => { closeStats({ returnFocus: false }); run(); });
    row.appendChild(button);
  });
  return row;
}

// One tiny row of dots per generation: lit gold for people in the sky that year, a faint ghost for
// those who aren't (the same 0.15 ghost the star map uses). Decorative — the counts are all in the
// list below, so it is hidden from screen readers.
function generationDots(stats) {
  const DOT_R = 3.2;
  const STEP = 10;
  const ROW_H = 11;
  const maxCols = Math.max(1, ...stats.generations.rows.map((r) => r.total));
  const width = (maxCols - 1) * STEP + DOT_R * 2;
  const height = (stats.generations.rows.length - 1) * ROW_H + DOT_R * 2;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'stats-card__dots');
  svg.setAttribute('viewBox', `0 0 ${width} ${Math.max(height, DOT_R * 2)}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  stats.generations.rows.forEach((row, rowIndex) => {
    const offsetX = (width - ((row.total - 1) * STEP + DOT_R * 2)) / 2; // centre each generation
    for (let i = 0; i < row.total; i += 1) {
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', String(offsetX + DOT_R + i * STEP));
      dot.setAttribute('cy', String(DOT_R + rowIndex * ROW_H));
      dot.setAttribute('r', String(DOT_R));
      dot.setAttribute('class', i < row.present ? 'stats-card__dot is-lit' : 'stats-card__dot');
      svg.appendChild(dot);
    }
  });
  return svg;
}
