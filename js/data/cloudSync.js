// Layers Supabase (shared, synced postcards/moments/Then & Now photos — see CLAUDE.md "Cloud
// sync") on top of the existing family.json + localStorage data, without changing how any other
// module reads state: everything still goes through getPeople()/getEvents() and the same bus
// events (postcardAdded/Edited/Deleted, eventAdded/Edited/Deleted) other modules already listen
// to. A no-op start to finish when Supabase isn't configured (hasSupabaseConfig() false) — the
// app then behaves exactly as it did before this file existed.
//
// Design: postcardActions.js/eventActions.js still do their own optimistic local mutate + bus
// emit immediately (unchanged), then also write through to Supabase. This file's job is the
// OTHER direction — bringing in postcards/moments/photos someone else (or another tab) added,
// via an initial reconcile on load and a realtime subscription afterwards. Every incoming change
// is applied by id: already-present-and-identical is a silent no-op (so a tab doesn't re-render
// in response to its own write echoing back), genuinely new/changed is applied and announced via
// the normal bus event, exactly as if it had happened locally.

import { getPeople, getEvents, setEvents } from '../state.js';
import { on, emit } from '../utils/events.js';
import { hasSupabaseConfig } from './supabaseClient.js';
import {
  fetchAllPostcards, fetchAllEvents, fetchAllPersonPhotos, savePostcard, saveEvent, subscribeToChanges,
} from './cloudStore.js';
import { rowToPostcard, rowToEvent, rowToPersonPhoto } from './cloudModel.js';
import { isEditablePostcard, withPostcardReplaced, withPostcardRemoved } from '../postcards/postcardModel.js';
import { withEventReplaced, withEventRemoved } from '../timeline/eventModel.js';

// personId -> { then, now } — real uploaded Then & Now photos, consulted by profileCard.js
// alongside the placeholder filenames from family.json. See getCloudPhotoFor() below.
const personPhotos = new Map();

export function getCloudPhotoFor(personId) {
  return personPhotos.get(personId) ?? null;
}

export function initCloudSync() {
  if (!hasSupabaseConfig()) return;
  on('dataReady', () => {
    reconcile().catch((err) => console.warn('[cloudSync] initial reconcile failed', err));
  });
}

function findPerson(personId) {
  return getPeople().find((p) => p.id === personId);
}

// ---- bringing cloud rows in -----------------------------------------------------------------

// Applies one postcard from the cloud (initial fetch or a realtime insert/update). Self-healing
// by design: whichever person (if any) currently holds this id but isn't `personId` loses their
// copy first, rather than trusting a passed-in "previous owner" — Postgres's default replica
// identity only guarantees the primary key in a realtime UPDATE's old row, not every column, so
// `old.person_id` can't always be relied on to say where a re-addressed postcard used to live
// (supabase/schema.sql turns on full replica identity for exactly this, but a tab shouldn't
// silently duplicate a postcard if that hasn't been applied yet). Never writes back to Supabase:
// this is the "incoming" direction only.
function applyIncomingPostcard(personId, postcard) {
  let previousOwnerId = null;
  getPeople().forEach((person) => {
    if (person.id !== personId && person.postcards.some((pc) => pc.id === postcard.id)) {
      previousOwnerId = person.id;
      person.postcards = withPostcardRemoved(person.postcards, postcard.id);
    }
  });
  const owner = findPerson(personId);
  if (!owner) return; // a postcard for someone not in this tree — nothing to attach it to
  const existing = owner.postcards.find((p) => p.id === postcard.id);
  if (!previousOwnerId && existing && JSON.stringify(existing) === JSON.stringify(postcard)) return; // our own echo — nothing changed
  owner.postcards = existing ? withPostcardReplaced(owner.postcards, postcard.id, postcard) : [...owner.postcards, postcard];
  emit(existing ? 'postcardEdited' : 'postcardAdded', { personId, fromPersonId: previousOwnerId ?? personId, postcard });
}

