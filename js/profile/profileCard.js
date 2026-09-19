// Profile Card: slides up over the star map when a star/planet is selected (see CLAUDE.md
// "The four features and how they interlock" — this is feature #2). Build-order step 9 is the
// shell only: open/close, focus management, and three tabs (Memories/Postcards/Timeline) with
// placeholder panels. The real then&now slider, corkboard, and per-person timeline get slotted
// into their matching #profile-panel-* element in their own later build-order steps (10-12)
// instead of this file being rewritten.

import { getPeople, getReducedMotion } from '../state.js';
import { on, emit } from '../utils/events.js';
import { releaseFollow } from '../starmap/starMapRender.js';
import { STAR_SELECT_RIPPLE_MS } from '../starmap/selectRipple.js';
import { openThenNowSlider } from './thenNowSlider.js';
import { renderCorkboard } from '../postcards/corkboard.js';
import { openAddPostcard, openEditPostcard } from '../postcards/addPostcard.js';
import { deletePostcard } from '../postcards/postcardActions.js';
import { initRelationshipPicker, setRelationshipSubjects } from '../relationship/relationshipPicker.js';
import { getCloudPhotoFor } from '../data/cloudSync.js';

const TABS = [
  { id: 'memories', label: 'Memories' },
  { id: 'postcards', label: 'Postcards' },
  { id: 'timeline', label: 'Timeline' },
];

const PANEL_PLACEHOLDER = {
  memories: '',
  postcards: '',
  timeline: 'A personal timeline is coming soon.',
};

let cardEl = null;
let activeTab = TABS[0].id;
let lastFocusedEl = null;
let closeTimer = null;
let openTimer = null;
let currentPerson = null;
let currentSubjects = [];

export function initProfileCard(rootEl) {
  cardEl = rootEl;
  cardEl.hidden = true;
  cardEl.setAttribute('role', 'dialog');
  cardEl.setAttribute('aria-modal', 'false');
  cardEl.setAttribute('aria-hidden', 'true');
  // Named by the person's heading; tabindex -1 lets us land focus on the dialog itself so a
  // screen reader announces "<name>, dialog" first, then Tab reaches the controls in order.
  cardEl.setAttribute('aria-labelledby', 'profile-card-name');
  cardEl.tabIndex = -1;
  cardEl.innerHTML = buildShellMarkup();
  initRelationshipPicker(cardEl.querySelector('#relationship-picker'));

  cardEl.querySelector('.profile-card__close').addEventListener('click', closeProfileCard);
  cardEl.addEventListener('keydown', onKeydown);
  // Non-modal dialog: Escape should close it even if focus has wandered back to the page. The
  // search box keeps its own Escape (clear / blur), and the modals stop propagation themselves.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || cardEl.hidden || !cardEl.classList.contains('is-open')) return;
    if (e.target.closest?.('#star-search')) return;
    closeProfileCard();
  });
  cardEl.querySelectorAll('.profile-card__tab').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => setActiveTab(tabBtn.dataset.tabId));
  });

  on('starSelected', ({ detail }) => openProfileCard(detail.personId));
  on('postcardAdded', ({ detail }) => refreshPostcards([detail.personId]));
  on('postcardEdited', ({ detail }) => refreshPostcards([detail.personId, detail.fromPersonId], detail.postcard.id));
  on('postcardDeleted', ({ detail }) => refreshPostcards([detail.personId]));
}

// Re-draws the corkboard after a postcard was added/edited/deleted (only if it concerns whoever
// is on screen). Re-rendering destroys the buttons that had focus, so put keyboard focus back
// somewhere sensible: the edited postcard's own Edit button if it's still here, else "+ Add".
function refreshPostcards(affectedPersonIds, focusPostcardId = null) {
  if (!currentSubjects.some((p) => affectedPersonIds.includes(p.id))) return;
  const panel = cardEl.querySelector('#profile-panel-postcards');
  const hadFocus = panel.contains(document.activeElement);
  renderPostcards();
  if (hadFocus) {
    const own = focusPostcardId && panel.querySelector(`[data-postcard-id="${focusPostcardId}"] .postcard-action--edit`);
    (own || panel.querySelector('.corkboard__add'))?.focus();
  }
  syncPanelFocusability();
}

