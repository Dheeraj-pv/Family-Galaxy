// The one place timeline moments are added, edited and removed: updates the in-memory events,
// saves to localStorage, syncs to Supabase when it's configured (see CLAUDE.md "Cloud sync"),
// and announces the change on the bus so the ribbon (and anyone reading events, e.g. anniversary
// greetings) can react. Forms and buttons call these; they never touch state or storage
// themselves. (Mirrors js/postcards/postcardActions.js, including the "local write is instant,
// cloud write happens after, in the background" ordering.)
//
// Events:  eventAdded   { event }
//          eventEdited  { event }
//          eventDeleted { eventId }

import { getEvents, setEvents } from '../state.js';
import { emit } from '../utils/events.js';
import { addStoredEvent, replaceStoredEvent, deleteStoredEvent } from '../data/localStorageStore.js';
import { saveEvent, deleteEventRow } from '../data/cloudStore.js';
import { newEventId, withEventReplaced, withEventRemoved } from './eventModel.js';

export function addEvent(event) {
  const saved = { ...event, id: newEventId() };
  setEvents([...getEvents(), saved]);
  addStoredEvent(saved);
  emit('eventAdded', { event: saved });
  saveEvent(saved);
  return saved;
}

export function editEvent(id, event) {
  const saved = { ...event, id };
  setEvents(withEventReplaced(getEvents(), id, saved));
  replaceStoredEvent(id, saved);
  emit('eventEdited', { event: saved });
  saveEvent(saved);
  return saved;
}

export function deleteEvent(id) {
  setEvents(withEventRemoved(getEvents(), id));
  deleteStoredEvent(id);
  emit('eventDeleted', { eventId: id });
  deleteEventRow(id);
}
