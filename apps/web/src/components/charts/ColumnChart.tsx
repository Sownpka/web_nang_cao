import { useState } from 'react';
import { ChartTooltip, columnPath, niceMax, useElementWidth, YGrid, type ChartDatum } from './chartUtils';

const M = { top: 10, right: 4, bottom: 22, left: 30 };

/** Single-series column chart with a per-column hover tooltip. */
export function ColumnChart({
  data,
  height = 180,
  tickEvery = 1,
  ariaLabel,
}: {
  data: ChartDatum[];
  height?: number;
  /** Show every n-th x label, counted back from the last one (dense daily series). */
  tickEvery?: number;
  ariaLabel: string;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = height - M.top - M.bottom;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const band = data.length ? plotW / data.length : 0;
  // Thin columns: at most 24px, always leaving at least a 2px gap.
  const barW = Math.max(1, Math.min(24, band * 0.7, band - 2));
  const hovered = hover === null ? undefined : data[hover];

  return (
    <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block select-none">
          <YGrid max={max} top={M.top} plotH={plotH} left={M.left} right={width - M.right} />
          {data.map((d, i) => {
            const x = M.left + band * i;
            const h = (d.value / max) * plotH;
            return (
              <g key={d.key}>
                {hover === i && <rect x={x} y={M.top} width={band} height={plotH} className="fill-muted/60" />}
                <path d={columnPath(x + (band - barW) / 2, M.top + plotH - h, barW, h)} className="fill-primary" />
                {(data.length - 1 - i) % tickEvery === 0 && (
                  <text x={x + band / 2} y={height - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                    {d.label}
                  </text>
                )}
                {/* Hit target is the whole band, much larger than the column. */}
                <rect x={x} y={M.top} width={band} height={plotH} fill="transparent" onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} />
              </g>
            );
          })}
        </svg>
      )}
      {hovered && hover !== null && (
        <ChartTooltip x={M.left + band * (hover + 0.5)} y={M.top + plotH - (hovered.value / max) * plotH} width={width}>
          {hovered.tooltip}
        </ChartTooltip>
      )}
    </div>
  );
}
