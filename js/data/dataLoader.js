import { setPeople, setEvents } from '../state.js';
import { emit } from '../utils/events.js';
import { normalizePerson, normalizeEvent } from './schema.js';
import { ensureStoredPostcardIds, getStoredEvents } from './localStorageStore.js';
import { newPostcardId } from '../postcards/postcardModel.js';

// Loads family.json, merges in anything the user has added via localStorage (postcards
// against the matching person, plus any user-added events), normalizes both, writes them
// into state, and announces readiness. This is the one place static data and user data meet.
export async function loadFamilyData(url = 'data/family.json') {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`[dataLoader] failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  const raw = await response.json();

  const storedPostcards = ensureStoredPostcardIds(newPostcardId);
  const people = raw.people.map((rawPerson) => {
    const person = normalizePerson(rawPerson);
    const added = storedPostcards[person.id];
    if (added && added.length) {
      person.postcards = [...person.postcards, ...added];
    }
    return person;
  });

  const events = [
    ...raw.events.map(normalizeEvent),
    ...getStoredEvents().map(normalizeEvent),
  ];

  setPeople(people);
  setEvents(events);
  emit('dataReady', { people, events });

  return { people, events };
}
