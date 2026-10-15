import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FINAL_VERDICTS,
  type CreateSubmissionInput,
  type CreateSubmissionResponse,
  type SubmissionDetail,
} from '@judgehint/shared';
import { api, post } from '@/lib/api';

export const submissionKeys = {
  detail: (id: string) => ['submissions', 'detail', id] as const,
};

export const isFinal = (s?: Pick<SubmissionDetail, 'verdict'>) => !!s && FINAL_VERDICTS.includes(s.verdict);

export function useSubmitCode() {
  return useMutation({
    mutationFn: (input: CreateSubmissionInput) => post<CreateSubmissionResponse>('/submissions', input),
  });
}

/** Polls a submission until it reaches a final verdict (replaced by Socket.IO events in week 5). */
export function useSubmission(id: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: submissionKeys.detail(id ?? ''),
    queryFn: async () => {
      const s = await api<SubmissionDetail>(`/submissions/${id}`);
      // Solved/attempted badges in the problem list depend on this result.
      if (isFinal(s)) void qc.invalidateQueries({ queryKey: ['problems', 'list'] });
      return s;
    },
    enabled: !!id,
    refetchInterval: (query) => (isFinal(query.state.data) ? false : 700),
  });
}
