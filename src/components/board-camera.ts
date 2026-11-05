export function zoomViewBox(viewBox: string, zoom: number) {
  const [x, y, width, height] = viewBox.trim().split(/\s+/).map(Number);
  const visibleWidth = width / zoom;
  const visibleHeight = height / zoom;
  return `${x + (width - visibleWidth) / 2} ${y + (height - visibleHeight) / 2} ${visibleWidth} ${visibleHeight}`;
}
