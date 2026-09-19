// Single canonical in-memory state object. Deliberately NOT event-driven itself — it's the
// queryable source of truth a module reads from on mount (so it never misses something that
// happened before it existed, e.g. Profile Card mounting after the playhead already moved).
// Modules that change state call the setter here AND emit the matching bus event themselves
// (see utils/events.js) so siblings can react. See CLAUDE.md "Module architecture".

const state = {
  people: [],
  events: [],
  playheadYear: new Date().getFullYear(),
  selectedPersonId: null,
  viewportTransform: { x: 0, y: 0, scale: 1 },
  reducedMotion: false,
};

export function getPeople() {
  return state.people;
}
export function setPeople(people) {
  state.people = people;
}

export function getEvents() {
  return state.events;
}
export function setEvents(events) {
  state.events = events;
}

export function getPlayheadYear() {
  return state.playheadYear;
}
export function setPlayheadYear(year) {
  state.playheadYear = year;
}

export function getSelectedPersonId() {
  return state.selectedPersonId;
}
export function setSelectedPersonId(personId) {
  state.selectedPersonId = personId;
}

export function getViewportTransform() {
  return state.viewportTransform;
}
export function setViewportTransform(transform) {
  state.viewportTransform = transform;
}

export function getReducedMotion() {
  return state.reducedMotion;
}
export function setReducedMotion(reducedMotion) {
  state.reducedMotion = reducedMotion;
}
