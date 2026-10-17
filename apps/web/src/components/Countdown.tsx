import { useEffect, useState } from 'react';
import { assignmentStatus } from '@judgehint/shared';
import { vi } from '@/i18n/vi';
import { cn } from '@/lib/utils';

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** "2 ngày 03:04:05" style duration. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hms = [Math.floor((total % 86400) / 3600), Math.floor((total % 3600) / 60), total % 60]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
  return days ? `${days} ${vi.classes.days} ${hms}` : hms;
}

const STATUS_STYLES = {
  UPCOMING: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  ACTIVE: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  ENDED: 'bg-secondary text-secondary-foreground',
} as const;

export function AssignmentStatusBadge({ startsAt, endsAt }: { startsAt: string; endsAt: string }) {
  const now = useNow(30_000);
  const status = assignmentStatus(startsAt, endsAt, now);
  return <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', STATUS_STYLES[status])}>{vi.classes.status[status]}</span>;
}

/** Live "starts in / ends in / ended" label for an assignment window. */
export function Countdown({ startsAt, endsAt, className }: { startsAt: string; endsAt: string; className?: string }) {
  const now = useNow();
  const status = assignmentStatus(startsAt, endsAt, now);
  const text =
    status === 'UPCOMING'
      ? vi.classes.startsIn(formatDuration(new Date(startsAt).getTime() - now))
      : status === 'ACTIVE'
        ? vi.classes.endsIn(formatDuration(new Date(endsAt).getTime() - now))
        : vi.classes.ended;
  return <span className={cn('tabular-nums', className)}>{text}</span>;
}
