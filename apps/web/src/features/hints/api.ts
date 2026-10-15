import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HINT_LEVELS, type HintItem, type HintLevel, type HintState } from '@judgehint/shared';
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
  text: string;
  error: string | null;
}

/** Opens one hint level over SSE and folds the finished hint into the cached hint state. */
export function useHintStream(submissionId: string) {
  const qc = useQueryClient();
  const [state, setState] = useState<HintStreamState>({ level: null, text: '', error: null });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const open = useCallback(
    async (level: HintLevel) => {
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;
      setState({ level, text: '', error: null });

      const finish = (content: string) => {
        qc.setQueryData<HintState>(hintKey(submissionId), (old) => {
          if (!old) return old;
          const hints: HintItem[] = [
            ...old.hints.filter((h) => h.level !== level),
            { level, content, createdAt: new Date().toISOString() },
          ].sort((a, b) => a.level - b.level);
          const nextLevel = HINT_LEVELS.find((l) => !hints.some((h) => h.level === l)) ?? null;
          return { ...old, hints, nextLevel };
        });
        setState({ level: null, text: '', error: null });
      };

      try {
        await streamSse(
          `/hints/stream?submissionId=${encodeURIComponent(submissionId)}&level=${level}`,
          ({ event, data }) => {
            const d = data as { text?: string; content?: string; message?: string };
            if (event === 'delta') setState((s) => ({ ...s, text: s.text + (d.text ?? '') }));
            else if (event === 'replace') setState((s) => ({ ...s, text: d.content ?? '' }));
            else if (event === 'done') finish(d.content ?? '');
            else if (event === 'error') setState((s) => ({ ...s, error: d.message ?? 'Có lỗi xảy ra' }));
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
