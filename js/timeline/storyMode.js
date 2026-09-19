// "Story mode": the playhead drifts slowly through the family's years by itself, lingering on each
// event so its caption can be read — the sky ages while you watch. This file is only the
// schedule (pure, no DOM/clock), so tests/test-story.html can check it; timelineRibbon.js owns
// the button and drives the playhead from it.
//
// New motion, not in the design mockup: like the orbital drift, treat the two timings below as
// tunable to taste rather than locked design-system values.

export const STORY_MS_PER_YEAR = 260; // ~23s to cross the 88 years of the reference family
export const STORY_DWELL_MS = 2600; // how long the playhead rests on an event year

// Builds the schedule from `startYear` to `endYear`, pausing at every event year in between.
// `eventYears` may be unsorted / duplicated / out of range. With `jump` (reduced motion) the
// years don't glide: the playhead hops from event to event and rests on each, which is the
// "collapse to a calm cross-fade" reading of the reduced-motion rule.
//
// Returns { segments, totalMs }; each segment is
//   { kind: 'travel'|'rest', fromYear, toYear, startMs, endMs }
export function buildStoryPlan({ startYear, endYear, eventYears = [], jump = false }) {
  const stops = [...new Set(eventYears)]
    .filter((y) => Number.isFinite(y) && y > startYear && y < endYear)
    .sort((a, b) => a - b);
  stops.push(endYear); // the story always arrives at the end year

  const segments = [];
  let clock = 0;
  let here = startYear;
  stops.forEach((stop) => {
    const isEnd = stop === endYear;
    if (!jump) {
      const travelMs = (stop - here) * STORY_MS_PER_YEAR;
      if (travelMs > 0) {
        segments.push({ kind: 'travel', fromYear: here, toYear: stop, startMs: clock, endMs: clock + travelMs });
        clock += travelMs;
      }
    }
    // Gliding, the end year needs no rest (the story is simply over); hopping, every stop rests.
    if (jump || !isEnd) {
      segments.push({ kind: 'rest', fromYear: stop, toYear: stop, startMs: clock, endMs: clock + STORY_DWELL_MS });
      clock += STORY_DWELL_MS;
    }
    here = stop;
  });
  return { segments, totalMs: clock };
}

// Where the story is `elapsedMs` after it began: { year, resting, done }. `resting` is true while
// the playhead sits on an event year (the caption should show). Years are whole numbers while
// resting, but fractional while travelling — the caller is expected to round for anything that
// only makes sense per whole year (the big year number, who's present) while using the raw value
// for anything that should glide smoothly (the playhead's on-screen position), rather than this
// function flooring it and forcing the playhead to visibly hop once per year.
export function storyStateAt(plan, elapsedMs) {
  const { segments, totalMs } = plan;
  if (segments.length === 0) return { year: null, resting: false, done: true };
  if (elapsedMs >= totalMs) {
    return { year: segments[segments.length - 1].toYear, resting: false, done: true };
  }
  const t = Math.max(0, elapsedMs);
  const segment = segments.find((s) => t < s.endMs) ?? segments[segments.length - 1];
  if (segment.kind === 'rest') return { year: segment.toYear, resting: true, done: false };
  const progress = (t - segment.startMs) / (segment.endMs - segment.startMs);
  const year = segment.fromYear + progress * (segment.toYear - segment.fromYear);
  return { year, resting: false, done: false };
}

// "Wedding" / "Wedding, Mom born" — the labels of every event in `year`, for the caption.
export function eventLabelsForYear(events, year) {
  return events.filter((e) => e.year === year).map((e) => e.label);
}
