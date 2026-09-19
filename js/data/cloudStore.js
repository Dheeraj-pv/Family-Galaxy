// The one place the app talks to Supabase tables/storage directly. Everything here degrades to
// "did nothing" (never throws) when Supabase isn't configured (hasSupabaseConfig() false), so
// callers don't need their own try/catch around every call — postcardActions.js and
// eventActions.js already have a localStorage fallback for exactly this reason.
//
// Row <-> app-shape translation lives in cloudModel.js (pure, tested); this file is the I/O.

import { getSupabase, hasSupabaseConfig } from './supabaseClient.js';
import { rowToPostcard, postcardToRow, rowToEvent, eventToRow, rowToPersonPhoto } from './cloudModel.js';

export { hasSupabaseConfig };

function warn(action, error) {
  console.warn(`[cloudStore] ${action} failed — the change is saved on this device only for now.`, error);
}

// ---- postcards --------------------------------------------------------------------------

export async function fetchAllPostcards() {
  const client = await getSupabase();
  if (!client) return [];
  const { data, error } = await client.from('postcards').select('*').order('created_at', { ascending: true });
  if (error) { warn('fetchAllPostcards', error); return []; }
  return data.map(rowToPostcard);
}

export async function savePostcard(personId, postcard) {
  const client = await getSupabase();
  if (!client) return { ok: false };
  const { error } = await client.from('postcards').upsert(postcardToRow(personId, postcard));
  if (error) warn('savePostcard', error);
  return { ok: !error, error };
}

export async function deletePostcardRow(id) {
  const client = await getSupabase();
  if (!client) return { ok: false };
  const { error } = await client.from('postcards').delete().eq('id', id);
  if (error) warn('deletePostcardRow', error);
  return { ok: !error, error };
}

// ---- events -------------------------------------------------------------------------------

export async function fetchAllEvents() {
  const client = await getSupabase();
  if (!client) return [];
  const { data, error } = await client.from('events').select('*').order('created_at', { ascending: true });
  if (error) { warn('fetchAllEvents', error); return []; }
  return data.map(rowToEvent);
}

export async function saveEvent(event) {
  const client = await getSupabase();
  if (!client) return { ok: false };
  const { error } = await client.from('events').upsert(eventToRow(event));
  if (error) warn('saveEvent', error);
  return { ok: !error, error };
}

export async function deleteEventRow(id) {
  const client = await getSupabase();
  if (!client) return { ok: false };
  const { error } = await client.from('events').delete().eq('id', id);
  if (error) warn('deleteEventRow', error);
  return { ok: !error, error };
}

// ---- person photos (uploaded Then & Now) ----------------------------------------------------

export async function fetchAllPersonPhotos() {
  const client = await getSupabase();
  if (!client) return [];
  const { data, error } = await client.from('person_photos').select('*');
  if (error) { warn('fetchAllPersonPhotos', error); return []; }
  return data.map(rowToPersonPhoto);
}

// Merges just the given field (`then`/`now`) so uploading one side never clobbers the other.
export async function savePersonPhoto(personId, which, url) {
  const client = await getSupabase();
  if (!client) return { ok: false };
  const column = which === 'then' ? 'then_photo' : 'now_photo';
  const { error } = await client.from('person_photos')
    .upsert({ person_id: personId, [column]: url }, { onConflict: 'person_id' });
  if (error) warn('savePersonPhoto', error);
  return { ok: !error, error };
}

// ---- photo uploads (Storage) ----------------------------------------------------------------
// `bucket` is 'postcards' or 'then-now' (see supabase/storage.sql); `path` is the object name
// within it. Always uploads as image/jpeg (js/utils/imageUpload.js already re-encodes to JPEG).

export async function uploadPhoto(bucket, path, blob) {
  const client = await getSupabase();
  if (!client) return { ok: false, url: null };
  const { error } = await client.storage.from(bucket).upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
  if (error) { warn('uploadPhoto', error); return { ok: false, url: null, error }; }
  const { data } = client.storage.from(bucket).getPublicUrl(path);
  // Both callers reuse a fixed filename when replacing a photo (a person's then/now side, or an
  // edited postcard's photo), so the public URL is otherwise byte-identical after a re-upload —
  // a cache-busting suffix forces every viewer's browser (including this one) to actually fetch
  // the new bytes instead of serving what it cached at that same URL before.
  return { ok: true, url: `${data.publicUrl}?v=${Date.now()}` };
}

// ---- realtime -----------------------------------------------------------------------------
// One shared subscription for all three tables. `handlers` gets `{ eventType, table, new, old }`
// for every insert/update/delete anyone (including this tab) makes. Returns an unsubscribe fn.

export async function subscribeToChanges(onChange) {
  const client = await getSupabase();
  if (!client) return () => {};
  const relay = (table) => (payload) => onChange({ table, eventType: payload.eventType, new: payload.new, old: payload.old });
  const channel = client.channel('family-galaxy-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'postcards' }, relay('postcards'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, relay('events'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'person_photos' }, relay('person_photos'))
    .subscribe();
  return () => client.removeChannel(channel);
}
