// Everything the user adds at runtime (postcards, custom events, preferences) — the second
// of the two allowed data locations per CLAUDE.md ("family.json + localStorage, no other
// persistence"). All reads/writes are wrapped: localStorage can throw (private browsing,
// quota, disabled storage) and this data is supplementary, so a failure here should degrade
// to "nothing saved" rather than break the app.

const KEYS = {
  postcards: 'familyGalaxy.postcards.v1', // { [personId]: Postcard[] }
  events: 'familyGalaxy.events.v1',       // Event[]
  prefs: 'familyGalaxy.prefs.v1',         // { [key]: value }
};

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.warn(`[localStorageStore] failed to read "${key}", using fallback.`, err);
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn(`[localStorageStore] failed to write "${key}" — change was not saved.`, err);
    return false;
  }
}

export function getStoredPostcards() {
  return readJSON(KEYS.postcards, {});
}

export function addStoredPostcard(personId, postcard) {
  const all = getStoredPostcards();
  const forPerson = all[personId] || [];
  all[personId] = [...forPerson, postcard];
  writeJSON(KEYS.postcards, all);
  return all[personId];
}

export function replaceStoredPostcard(personId, id, postcard) {
  const all = getStoredPostcards();
  all[personId] = (all[personId] || []).map((p) => (p.id === id ? postcard : p));
  writeJSON(KEYS.postcards, all);
}

export function deleteStoredPostcard(personId, id) {
  const all = getStoredPostcards();
  const remaining = (all[personId] || []).filter((p) => p.id !== id);
  if (remaining.length) all[personId] = remaining;
  else delete all[personId];
  writeJSON(KEYS.postcards, all);
}

// Postcards saved before editing existed have no id; give each one now (and save) so they can be
// edited or deleted like any other. Runs once at load; a no-op when every postcard has an id.
export function ensureStoredPostcardIds(makeId) {
  const all = getStoredPostcards();
  let changed = false;
  Object.values(all).forEach((list) => list.forEach((p) => {
    if (!p.id) { p.id = makeId(); changed = true; }
  }));
  if (changed) writeJSON(KEYS.postcards, all);
  return all;
}

export function getStoredEvents() {
  const stored = readJSON(KEYS.events, []);
  return Array.isArray(stored) ? stored : []; // a hand-edited / corrupt value must not break loading
}

export function addStoredEvent(event) {
  const all = getStoredEvents();
  all.push(event);
  writeJSON(KEYS.events, all);
  return all;
}

export function replaceStoredEvent(id, event) {
  const all = getStoredEvents().map((e) => (e.id === id ? event : e));
  writeJSON(KEYS.events, all);
  return all;
}

export function deleteStoredEvent(id) {
  const all = getStoredEvents().filter((e) => e.id !== id);
  writeJSON(KEYS.events, all);
  return all;
}

export function getPrefs() {
  return readJSON(KEYS.prefs, {});
}

export function setPref(key, value) {
  const prefs = getPrefs();
  prefs[key] = value;
  writeJSON(KEYS.prefs, prefs);
  return prefs;
}
