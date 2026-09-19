// Pure "family at a glance" numbers for the stats card — no DOM, no state, no clock (today is
// passed in), so tests/test-stats.html can check them directly. Everything is computed honestly
// from the data: an unknown birth/death (null) never turns into NaN, it just drops that stat.

import { isPersonPresent } from '../timeline/timelineFilter.js';

const isYear = (value) => Number.isFinite(value);
const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);

// Age of `person` in `year`, or null when the birth year is unknown or still ahead of `year`.
export function ageInYear(person, year) {
  if (!isYear(person.birth) || year < person.birth) return null;
  return year - person.birth;
}

/**
 * @param {Array} people   normalized people (birth/death/role/generation/postcards)
 * @param {Array} events   timeline events ({ year, ... })
 * @param {number} year    the year the playhead is on
 * @param {{ currentYear?: number }} [options]
 * @returns {{
 *   year, total, presentCount, averageAge, blood, marriedIn,
 *   generations: { count, rows: {generation, total, present}[] },
 *   span: { from, to, years } | null,
 *   eldest: { name, age } | null, youngest: { name, age } | null,
 *   postcards: { total, top: { name, count, tied } | null },
 *   moments: { total, from, to } | null,
 * }}
 */
export function familyStats(people, events, year, { currentYear = new Date().getFullYear() } = {}) {
  const present = people.filter((p) => isPersonPresent(p, year));

  // Ages of everyone in the sky whose birth we know (people with an unknown birth are "always
  // there" per isPersonPresent, but can't be aged).
  const aged = present
    .map((person) => ({ person, age: ageInYear(person, year) }))
    .filter((entry) => entry.age !== null);
  const averageAge = aged.length ? Math.round(aged.reduce((sum, entry) => sum + entry.age, 0) / aged.length) : null;
  // Ties keep the first person in the list, so the answer never flickers between equals.
  const eldest = aged.reduce((best, entry) => (!best || entry.age > best.age ? entry : best), null);
  const youngest = aged.reduce((best, entry) => (!best || entry.age < best.age ? entry : best), null);

  const generationValues = [...new Set(people.map((p) => p.generation).filter(isYear))].sort((a, b) => a - b);
  const rows = generationValues.map((generation) => {
    const members = people.filter((p) => p.generation === generation);
    return { generation, total: members.length, present: members.filter((p) => isPersonPresent(p, year)).length };
  });

  const births = people.map((p) => p.birth).filter(isYear);
  const allYears = [...births, ...people.map((p) => p.death).filter(isYear), ...events.map((e) => e.year).filter(isYear)];
  const span = births.length
    ? { from: Math.min(...births), to: Math.max(currentYear, ...allYears), years: 0 }
    : null;
  if (span) span.years = span.to - span.from;

  const postcardTotal = people.reduce((sum, p) => sum + (p.postcards?.length ?? 0), 0);
  const topCount = people.reduce((max, p) => Math.max(max, p.postcards?.length ?? 0), 0);
  const topPeople = topCount > 0 ? people.filter((p) => (p.postcards?.length ?? 0) === topCount) : [];

  const eventYears = events.map((e) => e.year).filter(isYear);

  return {
    year,
    total: people.length,
    presentCount: present.length,
    averageAge,
    blood: people.filter((p) => p.role === 'blood').length,
    marriedIn: people.filter((p) => p.role === 'spouse').length,
    generations: { count: generationValues.length, rows },
    span,
    eldest: eldest && { name: eldest.person.name, age: eldest.age },
    youngest: youngest && { name: youngest.person.name, age: youngest.age },
    postcards: {
      total: postcardTotal,
      top: topPeople.length ? { name: topPeople[0].name, count: topCount, tied: topPeople.length > 1 } : null,
    },
    moments: events.length
      ? { total: events.length, from: eventYears.length ? Math.min(...eventYears) : null, to: eventYears.length ? Math.max(...eventYears) : null }
      : null,
  };
}

// The words on the card: [{ key, label, value, note }]. A stat with nothing honest to say is
// left out rather than shown as "—". `value` is what gets the big Fraunces numeral.
export function describeStats(stats) {
  const items = [];

  const sky = { key: 'sky', label: `In the sky in ${stats.year}`, value: String(stats.presentCount), note: '' };
  if (stats.presentCount === 0) sky.note = 'The sky is still quiet';
  else {
    sky.note = `of ${stats.total} family members`;
    if (stats.averageAge !== null) sky.note += ` · average age ${stats.averageAge}`;
  }
  items.push(sky);

  if (stats.generations.count > 0) {
    items.push({
      key: 'generations',
      label: plural(stats.generations.count, 'Generation'),
      value: String(stats.generations.count),
      note: stats.generations.count > 1 ? 'from the founders to the youngest' : 'the founders',
    });
  }

  if (stats.total > 0) {
    items.push({
      key: 'blood',
      label: 'By blood',
      value: String(stats.blood),
      note: `${stats.marriedIn} married in`,
    });
  }

  if (stats.span && stats.span.years > 0) {
    items.push({
      key: 'span',
      label: 'Years of family',
      value: String(stats.span.years),
      note: `${stats.span.from} – ${stats.span.to}`,
    });
  }

  if (stats.eldest) {
    items.push({ key: 'eldest', label: 'Eldest in the sky', value: String(stats.eldest.age), note: `${plural(stats.eldest.age, 'year')} old \u00b7 ${stats.eldest.name}` });
  }
  if (stats.youngest && stats.eldest && stats.youngest.name !== stats.eldest.name) {
    items.push({ key: 'youngest', label: 'Youngest in the sky', value: String(stats.youngest.age), note: `${plural(stats.youngest.age, 'year')} old \u00b7 ${stats.youngest.name}` });
  }

  const cards = stats.postcards;
  items.push({
    key: 'postcards',
    label: plural(cards.total, 'Postcard'),
    value: String(cards.total),
    note: cards.top
      ? (cards.top.tied ? `${cards.top.count} each for the most-written-to` : `${cards.top.name} has the most (${cards.top.count})`)
      : 'none yet — write one?',
  });

  if (stats.moments) {
    const { total, from, to } = stats.moments;
    items.push({
      key: 'moments',
      label: `${plural(total, 'Moment')} on the timeline`,
      value: String(total),
      note: from !== null ? (from === to ? String(from) : `${from} – ${to}`) : '',
    });
  }

  return items;
}
