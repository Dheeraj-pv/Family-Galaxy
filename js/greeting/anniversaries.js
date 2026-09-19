// Pure logic for the anniversary greeting: which birthdays and dated events fall in the next few
// days, and the warm one-line sentence for each. No DOM, clock or storage — `today` is passed in —
// so tests/test-anniversaries.html can check it (leap days, year wrap, remembrance wording).
//
// Data it reads (both optional; see CLAUDE.md "Data shape"):
//   person.birthday = "MM-DD"  (the year comes from person.birth; a missing year just drops the age)
//   event.month / event.day    (numbers; events with only a year have nothing to celebrate)

export const DEFAULT_WINDOW_DAYS = 7;

// A calendar date with no time or timezone: { year, month (1-12), day }.
export function parseIsoDate(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text ?? '');
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  return isValidDate(year, month, day) ? { year, month, day } : null;
}

export function civilFromDate(date) {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

export function toIso({ year, month, day }) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isLeap(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year, month) {
  return [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function isValidDate(year, month, day) {
  return Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day)
    && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function dayNumber({ year, month, day }) {
  return Math.round(Date.UTC(year, month - 1, day) / 86400000);
}

// "MM-DD" -> { month, day } or null when malformed / impossible (Feb 29 is allowed: it is a real
// birthday, just not one every year has).
export function parseBirthday(text) {
  const match = /^(\d{2})-(\d{2})$/.exec(text ?? '');
  if (!match) return null;
  const [month, day] = match.slice(1).map(Number);
  return isValidDate(2000, month, day) ? { month, day } : null; // 2000 is a leap year
}

// The next time (today or later) that month/day comes round: { date, daysAway }. A Feb 29 date is
// kept on Feb 28 in years without one, so a leap-day birthday is never silently skipped.
export function nextOccurrence(month, day, today) {
  for (let year = today.year; year <= today.year + 1; year += 1) {
    const dayThatYear = month === 2 && day === 29 && !isLeap(year) ? 28 : day;
    const date = { year, month, day: dayThatYear };
    const daysAway = dayNumber(date) - dayNumber(today);
    if (daysAway >= 0) return { date, daysAway };
  }
  return null; // unreachable for valid input
}

function whenPhrase(daysAway) {
  if (daysAway === 0) return 'today';
  if (daysAway === 1) return 'tomorrow';
  return `in ${daysAway} days`;
}

const possessive = (name) => `${name}'s`;

function birthdayText({ name, isSelf, daysAway, remembering, age }) {
  const suffix = age == null ? '' : remembering ? ` · would have turned ${age}` : ` · turning ${age}`;
  if (remembering) {
    return daysAway === 0
      ? `Today we remember ${name}${suffix}`
      : `${possessive(name)} birthday is ${whenPhrase(daysAway)}${suffix}`;
  }
  if (isSelf) return daysAway === 0 ? `Today is your birthday${suffix}` : `Your birthday is ${whenPhrase(daysAway)}${suffix}`;
  return daysAway === 0 ? `Today is ${possessive(name)} birthday${suffix}` : `${possessive(name)} birthday is ${whenPhrase(daysAway)}${suffix}`;
}

// "Wedding" -> "Wedding anniversary"; anything else -> Anniversary of “Married Dad”.
function eventTitle(label) {
  const trimmed = (label ?? '').trim() || 'a family moment';
  if (/anniversary/i.test(trimmed)) return trimmed;
  if (/wedding/i.test(trimmed)) return `${trimmed} anniversary`;
  return `Anniversary of “${trimmed}”`;
}

function eventText({ label, daysAway, years }) {
  const suffix = years == null ? '' : ` · ${years} ${years === 1 ? 'year' : 'years'}`;
  return `${eventTitle(label)} is ${whenPhrase(daysAway)}${suffix}`;
}

/**
 * Celebrations from `today` through the next `windowDays` days, soonest first (birthdays before
 * events on the same day, then by name/label).
 *
 * @param {object[]} people  normalized people ({ id, name, birth, death, birthday })
 * @param {object[]} events  normalized events ({ year, month, day, personId, label })
 * @param {{year:number, month:number, day:number}|string|Date} today
 * @param {{ windowDays?: number, selfId?: string }} [options]  selfId (default "me") is greeted as "your"
 * @returns {{ kind: 'birthday'|'event', personId: string|null, label: string, daysAway: number,
 *             age?: number, years?: number, remembering: boolean, icon: string, text: string }[]}
 */
export function upcomingCelebrations(people, events, today, { windowDays = DEFAULT_WINDOW_DAYS, selfId = 'me' } = {}) {
  const now = normalizeToday(today);
  if (!now) return [];
  const items = [];
  const birthdaysSeen = new Set(); // `${personId}:${month}-${day}`, to drop "X born" events that echo them

  people.forEach((person) => {
    const birthday = parseBirthday(person.birthday);
    if (!birthday) return;
    const next = nextOccurrence(birthday.month, birthday.day, now);
    if (!next || next.daysAway > windowDays) return;
    const year = next.date.year;
    const age = Number.isFinite(person.birth) ? year - person.birth : null;
    if (age !== null && age <= 0) return; // not born yet (or born this very year): nothing to celebrate
    const remembering = Number.isFinite(person.death) && person.death < year;
    const isSelf = person.id === selfId;
    birthdaysSeen.add(`${person.id}:${birthday.month}-${birthday.day}`);
    const fields = { name: person.name, isSelf, daysAway: next.daysAway, remembering, age };
    items.push({
      kind: 'birthday',
      personId: person.id,
      label: remembering ? `Remembering ${person.name}` : isSelf ? 'Your birthday' : `${possessive(person.name)} birthday`,
      daysAway: next.daysAway,
      ...(age !== null ? { age } : {}),
      remembering,
      icon: remembering ? '\u{1F56F}️' : '\u{1F382}',
      text: birthdayText(fields),
      sortName: person.name,
    });
  });

  events.forEach((event) => {
    if (!Number.isInteger(event.month) || !Number.isInteger(event.day)) return; // year-only: nothing to celebrate
    if (!isValidDate(2000, event.month, event.day)) return;
    if (event.personId && birthdaysSeen.has(`${event.personId}:${event.month}-${event.day}`)) return;
    const next = nextOccurrence(event.month, event.day, now);
    if (!next || next.daysAway > windowDays) return;
    let years = null;
    if (Number.isFinite(event.year)) {
      years = next.date.year - event.year;
      if (years <= 0) return; // hasn't happened yet, or is happening this very year — not an anniversary
    }
    items.push({
      kind: 'event',
      personId: event.personId ?? null,
      label: eventTitle(event.label),
      daysAway: next.daysAway,
      ...(years !== null ? { years } : {}),
      remembering: false,
      icon: '✨',
      text: eventText({ label: event.label, daysAway: next.daysAway, years }),
      sortName: event.label ?? '',
    });
  });

  items.sort((a, b) => a.daysAway - b.daysAway
    || (a.kind === b.kind ? 0 : a.kind === 'birthday' ? -1 : 1)
    || a.sortName.localeCompare(b.sortName));
  return items.map(({ sortName, ...item }) => item);
}

function normalizeToday(today) {
  if (today instanceof Date) return civilFromDate(today);
  if (typeof today === 'string') return parseIsoDate(today);
  if (today && isValidDate(today.year, today.month, today.day)) return today;
  return null;
}

// "…and 2 more" (or "…and 1 more") for the button that expands the rest of the list.
export function moreLabel(count) {
  return `and ${count} more`;
}
