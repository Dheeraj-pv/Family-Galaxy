// The timeline ribbon (CLAUDE.md feature #4): a fixed strip along the bottom whose gold playhead
// is a global lens — moving it emits `playheadChanged`, and the star map fades people in/out.
// This module owns only the UI: the axis, decade ticks, event markers, scrubbing, and (on
// touch) pinch-zoom / two-finger pan of the time axis. Who is "present" in a year lives in
// timelineFilter.js. The Play button ("story mode") lets the playhead glide through the years on
// its own; the schedule lives in storyMode.js and any manual touch of the timeline stops it.

import { getPeople, getEvents, getPlayheadYear, setPlayheadYear, getReducedMotion } from '../state.js';
import { on, emit } from '../utils/events.js';
import { clamp } from '../utils/math.js';
import { getTimelineRange, isPersonPresent } from './timelineFilter.js';
import { announce } from '../a11y/announcer.js';
import { buildStoryPlan, storyStateAt, eventLabelsForYear } from './storyMode.js';
import { openAddEvent } from './addEvent.js';
import { deleteEvent } from './eventActions.js';
import { openMomentMenu, closeMomentMenu } from './momentMenu.js';
import { isEditableEvent, markerAriaLabel, eventCaption } from './eventModel.js';

const AXIS_PADDING_PX = 20; // keeps the first/last tick and label from touching the edge
const MAX_ZOOM = 8;
const MIN_PX_PER_DECADE_FOR_EVERY_LABEL = 44;
const KEY_STEP_YEARS = 1;
const KEY_STEP_LARGE_YEARS = 10;

let yearEl = null;
let captionEl = null;
let viewportEl = null;
let axisEl = null;
let playheadEl = null;
let playButtonEl = null;
let addButtonEl = null;

let range = { min: 0, max: 0 };
let events = [];
let year = new Date().getFullYear();
let zoom = 1;
let panX = 0; // px the axis is shifted left; 0 = left edge aligned
let committedYear = null;
let commitScheduled = false;

// Story mode: `story` is null when idle, else { plan, startTime, lastStopYear, frame }.
let story = null;
const ADD_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>';
const PLAY_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function initTimelineRibbon(containerEl) {
  containerEl.textContent = '';

  const root = el('div', 'timeline'); // landmark + name come from <section id="timeline-container">

  const readout = el('div', 'timeline__readout');
  const yearRow = el('div', 'timeline__year-row');
  yearEl = el('div', 'timeline__year');
  yearEl.setAttribute('aria-hidden', 'true');
  playButtonEl = el('button', 'timeline__play');
  playButtonEl.type = 'button';
  playButtonEl.addEventListener('click', () => (story ? stopStory('paused') : startStory()));
  renderPlayButton();
  addButtonEl = el('button', 'timeline__add');
  addButtonEl.type = 'button';
  addButtonEl.innerHTML = ADD_ICON;
  addButtonEl.setAttribute('aria-label', 'Add a moment to the timeline');
  addButtonEl.title = 'Add a moment';
  addButtonEl.addEventListener('click', () => { stopStory(); closeMomentMenu(); openAddEvent({ year }); });
  // The button is icon-only (the strip is tight), so its name shows in the caption like a marker's.
  const showAddCaption = () => { captionEl.textContent = 'Add a moment'; };
  const clearAddCaption = () => { if (captionEl.textContent === 'Add a moment') captionEl.textContent = ''; };
  addButtonEl.addEventListener('pointerenter', showAddCaption);
  addButtonEl.addEventListener('pointerleave', clearAddCaption);
  addButtonEl.addEventListener('focus', showAddCaption);
  addButtonEl.addEventListener('blur', clearAddCaption);
  yearRow.append(yearEl, playButtonEl, addButtonEl);
  captionEl = el('div', 'timeline__caption small-caps');
  captionEl.setAttribute('aria-hidden', 'true');
  readout.append(yearRow, captionEl);

  viewportEl = el('div', 'timeline__viewport');
  axisEl = el('div', 'timeline__axis');

  playheadEl = el('div', 'timeline__playhead');
  playheadEl.setAttribute('role', 'slider');
  playheadEl.setAttribute('aria-label', 'Year shown on the star map');
  playheadEl.tabIndex = 0;
  playheadEl.append(el('span', 'timeline__grip'));

  viewportEl.appendChild(axisEl);
  viewportEl.appendChild(playheadEl);
  root.append(readout, viewportEl);
  containerEl.appendChild(root);

  attachPointerHandling();
  playheadEl.addEventListener('keydown', onKeydown);
  // Anything the user does to the sky or the timeline takes the wheel back from the story.
  on('starSelected', () => stopStory());
  new ResizeObserver(() => layout()).observe(viewportEl);

  // Moments the user adds, edits or removes: re-read the events and redraw the markers.
  on('eventAdded', refreshEvents);
  on('eventEdited', refreshEvents);
  on('eventDeleted', refreshEvents);

  on('dataReady', () => {
    events = getEvents();
    range = getTimelineRange(getPeople(), events);
    year = clamp(getPlayheadYear(), range.min, range.max);
    committedYear = year;
    zoom = 1;
    panX = 0;
    playheadEl.setAttribute('aria-valuemin', String(range.min));
    playheadEl.setAttribute('aria-valuemax', String(range.max));
    layout();
  });
}

