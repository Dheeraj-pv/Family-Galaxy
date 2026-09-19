// The printable family sheet (CLAUDE.md, "Print a family sheet"): a keepsake on paper — the
// family tree as a warm outline, everyone at a glance, the postcards and the moments. The data
// comes from sheetModel.js (pure); this file draws it into the hidden #print-sheet mount and
// makes printing (the stats card's button, or Ctrl/Cmd+P from the browser menu) show that sheet
// instead of the dark app. css/print.css does the actual switching under @media print.
//
// Every string goes in through textContent, so a name or postcard note can never become markup.

import { getPeople, getEvents } from '../state.js';
import { buildFamilySheet } from './sheetModel.js';

const SHEET_DOCUMENT_TITLE = 'The Family Galaxy — family sheet';
const SVG_NS = 'http://www.w3.org/2000/svg';

let sheetEl = null;
let printing = false; // between prepare() and cleanup()
let savedTitle = '';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== '') node.textContent = text;
  return node;
}

// The app's own four-point star, drawn small in gold with a navy outline so it holds up on paper.
function starOrnament() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'print-sheet__star');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '26');
  svg.setAttribute('height', '26');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M12 1.5 14.3 9.7 22.5 12 14.3 14.3 12 22.5 9.7 14.3 1.5 12 9.7 9.7Z');
  svg.appendChild(path);
  return svg;
}

// One name + role + life, as inline spans ("Mom  Mother  b. 1966").
function personLine(person, className) {
  const line = el('span', className);
  line.appendChild(el('span', 'print-sheet__name', person.name));
  if (person.familyRole) line.appendChild(el('span', 'print-sheet__role', person.familyRole));
  if (person.life) line.appendChild(el('span', 'print-sheet__life', person.life));
  return line;
}

function treeNode(node) {
  const li = el('li', 'print-sheet__node');
  li.appendChild(personLine(node, 'print-sheet__person'));
  node.spouses.forEach((spouse) => {
    const partner = el('span', 'print-sheet__spouse');
    partner.appendChild(el('span', 'print-sheet__marry', '✦ married'));
    partner.appendChild(personLine(spouse, 'print-sheet__person'));
    li.appendChild(partner);
  });
  if (node.children.length > 0) {
    const list = el('ul', 'print-sheet__tree');
    node.children.forEach((child) => list.appendChild(treeNode(child)));
    li.appendChild(list);
  }
  return li;
}

function section(title, className) {
  const wrap = el('section', `print-sheet__section ${className}`);
  wrap.appendChild(el('h2', 'print-sheet__heading', title));
  return wrap;
}

