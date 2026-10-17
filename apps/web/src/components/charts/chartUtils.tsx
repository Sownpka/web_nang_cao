import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ChartDatum {
  key: string;
  /** Short axis label. */
  label: string;
  value: number;
  /** Rich content for the hover tooltip. */
  tooltip: ReactNode;
}

/** Tracks an element's width so SVG charts can lay out in real pixels. */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => entry && setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Round the axis maximum up to 4 × a 1/2/5 step, so gridlines land on whole numbers. */
export function niceMax(max: number, ticks = 4): number {
  if (max <= ticks) return ticks;
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
  return Math.max(1, Math.ceil(step)) * ticks;
}

/** Column with a 4px rounded data end and a square base. */
export function columnPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/** Tooltip anchored above a point, kept inside the chart horizontally. */
export function ChartTooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const half = 80;
  const left = Math.min(Math.max(x, half), Math.max(half, width - half));
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 w-max max-w-40 -translate-x-1/2 -translate-y-full rounded-md border bg-card px-2.5 py-1.5 text-xs shadow-md"
      style={{ left, top: Math.max(0, y - 8) }}
    >
      {children}
    </div>
  );
}

export function YGrid({ max, ticks = 4, top, plotH, left, right }: { max: number; ticks?: number; top: number; plotH: number; left: number; right: number }) {
  return (
    <g>
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const v = (max / ticks) * i;
        const y = top + plotH - (plotH * i) / ticks;
        return (
          <g key={i}>
            <line x1={left} x2={right} y1={y} y2={y} className={cn(i === 0 ? 'stroke-muted-foreground/50' : 'stroke-border')} strokeWidth={1} />
            <text x={left - 6} y={y} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
              {Number.isInteger(v) ? v : v.toFixed(1)}
            </text>
          </g>
        );
      })}
    </g>
  );
}
