// Decorative dashed orbit rings. Two visual kinds, matching the mockup: lineage orbits (warm
// gold, wider dash) around a parent, and marriage orbits (cool blue-white, tighter dash) around
// a blood star. Never intercepts input — purely decorative.

const RING_STYLES = {
  lineage: { color: 'rgba(255,216,155,0.2)', dash: [4, 6] },
  marriage: { color: 'rgba(180,200,255,0.22)', dash: [3, 5] },
};

export function drawOrbitRing(ctx, cx, cy, radius, kind, opacity = 1) {
  if (opacity <= 0) return;
  const style = RING_STYLES[kind];
  if (!style) return;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.setLineDash(style.dash);
  ctx.strokeStyle = style.color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
