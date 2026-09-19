// Normalizes raw family.json + localStorage records to the full shape other modules can rely
// on, so nothing downstream needs defensive `person.memories || []` checks. See CLAUDE.md
// "Data shape" for the authoritative field list.

export function normalizePerson(raw) {
  return {
    id: raw.id,
    name: raw.name,
    birth: raw.birth ?? null,
    death: raw.death ?? null,
    role: raw.role, // "blood" | "spouse" — required, not defaulted: a missing role is a data bug.
    partnerOf: raw.partnerOf ?? null,
    isFounder: raw.isFounder ?? false,
    photo: raw.photo ?? null,
    parents: raw.parents ?? [],
    generation: raw.generation,
    side: raw.side ?? null,
    bio: raw.bio ?? '',
    memories: raw.memories ?? [],
    postcards: raw.postcards ?? [],
    emoji: raw.emoji ?? null, // avatar fallback when there's no `photo` — see profile card mockup
    familyRole: raw.familyRole ?? '', // display label e.g. "Eldest Uncle" — NOT the blood/spouse `role` above
    color: raw.color ?? null, // explicit spouse-planet hue (hex); blood stars ignore this — see CLAUDE.md
    birthday: raw.birthday ?? null, // optional "MM-DD" (month-day of the birth year in `birth`), for anniversary greetings
    region: raw.region ?? null, // optional short place label ("The Old Farmhouse"), for the family map view — see CLAUDE.md
  };
}

export function normalizeEvent(raw) {
  return {
    id: raw.id ?? null, // only user-added events carry one (ev_...); family.json events are read-only
    year: raw.year,
    month: raw.month ?? null, // optional 1-12 / 1-31, for anniversary greetings; year-only events stay null
    day: raw.day ?? null,
    personId: raw.personId ?? null,
    label: raw.label,
    color: raw.color, // "maternal" | "paternal" | "shared"
  };
}
