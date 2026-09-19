// Soft, decorative backdrop for one cluster in the family map view (js/starmap/familyMapLayout.js).
// Not a real map shape — a gentle radial wash plus a faint dashed boundary, the same visual
// register as the sky's own decorative elements (orbit rings, the nebula atmosphere), with the
// region's name lettered across the top in the same italic display face used for names elsewhere.

export function drawRegionBlob(ctx, blob) {
  const { x, y, radius, region } = blob;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter'; // light adding to light, like the nebula wash — never muddies the bodies drawn on top
  const wash = ctx.createRadialGradient(x, y, 0, x, y, radius);
  wash.addColorStop(0, 'rgba(255, 216, 155, 0.10)');
  wash.addColorStop(0.7, 'rgba(255, 216, 155, 0.05)');
  wash.addColorStop(1, 'rgba(255, 216, 155, 0)');
  ctx.fillStyle = wash;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.setLineDash([2, 10]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 216, 155, 0.4)';
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.font = 'italic 500 15px "Fraunces", Georgia, serif';
  ctx.fillStyle = 'rgba(255, 248, 231, 0.8)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(region, x, y - radius - 10);
  ctx.restore();
}
