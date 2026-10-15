import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { HintLevel, HintPhase, HintState } from '@judgehint/shared';
import { api, ApiError } from '@/lib/api';
import { streamSse } from '@/lib/sse';

const hintKey = (submissionId: string) => ['hints', submissionId] as const;

export function useHintState(submissionId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: hintKey(submissionId ?? ''),
    queryFn: () => api<HintState>(`/hints?submissionId=${submissionId}`),
    enabled: !!submissionId && enabled,
  });
}

export interface HintStreamState {
  level: HintLevel | null;
  /** Server-side stage before approved text starts arriving. */
  phase: HintPhase | null;
  chars: number;
  text: string;
  error: string | null;
}

const idle: HintStreamState = { level: null, phase: null, chars: 0, text: '', error: null };

/** Opens one hint level over SSE; afterwards the hint state (hints, quota, penalty) is refetched. */
export function useHintStream(submissionId: string) {
  const qc = useQueryClient();
  const [state, setState] = useState<HintStreamState>(idle);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const open = useCallback(
    async (level: HintLevel) => {
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;
      setState({ ...idle, level, phase: 'generating' });

      try {
        await streamSse(
          `/hints/stream?submissionId=${encodeURIComponent(submissionId)}&level=${level}`,
          ({ event, data }) => {
            const d = data as { text?: string; phase?: HintPhase; chars?: number; message?: string };
            if (event === 'status') setState((s) => ({ ...s, phase: d.phase ?? s.phase, chars: d.chars ?? s.chars }));
            else if (event === 'delta') setState((s) => ({ ...s, phase: null, text: s.text + (d.text ?? '') }));
            else if (event === 'error') setState((s) => ({ ...s, error: d.message ?? 'Có lỗi xảy ra' }));
            else if (event === 'done') {
              void qc.invalidateQueries({ queryKey: hintKey(submissionId) }).then(() => setState(idle));
            }
          },
          abort.signal,
        );
      } catch (err) {
        if (abort.signal.aborted) return;
        setState((s) => ({ ...s, error: err instanceof ApiError ? err.message : 'Không kết nối được máy chủ' }));
      }
    },
    [qc, submissionId],
  );

  return { ...state, streaming: state.level !== null && !state.error, open };
}