// ---- geometry ----------------------------------------------------------------------------

function viewportWidth() {
  return viewportEl.clientWidth;
}
function axisWidth() {
  return viewportWidth() * zoom;
}
function span() {
  return Math.max(1, range.max - range.min);
}
function xForYear(y) {
  return AXIS_PADDING_PX + ((y - range.min) / span()) * (axisWidth() - 2 * AXIS_PADDING_PX);
}
function yearForAxisX(x) {
  const fraction = (x - AXIS_PADDING_PX) / (axisWidth() - 2 * AXIS_PADDING_PX);
  return clamp(Math.round(range.min + fraction * span()), range.min, range.max);
}
function clampPan(value) {
  return clamp(value, 0, Math.max(0, axisWidth() - viewportWidth()));
}

// ---- rendering ---------------------------------------------------------------------------

function layout() {
  if (!axisEl || range.max === 0 || viewportWidth() === 0) return;
  panX = clampPan(panX);
  axisEl.style.width = `${axisWidth()}px`;
  axisEl.style.transform = `translateX(${-panX}px)`;
  playheadEl.style.width = `${axisWidth()}px`; // same coordinate space as the axis
  playheadEl.style.transform = `translateX(${-panX}px)`;
  renderAxis();
  updatePlayhead();
}

function renderAxis() {
  axisEl.textContent = '';
  axisEl.appendChild(el('div', 'timeline__line'));

  const pxPerDecade = (axisWidth() - 2 * AXIS_PADDING_PX) / (span() / 10);
  const labelEvery = pxPerDecade < MIN_PX_PER_DECADE_FOR_EVERY_LABEL ? 2 : 1;
  const firstDecade = Math.ceil(range.min / 10) * 10;
  for (let y = firstDecade, i = 0; y <= range.max; y += 10, i += 1) {
    const tick = el('div', 'timeline__tick');
    tick.style.left = `${xForYear(y)}px`;
    if (i % labelEvery === 0) tick.appendChild(el('span', 'timeline__tick-label small-caps', String(y)));
    axisEl.appendChild(tick);
  }

  const people = getPeople();
  events.forEach((event) => {
    const marker = el('button', 'timeline__event');
    const mine = isEditableEvent(event); // only moments the user added can be edited or removed
    marker.type = 'button';
    marker.dataset.color = event.color;
    if (mine) { marker.dataset.eventId = event.id; marker.classList.add('timeline__event--mine'); }
    marker.style.left = `${xForYear(event.year)}px`;
    marker.setAttribute('aria-label', markerAriaLabel(event, people));
    marker.appendChild(el('span', 'timeline__event-dot'));
    const showCaption = () => { captionEl.textContent = eventCaption(event); };
    const clearCaption = () => { captionEl.textContent = ''; };
    marker.addEventListener('pointerenter', showCaption);
    marker.addEventListener('pointerleave', clearCaption);
    marker.addEventListener('focus', showCaption);
    marker.addEventListener('blur', clearCaption);
    marker.addEventListener('click', () => {
      stopStory();
      requestYear(event.year);
      if (!mine) { closeMomentMenu(); return; }
      openMomentMenu({
        event,
        anchorEl: marker,
        who: event.personId ? people.find((p) => p.id === event.personId)?.name ?? null : null,
        onEdit: (ev) => openAddEvent({ year: ev.year, editing: ev }),
        onDelete: (ev) => {
          deleteEvent(ev.id);
          announce(`Moment removed: ${ev.year}, ${ev.label}.`, { delay: 300 });
          addButtonEl?.focus(); // the marker is gone; the add button is the natural next stop
        },
      });
    });
    axisEl.appendChild(marker);
  });
}

