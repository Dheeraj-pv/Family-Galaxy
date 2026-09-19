// Header: "Find a star" search (an ARIA combobox) and the "go to my star" avatar. Choosing a
// result resolves to the exact same `starSelected` event a canvas click or the keyboard mirror
// emits, so the camera follow and profile card need no special case.

import { getPeople, setSelectedPersonId } from '../state.js';
import { on, emit } from '../utils/events.js';
import { announce } from '../a11y/announcer.js';

const MAX_RESULTS = 8;
const MY_STAR_ID = 'me';

// Ranks name-prefix matches first, then word-prefix, then substring, then family-role matches
// ("Aunty", "Cousin"). Pure, so it can be tested without the DOM (tests/test-search.html).
export function searchPeople(people, query, limit = MAX_RESULTS) {
  const q = (query ?? '').trim().toLowerCase();
  if (!q) return [];
  // Spaces/hyphens are ignored, so "aunty1" finds "Aunty 1" and "wifeuncle" finds "Wife-Uncle1".
  const compact = (text) => text.replace(/[\s-]+/g, '');
  const cq = compact(q);
  const scored = [];
  people.forEach((person) => {
    const name = person.name.toLowerCase();
    const role = (person.familyRole ?? '').toLowerCase();
    let score = null;
    if (name.startsWith(q) || compact(name).startsWith(cq)) score = 0;
    else if (name.split(/[\s-]+/).some((word) => word.startsWith(q))) score = 1;
    else if (name.includes(q) || compact(name).includes(cq)) score = 2;
    else if (role.includes(q)) score = 3;
    if (score !== null) scored.push({ person, score });
  });
  scored.sort((a, b) => a.score - b.score || a.person.name.localeCompare(b.person.name));
  return scored.slice(0, limit).map((entry) => entry.person);
}

function selectPerson(personId) {
  setSelectedPersonId(personId);
  emit('starSelected', { personId });
}

export function initHeader() {
  const input = document.getElementById('star-search-input');
  const list = document.getElementById('star-search-list');
  const myStarBtn = document.getElementById('my-star-btn');
  let results = [];
  let activeIndex = -1;

  function setActive(index) {
    activeIndex = index;
    [...list.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === index)));
    if (index >= 0) input.setAttribute('aria-activedescendant', list.children[index].id);
    else input.removeAttribute('aria-activedescendant');
  }

  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    setActive(-1);
  }

  function choose(person) {
    input.value = '';
    close();
    selectPerson(person.id);
  }

  function render() {
    results = searchPeople(getPeople(), input.value);
    list.textContent = '';
    if (!input.value.trim()) { close(); return; }
    if (results.length === 0) {
      const none = document.createElement('li');
      none.className = 'search__empty';
      none.textContent = 'No star by that name';
      none.setAttribute('role', 'option');
      none.setAttribute('aria-disabled', 'true');
      list.appendChild(none);
    }
    results.forEach((person, i) => {
      const li = document.createElement('li');
      li.id = `star-search-option-${i}`;
      li.className = 'search__option';
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      const emoji = document.createElement('span');
      emoji.setAttribute('aria-hidden', 'true');
      emoji.textContent = person.emoji ?? '⭐';
      const name = document.createElement('span');
      name.className = 'search__name';
      name.textContent = person.name;
      const role = document.createElement('span');
      role.className = 'search__role small-caps';
      role.textContent = person.familyRole;
      li.append(emoji, name, role);
      // pointerdown (not click) so the choice lands before the input's blur closes the list.
      li.addEventListener('pointerdown', (e) => { e.preventDefault(); choose(person); });
      list.appendChild(li);
    });
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(-1);
    announce(results.length === 0 ? 'No matches.' : `${results.length} ${results.length === 1 ? 'match' : 'matches'}. Use up and down arrows to choose.`, { delay: 500 });
  }

  input.addEventListener('input', render);
  input.addEventListener('focus', () => { if (input.value.trim()) render(); });
  input.addEventListener('blur', close);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && results.length) {
      e.preventDefault();
      setActive((activeIndex + 1) % results.length);
    } else if (e.key === 'ArrowUp' && results.length) {
      e.preventDefault();
      setActive((activeIndex - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      const pick = results[activeIndex >= 0 ? activeIndex : 0];
      if (pick) { e.preventDefault(); choose(pick); }
    } else if (e.key === 'Escape') {
      if (input.value) { input.value = ''; render(); } else input.blur();
    }
  });

  on('dataReady', () => {
    const me = getPeople().find((p) => p.id === MY_STAR_ID);
    if (!me) return;
    myStarBtn.textContent = me.emoji ?? '⭐';
    myStarBtn.hidden = false;
  });
  myStarBtn.addEventListener('click', () => selectPerson(MY_STAR_ID));
}
