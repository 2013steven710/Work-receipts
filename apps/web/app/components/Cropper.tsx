"use client";

import { useEffect, useRef, useState } from "react";
import { defaultQuad, detectDocument, outputSize, type Quad, scaleQuad, toGray, warp } from "../../lib/edges";

const WORK_EDGE = 2400; // cap the working image so warping stays fast on phones
const DETECT_EDGE = 400;

interface Props {
  file: Blob;
  onUse: (blob: Blob) => void;
  onCancel: () => void;
}

/** Crop with automatic corners (best effort) that can be dragged into place. */
export function Cropper({ file, onUse, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragging = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, WORK_EDGE / Math.max(bitmap.width, bitmap.height));
        const w = Math.round(bitmap.width * scale);
        const h = Math.round(bitmap.height * scale);
        const canvas = canvasRef.current!;
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);

        const ds = Math.min(1, DETECT_EDGE / Math.max(w, h));
        const small = document.createElement("canvas");
        small.width = Math.max(1, Math.round(w * ds));
        small.height = Math.max(1, Math.round(h * ds));
        const sctx = small.getContext("2d")!;
        sctx.drawImage(canvas, 0, 0, small.width, small.height);
        const pixels = sctx.getImageData(0, 0, small.width, small.height);
        const found = detectDocument(toGray(pixels), small.width, small.height);
        if (cancelled) return;
        setSize({ w, h });
        setQuad(found ? scaleQuad(found, 1 / ds) : defaultQuad(w, h));
      } catch {
        if (!cancelled) setError("This image couldn't be opened. Try another photo.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const toSvgPoint = (event: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: Math.min(size!.w, Math.max(0, ((event.clientX - rect.left) / rect.width) * size!.w)),
      y: Math.min(size!.h, Math.max(0, ((event.clientY - rect.top) / rect.height) * size!.h)),
    };
  };

  const use = async () => {
    if (!quad || !size) return;
    setBusy(true);
    // Let the "Straightening" state paint before the heavy work.
    await new Promise((r) => setTimeout(r, 20));
    const ctx = canvasRef.current!.getContext("2d")!;
    const src = ctx.getImageData(0, 0, size.w, size.h);
    const out = outputSize(quad);
    const result = warp(src, quad, out.width, out.height);
    const outCanvas = document.createElement("canvas");
    outCanvas.width = out.width;
    outCanvas.height = out.height;
    outCanvas.getContext("2d")!.putImageData(new ImageData(result.data, out.width, out.height), 0, 0);
    outCanvas.toBlob((blob) => (blob ? onUse(blob) : setError("Couldn't save the crop.")), "image/jpeg", 0.85);
  };

  const r = size ? Math.max(size.w, size.h) / 40 : 10;
  return (
    <div className="screen crop">
      <p className="hint">Drag the corners to the edges of the receipt.</p>
      <div className="crop-stage">
        <canvas ref={canvasRef} className="crop-image" />
        {size && quad && (
          <svg
            ref={svgRef}
            className="crop-overlay"
            viewBox={`0 0 ${size.w} ${size.h}`}
            onPointerMove={(e) => {
              if (dragging.current === null) return;
              const p = toSvgPoint(e);
              setQuad((q) => q && (q.map((c, i) => (i === dragging.current ? p : c)) as Quad));
            }}
            onPointerUp={() => (dragging.current = null)}
            onPointerCancel={() => (dragging.current = null)}
          >
            <polygon points={quad.map((p) => `${p.x},${p.y}`).join(" ")} className="crop-poly" />
            {quad.map((p, i) => (
              <circle
                key={i}
                data-testid={`corner-${i}`}
                cx={p.x}
                cy={p.y}
                r={r}
                className="crop-handle"
                onPointerDown={(e) => {
                  dragging.current = i;
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                }}
              />
            ))}
          </svg>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button className="secondary" onClick={onCancel} disabled={busy}>
          Retake
        </button>
        <button className="primary" onClick={use} disabled={!quad || busy}>
          {busy ? "Straightening…" : "Use photo"}
        </button>
      </div>
    </div>
  );
}
