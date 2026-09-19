// A person's corkboard: the grid of flippable postcards inside the profile card's Postcards tab.
// Pure rendering — takes the subjects (one person, or both founders) and fills the panel.

import { getPeople } from '../state.js';
import { sortPostcards, resolveSenderName, isEditablePostcard } from './postcardModel.js';
import { createPostcardElement } from './postcardFlip.js';

// onEdit(ownerId, postcard) / onDelete(ownerId, postcard) are offered only on user-added postcards.
export function renderCorkboard(panelEl, subjects, { onAdd, onEdit, onDelete } = {}) {
  panelEl.textContent = '';
  const people = getPeople();

  const postcards = subjects.flatMap((person) =>
    person.postcards.map((postcard, i) => ({ postcard, seed: `${person.id}:${i}`, ownerId: person.id })));

  if (postcards.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'profile-card__placeholder';
    empty.textContent = 'No postcards yet. Be the first to send one.';
    panelEl.appendChild(empty);
  } else {
    const list = document.createElement('ul');
    list.className = 'corkboard';
    list.setAttribute('role', 'list'); // list-style:none drops list semantics in Safari/VoiceOver
    list.setAttribute('aria-label', 'Postcards');
    const sorted = sortPostcards(postcards.map((entry) => ({ ...entry.postcard, __seed: entry.seed, __owner: entry.ownerId })));
    sorted.forEach((postcard) => {
      const { __seed, __owner, ...plain } = postcard;
      const actions = onEdit && onDelete && isEditablePostcard(plain)
        ? { onEdit: () => onEdit(__owner, plain), onDelete: () => onDelete(__owner, plain) }
        : null;
      list.appendChild(createPostcardElement(plain, resolveSenderName(plain.from, people), __seed, actions));
    });
    panelEl.appendChild(list);
  }

  if (onAdd) {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'corkboard__add small-caps';
    add.textContent = '+ Add a postcard';
    add.addEventListener('click', onAdd);
    panelEl.appendChild(add);
  }
}
