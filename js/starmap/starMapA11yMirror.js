// Hidden-but-focusable DOM mirror of the canvas-rendered star map, per CLAUDE.md's
// accessibility rule ("stars keyboard-navigable (Tab + Enter)... screen readers get hidden DOM
// mirrors of canvas-rendered content"). Built alongside starMapInput.js (not bolted on later)
// so both the pointer and keyboard paths resolve to the identical `starSelected` event. Real
// <button> elements give Enter/Space for free. The list is ONE Tab stop (roving tabindex): Tab
// enters/leaves it, arrow keys/Home/End move between stars — otherwise a keyboard user would have
// to Tab through every relative just to reach the timeline.

import { getPeople, getEvents, setSelectedPersonId, getPlayheadYear, getViewMode } from '../state.js';
import { computeStarMapLayout } from './orbitMath.js';
import { on, emit } from '../utils/events.js';
import { absenceReason } from '../timeline/timelineFilter.js';
import { milestonesInYear } from '../timeline/milestones.js';
import { setFocusedPersonId } from './starMapRender.js';

let listEl = null;
let mirrorItems = []; // { button, label, personIds } — so the timeline can annotate absent people

export function initStarMapA11yMirror(containerEl) {
  listEl = document.createElement('ul');
  listEl.className = 'visually-hidden';
  listEl.setAttribute('aria-label', 'Family members. Use the arrow keys to move between stars and Enter to open one.');
  listEl.addEventListener('keydown', onListKeydown);
  containerEl.appendChild(listEl);

  on('dataReady', () => renderMirror());
  on('playheadChanged', () => updateAbsenceLabels());
  ['eventAdded', 'eventEdited', 'eventDeleted'].forEach((name) => on(name, () => updateAbsenceLabels()));
  on('viewModeChanged', () => updateAbsenceLabels());
}

function renderMirror() {
  const people = getPeople();
  const byId = new Map(people.map((p) => [p.id, p]));
  const { founderGroups } = computeStarMapLayout(people);
  const founderPersonIds = new Set(founderGroups.flatMap((g) => g.personIds));

  listEl.innerHTML = '';
  mirrorItems = [];

  founderGroups.forEach((group) => {
    const names = group.personIds.map((id) => byId.get(id)?.name).filter(Boolean).join(' & ');
    listEl.appendChild(createItem(names || 'Founders', group.personIds[0], group.personIds));
  });

  people.forEach((person) => {
    if (founderPersonIds.has(person.id)) return;
    listEl.appendChild(createItem(person.name, person.id, [person.id]));
  });
  mirrorItems.forEach(({ button }, i) => { button.tabIndex = i === 0 ? 0 : -1; });
  updateAbsenceLabels();
}

// Roving tabindex: exactly one star button is in the Tab order at a time — the one last focused.
function setRovingStop(activeButton) {
  mirrorItems.forEach(({ button }) => { button.tabIndex = button === activeButton ? 0 : -1; });
}

function onListKeydown(e) {
  const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  const index = mirrorItems.findIndex(({ button }) => button === document.activeElement);
  if (index === -1) return;
  let next;
  if (e.key in keys) next = (index + keys[e.key] + mirrorItems.length) % mirrorItems.length;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = mirrorItems.length - 1;
  else return;
  e.preventDefault();
  mirrorItems[next].button.focus();
}

// When the timeline playhead moves, a star that has faded out of the sky says why: a screen
// reader user scrubbing years hears "Mom, not yet born" instead of nothing changing. Also names
// any milestone constellation ring the star map is drawing that year (see timeline/milestones.js)
// and, while the family map view is showing, each person's region — both otherwise purely visual.
function updateAbsenceLabels() {
  const people = getPeople();
  const byId = new Map(people.map((p) => [p.id, p]));
  const year = getPlayheadYear();
  const mapMode = getViewMode() === 'map';
  const milestonesByPerson = new Map();
  milestonesInYear(people, getEvents(), year).forEach((m) => {
    if (!m.personId) return;
    milestonesByPerson.set(m.personId, [...(milestonesByPerson.get(m.personId) ?? []), m.detail]);
  });
  mirrorItems.forEach(({ button, label, personIds }) => {
    const reasons = personIds.map((id) => absenceReason(byId.get(id), year));
    const allAbsent = reasons.every(Boolean);
    const suffix = !allAbsent ? '' : reasons.every((r) => r === 'unborn') ? ', not yet born' : reasons.every((r) => r === 'passed') ? ', no longer living' : ', not present in this year';
    const milestones = allAbsent ? [] : personIds.flatMap((id) => milestonesByPerson.get(id) ?? []);
    const milestoneSuffix = milestones.length ? `, ${milestones.join(' & ')}` : '';
    const regions = mapMode && !allAbsent ? [...new Set(personIds.map((id) => byId.get(id)?.region).filter(Boolean))] : [];
    const regionSuffix = regions.length ? `, from ${regions.join(' & ')}` : '';
    button.textContent = label + suffix + milestoneSuffix + regionSuffix;
  });
}

function createItem(label, focusPersonId, personIds) {
  const li = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('focus', () => {
    setRovingStop(button);
    setFocusedPersonId(focusPersonId);
  });
  button.addEventListener('blur', () => setFocusedPersonId(null));
  button.addEventListener('click', () => {
    setSelectedPersonId(focusPersonId);
    emit('starSelected', { personId: focusPersonId });
  });
  li.appendChild(button);
  mirrorItems.push({ button, label, personIds });
  return li;
}
