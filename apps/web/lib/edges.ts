// Best-effort receipt edge detection and perspective crop, in plain TypeScript so it runs offline
// on any phone browser (build plan section 4: no native document scanner on the web). The user can
// always drag the corners, so detection only has to give a good starting point.

export interface Point {
  x: number;
  y: number;
}

/** Corners in order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point];

export interface Pixels {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel (the layout of canvas ImageData). */
  data: Uint8ClampedArray;
}

export function toGray({ width, height, data }: Pixels): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = (data[p]! * 77 + data[p + 1]! * 150 + data[p + 2]! * 29) >> 8;
  }
  return gray;
}

/** Otsu's threshold: the grey level that best splits paper from background. */
export function otsu(gray: Uint8Array): number {
  const hist = new Array<number>(256).fill(0);
  for (const v of gray) hist[v]!++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i]!;
  let sumB = 0;
  let weightB = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    weightB += hist[t]!;
    if (weightB === 0) continue;
    const weightF = total - weightB;
    if (weightF === 0) break;
    sumB += t * hist[t]!;
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const between = weightB * weightF * (meanB - meanF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/**
 * Finds the largest bright region (the paper) and returns its four extreme corners, or null when
 * nothing plausible stands out (then the caller uses a default inset).
 */
export function detectDocument(gray: Uint8Array, width: number, height: number): Quad | null {
  const threshold = otsu(gray);
  const bright = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) bright[i] = gray[i]! > threshold ? 1 : 0;

  const label = new Int32Array(gray.length);
  const queue = new Int32Array(gray.length);
  let bestLabel = 0;
  let bestSize = 0;
  let next = 1;
  for (let start = 0; start < gray.length; start++) {
    if (!bright[start] || label[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    label[start] = next;
    while (head < tail) {
      const i = queue[head++]!;
      const x = i % width;
      const neighbours = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width];
      for (const n of neighbours) {
        if (n >= 0 && n < gray.length && bright[n] && !label[n]) {
          label[n] = next;
          queue[tail++] = n;
        }
      }
    }
    if (tail > bestSize) {
      bestSize = tail;
      bestLabel = next;
    }
    next++;
  }

  const area = width * height;
  if (bestSize < area * 0.08 || bestSize > area * 0.97) return null;

  let tl = { s: Infinity, p: { x: 0, y: 0 } };
  let br = { s: -Infinity, p: { x: 0, y: 0 } };
  let tr = { s: -Infinity, p: { x: 0, y: 0 } };
  let bl = { s: Infinity, p: { x: 0, y: 0 } };
  for (let i = 0; i < label.length; i++) {
    if (label[i] !== bestLabel) continue;
    const x = i % width;
    const y = (i - x) / width;
    const sum = x + y;
    const diff = x - y;
    if (sum < tl.s) tl = { s: sum, p: { x, y } };
    if (sum > br.s) br = { s: sum, p: { x, y } };
    if (diff > tr.s) tr = { s: diff, p: { x, y } };
    if (diff < bl.s) bl = { s: diff, p: { x, y } };
  }
  return [tl.p, tr.p, br.p, bl.p];
}

export function defaultQuad(width: number, height: number, inset = 0.04): Quad {
  const dx = width * inset;
  const dy = height * inset;
  return [
    { x: dx, y: dy },
    { x: width - dx, y: dy },
    { x: width - dx, y: height - dy },
    { x: dx, y: height - dy },
  ];
}

export function scaleQuad(quad: Quad, factor: number): Quad {
  return quad.map((p) => ({ x: p.x * factor, y: p.y * factor })) as Quad;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Output size for a crop: the quad's longest sides, capped at `maxEdge` on the long side. */
export function outputSize(quad: Quad, maxEdge = 2000): { width: number; height: number } {
  const [tl, tr, br, bl] = quad;
  let width = Math.max(dist(tl, tr), dist(bl, br));
  let height = Math.max(dist(tl, bl), dist(tr, br));
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));
  return { width, height };
}

/**
 * The projective transform taking the output rectangle (0,0)-(w,h) to `quad` in the source image,
 * as 8 coefficients [a..h]: x' = (ax + by + c) / (gx + hy + 1), y' = (dx + ey + f) / (gx + hy + 1).
 */
export function homography(width: number, height: number, quad: Quad): number[] {
  const from: Point[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i]!;
    const { x: u, y: v } = quad[i]!;
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  return solve(a, b);
}

function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    const p = m[col]![col]!;
    if (Math.abs(p) < 1e-12) throw new Error("degenerate quad");
    for (let c = col; c <= n; c++) m[col]![c]! /= p;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r]![col]!;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) m[r]![c]! -= f * m[col]![c]!;
    }
  }
  return m.map((row) => row[n]!);
}

/** Straightens the quad into a rectangle (bilinear sampling). */
export function warp(src: Pixels, quad: Quad, width: number, height: number): Pixels & { data: Uint8ClampedArray<ArrayBuffer> } {
  const [a, b, c, d, e, f, g, h] = homography(width, height, quad) as [number, number, number, number, number, number, number, number];
  const out = new Uint8ClampedArray(width * height * 4);
  const sw = src.width;
  const sh = src.height;
  const s = src.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w = g * px + h * py + 1;
      const u = Math.min(sw - 1, Math.max(0, (a * px + b * py + c) / w - 0.5));
      const v = Math.min(sh - 1, Math.max(0, (d * px + e * py + f) / w - 0.5));
      const x0 = Math.floor(u);
      const y0 = Math.floor(v);
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);
      const fx = u - x0;
      const fy = v - y0;
      const o = (y * width + x) * 4;
      for (let ch = 0; ch < 4; ch++) {
        const top = s[(y0 * sw + x0) * 4 + ch]! * (1 - fx) + s[(y0 * sw + x1) * 4 + ch]! * fx;
        const bottom = s[(y1 * sw + x0) * 4 + ch]! * (1 - fx) + s[(y1 * sw + x1) * 4 + ch]! * fx;
        out[o + ch] = top * (1 - fy) + bottom * fy;
      }
    }
  }
  return { width, height, data: out };
}
