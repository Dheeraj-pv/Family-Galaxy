// A quiet greeting pill under the header when a birthday or family anniversary is close
// ("Mom's birthday is in 2 days · turning 60"). The rules for what counts live in
// anniversaries.js; this file owns the pill: fade-in after the data loads, "and N more"
// expansion, dismissing (remembered for the rest of that calendar day), and tapping a name to
// open that star. Nothing here blocks the map: only the pill itself takes pointer events.
//
// Testing aid: add ?today=YYYY-MM-DD to the URL to pretend it is that day.

import { getPeople, getEvents, setSelectedPersonId } from '../state.js';
import { on, emit } from '../utils/events.js';
import { announce } from '../a11y/announcer.js';
import { getPrefs, setPref } from '../data/localStorageStore.js';
import { upcomingCelebrations, parseIsoDate, civilFromDate, toIso, moreLabel } from './anniversaries.js';

const DISMISSED_PREF = 'greetingDismissedOn'; // ISO date the pill was last dismissed

let bannerEl = null;
let todayIso = '';
let items = [];
let listEl = null;
let moreBtn = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function getToday() {
  const forced = parseIsoDate(new URLSearchParams(window.location.search).get('today'));
  return forced ?? civilFromDate(new Date());
}

function wasDismissedToday() {
  try { return getPrefs()[DISMISSED_PREF] === todayIso; } catch (err) { return false; }
}

function rememberDismissed() {
  try { setPref(DISMISSED_PREF, todayIso); } catch (err) { /* storage unavailable: it just comes back next load */ }
}

function selectPerson(personId) {
  setSelectedPersonId(personId);
  emit('starSelected', { personId });
}

// One celebration as a line: the whole sentence is a button when it belongs to someone.
function celebrationLine(item, className) {
  const text = `${item.text}`;
  if (!item.personId) return el('span', className, text);
  const button = el('button', className, text);
  button.type = 'button';
  button.addEventListener('click', () => selectPerson(item.personId));
  return button;
}

function render() {
  bannerEl.textContent = '';
  bannerEl.setAttribute('role', 'region');
  bannerEl.setAttribute('aria-label', 'Family celebrations');

  const [lead, ...rest] = items;
  const pill = el('div', 'greeting__pill');

  const icon = el('span', 'greeting__icon', lead.icon);
  icon.setAttribute('aria-hidden', 'true');
  pill.append(icon, celebrationLine(lead, 'greeting__text'));

  if (rest.length > 0) {
    listEl = el('ul', 'greeting__list');
    listEl.id = 'greeting-list';
    listEl.hidden = true;
    rest.forEach((item) => {
      const li = el('li', 'greeting__item');
      const itemIcon = el('span', 'greeting__icon', item.icon);
      itemIcon.setAttribute('aria-hidden', 'true');
      li.append(itemIcon, celebrationLine(item, 'greeting__text'));
      listEl.appendChild(li);
    });

    moreBtn = el('button', 'greeting__more', moreLabel(rest.length));
    moreBtn.type = 'button';
    moreBtn.setAttribute('aria-expanded', 'false');
    moreBtn.setAttribute('aria-controls', listEl.id);
    moreBtn.addEventListener('click', toggleList);
    pill.appendChild(moreBtn);
  } else {
    listEl = null;
    moreBtn = null;
  }

  const close = el('button', 'greeting__close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Dismiss greeting');
  close.textContent = '×';
  close.addEventListener('click', () => dismiss(close.matches(':focus-visible')));
  pill.appendChild(close);

  bannerEl.appendChild(pill);
  if (listEl) bannerEl.appendChild(listEl);
}

function toggleList() {
  const open = listEl.hidden;
  listEl.hidden = !open;
  moreBtn.setAttribute('aria-expanded', String(open));
}

// Fades the pill out and remembers the dismissal until tomorrow. A keyboard user's focus was
// inside the pill, so it moves somewhere sensible (the search box just above) instead of dropping.
function dismiss(returnFocus) {
  rememberDismissed();
  bannerEl.classList.remove('is-open');
  if (returnFocus) document.getElementById('star-search-input')?.focus();
  const hide = () => { bannerEl.hidden = true; bannerEl.textContent = ''; };
  const style = getComputedStyle(bannerEl);
  const ms = parseFloat(style.transitionDuration) * 1000;
  if (Number.isFinite(ms) && ms > 0) setTimeout(hide, ms + 20); // timeout, not transitionend: also fires when the tab is throttled
  else hide();
}

function show() {
  render();
  bannerEl.hidden = false;
  void bannerEl.offsetWidth; // commit the hidden (opacity 0) state so the fade-in transitions
  bannerEl.classList.add('is-open');

  const [lead, ...rest] = items;
  const more = rest.length > 0 ? `, and ${rest.length} more` : '';
  announce(`${lead.text}${more}.`, { delay: 1500 });
}

export function initAnniversaryBanner(mountEl) {
  bannerEl = mountEl;
  if (!bannerEl) return;

  bannerEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation(); // don't also close the profile card behind it
    dismiss(true);
  });

  on('dataReady', () => {
    const today = getToday();
    todayIso = toIso(today);
    items = upcomingCelebrations(getPeople(), getEvents(), today);
    if (items.length === 0 || wasDismissedToday()) return;
    show();
  });

  // A moment added, edited or removed through the timeline changes what is coming up. Keep the
  // pill in step quietly: refresh it in place when it is already showing, and only announce when
  // it newly appears. A dismissed pill stays dismissed for the day.
  const refresh = () => {
    if (!todayIso || wasDismissedToday()) return;
    items = upcomingCelebrations(getPeople(), getEvents(), parseIsoDate(todayIso));
    const showing = !bannerEl.hidden;
    if (items.length === 0) {
      if (showing) { bannerEl.classList.remove('is-open'); bannerEl.hidden = true; bannerEl.textContent = ''; }
      return;
    }
    if (showing) render();
    else show();
  };
  ['eventAdded', 'eventEdited', 'eventDeleted'].forEach((name) => on(name, refresh));
}
