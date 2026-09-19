// Then & Now slider: a modal with two stacked photos and a draggable divider. "Now" sits
// underneath; "Then" sits on top and is clipped from the right, so dragging the divider right
// reveals more of the past. Pointer Events (mouse + touch in one path) and a real ARIA slider
// (arrow keys / Home / End) on the handle. Called directly by profileCard.js, not via the bus.
//
// When Supabase is configured (see CLAUDE.md "Cloud sync") and a `personId` is given, each side
// also gets a small "Add/Replace a real photo" upload — the placeholder filenames from
// family.json are just placeholders, and this is how they get replaced with the real thing,
// shared with everyone else who visits the site.

import { setBackgroundInert } from '../a11y/modalInert.js';
import { announce } from '../a11y/announcer.js';
import { hasSupabaseConfig } from '../data/supabaseClient.js';
import { uploadPhoto, savePersonPhoto } from '../data/cloudStore.js';
import { validateImageFile, resizeImageFile } from '../utils/imageUpload.js';

const PHOTO_DIR = 'assets/photos/';
const KEY_STEP = 5;
const KEY_STEP_LARGE = 20;

export function clampPercent(value) {
  return Math.min(100, Math.max(0, value));
}

// Pointer x -> divider position as a 0-100 percentage of the stage's width.
export function percentFromPointer(clientX, rect) {
  if (rect.width <= 0) return 50;
  return clampPercent(((clientX - rect.left) / rect.width) * 100);
}

function photoUrl(name) {
  return name.includes('/') ? name : PHOTO_DIR + name;
}

let modalEl = null;
let returnFocusEl = null;
let onCloseCb = null;

export function openThenNowSlider({ then, now, caption = '', title = '', personId = null }, { onClose } = {}) {
  closeThenNowSlider({ silent: true });
  onCloseCb = onClose ?? null;
  returnFocusEl = document.activeElement;

  modalEl = document.createElement('div');
  modalEl.className = 'then-now';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.setAttribute('aria-label', title ? `Then and now: ${title}` : 'Then and now');
  modalEl.innerHTML = `
    <div class="then-now__backdrop"></div>
    <div class="then-now__panel">
      <button type="button" class="then-now__close" aria-label="Close then and now">&times;</button>
      <div class="then-now__stage">
        <div class="then-now__layer then-now__layer--now"><img alt="" draggable="false" /></div>
        <div class="then-now__layer then-now__layer--then"><img alt="" draggable="false" /></div>
        <span class="then-now__label then-now__label--then small-caps" aria-hidden="true">Then</span>
        <span class="then-now__label then-now__label--now small-caps" aria-hidden="true">Now</span>
        <div class="then-now__handle" role="slider" tabindex="0" aria-label="Reveal then or now"
          aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"
          aria-valuetext="Half then, half now"><span class="then-now__grip"></span></div>
      </div>
      <p class="then-now__caption font-hand"></p>
    </div>
  `;
  modalEl.querySelector('.then-now__caption').textContent = caption;
  modalEl.querySelector('.then-now__caption').hidden = !caption;

  const stage = modalEl.querySelector('.then-now__stage');
  const handle = modalEl.querySelector('.then-now__handle');

  // Built before attachImage() so each control's label can react the moment its side's real/
  // placeholder state is known — a real photo can 404 (settling to placeholder) or a placeholder
  // slot can only be confirmed once there's no `name` at all, and both happen after this point.
  const thenControl = hasSupabaseConfig() && personId ? buildUploadControl(stage, personId, 'then', title) : null;
  const nowControl = hasSupabaseConfig() && personId ? buildUploadControl(stage, personId, 'now', title) : null;
  if (thenControl) stage.appendChild(thenControl.wrap);
  if (nowControl) stage.appendChild(nowControl.wrap);

  attachImage(modalEl.querySelector('.then-now__layer--then'), then, 'then', title, thenControl?.refreshLabel);
  attachImage(modalEl.querySelector('.then-now__layer--now'), now, 'now', title, nowControl?.refreshLabel);

  function setPosition(percent) {
    const p = clampPercent(percent);
    stage.style.setProperty('--divider', `${p}%`);
    handle.setAttribute('aria-valuenow', String(Math.round(p)));
    handle.setAttribute(
      'aria-valuetext',
      p <= 3 ? 'All now' : p >= 97 ? 'All then' : `${Math.round(p)} percent then, ${Math.round(100 - p)} percent now`,
    );
  }
  setPosition(50);

  let dragging = false;
  stage.addEventListener('pointerdown', (e) => {
    // The upload controls live inside the stage (so they can sit at its own corners); without
    // this check a press on one of them was captured here first and read as a divider drag,
    // stealing the click before the button ever saw it.
    if (e.target.closest('.then-now__upload')) return;
    dragging = true;
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointers can throw; dragging still works */ }
    setPosition(percentFromPointer(e.clientX, stage.getBoundingClientRect()));
    handle.focus({ preventScroll: true });
  });
  stage.addEventListener('pointermove', (e) => {
    if (dragging) setPosition(percentFromPointer(e.clientX, stage.getBoundingClientRect()));
  });
  const endDrag = () => { dragging = false; };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  handle.addEventListener('keydown', (e) => {
    const current = Number(handle.getAttribute('aria-valuenow'));
    const step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    const next = {
      ArrowLeft: current - step, ArrowDown: current - step,
      ArrowRight: current + step, ArrowUp: current + step,
      PageDown: current - KEY_STEP_LARGE, PageUp: current + KEY_STEP_LARGE,
      Home: 0, End: 100,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setPosition(next);
  });

  modalEl.querySelector('.then-now__close').addEventListener('click', () => closeThenNowSlider());
  modalEl.querySelector('.then-now__backdrop').addEventListener('click', () => closeThenNowSlider());
  modalEl.addEventListener('keydown', onModalKeydown);

  document.body.appendChild(modalEl);
  setBackgroundInert(true);
  // Same two-frame trick as the profile card: let the element paint closed before opening.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    modalEl?.classList.add('is-open');
    handle.focus({ preventScroll: true });
  }));
}

