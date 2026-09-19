// Background starfield parallax (brief: "background starfield drifts at a slower rate than
// foreground stars"). The starfield is a static CSS layer behind the canvas; it follows the
// camera's pan at a fraction of its speed, which reads as distance. Pure, so it can be tested.
// Frozen under reduced motion (CLAUDE.md: reduced motion disables parallax).

export const STARFIELD_PARALLAX = 0.25; // 1 = moves with the stars, 0 = fixed to the screen

export function starfieldOffset(pan, reducedMotion, factor = STARFIELD_PARALLAX) {
  if (reducedMotion) return { x: 0, y: 0 };
  return { x: pan.x * factor, y: pan.y * factor };
}
