// Pure data for the printable family sheet — no DOM, so tests/test-print-sheet.html can check it.
// `buildFamilySheet` turns people + events into a plain structure (tree, people list, postcards,
// moments); printSheet.js only draws it. Everything here is plain text: escaping is the
// renderer's job (it uses textContent), so a label like "<b>x</b>" passes through untouched.

import { resolveSenderName, formatPostcardDate } from '../postcards/postcardModel.js';
import { EVENT_COLORS, formatEventWhen } from '../timeline/eventModel.js';

export const SHEET_TITLE = 'The Family Galaxy';
export const SHEET_TAGLINE = 'Everyone who ever made us who we are';
export const SHEET_FOOTER = 'Kept safe among the stars';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "1941 – 2021" for someone who has passed, "b. 1991" for someone living, "d. 2021" when only the
// death is known, '' when neither is (never "null" or "NaN").
export function lifeText(person) {
  const birth = Number.isFinite(person.birth) ? person.birth : null;
  const death = Number.isFinite(person.death) ? person.death : null;
  if (birth !== null && death !== null) return `${birth} – ${death}`;
  if (birth !== null) return `b. ${birth}`;
  if (death !== null) return `d. ${death}`;
  return '';
}

// "07-14" -> "14 Jul". Anything that isn't a real month-day (Feb 29 allowed) -> ''.
export function birthdayText(birthday) {
  const match = /^(\d{2})-(\d{2})$/.exec(birthday ?? '');
  if (!match) return '';
  const month = Number(match[1]);
  const day = Number(match[2]);
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (!daysInMonth || day < 1 || day > daysInMonth) return '';
  return `${day} ${MONTH_SHORT[month - 1]}`;
}

// "18 Sep 2026" from a { year, month, day } date or a Date.
export function printedOnText(today = new Date()) {
  const date = today instanceof Date ? { year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() } : today;
  return `${date.day} ${MONTH_SHORT[date.month - 1]} ${date.year}`;
}

const byBirth = (a, b) => (a.birth ?? Infinity) - (b.birth ?? Infinity);

function brief(person) {
  return { id: person.id, name: person.name, familyRole: person.familyRole ?? '', life: lifeText(person) };
}

export function buildFamilySheet(people, events = [], { today = new Date() } = {}) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const placed = new Set();
  const place = (person) => { placed.add(person.id); return person; };

  // Married-in partners attach to the blood person they married (their `partnerOf`), or, failing
  // that, to whoever names them as partnerOf.
  const spousesOf = (person) => people.filter((other) =>
    other.id !== person.id && !other.isFounder && !placed.has(other.id)
    && (other.partnerOf === person.id || (person.partnerOf === other.id && other.role === 'spouse')));

  const childrenOf = (ids) => people
    .filter((other) => !other.isFounder && !placed.has(other.id) && other.role === 'blood'
      && (other.parents ?? []).some((parentId) => ids.includes(parentId)))
    .sort(byBirth);

  function nodeFor(person) {
    place(person);
    const spouses = spousesOf(person).sort(byBirth);
    spouses.forEach(place);
    const kids = childrenOf([person.id, ...spouses.map((s) => s.id)]).map(nodeFor);
    return { ...brief(person), spouses: spouses.map(brief), children: kids };
  }

  // Founding couples: founders grouped by mutual partnerOf (one couple = one black hole).
  const founders = people.filter((p) => p.isFounder);
  const couples = [];
  const grouped = new Set();
  founders.forEach((founder) => {
    if (grouped.has(founder.id)) return;
    const partner = founders.find((p) => p.id === founder.partnerOf && !grouped.has(p.id));
    const members = partner ? [founder, partner] : [founder];
    members.forEach((m) => { grouped.add(m.id); place(m); });
    couples.push(members);
  });

  const branches = couples.map((members) => {
    const ids = members.map((m) => m.id);
    return {
      founders: members.map(brief),
      names: members.map((m) => m.name).join(' & '),
      children: childrenOf(ids).map(nodeFor),
    };
  });

  // Anyone the tree above did not reach (a missing parent link, say) still belongs on the page.
  const others = people.filter((p) => !placed.has(p.id)).sort(byBirth).map(brief);

  const list = people
    .map((p) => ({
      id: p.id,
      name: p.name,
      familyRole: p.familyRole ?? '',
      life: lifeText(p),
      birthday: birthdayText(p.birthday),
      generation: p.generation ?? 0,
      birth: p.birth ?? null,
    }))
    .sort((a, b) => (a.generation - b.generation) || byBirth(a, b) || a.name.localeCompare(b.name));

  // Newest first, like the corkboard; undated postcards last.
  const postcards = people
    .flatMap((person) => (person.postcards ?? []).map((postcard) => ({
      to: person.name,
      from: resolveSenderName(postcard.from, people),
      iso: postcard.date ?? '',
      note: postcard.note ?? '',
    })))
    .sort((a, b) => b.iso.localeCompare(a.iso))
    .map(({ iso, ...rest }) => ({ ...rest, date: formatPostcardDate(iso) }));

  const sideLabel = (color) => EVENT_COLORS.find((c) => c.value === color)?.label ?? '';
  const moments = [...events]
    .sort((a, b) => (a.year - b.year) || ((a.month ?? 0) - (b.month ?? 0)) || ((a.day ?? 0) - (b.day ?? 0)))
    .map((event) => ({
      when: formatEventWhen(event),
      label: event.label ?? '',
      side: sideLabel(event.color),
      who: (event.personId && byId.get(event.personId)?.name) || '',
    }));

  return {
    title: SHEET_TITLE,
    tagline: SHEET_TAGLINE,
    printedOn: printedOnText(today),
    count: people.length,
    branches,
    others,
    people: list,
    postcards,
    moments,
    footer: SHEET_FOOTER,
  };
}