function buildShellMarkup() {
  return `
    <button type="button" class="profile-card__close" aria-label="Close profile card">&times;</button>
    <div class="profile-card__header">
      <div class="profile-card__avatar" aria-hidden="true"></div>
      <div class="profile-card__identity">
        <h2 class="profile-card__name" id="profile-card-name"></h2>
        <p class="profile-card__role small-caps"></p>
      </div>
    </div>
    <p class="profile-card__bio"></p>
    <div class="relationship" id="relationship-picker"></div>
    <div class="profile-card__tabs" role="tablist" aria-label="Profile sections">
      ${TABS.map((tab, i) => `
        <button type="button" class="profile-card__tab small-caps" role="tab"
          data-tab-id="${tab.id}" id="profile-tab-${tab.id}" aria-controls="profile-panel-${tab.id}"
          aria-selected="${i === 0}" tabindex="${i === 0 ? '0' : '-1'}">${tab.label}</button>
      `).join('')}
    </div>
    ${TABS.map((tab) => `
      <div class="profile-card__panel" role="tabpanel" id="profile-panel-${tab.id}"
        aria-labelledby="profile-tab-${tab.id}" ${tab.id === TABS[0].id ? '' : 'hidden'}>
        <p class="profile-card__placeholder">${PANEL_PLACEHOLDER[tab.id]}</p>
      </div>
    `).join('')}
  `;
}

// The founding couple is drawn as ONE black hole, so selecting it must cover both people —
// otherwise only the first founder would ever be reachable. Everyone else is a single subject.
function resolveSubjects(person) {
  if (!person.isFounder || !person.partnerOf) return [person];
  const partner = getPeople().find((p) => p.id === person.partnerOf);
  return partner && partner.partnerOf === person.id ? [person, partner] : [person];
}

function openProfileCard(personId) {
  const person = getPeople().find((p) => p.id === personId);
  if (!person) {
    console.warn(`[profileCard] starSelected referenced unknown person "${personId}"`);
    return;
  }
  clearTimeout(closeTimer);
  const subjects = resolveSubjects(person);
  const isCouple = subjects.length > 1;

  cardEl.querySelector('.profile-card__name').textContent = subjects.map((p) => p.name).join(' & ');
  cardEl.querySelector('.profile-card__role').textContent = isCouple
    ? 'The founding couple'
    : person.familyRole || (person.role === 'spouse' ? 'Spouse' : '');

  const bioEl = cardEl.querySelector('.profile-card__bio');
  const bio = subjects.map((p) => p.bio).filter(Boolean).join(' ');
  bioEl.textContent = bio;
  bioEl.hidden = !bio;

  const avatar = cardEl.querySelector('.profile-card__avatar');
  avatar.textContent = '';
  avatar.toggleAttribute('data-couple', isCouple);
  avatar.style.backgroundImage = !isCouple && person.photo ? `url("${person.photo}")` : '';
  if (isCouple || !person.photo) {
    avatar.textContent = subjects.map((p) => p.emoji).filter(Boolean).join('') || '⭐';
  }

  currentPerson = person;
  currentSubjects = subjects;
  setRelationshipSubjects(subjects);
  renderMemories(subjects);
  renderPostcards();
  setActiveTab(TABS[0].id);
  syncPanelFocusability();

  // Only remember an opener outside the card: re-selecting while open must not make the card its
  // own "return focus" target.
  if (!cardEl.contains(document.activeElement)) lastFocusedEl = document.activeElement;
  const alreadyOpen = cardEl.classList.contains('is-open');
  cardEl.hidden = false;
  cardEl.setAttribute('aria-hidden', 'false');
  // The card rises only after the 400ms star-select ripple has played (motion table); if it is
  // already showing (re-selecting another star) or motion is reduced, there is nothing to wait for.
  const riseDelayMs = alreadyOpen || getReducedMotion() ? 0 : STAR_SELECT_RIPPLE_MS;
  clearTimeout(openTimer);
  // Two rAFs: removing `hidden` and adding `.is-open` in the same frame would let the browser
  // coalesce both style changes and skip the transition entirely.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (cardEl.getAttribute('aria-hidden') === 'true') return; // closed before the rAFs ran
    openTimer = setTimeout(() => {
      cardEl.classList.add('is-open');
      cardEl.focus();
    }, riseDelayMs);
  }));

  emit('profileCardOpened', { personId });
}

