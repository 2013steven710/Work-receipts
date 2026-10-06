import { describe, expect, it } from "vitest";
import { detectDocument, outputSize, type Pixels, type Quad, toGray, warp } from "../lib/edges.js";

/** A dark table with a white, slightly rotated receipt on it. */
function scene(width: number, height: number, quad: Quad): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  const inside = (x: number, y: number) => {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const a = quad[i]!;
      const b = quad[(i + 1) % 4]!;
      const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
      const s = Math.sign(cross);
      if (s !== 0 && sign !== 0 && s !== sign) return false;
      if (s !== 0) sign = s;
    }
    return true;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = inside(x + 0.5, y + 0.5) ? 235 : 60 + ((x * 7 + y * 13) % 25);
      const o = (y * width + x) * 4;
      data[o] = v;
      data[o + 1] = v;
      data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  return { width, height, data };
}

const near = (a: { x: number; y: number }, b: { x: number; y: number }, tol: number) =>
  Math.hypot(a.x - b.x, a.y - b.y) <= tol;

describe("detectDocument", () => {
  it("finds the corners of a rotated receipt", () => {
    const truth: Quad = [
      { x: 80, y: 40 },
      { x: 220, y: 60 },
      { x: 200, y: 360 },
      { x: 60, y: 340 },
    ];
    const img = scene(300, 400, truth);
    const quad = detectDocument(toGray(img), img.width, img.height);
    expect(quad).not.toBeNull();
    quad!.forEach((p, i) => expect(near(p, truth[i]!, 4)).toBe(true));
  });

  it("gives up when nothing stands out", () => {
    const flat: Pixels = { width: 50, height: 50, data: new Uint8ClampedArray(50 * 50 * 4).fill(128) };
    expect(detectDocument(toGray(flat), 50, 50)).toBeNull();
  });
});

describe("warp", () => {
  it("straightens the receipt so it fills the output", () => {
    const truth: Quad = [
      { x: 80, y: 40 },
      { x: 220, y: 60 },
      { x: 200, y: 360 },
      { x: 60, y: 340 },
    ];
    const img = scene(300, 400, truth);
    const size = outputSize(truth);
    const out = warp(img, truth, size.width, size.height);
    // Sample well inside the edges: everything should be paper-white.
    let dark = 0;
    for (let y = 5; y < out.height - 5; y += 7) {
      for (let x = 5; x < out.width - 5; x += 7) if (out.data[(y * out.width + x) * 4]! < 200) dark++;
    }
    expect(dark).toBe(0);
    expect(size.height).toBeGreaterThan(size.width);
  });

  it("caps the long edge", () => {
    const big: Quad = [
      { x: 0, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 4000 },
      { x: 0, y: 4000 },
    ];
    expect(outputSize(big)).toEqual({ width: 1500, height: 2000 });
  });
});