// Re-reads events after one was added / edited / removed: refreshes the range (a moment can
// reach beyond the old first decade or today), redraws the axis, and keeps the playhead valid.
function refreshEvents() {
  if (!axisEl) return;
  const focusedId = document.activeElement?.dataset?.eventId ?? null;
  events = getEvents();
  range = getTimelineRange(getPeople(), events);
  playheadEl.setAttribute('aria-valuemin', String(range.min));
  playheadEl.setAttribute('aria-valuemax', String(range.max));
  layout();
  const clamped = clamp(year, range.min, range.max);
  if (clamped !== year) requestYear(clamped);
  if (focusedId) axisEl.querySelector(`[data-event-id="${focusedId}"]`)?.focus();
}

// `displayYear` (default: the committed whole `year`) lets story mode glide the playhead's pixel
// position smoothly between whole years without touching the committed year itself — everything
// that only makes sense per whole year (the big number, aria state, event lookups) still rounds.
function updatePlayhead(displayYear = year) {
  const shown = Math.round(displayYear);
  yearEl.textContent = String(shown);
  playheadEl.style.setProperty('--x', `${xForYear(displayYear)}px`);
  playheadEl.setAttribute('aria-valuenow', String(shown));
  const here = events.filter((e) => e.year === shown).map((e) => e.label);
  playheadEl.setAttribute('aria-valuetext', here.length ? `${shown}: ${here.join(', ')}` : String(shown));
}

function keepPlayheadVisible() {
  const x = xForYear(year);
  if (x < panX + AXIS_PADDING_PX || x > panX + viewportWidth() - AXIS_PADDING_PX) {
    panX = clampPan(x - viewportWidth() / 2);
    layout();
  }
}

// ---- year changes ------------------------------------------------------------------------

// The UI follows immediately; state + the bus event are throttled to once per frame and only
// fire when the integer year actually changed.
function requestYear(nextYear) {
  const clamped = clamp(Math.round(nextYear), range.min, range.max);
  if (clamped === year) return;
  year = clamped;
  updatePlayhead();
  if (commitScheduled) return;
  commitScheduled = true;
  requestAnimationFrame(commit);
}

function commit() {
  commitScheduled = false;
  if (year === committedYear) return;
  committedYear = year;
  setPlayheadYear(year);
  emit('playheadChanged', { year });
  // Debounced: scrubbing produces one calm summary once the playhead settles, not chatter.
  const people = getPeople();
  const present = people.filter((p) => isPersonPresent(p, year)).length;
  announce(`${year}: ${present} of ${people.length} family members in the sky.`, { delay: 800 });
}

function onKeydown(e) {
  const large = e.shiftKey ? KEY_STEP_LARGE_YEARS : KEY_STEP_YEARS;
  const target = {
    ArrowLeft: year - large, ArrowDown: year - large,
    ArrowRight: year + large, ArrowUp: year + large,
    PageDown: year - KEY_STEP_LARGE_YEARS, PageUp: year + KEY_STEP_LARGE_YEARS,
    Home: range.min, End: range.max,
  }[e.key];
  if (target === undefined) return;
  e.preventDefault();
  stopStory();
  requestYear(target);
  keepPlayheadVisible();
}

// ---- pointer: scrub (one pointer), pinch-zoom + pan (two pointers), wheel ----------------

