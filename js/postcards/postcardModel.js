// Pure helpers for postcards — no DOM, so they can be unit-tested standalone
// (tests/test-postcard-flip.html). A postcard is { from, date, photo, note }, where `from` is
// either a person id (as in family.json) or a free-typed name (as added through the form).

export const NOTE_MAX_LENGTH = 200;
export const FROM_MAX_LENGTH = 60;

// "2023-07-14" -> "14 Jul 2023". Parsed by hand and formatted in UTC so a date never slips a
// day because of the viewer's timezone. Returns '' for anything unparseable.
export function formatPostcardDate(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate ?? '');
  if (!match) return '';
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// Newest first; undated postcards sink to the end. Returns a new array.
export function sortPostcards(postcards) {
  return [...postcards].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
}

// `from` may be a person id (resolve to their name) or already a plain name (use as typed).
export function resolveSenderName(from, people) {
  const match = people.find((p) => p.id === from);
  return match ? match.name : (from ?? '').trim() || 'Someone who loves you';
}

// Validates form input. Returns { ok: true, postcard } or { ok: false, errors: { field: message } }.
export function validatePostcardInput({ personId, from, note, date }, knownPersonIds) {
  const errors = {};
  if (!personId || !knownPersonIds.includes(personId)) errors.personId = 'Choose who this postcard is for.';
  const cleanFrom = (from ?? '').trim();
  if (!cleanFrom) errors.from = 'Say who it is from.';
  else if (cleanFrom.length > FROM_MAX_LENGTH) errors.from = `Keep the name under ${FROM_MAX_LENGTH} characters.`;
  const cleanNote = (note ?? '').trim();
  if (!cleanNote) errors.note = 'Write a few words on the back.';
  else if (cleanNote.length > NOTE_MAX_LENGTH) errors.note = `Keep the note under ${NOTE_MAX_LENGTH} characters.`;
  if (date && !formatPostcardDate(date)) errors.date = 'Use a valid date.';

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    postcard: { from: cleanFrom, date: date || null, photo: null, note: cleanNote },
  };
}

// --- editing / deleting ---
// Only postcards the user added (kept in localStorage) carry an `id`, and only those can be
// edited or deleted. Postcards authored in family.json are the family's own data: they stay
// read-only in the app, so a stray click can never destroy them.
export function isEditablePostcard(postcard) {
  return typeof postcard.id === 'string' && postcard.id.length > 0;
}

export function newPostcardId() {
  return `pc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function withPostcardReplaced(list, id, replacement) {
  return list.map((p) => (p.id === id ? replacement : p));
}

export function withPostcardRemoved(list, id) {
  return list.filter((p) => p.id !== id);
}
