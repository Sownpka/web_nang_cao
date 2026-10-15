import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import {
  FINAL_VERDICTS,
  type CreateSubmissionInput,
  type CreateSubmissionResponse,
  type Paginated,
  type SubmissionDetail,
  type SubmissionListItem,
  type SubmissionListQuery,
} from '@judgehint/shared';
import { useSocketConnected } from '@/features/realtime/SocketProvider';
import { api, post } from '@/lib/api';

/** Detail as cached on the client: live per-test progress is merged in from socket events. */
export type SubmissionView = SubmissionDetail & { progress?: { testIndex: number; total: number } };

export const submissionKeys = {
  detail: (id: string) => ['submissions', 'detail', id] as const,
  lists: () => ['submissions', 'list'] as const,
  list: (q: SubmissionListQuery) => ['submissions', 'list', q] as const,
};

export const isFinal = (s?: Pick<SubmissionDetail, 'verdict'>) => !!s && FINAL_VERDICTS.includes(s.verdict);

/** Polling interval used only while the socket is down. */
const FALLBACK_POLL_MS = 1500;

export function useSubmitCode() {
  return useMutation({
    mutationFn: (input: CreateSubmissionInput) => post<CreateSubmissionResponse>('/submissions', input),
  });
}

export function useSubmission(id: string | undefined) {
  const live = useSocketConnected();
  return useQuery<SubmissionView>({
    queryKey: submissionKeys.detail(id ?? ''),
    queryFn: () => api<SubmissionDetail>(`/submissions/${id}`),
    enabled: !!id,
    refetchInterval: (query) => (isFinal(query.state.data) || live ? false : FALLBACK_POLL_MS),
  });
}

function toSearch(query: SubmissionListQuery): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') params.set(k, String(v));
  const s = params.toString();
  return s ? `?${s}` : '';
}

export function useSubmissions(query: SubmissionListQuery) {
  const live = useSocketConnected();
  return useQuery({
    queryKey: submissionKeys.list(query),
    queryFn: () => api<Paginated<SubmissionListItem>>(`/submissions${toSearch(query)}`),
    placeholderData: keepPreviousData,
    // Rows still being judged update through socket invalidations; poll only without a socket.
    refetchInterval: (q) => (!live && q.state.data?.items.some((s) => !isFinal(s)) ? FALLBACK_POLL_MS : false),
  });
}
