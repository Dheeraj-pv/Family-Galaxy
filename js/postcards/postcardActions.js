// The one place postcards are added, edited and deleted: updates the in-memory people, saves to
// localStorage, syncs to Supabase when it's configured (see CLAUDE.md "Cloud sync"), and
// announces the change on the bus so the corkboard and star map can react. (Forms and buttons
// call these; they never touch state or storage themselves.)
//
// Events:  postcardAdded   { personId, postcard }
//          postcardEdited  { personId, fromPersonId, postcard }   (personId = current owner)
//          postcardDeleted { personId, postcardId }
//
// The local mutation + localStorage write + bus emit all happen synchronously, exactly as
// before Supabase existed — a postcard appears instantly, on this device, whether or not the
// network is even up. The Supabase write happens after, in the background; a failure there
// leaves the postcard saved locally (and localStorage-backed) but not yet shared with anyone
// else — js/data/cloudSync.js reconciles it up next time it succeeds.

import { getPeople } from '../state.js';
import { emit } from '../utils/events.js';
import { addStoredPostcard, replaceStoredPostcard, deleteStoredPostcard } from '../data/localStorageStore.js';
import { savePostcard, deletePostcardRow } from '../data/cloudStore.js';
import { newPostcardId, withPostcardReplaced, withPostcardRemoved } from './postcardModel.js';

function findPerson(personId) {
  return getPeople().find((p) => p.id === personId);
}

// `postcard.id`, if already set (addPostcard.js pre-generates one when a photo is attached, so
// the upload has somewhere to live before the postcard itself is saved), is kept as-is.
export function addPostcard(personId, postcard) {
  const person = findPerson(personId);
  if (!person) return null;
  const saved = { ...postcard, id: postcard.id ?? newPostcardId() };
  person.postcards = [...person.postcards, saved];
  addStoredPostcard(personId, saved);
  emit('postcardAdded', { personId, postcard: saved });
  savePostcard(personId, saved);
  return saved;
}

// `newOwnerId` may differ from `ownerId` (a postcard can be re-addressed to someone else).
export function editPostcard({ ownerId, id, newOwnerId, postcard }) {
  const owner = findPerson(ownerId);
  const target = findPerson(newOwnerId);
  if (!owner || !target) return null;
  const saved = { ...postcard, id };

  if (newOwnerId === ownerId) {
    owner.postcards = withPostcardReplaced(owner.postcards, id, saved);
    replaceStoredPostcard(ownerId, id, saved);
  } else {
    owner.postcards = withPostcardRemoved(owner.postcards, id);
    deleteStoredPostcard(ownerId, id);
    target.postcards = [...target.postcards, saved];
    addStoredPostcard(newOwnerId, saved);
  }
  emit('postcardEdited', { personId: newOwnerId, fromPersonId: ownerId, postcard: saved });
  savePostcard(newOwnerId, saved); // one row, keyed by id — re-addressing is just an update to person_id
  return saved;
}

export function deletePostcard(ownerId, id) {
  const owner = findPerson(ownerId);
  if (!owner) return;
  owner.postcards = withPostcardRemoved(owner.postcards, id);
  deleteStoredPostcard(ownerId, id);
  emit('postcardDeleted', { personId: ownerId, postcardId: id });
  deletePostcardRow(id);
}
