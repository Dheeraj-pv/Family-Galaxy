// Client-side image prep for uploads (postcard photos, Then & Now photos): resize/compress a
// picked file before it ever leaves the browser, so a phone photo doesn't eat the free Storage
// quota or slow the sky down. The dimension maths is pure (tests/test-image-upload.html); the
// actual resize needs a canvas, so it only runs in a browser.

export const MAX_DIMENSION_PX = 1600; // long edge, generous for a Then & Now slider or postcard front
export const JPEG_QUALITY = 0.82;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB — a phone photo before resizing; rejected outright above this
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

// Longest edge capped to `max`; the other edge scales to match. Never upscales a smaller image.
export function computeResizedDimensions(width, height, max = MAX_DIMENSION_PX) {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const longest = Math.max(width, height);
  if (longest <= max) return { width: Math.round(width), height: Math.round(height) };
  const scale = max / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// A plain, human `{ ok, reason }` check before touching the network at all.
export function validateImageFile(file, { maxBytes = MAX_UPLOAD_BYTES, allowedTypes = ALLOWED_TYPES } = {}) {
  if (!file) return { ok: false, reason: 'Choose a photo first.' };
  if (!allowedTypes.includes(file.type)) return { ok: false, reason: 'That file doesn’t look like a photo (JPEG, PNG, WEBP or HEIC only).' };
  if (file.size > maxBytes) return { ok: false, reason: 'That photo is too large — try one under 8MB.' };
  return { ok: true, reason: null };
}

// Resizes/re-compresses an image File/Blob to a JPEG under MAX_DIMENSION_PX on its long edge.
// Browser-only (canvas + createImageBitmap); returns { blob, width, height }.
export async function resizeImageFile(file, { maxDimension = MAX_DIMENSION_PX, quality = JPEG_QUALITY } = {}) {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = computeResizedDimensions(bitmap.width, bitmap.height, maxDimension);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process that photo.'))), 'image/jpeg', quality);
    });
    return { blob, width, height };
  } finally {
    bitmap.close?.();
  }
}