// A missing/broken photo is expected while the family is still adding theirs — show a warm
// labelled placeholder instead of a broken-image icon, and keep the slider fully usable.
// `onSettled`, if given, fires once it's known whether this side ended up as a real photo or a
// placeholder (immediately for "no name at all"; after load/error for a real `name`) — the
// upload control's "Add a real photo" / "Replace this photo" label depends on knowing which.
function attachImage(layerEl, name, which, title, onSettled) {
  const img = layerEl.querySelector('img');
  const showPlaceholder = () => {
    layerEl.classList.add('is-placeholder');
    img.remove();
    if (!layerEl.querySelector('.then-now__placeholder')) {
      const ph = document.createElement('span');
      ph.className = 'then-now__placeholder font-hand';
      ph.setAttribute('aria-hidden', 'true'); // decorative stand-in; the slider itself carries the meaning
      ph.textContent = which === 'then' ? 'a photo from then…' : 'a photo from now…';
      layerEl.appendChild(ph);
    }
    onSettled?.();
  };
  if (!name) { showPlaceholder(); return; }
  img.addEventListener('error', showPlaceholder, { once: true });
  img.addEventListener('load', () => onSettled?.(), { once: true });
  img.alt = title ? `${title}, ${which}` : which === 'then' ? 'Then' : 'Now';
  img.src = photoUrl(name);
}

// Swaps a layer over to a real, just-uploaded photo — same end state as attachImage() with a
// real `name`, but callable after the slider is already open (no re-render of the whole modal).
function showRealPhoto(layerEl, url, which, title) {
  layerEl.classList.remove('is-placeholder');
  layerEl.querySelector('.then-now__placeholder')?.remove();
  let img = layerEl.querySelector('img');
  if (!img) {
    img = document.createElement('img');
    img.draggable = false;
    layerEl.prepend(img);
  }
  img.alt = title ? `${title}, ${which}` : which === 'then' ? 'Then' : 'Now';
  img.src = url;
}

// A small "Add/Replace a real photo" button per side (only when Supabase is configured and a
// personId is known — see CLAUDE.md "Cloud sync"), sitting at the stage's own bottom corner
// (not inside the clipped .then-now__layer--then) so it's never affected by the divider. The
// file itself is resized in the browser and uploaded straight to Storage on selection — there's
// no separate "save" step, since replacing a memory's photo isn't something you'd want to undo
// by just closing the dialog.
function buildUploadControl(stage, personId, which, title) {
  const wrap = document.createElement('div');
  wrap.className = `then-now__upload then-now__upload--${which}`;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'then-now__upload-btn small-caps';
  const layerEl = stage.querySelector(`.then-now__layer--${which}`);
  const isPlaceholder = () => layerEl.classList.contains('is-placeholder');
  const refreshLabel = () => { button.textContent = isPlaceholder() ? 'Add a real photo' : 'Replace this photo'; };
  refreshLabel();

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.className = 'visually-hidden';

  const status = document.createElement('p');
  status.className = 'then-now__upload-status small-caps';

  button.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    const check = validateImageFile(file);
    if (!check.ok) { status.textContent = check.reason; return; }
    status.textContent = 'Saving…';
    button.disabled = true;
    try {
      const { blob } = await resizeImageFile(file);
      const result = await uploadPhoto('then-now', `${personId}-${which}.jpg`, blob);
      if (!result.ok) { status.textContent = 'Couldn’t save that photo — mind trying again?'; return; }
      showRealPhoto(layerEl, result.url, which, title);
      await savePersonPhoto(personId, which, result.url);
      status.textContent = '';
      refreshLabel();
      announce(`${which === 'then' ? 'Then' : 'Now'} photo updated.`, { delay: 300 });
    } catch (err) {
      status.textContent = 'Couldn’t read that photo — try a different one?';
    } finally {
      button.disabled = false;
    }
  });

  wrap.append(button, input, status);
  return { wrap, refreshLabel };
}

function onModalKeydown(e) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    closeThenNowSlider();
    return;
  }
  if (e.key !== 'Tab') return;
  // Focus trap: handle + close, plus any upload buttons when they're present.
  const stops = [...modalEl.querySelectorAll('.then-now__handle, .then-now__close, .then-now__upload-btn')];
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

export function closeThenNowSlider({ silent = false } = {}) {
  if (!modalEl) return;
  const el = modalEl;
  modalEl = null;
  el.classList.remove('is-open');
  el.inert = true; // fading out: no longer focusable, clickable, or read by assistive tech
  const ms = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--duration-card-entrance')) || 450;
  setTimeout(() => el.remove(), ms);

  setBackgroundInert(false); // before refocusing: inert elements can't take focus
  if (returnFocusEl && document.contains(returnFocusEl)) returnFocusEl.focus();
  const cb = onCloseCb;
  onCloseCb = null;
  if (!silent && cb) cb();
}
