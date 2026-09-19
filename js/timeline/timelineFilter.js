// Pure functions deciding who is "present" in the sky at a given year — the timeline is a global
// lens over the star map (CLAUDE.md feature #4). No DOM/canvas/state, so it is unit-tested
// standalone (tests/test-timeline-filter.html).

// Timeline scrub fade goes opacity 0.15 -> 1.0 (CLAUDE.md motion table), so an absent person
// is dimmed to a faint ghost rather than removed: the family stays findable.
export const FADED_OPACITY = 0.15;
export const PRESENT_OPACITY = 1;
export const TIMELINE_FADE_MS = 300;

// Present from their birth year through their death year, inclusive. A missing birth means we
// don't know, so we never hide them (better a star that's always there than one that vanishes
// by mistake); a missing death means still living.
export function isPersonPresent(person, year) {
  if (person.birth != null && year < person.birth) return false;
  if (person.death != null && year > person.death) return false;
  return true;
}

// Why someone is absent at `year`: 'unborn' | 'passed' | null (present). Used for screen-reader
// text so a fading star isn't just silently harder to find.
export function absenceReason(person, year) {
  if (person.birth != null && year < person.birth) return 'unborn';
  if (person.death != null && year > person.death) return 'passed';
  return null;
}

export function personOpacityForYear(person, year) {
  return isPersonPresent(person, year) ? PRESENT_OPACITY : FADED_OPACITY;
}

// The span the ribbon covers: from the decade of the earliest birth/event up to `currentYear`
// (never earlier than any known event, never later than today). Falls back to a 100-year span
// ending today when there is no dated data at all.
export function getTimelineRange(people, events, currentYear = new Date().getFullYear()) {
  const years = [
    ...people.map((p) => p.birth),
    ...events.map((e) => e.year),
  ].filter((y) => Number.isFinite(y));
  if (years.length === 0) return { min: currentYear - 100, max: currentYear };
  const earliest = Math.min(...years);
  const latest = Math.max(currentYear, ...years);
  return { min: Math.floor(earliest / 10) * 10, max: latest };
}
