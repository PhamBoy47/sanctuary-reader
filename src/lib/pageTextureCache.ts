import { toCanvas } from "html-to-image";

export async function captureArea(
  host: HTMLElement,
  x: number,
  y: number,
  w: number,
  h: number,
): Promise<HTMLCanvasElement | null> {
  if (w <= 0 || h <= 0) return null;
  try {
    return await toCanvas(host, {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(w),
      height: Math.round(h),
      pixelRatio: 1,
      includeShadowDom: true,
      skipAutoScale: true,
    });
  } catch {
    const c = document.createElement("canvas");
    c.width = Math.round(w);
    c.height = Math.round(h);
    const ctx = c.getContext("2d");
    if (ctx) {
      const g = ctx.createLinearGradient(0, 0, w * 0.3, h);
      g.addColorStop(0, "hsl(40,28%,94%)");
      g.addColorStop(0.45, "hsl(40,22%,89%)");
      g.addColorStop(1, "hsl(40,18%,84%)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    return c;
  }
}
