export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// A stable (not cryptographic) string hash, used wherever a person needs a deterministic but
// varied per-id value — a spouse's planet hue, a star's twinkle phase/period — without adding
// extra fields to the data schema. Salt lets the same id produce independent-looking values for
// different purposes (e.g. twinkle period vs. twinkle phase) without them being correlated.
//
// FNV-1a, not a simple polynomial rolling hash: short similar-length ids that differ only in
// their last couple characters (e.g. "mom" vs "dad") produced near-identical output under
// `hash*31+c`, which defeats the whole point (two stars twinkling in visible sync). FNV-1a's
// multiply-then-mix-in-next-byte order avalanches much better for short strings.
function hashString(str, salt = '') {
  const input = salt + str;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// Deterministic string -> [0, 360) hash, used to give each spouse "planet" a stable but
// varied hue (matching the mockup's mix of muted planet colors) without adding a color field
// to the data schema.
export function hashStringToHue(str) {
  return hashString(str) % 360;
}

// Deterministic string -> [0, 1) in [min, max) — general-purpose version of hashStringToHue.
export function hashStringToRange(str, min, max, salt = '') {
  const unit = hashString(str, salt) / 0xffffffff;
  return min + unit * (max - min);
}

// Extracts just the hue angle [0, 360) from a "#rrggbb" hex color — used so a spouse with an
// explicit `color` in family.json still renders through the exact same saturation/lightness
// recipe as the hash-derived fallback (see planetRenderer.js); only the hue source differs.
export function hexToHue(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  let hue;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue *= 60;
  return hue < 0 ? hue + 360 : hue;
}
