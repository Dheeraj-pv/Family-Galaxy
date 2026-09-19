// "+ Add Postcard" / "Edit": one small form modal for both. It only collects and validates input;
// saving (localStorage + in-memory people + bus events) lives in postcardActions.js. The photo
// field (when Supabase is configured — see CLAUDE.md "Cloud sync") resizes the chosen file in
// the browser and uploads it directly here, since the postcard itself isn't saved until the
// upload has a URL to attach.

import { getPeople } from '../state.js';
import { announce } from '../a11y/announcer.js';
import { setBackgroundInert } from '../a11y/modalInert.js';
import { addPostcard, editPostcard } from './postcardActions.js';
import { validatePostcardInput, newPostcardId, NOTE_MAX_LENGTH, FROM_MAX_LENGTH } from './postcardModel.js';
import { hasSupabaseConfig } from '../data/supabaseClient.js';
import { uploadPhoto } from '../data/cloudStore.js';
import { validateImageFile, resizeImageFile } from '../utils/imageUpload.js';

let modalEl = null;
let returnFocusEl = null;

function todayIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function makeField(labelText, control, id) {
  const wrap = document.createElement('div');
  wrap.className = 'add-postcard__field';
  const label = document.createElement('label');
  label.className = 'small-caps';
  label.htmlFor = id;
  label.textContent = labelText;
  const error = document.createElement('p');
  error.className = 'add-postcard__error';
  error.id = `${id}-error`;
  wrap.append(label, control, error);
  control.id = id;
  control.setAttribute('aria-describedby', error.id);
  return wrap;
}

// A file picker + preview + "Remove photo". The file itself is only resized/uploaded when the
// form is actually submitted (`resolvePhoto`), so choosing then cancelling never touches the
// network, and a fresh choice always replaces (never adds to) whatever was picked before.
function buildPhotoField(existingUrl) {
  const wrap = document.createElement('div');
  wrap.className = 'add-postcard__field add-postcard__field--photo';

  const label = document.createElement('label');
  label.className = 'small-caps';
  label.htmlFor = 'add-postcard-photo';
  label.textContent = 'Photo (optional)';

  const preview = document.createElement('img');
  preview.className = 'add-postcard__photo-preview';
  preview.alt = '';
  preview.hidden = !existingUrl;
  if (existingUrl) preview.src = existingUrl;

  const input = document.createElement('input');
  input.type = 'file';
  input.id = 'add-postcard-photo';
  input.accept = 'image/*';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'add-postcard__photo-remove small-caps';
  removeBtn.textContent = 'Remove photo';
  removeBtn.hidden = !existingUrl;

  const error = document.createElement('p');
  error.className = 'add-postcard__error';

  let selectedFile = null;
  let removed = false;

  input.addEventListener('change', () => {
    error.textContent = '';
    const file = input.files[0];
    if (!file) return;
    const check = validateImageFile(file);
    if (!check.ok) {
      error.textContent = check.reason;
      input.value = '';
      return;
    }
    selectedFile = file;
    removed = false;
    removeBtn.hidden = false;
    preview.hidden = false;
    preview.src = URL.createObjectURL(file);
  });

  removeBtn.addEventListener('click', () => {
    selectedFile = null;
    removed = true;
    input.value = '';
    preview.hidden = true;
    preview.removeAttribute('src');
    removeBtn.hidden = true;
    error.textContent = '';
  });

  wrap.append(label, preview, input, removeBtn, error);

  // Resolves to the final photo URL (or null) for this submit: a newly chosen file is resized
  // and uploaded now (using `id` — the postcard's own id — as the storage filename); otherwise
  // "Remove photo" wins, otherwise whatever photo was already there is kept as-is.
  async function resolvePhoto(id) {
    if (selectedFile) {
      try {
        const { blob } = await resizeImageFile(selectedFile);
        const result = await uploadPhoto('postcards', `${id}.jpg`, blob);
        if (!result.ok) return { ok: false, error: 'Couldn’t save that photo — mind trying again?' };
        return { ok: true, photo: result.url };
      } catch (err) {
        return { ok: false, error: 'Couldn’t read that photo — try a different one?' };
      }
    }
    if (removed) return { ok: true, photo: null };
    return { ok: true, photo: existingUrl ?? null };
  }

  return { wrap, resolvePhoto, showError: (message) => { error.textContent = message; } };
}

export function openEditPostcard(ownerId, postcard) {
  openAddPostcard({ personId: ownerId, editing: { ownerId, postcard } });
}