// Removes the postcard from EVERY person who has it, not just the first found — the same
// self-healing reasoning as applyIncomingPostcard above.
function removeIncomingPostcard(id) {
  getPeople().forEach((owner) => {
    if (!owner.postcards.some((pc) => pc.id === id)) return;
    owner.postcards = withPostcardRemoved(owner.postcards, id);
    emit('postcardDeleted', { personId: owner.id, postcardId: id });
  });
}

function applyIncomingEvent(event) {
  const existing = getEvents().find((e) => e.id === event.id);
  if (existing && JSON.stringify(existing) === JSON.stringify(event)) return; // our own echo
  setEvents(existing ? withEventReplaced(getEvents(), event.id, event) : [...getEvents(), event]);
  emit(existing ? 'eventEdited' : 'eventAdded', { event });
}

function removeIncomingEvent(id) {
  if (!getEvents().some((e) => e.id === id)) return; // already gone locally
  setEvents(withEventRemoved(getEvents(), id));
  emit('eventDeleted', { eventId: id });
}

function applyIncomingPersonPhoto({ personId, then, now }) {
  const current = personPhotos.get(personId) ?? { then: null, now: null };
  const next = { then: then ?? current.then, now: now ?? current.now };
  personPhotos.set(personId, next);
}

// ---- initial load: push up anything local-only, pull down everything else -------------------

async function reconcile() {
  const [cloudPostcards, cloudEvents, cloudPhotos] = await Promise.all([
    fetchAllPostcards(), fetchAllEvents(), fetchAllPersonPhotos(),
  ]);

  // Anything already here (from localStorage, before cloud sync existed on this device) that the
  // cloud hasn't seen yet gets pushed up. Safe to run every load: an id already on the server is
  // just re-saved as itself (upsert), never duplicated.
  const cloudPostcardIds = new Set(cloudPostcards.map((p) => p.id));
  const localOnlyPostcards = getPeople().flatMap((person) =>
    person.postcards.filter((pc) => isEditablePostcard(pc) && !cloudPostcardIds.has(pc.id)).map((pc) => ({ personId: person.id, pc })));
  await Promise.all(localOnlyPostcards.map(({ personId, pc }) => savePostcard(personId, pc)));

  const cloudEventIds = new Set(cloudEvents.map((e) => e.id));
  const localOnlyEvents = getEvents().filter((e) => e.id && !cloudEventIds.has(e.id));
  await Promise.all(localOnlyEvents.map((e) => saveEvent(e)));

  // Now pull everything the cloud knows about into local state (including what was just pushed
  // up, which is a harmless identical-echo no-op per applyIncomingPostcard/Event above).
  cloudPostcards.forEach((pc) => applyIncomingPostcard(pc.personId, { id: pc.id, from: pc.from, date: pc.date, photo: pc.photo, note: pc.note }));
  cloudEvents.forEach((ev) => applyIncomingEvent({ id: ev.id, year: ev.year, month: ev.month, day: ev.day, personId: ev.personId, label: ev.label, color: ev.color }));
  cloudPhotos.forEach(applyIncomingPersonPhoto);

  subscribeToChanges(handleRealtimeChange);
}

function handleRealtimeChange({ table, eventType, new: newRow, old: oldRow }) {
  if (table === 'postcards') {
    if (eventType === 'DELETE') removeIncomingPostcard(oldRow.id);
    else {
      // eslint-disable-next-line no-unused-vars
      const { personId: _owner, ...postcard } = rowToPostcard(newRow); // owner travels separately below
      applyIncomingPostcard(newRow.person_id, postcard);
    }
  } else if (table === 'events') {
    if (eventType === 'DELETE') removeIncomingEvent(oldRow.id);
    else applyIncomingEvent(rowToEvent(newRow));
  } else if (table === 'person_photos') {
    if (eventType !== 'DELETE') applyIncomingPersonPhoto(rowToPersonPhoto(newRow));
  }
}
