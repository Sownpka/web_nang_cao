import { useState, type PointerEvent } from 'react';
import { ChartTooltip, niceMax, useElementWidth, YGrid, type ChartDatum } from './chartUtils';

const M = { top: 12, right: 8, bottom: 22, left: 30 };

/** Single-series line + area wash with a crosshair tooltip that snaps to the nearest point. */
export function TrendChart({
  data,
  height = 200,
  tickEvery = 1,
  ariaLabel,
}: {
  data: ChartDatum[];
  height?: number;
  tickEvery?: number;
  ariaLabel: string;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = height - M.top - M.bottom;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const step = data.length > 1 ? plotW / (data.length - 1) : 0;
  const px = (i: number) => M.left + step * i;
  const py = (v: number) => M.top + plotH - (v / max) * plotH;

  const line = data.map((d, i) => `${i ? 'L' : 'M'}${px(i)},${py(d.value)}`).join('');
  const area = data.length ? `${line}L${px(data.length - 1)},${M.top + plotH}L${px(0)},${M.top + plotH}Z` : '';

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    setHover(Math.min(data.length - 1, Math.max(0, Math.round(x / (step || 1)))));
  };
  const hovered = hover === null ? undefined : data[hover];

  return (
    <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block select-none">
          <YGrid max={max} top={M.top} plotH={plotH} left={M.left} right={width - M.right} />
          <path d={area} className="fill-primary/10" />
          <path d={line} className="fill-none stroke-primary" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {data.map((d, i) =>
            (data.length - 1 - i) % tickEvery === 0 ? (
              <text
                key={d.key}
                x={px(i)}
                y={height - 6}
                textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
                className="fill-muted-foreground text-[10px]"
              >
                {d.label}
              </text>
            ) : null,
          )}
          {hovered && hover !== null && (
            <g>
              <line x1={px(hover)} x2={px(hover)} y1={M.top} y2={M.top + plotH} className="stroke-muted-foreground/60" strokeWidth={1} />
              <circle cx={px(hover)} cy={py(hovered.value)} r={4} className="fill-primary stroke-card" strokeWidth={2} />
            </g>
          )}
          <rect x={M.left} y={M.top} width={plotW} height={plotH} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} />
        </svg>
      )}
      {hovered && hover !== null && (
        <ChartTooltip x={px(hover)} y={py(hovered.value)} width={width}>
          {hovered.tooltip}
        </ChartTooltip>
      )}
    </div>
  );
}