export function openAddPostcard({ personId = null, editing = null } = {}) {
  closeAddPostcard();
  returnFocusEl = document.activeElement;
  const people = getPeople();

  modalEl = document.createElement('div');
  modalEl.className = 'add-postcard';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.setAttribute('aria-labelledby', 'add-postcard-title');

  const backdrop = document.createElement('div');
  backdrop.className = 'add-postcard__backdrop';
  const panel = document.createElement('form');
  panel.className = 'add-postcard__panel';
  panel.noValidate = true;

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'add-postcard__close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';
  const title = document.createElement('h2');
  title.id = 'add-postcard-title';
  title.textContent = editing ? 'Edit postcard' : 'Send a postcard';

  const to = document.createElement('select');
  const placeholder = new Option('Choose a star…', '');
  to.appendChild(placeholder);
  people.forEach((p) => to.appendChild(new Option(p.name, p.id)));
  if (personId) to.value = personId;

  const from = document.createElement('input');
  from.type = 'text';
  from.maxLength = FROM_MAX_LENGTH;
  from.autocomplete = 'off';
  from.setAttribute('list', 'add-postcard-names');
  const names = document.createElement('datalist');
  names.id = 'add-postcard-names';
  people.forEach((p) => names.appendChild(new Option(p.name)));

  const note = document.createElement('textarea');
  note.rows = 4;
  note.maxLength = NOTE_MAX_LENGTH;
  note.className = 'font-hand';
  note.placeholder = 'Thought of you today…';

  const date = document.createElement('input');
  date.type = 'date';
  date.value = todayIso();
  if (editing) {
    from.value = editing.postcard.from;
    note.value = editing.postcard.note;
    date.value = editing.postcard.date ?? '';
  }

  const fields = {
    personId: makeField('To', to, 'add-postcard-to'),
    from: makeField('From', from, 'add-postcard-from'),
    note: makeField('On the back', note, 'add-postcard-note'),
    date: makeField('Date', date, 'add-postcard-date'),
  };

  // Photo: only offered when there's somewhere to upload it. A file is resized/uploaded at
  // submit time, not on selection, so choosing a photo and then cancelling the form never
  // touches the network.
  const photoField = hasSupabaseConfig() ? buildPhotoField(editing?.postcard.photo ?? null) : null;

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'add-postcard__submit';
  submit.textContent = editing ? 'Save changes' : 'Send postcard';

  panel.append(close, title, fields.personId, fields.from, fields.note, fields.date);
  if (photoField) panel.appendChild(photoField.wrap);
  panel.append(submit, names);
  modalEl.append(backdrop, panel);

  const controls = { personId: to, from, note, date };
  panel.addEventListener('submit', async (e) => {
    e.preventDefault();
    const result = validatePostcardInput(
      { personId: to.value, from: from.value, note: note.value, date: date.value },
      people.map((p) => p.id),
    );
    Object.entries(fields).forEach(([key, wrap]) => {
      const message = result.ok ? '' : result.errors[key] ?? '';
      wrap.querySelector('.add-postcard__error').textContent = message;
      controls[key].setAttribute('aria-invalid', String(Boolean(message)));
    });
    if (!result.ok) {
      const count = Object.keys(result.errors).length;
      announce(`${count} ${count === 1 ? 'field needs' : 'fields need'} attention.`, { delay: 0 });
      const firstBad = Object.keys(fields).find((key) => result.errors[key]);
      controls[firstBad].focus();
      return;
    }

    const id = editing ? editing.postcard.id : newPostcardId();
    if (photoField) {
      const originalLabel = submit.textContent;
      submit.disabled = true;
      submit.textContent = 'Sending…';
      const outcome = await photoField.resolvePhoto(id);
      submit.disabled = false;
      submit.textContent = originalLabel;
      if (!outcome.ok) { photoField.showError(outcome.error); return; } // modal stays open to retry
      result.postcard.photo = outcome.photo;
    }

    const recipient = people.find((p) => p.id === to.value);
    closeAddPostcard(); // first, so focus returns to the opener before listeners re-render around it
    if (editing) {
      editPostcard({
        ownerId: editing.ownerId, id, newOwnerId: recipient.id, postcard: result.postcard,
      });
      announce(`Postcard updated.`, { delay: 300 });
    } else {
      addPostcard(recipient.id, { ...result.postcard, id });
      announce(`Postcard sent to ${recipient.name}.`, { delay: 300 });
    }
  });

  close.addEventListener('click', closeAddPostcard);
  backdrop.addEventListener('click', closeAddPostcard);
  modalEl.addEventListener('keydown', onKeydown);

  document.body.appendChild(modalEl);
  setBackgroundInert(true);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    modalEl?.classList.add('is-open');
    (personId ? from : to).focus();
  }));
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    closeAddPostcard();
    return;
  }
  if (e.key !== 'Tab') return;
  const stops = [...modalEl.querySelectorAll('button, input, select, textarea')].filter((n) => !n.disabled);
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

export function closeAddPostcard() {
  if (!modalEl) return;
  const el = modalEl;
  modalEl = null;
  el.classList.remove('is-open');
  el.inert = true; // fading out: no longer focusable, clickable, or read by assistive tech
  const ms = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--duration-card-entrance')) || 450;
  setTimeout(() => el.remove(), ms);
  setBackgroundInert(false); // before refocusing: inert elements can't take focus
  if (returnFocusEl && document.contains(returnFocusEl)) returnFocusEl.focus();
}