function attachPointerHandling() {
  const pointers = new Map(); // pointerId -> {x}
  let scrubbing = false;
  let pinch = null; // { startDistance, startZoom, focalYear }

  const pointerAxisX = (clientX) => clientX - viewportEl.getBoundingClientRect().left + panX;

  viewportEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.timeline__event')) return; // markers handle their own click
    stopStory();
    pointers.set(e.pointerId, { x: e.clientX });
    try { viewportEl.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointers can throw; scrubbing still works */ }

    if (pointers.size === 1) {
      scrubbing = true;
      requestYear(yearForAxisX(pointerAxisX(e.clientX)));
    } else if (pointers.size === 2) {
      scrubbing = false;
      const [a, b] = [...pointers.values()];
      const midpoint = (a.x + b.x) / 2;
      pinch = {
        startDistance: Math.max(1, Math.abs(a.x - b.x)),
        startZoom: zoom,
        focalYear: yearForAxisX(pointerAxisX(midpoint)),
        lastMidpoint: midpoint,
      };
    }
  });

  viewportEl.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX });
    if (scrubbing && pointers.size === 1) {
      requestYear(yearForAxisX(pointerAxisX(e.clientX)));
    } else if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const midpoint = (a.x + b.x) / 2;
      const distance = Math.max(1, Math.abs(a.x - b.x));
      zoom = clamp(pinch.startZoom * (distance / pinch.startDistance), 1, MAX_ZOOM);
      // Keep the year that was under the fingers' midpoint under them as the axis stretches.
      const left = viewportEl.getBoundingClientRect().left;
      panX = clampPan(xForYear(pinch.focalYear) - (midpoint - left));
      layout();
    }
  });

  const release = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) scrubbing = false;
  };
  viewportEl.addEventListener('pointerup', release);
  viewportEl.addEventListener('pointercancel', release);

  // Trackpad/mouse: ctrl+wheel zooms about the cursor, horizontal wheel pans.
  viewportEl.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const left = viewportEl.getBoundingClientRect().left;
      const focalYear = yearForAxisX(pointerAxisX(e.clientX));
      zoom = clamp(zoom * Math.exp(-e.deltaY * 0.01), 1, MAX_ZOOM);
      panX = clampPan(xForYear(focalYear) - (e.clientX - left));
      layout();
    } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && zoom > 1) {
      e.preventDefault();
      panX = clampPan(panX + e.deltaX);
      layout();
    }
  }, { passive: false });
}

// ---- story mode ---------------------------------------------------------------------------
// The playhead glides through the years, resting on each event so its caption can be read.
// Playing from the end (or from a year with nothing left to visit) starts again from the
// beginning. Under reduced motion it hops between events instead of gliding.

function renderPlayButton() {
  const playing = story !== null;
  playButtonEl.innerHTML = playing ? PAUSE_ICON : PLAY_ICON;
  playButtonEl.setAttribute('aria-label', playing ? 'Pause the family story' : 'Play the family story');
  playButtonEl.title = playing ? 'Pause the story' : 'Watch the family story';
}

function startStory() {
  if (range.max === 0) return;
  const startYear = year >= range.max ? range.min : year;
  const plan = buildStoryPlan({
    startYear,
    endYear: range.max,
    eventYears: events.map((e) => e.year),
    jump: getReducedMotion(),
  });
  story = { plan, startTime: performance.now(), lastStopYear: null, frame: null };
  if (!getReducedMotion()) requestYear(startYear); // gliding starts from the start year itself
  renderPlayButton();
  announce(`Playing the family story from ${startYear}.`, { delay: 300 });
  emit('storyPlaybackChanged', { playing: true }); // lets other ambient features (e.g. ambientDiscovery.js) stand down while the story drives the sky
  story.frame = requestAnimationFrame(tickStory);
}

function tickStory(now) {
  if (!story) return;
  const state = storyStateAt(story.plan, now - story.startTime);
  if (state.year !== null) {
    requestYear(state.year); // commits + emits playheadChanged only when the whole year changes
    updatePlayhead(state.year); // repaints every frame at the fractional position for a smooth glide
    keepPlayheadVisible();
  }
  if (state.resting && state.year !== story.lastStopYear) {
    story.lastStopYear = state.year;
    const labels = eventLabelsForYear(events, state.year);
    captionEl.textContent = labels.length ? `${state.year} \u00b7 ${labels.join(', ')}` : '';
    if (labels.length) announce(`${state.year}: ${labels.join(', ')}.`, { delay: 1000 });
  } else if (!state.resting && story.lastStopYear !== null) {
    story.lastStopYear = null;
    captionEl.textContent = '';
  }
  if (state.done) {
    stopStory('finished');
    return;
  }
  story.frame = requestAnimationFrame(tickStory);
}

// `reason` is 'paused' (Play button) or 'finished'; omitted when the user simply took over.
function stopStory(reason) {
  if (!story) return;
  cancelAnimationFrame(story.frame);
  story = null;
  captionEl.textContent = '';
  renderPlayButton();
  emit('storyPlaybackChanged', { playing: false });
  if (reason === 'finished') announce(`The story reaches ${year}.`, { delay: 1000 });
  else if (reason === 'paused') announce(`Story paused at ${year}.`, { delay: 300 });
}
