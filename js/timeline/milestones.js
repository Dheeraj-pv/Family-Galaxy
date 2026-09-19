// Milestone constellation (added on request): as the timeline plays or is scrubbed, anyone turning
// a round-number age this year, or any dated event reaching a round-number anniversary, is quietly
// singled out on the map — the significant years stand out while journeying through the family's
// history, not just what's coming up in real life (compare greeting/anniversaries.js, which does a
// similar thing but off today's real-world date rather than the playhead year). Pure: no DOM,
// canvas or clock — `year` is passed in — so tests/test-milestones.html can check it directly.

import { isPersonPresent } from './timelineFilter.js';

export const MILESTONE_AGE_STEP = 10; // every 10th birthday: 10, 20, 30, ...
export const MILESTONE_EVENT_STEP = 5; // every 5th anniversary of a dated event

// "1st"/"2nd"/"3rd"/"4th"... (11th/12th/13th stay "th", the usual English exception).
function ordinal(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

// { age, label: "60th" } if `person` turns a milestone age exactly in `year` and is actually
// present that year (so it never marks someone before they're born or after they've passed),
// else null.
export function milestoneForPerson(person, year) {
  if (person.birth == null) return null;
  const age = year - person.birth;
  if (age <= 0 || age % MILESTONE_AGE_STEP !== 0) return null;
  if (!isPersonPresent(person, year)) return null;
  return { age, label: ordinal(age) };
}

// { years, label: "25th" } if `event.year` reaches a milestone anniversary in `year`, else null.
export function milestoneForEvent(event, year) {
  if (event.year == null) return null;
  const years = year - event.year;
  if (years <= 0 || years % MILESTONE_EVENT_STEP !== 0) return null;
  return { years, label: ordinal(years) };
}

// Every milestone landing in `year`: [{ personId, kind: 'birthday'|'event', label, detail }].
// `personId` is null for an event with no person attached; `detail` is the ready-to-show phrase.
// An "X born" event that just records someone's birth is skipped once they have a person record
// with the same birth year — otherwise a person turning 60 sees both "60th birthday" AND "60th
// anniversary of X born" for the exact same milestone (found live: family.json's own "Mom born"
// event does exactly this for Mom's birthday — compare greeting/anniversaries.js, which drops the
// same kind of duplicate for the same reason).
export function milestonesInYear(people, events, year) {
  const items = [];
  const birthYearOf = new Map(people.map((p) => [p.id, p.birth]));
  people.forEach((person) => {
    const m = milestoneForPerson(person, year);
    if (m) items.push({ personId: person.id, kind: 'birthday', label: m.label, detail: `${m.label} birthday` });
  });
  events.forEach((event) => {
    if (event.personId && event.year === birthYearOf.get(event.personId)) return;
    const m = milestoneForEvent(event, year);
    if (m) items.push({ personId: event.personId ?? null, kind: 'event', label: m.label, detail: `${m.label} anniversary of ${event.label}` });
  });
  return items;
}
