/**
 * Convert a pointer on a letterboxed object-fit:contain video into
 * normalized physical-display coordinates. Reject clicks in black bars.
 */
export function normalizedVideoPoint(video, clientX, clientY) {
  const box = video.getBoundingClientRect();
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!(width > 0 && height > 0 && box.width > 0 && box.height > 0)) return null;
  const scale = Math.min(box.width / width, box.height / height);
  const contentWidth = width * scale;
  const contentHeight = height * scale;
  const left = box.left + (box.width - contentWidth) / 2;
  const top = box.top + (box.height - contentHeight) / 2;
  const x = (clientX - left) / contentWidth;
  const y = (clientY - top) / contentHeight;
  return Number.isFinite(x) && Number.isFinite(y) &&
    x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
}
