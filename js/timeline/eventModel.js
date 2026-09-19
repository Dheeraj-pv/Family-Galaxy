// Pure helpers for user-added timeline events ("moments") — no DOM, so they can be unit-tested
// standalone (tests/test-events.html). An event is { id, year, month, day, personId, label, color }:
// `id` exists only on events the user added (kept in localStorage), `month`/`day` are optional
// (both or neither; anniversary greetings read them), `personId` is optional (null = everyone),
// `color` is 'maternal' | 'paternal' | 'shared'.

export const LABEL_MAX_LENGTH = 40;
export const MIN_EVENT_YEAR = 1800;

// The three marker colours as warm, plain-language choices.
export const EVENT_COLORS = [
  { value: 'maternal', label: "Mom's side" },
  { value: 'paternal', label: "Dad's side" },
  { value: 'shared', label: 'Whole family' },
];

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// A moment can sit up to a year ahead (an expected arrival, a planned wedding) but no further.
export function maxEventYear(currentYear = new Date().getFullYear()) {
  return currentYear + 1;
}

// True when month/day name a real date in `year` (so 29 Feb only exists in leap years).
export function isRealDate(year, month, day) {
  const date = new Date(Date.UTC(2000, month - 1, day));
  date.setUTCFullYear(year);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function toInt(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? value : NaN;
  const text = String(value ?? '').trim();
  return /^-?\d+$/.test(text) ? Number(text) : NaN;
}

// Validates the form. Returns { ok: true, event } (no id yet) or { ok: false, errors: { field: msg } }.
// Error keys: year | label | color | personId | date.
export function validateEventInput({ year, label, color, personId, month, day }, knownPersonIds, currentYear = new Date().getFullYear()) {
  const errors = {};

  const cleanYear = toInt(year);
  const maxYear = maxEventYear(currentYear);
  if (Number.isNaN(cleanYear)) errors.year = 'Enter a year, like 1998.';
  else if (cleanYear < MIN_EVENT_YEAR || cleanYear > maxYear) errors.year = `Choose a year between ${MIN_EVENT_YEAR} and ${maxYear}.`;

  const cleanLabel = (label ?? '').trim();
  if (!cleanLabel) errors.label = 'Say what happened, in a few words.';
  else if (cleanLabel.length > LABEL_MAX_LENGTH) errors.label = `Keep it under ${LABEL_MAX_LENGTH} characters.`;

  if (!EVENT_COLORS.some((c) => c.value === color)) errors.color = 'Choose whose moment this is.';

  const cleanPerson = personId ? personId : null;
  if (cleanPerson && !knownPersonIds.includes(cleanPerson)) errors.personId = 'Choose someone from the family, or everyone.';

  const monthBlank = month === '' || month == null;
  const dayBlank = day === '' || day == null;
  let cleanMonth = null;
  let cleanDay = null;
  if (monthBlank !== dayBlank) {
    errors.date = 'Add both a month and a day, or leave both empty.';
  } else if (!monthBlank) {
    cleanMonth = toInt(month);
    cleanDay = toInt(day);
    const yearOk = !Number.isNaN(cleanYear);
    if (Number.isNaN(cleanMonth) || cleanMonth < 1 || cleanMonth > 12 || Number.isNaN(cleanDay) || cleanDay < 1 || cleanDay > 31) {
      errors.date = 'Use a real month and a day from 1 to 31.';
    } else if (yearOk && !isRealDate(cleanYear, cleanMonth, cleanDay)) {
      errors.date = `${MONTH_NAMES[cleanMonth - 1]} ${cleanDay} doesn't exist in ${cleanYear}.`;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    event: { year: cleanYear, month: cleanMonth, day: cleanDay, personId: cleanPerson, label: cleanLabel, color },
  };
}

// --- ids, editing, deleting ---
// Only events the user added carry an `id`, and only those can be edited or removed. Events
// authored in family.json are the family's own data: read-only in the app.
export function isEditableEvent(event) {
  return typeof event?.id === 'string' && event.id.length > 0;
}

export function newEventId() {
  return `ev_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function withEventReplaced(list, id, replacement) {
  return list.map((e) => (id && e.id === id ? replacement : e));
}

export function withEventRemoved(list, id) {
  return list.filter((e) => !id || e.id !== id);
}

// --- wording ---
// "1998" or "14 June 1998" when the event carries a month and day.
export function formatEventWhen(event) {
  if (event.month != null && event.day != null && MONTH_NAMES[event.month - 1]) {
    return `${event.day} ${MONTH_NAMES[event.month - 1]} ${event.year}`;
  }
  return String(event.year);
}

function personName(event, people) {
  return event.personId ? people.find((p) => p.id === event.personId)?.name ?? null : null;
}

// Short caption shown under the year while a marker is hovered or focused.
export function eventCaption(event) {
  return `${event.year} · ${event.label}`;
}

// Screen-reader name for a marker button: "1998: Moved to Chennai (Mom). Move the timeline to this year."
export function markerAriaLabel(event, people = []) {
  const who = personName(event, people);
  const base = `${event.year}: ${event.label}${who ? ` (${who})` : ''}. Move the timeline to this year.`;
  return isEditableEvent(event) ? `${base} Opens options to edit or remove this moment.` : base;
}