function renderPostcards() {
  renderCorkboard(cardEl.querySelector('#profile-panel-postcards'), currentSubjects, {
    onAdd: () => openAddPostcard({ personId: currentPerson.id }),
    onEdit: (ownerId, postcard) => openEditPostcard(ownerId, postcard),
    onDelete: (ownerId, postcard) => deletePostcard(ownerId, postcard.id),
  });
}

// Memories tab: one button per memory. Only "thenNow" memories exist so far; each opens the
// slider modal. Built with DOM nodes + textContent (captions are user-authored data).
function renderMemories(subjects) {
  const panel = cardEl.querySelector('#profile-panel-memories');
  panel.textContent = '';
  const memories = subjects.flatMap((person) => person.memories.filter((m) => m.type === 'thenNow').map((m) => {
    // A real uploaded photo (see CLAUDE.md "Cloud sync") replaces the placeholder filename from
    // family.json for whichever side (then/now) has one; the other side keeps its placeholder.
    const cloud = getCloudPhotoFor(person.id);
    return {
      ...m,
      then: cloud?.then ?? m.then,
      now: cloud?.now ?? m.now,
      owner: person.name,
      personId: person.id,
    };
  }));
  if (memories.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'profile-card__placeholder';
    empty.textContent = 'No memories have been added for this star yet.';
    panel.appendChild(empty);
    return;
  }
  const list = document.createElement('ul');
  list.className = 'profile-card__memories';
  list.setAttribute('role', 'list'); // list-style:none drops list semantics in Safari/VoiceOver
  memories.forEach((memory) => {
    const item = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'profile-card__memory';
    const kind = document.createElement('span');
    kind.className = 'small-caps profile-card__memory-kind';
    kind.textContent = subjects.length > 1 ? `Then & Now \u00b7 ${memory.owner}` : 'Then & Now';
    const caption = document.createElement('span');
    caption.className = 'font-hand profile-card__memory-caption';
    caption.textContent = memory.caption || 'Open this memory';
    btn.append(kind, caption);
    btn.addEventListener('click', () => openThenNowSlider({ ...memory, title: memory.owner }));
    item.appendChild(btn);
    list.appendChild(item);
  });
  panel.appendChild(list);
}

export function closeProfileCard() {
  if (cardEl.hidden) return;
  clearTimeout(openTimer); // closed during the ripple: never open
  cardEl.classList.remove('is-open');
  cardEl.setAttribute('aria-hidden', 'true');
  releaseFollow(); // fly the camera back to its pre-follow framing, same as clicking empty map space

  const entranceMs = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--duration-card-entrance'),
  ) || 450;
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    cardEl.hidden = true;
  }, entranceMs);

  if (lastFocusedEl && document.contains(lastFocusedEl)) {
    lastFocusedEl.focus();
  }
  currentPerson = null;
  currentSubjects = [];
  emit('profileCardClosed', {});
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    closeProfileCard();
    return;
  }
  if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
  if (!e.target.classList.contains('profile-card__tab')) return;
  e.preventDefault();

  const ids = TABS.map((t) => t.id);
  const currentIndex = ids.indexOf(activeTab);
  let nextId;
  if (e.key === 'Home') nextId = ids[0];
  else if (e.key === 'End') nextId = ids[ids.length - 1];
  else nextId = ids[(currentIndex + (e.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length];
  setActiveTab(nextId);
  cardEl.querySelector(`#profile-tab-${nextId}`).focus();
}

function setActiveTab(tabId) {
  activeTab = tabId;
  TABS.forEach((tab) => {
    const isActive = tab.id === tabId;
    const tabBtn = cardEl.querySelector(`#profile-tab-${tab.id}`);
    tabBtn.setAttribute('aria-selected', String(isActive));
    tabBtn.tabIndex = isActive ? 0 : -1;
    cardEl.querySelector(`#profile-panel-${tab.id}`).hidden = !isActive;
  });
  syncPanelFocusability();
}

// ARIA tabs pattern: a tab panel with nothing focusable inside must itself be a tab stop, or
// keyboard users could never reach its text. Panels that do contain controls stay out of the order.
function syncPanelFocusability() {
  cardEl.querySelectorAll('.profile-card__panel').forEach((panel) => {
    if (panel.querySelector('button, a[href], input, select, textarea')) panel.removeAttribute('tabindex');
    else panel.tabIndex = 0;
  });
}
