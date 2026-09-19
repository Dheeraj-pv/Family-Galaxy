// One flippable postcard. Front: photo (or a warm placeholder), sender and date. Back: the
// handwritten note. The whole card is a single <button> so Tab/Enter/Space flip it for free;
// only the visible face is exposed to screen readers, and the flip state is aria-pressed.
// Motion (rotateY 600ms, mid-flip shadow deepen, reduced-motion cross-fade) lives in postcards.css.

import { hashStringToRange } from '../utils/math.js';
import { formatPostcardDate } from './postcardModel.js';
import { announce } from '../a11y/announcer.js';

const PHOTO_DIR = 'assets/photos/';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// `seed` keeps each card's slight tilt stable across re-renders.
// `actions` ({ onEdit, onDelete }) is passed only for postcards the user may change; the buttons
// sit beside the flip button (never inside it: a button can't contain buttons).
export function createPostcardElement(postcard, senderName, seed, actions = null) {
  const item = document.createElement('li');
  item.className = 'postcard-slot';
  if (postcard.id) item.dataset.postcardId = postcard.id;
  item.style.setProperty('--tilt', `${hashStringToRange(seed, -2.2, 2.2, 'tilt').toFixed(2)}deg`);

  const button = el('button', 'postcard');
  button.type = 'button';
  button.setAttribute('aria-pressed', 'false');

  const inner = el('span', 'postcard__inner');

  const front = el('span', 'postcard__face postcard__face--front');
  const photoWrap = el('span', 'postcard__photo');
  if (postcard.photo) {
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.addEventListener('error', () => { img.remove(); photoWrap.classList.add('is-placeholder'); }, { once: true });
    img.src = postcard.photo.includes('/') ? postcard.photo : PHOTO_DIR + postcard.photo;
    photoWrap.appendChild(img);
  } else {
    photoWrap.classList.add('is-placeholder');
  }
  const dateText = formatPostcardDate(postcard.date);
  const caption = el('span', 'postcard__from font-hand', `From ${senderName}`);
  const dateEl = el('span', 'postcard__date small-caps', dateText);
  const hint = el('span', 'visually-hidden', '. Press to turn the postcard over and read it.');
  front.append(photoWrap, caption, dateEl, hint);

  const back = el('span', 'postcard__face postcard__face--back');
  back.append(
    el('span', 'postcard__note font-hand', postcard.note),
    el('span', 'postcard__signoff font-hand', `— ${senderName}`),
  );

  inner.append(front, back);
  button.appendChild(inner);
  item.appendChild(button);
  if (actions) item.appendChild(createActionRow(senderName, actions));

  setFace(button, front, back, false);
  button.addEventListener('click', () => {
    const flipped = button.getAttribute('aria-pressed') !== 'true';
    setFace(button, front, back, flipped);
    button.classList.add('is-flipping');
    // The button's name doesn't change on flip for most screen readers, so read the note aloud.
    if (flipped) announce(`${senderName} wrote: ${postcard.note}`, { delay: 0 });
  });
  button.addEventListener('animationend', (e) => {
    if (e.target !== button && !e.target.classList.contains('postcard__face')) return;
    button.classList.remove('is-flipping');
  });
  return item;
}

function setFace(button, front, back, flipped) {
  button.setAttribute('aria-pressed', String(flipped));
  button.classList.toggle('is-flipped', flipped);
  front.setAttribute('aria-hidden', String(flipped));
  back.setAttribute('aria-hidden', String(!flipped));
}

// Edit / Delete buttons. Delete asks first, inline ("Delete this postcard? Keep / Delete") rather
// than with a browser popup: gentler, stays in the card's own style, and works with screen readers.
function createActionRow(senderName, { onEdit, onDelete }) {
  const row = el('div', 'postcard-actions');

  function showButtons(focusDelete = false) {
    row.textContent = '';
    const edit = el('button', 'postcard-action postcard-action--edit small-caps', 'Edit');
    edit.type = 'button';
    edit.setAttribute('aria-label', `Edit postcard from ${senderName}`);
    edit.addEventListener('click', onEdit);
    const del = el('button', 'postcard-action postcard-action--delete small-caps', 'Delete');
    del.type = 'button';
    del.setAttribute('aria-label', `Delete postcard from ${senderName}`);
    del.addEventListener('click', showConfirm);
    row.append(edit, del);
    if (focusDelete) del.focus();
  }

  function showConfirm() {
    row.textContent = '';
    const question = el('span', 'postcard-actions__question', 'Delete this postcard?');
    question.id = `confirm-${Math.random().toString(36).slice(2, 8)}`;
    const keep = el('button', 'postcard-action small-caps', 'Keep');
    keep.type = 'button';
    keep.addEventListener('click', () => showButtons(true));
    const yes = el('button', 'postcard-action postcard-action--delete small-caps', 'Delete');
    yes.type = 'button';
    yes.setAttribute('aria-describedby', question.id);
    yes.addEventListener('click', onDelete);
    row.setAttribute('role', 'group');
    row.setAttribute('aria-labelledby', question.id);
    row.append(question, keep, yes);
    keep.focus(); // the safe choice is the default
    announce(`Delete the postcard from ${senderName}? Keep or Delete.`, { delay: 0 });
  }

  row.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && row.querySelector('.postcard-actions__question')) {
      e.stopPropagation(); // cancel the confirmation, not the whole profile card
      showButtons(true);
    }
  });

  showButtons();
  return row;
}
