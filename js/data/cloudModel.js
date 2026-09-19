// Pure translation between Supabase's column-named rows (see supabase/schema.sql) and this
// app's existing postcard/event shapes (js/postcards/postcardModel.js, js/timeline/eventModel.js).
// No network, no DOM — so the mapping itself (the easy place to get a field name wrong) is
// unit-tested standalone: tests/test-cloud-model.html.

export function rowToPostcard(row) {
  return {
    id: row.id,
    personId: row.person_id,
    from: row.sender,
    date: row.date ?? null,
    photo: row.photo ?? null,
    note: row.note,
  };
}

// `postcard` is this app's shape ({ id, from, date, photo, note }); `personId` is passed
// separately since the app nests postcards inside `person.postcards`, but the row needs it as
// its own column.
export function postcardToRow(personId, postcard) {
  return {
    id: postcard.id,
    person_id: personId,
    sender: postcard.from,
    date: postcard.date ?? null,
    photo: postcard.photo ?? null,
    note: postcard.note,
  };
}

export function rowToEvent(row) {
  return {
    id: row.id,
    year: row.year,
    month: row.month ?? null,
    day: row.day ?? null,
    personId: row.person_id ?? null,
    label: row.label,
    color: row.color,
  };
}

export function eventToRow(event) {
  return {
    id: event.id,
    year: event.year,
    month: event.month ?? null,
    day: event.day ?? null,
    person_id: event.personId ?? null,
    label: event.label,
    color: event.color,
  };
}

export function rowToPersonPhoto(row) {
  return { personId: row.person_id, then: row.then_photo ?? null, now: row.now_photo ?? null };
}
