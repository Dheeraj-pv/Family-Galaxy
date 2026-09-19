// A small popover for a moment the user added: pressing its timeline marker moves the playhead
// (as for every marker) and opens this beside it with Edit / Remove. Removing asks first, with
// "Keep" focused by default (same pattern as deleting a postcard). It is body-level and
// position:fixed because the ribbon's backdrop-filter would otherwise trap fixed children.
// Non-modal: Escape, a click elsewhere, or focus leaving it closes it.

import { formatEventWhen } from './eventModel.js';

let menuEl = null;
let anchor = null;
let cleanup = null;

export function isMomentMenuOpen() {
  return menuEl !== null;
}

function button(className, text, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `moment-menu__button ${className}`;
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

// `anchorEl` is the marker button; `who` is the person's name or null.
export function openMomentMenu({ event, anchorEl, who = null, onEdit, onDelete }) {
  closeMomentMenu({ restoreFocus: false });
  anchor = anchorEl;

  menuEl = document.createElement('div');
  menuEl.className = 'moment-menu';
  menuEl.dataset.color = event.color;
  menuEl.setAttribute('role', 'group');
  menuEl.setAttribute('aria-label', `Your moment: ${event.label}, ${formatEventWhen(event)}`);

  const heading = document.createElement('p');
  heading.className = 'moment-menu__title';
  heading.textContent = event.label;
  const meta = document.createElement('p');
  meta.className = 'moment-menu__meta small-caps';
  meta.textContent = `${formatEventWhen(event)}${who ? ` · ${who}` : ''}`;
  const actions = document.createElement('div');
  actions.className = 'moment-menu__actions';
  menuEl.append(heading, meta, actions);

  const showActions = () => {
    actions.textContent = '';
    const edit = button('moment-menu__edit', 'Edit', () => { closeMomentMenu({ restoreFocus: false }); onEdit(event); });
    const remove = button('moment-menu__remove', 'Remove', showConfirm);
    remove.setAttribute('aria-label', `Remove the moment ${event.label}`);
    actions.append(edit, remove);
    return edit;
  };
  function showConfirm() {
    actions.textContent = '';
    const question = document.createElement('span');
    question.className = 'moment-menu__question';
    question.textContent = 'Remove this moment?';
    const keep = button('moment-menu__keep', 'Keep', () => showActions().focus());
    const yes = button('moment-menu__remove', 'Remove', () => { closeMomentMenu({ restoreFocus: false }); onDelete(event); });
    actions.append(question, keep, yes);
    keep.focus(); // the gentle choice is the default
  }

  document.body.appendChild(menuEl);
  const first = showActions();
  position();
  first.focus();

  const onKeydown = (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    // Escape backs out of the confirmation first, then closes the menu.
    if (actions.querySelector('.moment-menu__keep')) showActions().focus();
    else closeMomentMenu({ restoreFocus: true });
  };
  const onPointerDown = (e) => { if (!menuEl.contains(e.target) && !anchor.contains(e.target)) closeMomentMenu({ restoreFocus: false }); };
  const onFocusOut = (e) => { if (e.relatedTarget && !menuEl.contains(e.relatedTarget)) closeMomentMenu({ restoreFocus: false }); };
  const onReflow = () => closeMomentMenu({ restoreFocus: false });
  menuEl.addEventListener('keydown', onKeydown);
  menuEl.addEventListener('focusout', onFocusOut);
  document.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('resize', onReflow);
  cleanup = () => {
    document.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('resize', onReflow);
  };
}

// Sits just above the marker, centred on it, kept inside the screen.
function position() {
  const a = anchor.getBoundingClientRect();
  const m = menuEl.getBoundingClientRect();
  const margin = 8;
  const left = Math.min(Math.max(a.left + a.width / 2 - m.width / 2, margin), window.innerWidth - m.width - margin);
  menuEl.style.left = `${left}px`;
  menuEl.style.bottom = `${window.innerHeight - a.top + margin}px`;
  // A tiny pointer toward the marker, even when the panel had to shift sideways.
  menuEl.style.setProperty('--pointer-x', `${a.left + a.width / 2 - left}px`);
}

export function closeMomentMenu({ restoreFocus = false } = {}) {
  if (!menuEl) return;
  const el = menuEl;
  const returnTo = anchor;
  menuEl = null;
  anchor = null;
  cleanup?.();
  cleanup = null;
  el.remove();
  if (restoreFocus && returnTo && document.contains(returnTo)) returnTo.focus();
}
