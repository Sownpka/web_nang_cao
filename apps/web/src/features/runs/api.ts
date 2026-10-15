import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { RunResult, RunSamplesInput } from '@judgehint/shared';
import { useSocketConnected, useSocketEvent } from '@/features/realtime/SocketProvider';
import { api, post } from '@/lib/api';

const runKey = (runId: string) => ['runs', runId] as const;
const isDone = (r?: RunResult) => r?.status === 'DONE' || r?.status === 'ERROR';

/** "Chạy thử": starts a sample run and follows it over the socket (polling as a fallback). */
export function useSampleRun(problemId: string) {
  const qc = useQueryClient();
  const live = useSocketConnected();
  const [runId, setRunId] = useState<string>();

  const start = useMutation({
    mutationFn: (input: RunSamplesInput) => post<RunResult>(`/problems/${problemId}/run-samples`, input),
    onSuccess: (result) => {
      qc.setQueryData(runKey(result.runId), result);
      setRunId(result.runId);
    },
  });

  const run = useQuery({
    queryKey: runKey(runId ?? ''),
    queryFn: () => api<RunResult>(`/runs/${runId}`),
    enabled: !!runId,
    staleTime: Infinity,
    refetchInterval: (q) => (isDone(q.state.data) || live ? false : 1500),
  });

  // Each finished case is already in Redis, so refetch to show results as they arrive.
  useSocketEvent('run:progress', (p) => {
    if (p.runId === runId && p.testIndex > 0) void qc.invalidateQueries({ queryKey: runKey(p.runId) });
  });
  useSocketEvent('run:done', (result) => {
    if (result.runId === runId) qc.setQueryData(runKey(result.runId), result);
  });

  return {
    start,
    result: run.data,
    running: start.isPending || (!!runId && !isDone(run.data)),
  };
}