// Draws `sheet` (from buildFamilySheet) into `container`, replacing what was there. Sections with
// nothing to show (no postcards, no moments) are left out rather than printed empty.
export function renderFamilySheet(container, sheet) {
  container.textContent = '';
  const page = el('article', 'print-sheet__page');
  page.setAttribute('aria-label', `${sheet.title} — family sheet`);

  const header = el('header', 'print-sheet__header');
  header.appendChild(starOrnament());
  header.appendChild(el('h1', 'print-sheet__title', sheet.title));
  header.appendChild(el('p', 'print-sheet__tagline', sheet.tagline));
  header.appendChild(el('p', 'print-sheet__printed small-caps', `${sheet.count} people · printed ${sheet.printedOn}`));
  page.appendChild(header);

  if (sheet.branches.length > 0 || sheet.others.length > 0) {
    const tree = section('Our family tree', 'print-sheet__section--tree');
    sheet.branches.forEach((branch) => {
      const head = el('div', 'print-sheet__founders');
      head.appendChild(el('p', 'print-sheet__founder-names', branch.names));
      const lives = el('p', 'print-sheet__founder-lives');
      branch.founders.forEach((founder) => {
        if (founder.life) lives.appendChild(el('span', 'print-sheet__life', `${founder.name} ${founder.life}`));
      });
      if (lives.childNodes.length > 0) head.appendChild(lives);
      tree.appendChild(head);
      if (branch.children.length > 0) {
        const list = el('ul', 'print-sheet__tree print-sheet__tree--root');
        branch.children.forEach((child) => list.appendChild(treeNode(child)));
        tree.appendChild(list);
      }
    });
    if (sheet.others.length > 0) {
      tree.appendChild(el('p', 'print-sheet__also', 'Also among the stars'));
      const list = el('ul', 'print-sheet__tree print-sheet__tree--root');
      sheet.others.forEach((other) => {
        const li = el('li', 'print-sheet__node');
        li.appendChild(personLine(other, 'print-sheet__person'));
        list.appendChild(li);
      });
      tree.appendChild(list);
    }
    page.appendChild(tree);
  }

  if (sheet.people.length > 0) {
    const everyone = section('Everyone at a glance', 'print-sheet__section--people');
    const table = el('table', 'print-sheet__table');
    table.appendChild(el('caption', 'visually-hidden', 'Everyone in the family, by generation'));
    const head = el('thead');
    const headRow = el('tr');
    ['Name', 'Who', 'Years', 'Birthday'].forEach((label) => {
      const th = el('th', 'small-caps', label);
      th.scope = 'col';
      headRow.appendChild(th);
    });
    head.appendChild(headRow);
    table.appendChild(head);
    const body = el('tbody');
    sheet.people.forEach((person) => {
      const row = el('tr');
      const name = el('th', 'print-sheet__name', person.name);
      name.scope = 'row';
      row.append(name, el('td', '', person.familyRole), el('td', '', person.life), el('td', '', person.birthday));
      body.appendChild(row);
    });
    table.appendChild(body);
    everyone.appendChild(table);
    page.appendChild(everyone);
  }

  if (sheet.postcards.length > 0) {
    const cards = section('Postcards along the way', 'print-sheet__section--postcards');
    const list = el('ul', 'print-sheet__postcards');
    sheet.postcards.forEach((postcard) => {
      const li = el('li', 'print-sheet__postcard');
      li.appendChild(el('blockquote', 'print-sheet__note', postcard.note));
      const cite = [`To ${postcard.to}`, `from ${postcard.from}`, postcard.date].filter(Boolean).join(' · ');
      li.appendChild(el('p', 'print-sheet__cite small-caps', cite));
      list.appendChild(li);
    });
    cards.appendChild(list);
    page.appendChild(cards);
  }

  if (sheet.moments.length > 0) {
    const moments = section('Moments we kept', 'print-sheet__section--moments');
    const list = el('ol', 'print-sheet__moments');
    sheet.moments.forEach((moment) => {
      const li = el('li', 'print-sheet__moment');
      li.appendChild(el('span', 'print-sheet__when', moment.when));
      li.appendChild(el('span', 'print-sheet__what', moment.label));
      const note = [moment.who, moment.side].filter(Boolean).join(' · ');
      if (note) li.appendChild(el('span', 'print-sheet__moment-note', note));
      list.appendChild(li);
    });
    moments.appendChild(list);
    page.appendChild(moments);
  }

  page.appendChild(el('footer', 'print-sheet__footer', `${sheet.footer} ✦`));
  container.appendChild(page);
}

// Fills #print-sheet from the live data and reveals it for the printer. Safe to call twice (both
// printFamilySheet() and the browser's own beforeprint event lead here): it simply redraws, and
// only remembers the page title the first time.
function prepare() {
  if (!sheetEl) return;
  renderFamilySheet(sheetEl, buildFamilySheet(getPeople(), getEvents(), { today: new Date() }));
  sheetEl.hidden = false;
  sheetEl.removeAttribute('aria-hidden');
  if (!printing) savedTitle = document.title;
  printing = true;
  document.title = SHEET_DOCUMENT_TITLE; // becomes the suggested PDF file name
}

// Puts everything back: the sheet is invisible to layout and to screen readers again.
function cleanup() {
  if (!sheetEl || !printing) return;
  printing = false;
  sheetEl.hidden = true;
  sheetEl.setAttribute('aria-hidden', 'true');
  sheetEl.textContent = '';
  document.title = savedTitle;
}

export function initPrintSheet() {
  sheetEl = document.getElementById('print-sheet');
  if (!sheetEl) return;
  sheetEl.setAttribute('aria-hidden', 'true');
  window.addEventListener('beforeprint', prepare);
  window.addEventListener('afterprint', cleanup);
  // Safari fires these unreliably; the print media query is the backup signal.
  const media = window.matchMedia?.('print');
  media?.addEventListener?.('change', (e) => (e.matches ? prepare() : cleanup()));
}

// The stats card's "Print a family sheet": build the sheet, then hand over to the print dialog.
// Cleanup is left to `afterprint` on purpose: in browsers where print() returns straight away,
// clearing the sheet here would print a blank page. If afterprint never fires the sheet just
// stays in place, invisible (css/print.css hides it on screen) until the next print redraws it.
export function printFamilySheet() {
  if (!sheetEl) return;
  prepare();
  window.print();
}
