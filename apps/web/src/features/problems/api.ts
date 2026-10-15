import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Paginated,
  ProblemDetail,
  ProblemInput,
  ProblemListItem,
  ProblemListQuery,
  ProblemManage,
  TestCaseBulkInput,
  TestCaseFull,
  TestCaseInput,
  TestCaseSummary,
} from '@judgehint/shared';
import { api, post } from '@/lib/api';

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

function toSearch(query: ProblemListQuery): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== '' && v !== null) params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export const problemKeys = {
  all: ['problems'] as const,
  list: (q: ProblemListQuery) => ['problems', 'list', q] as const,
  detail: (slug: string) => ['problems', 'detail', slug] as const,
  manage: (id: string) => ['problems', 'manage', id] as const,
  tests: (id: string) => ['problems', 'tests', id] as const,
};

export function useProblems(query: ProblemListQuery) {
  return useQuery({
    queryKey: problemKeys.list(query),
    queryFn: () => api<Paginated<ProblemListItem>>(`/problems${toSearch(query)}`),
    placeholderData: keepPreviousData,
  });
}

export function useProblem(slug: string) {
  return useQuery({ queryKey: problemKeys.detail(slug), queryFn: () => api<ProblemDetail>(`/problems/${slug}`) });
}

export function useProblemManage(id: string | undefined) {
  return useQuery({
    queryKey: problemKeys.manage(id ?? ''),
    queryFn: () => api<ProblemManage>(`/problems/${id}/manage`),
    enabled: !!id,
  });
}

export function useSaveProblem(id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProblemInput) =>
      id
        ? api<{ id: string; slug: string }>(`/problems/${id}`, json('PUT', input))
        : post<{ id: string; slug: string }>('/problems', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: problemKeys.all }),
  });
}

export function useDeleteProblem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/problems/${id}`, json('DELETE')),
    onSuccess: () => qc.invalidateQueries({ queryKey: problemKeys.all }),
  });
}

// ---- Test cases ----------------------------------------------------------

export function useTestCases(problemId: string) {
  return useQuery({
    queryKey: problemKeys.tests(problemId),
    queryFn: () => api<TestCaseSummary[]>(`/problems/${problemId}/testcases`),
  });
}

export function fetchTestCase(problemId: string, testId: string) {
  return api<TestCaseFull>(`/problems/${problemId}/testcases/${testId}`);
}

function useInvalidateTests(problemId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: problemKeys.tests(problemId) });
    void qc.invalidateQueries({ queryKey: problemKeys.manage(problemId) });
    void qc.invalidateQueries({ queryKey: ['problems', 'detail'] });
  };
}

export function useSaveTestCase(problemId: string) {
  const invalidate = useInvalidateTests(problemId);
  return useMutation({
    mutationFn: ({ id, ...input }: TestCaseInput & { id?: string }) =>
      id
        ? api<TestCaseFull>(`/problems/${problemId}/testcases/${id}`, json('PUT', input))
        : post<TestCaseFull>(`/problems/${problemId}/testcases`, input),
    onSuccess: invalidate,
  });
}

export function useToggleHidden(problemId: string) {
  const invalidate = useInvalidateTests(problemId);
  return useMutation({
    mutationFn: ({ id, isHidden }: { id: string; isHidden: boolean }) =>
      api<TestCaseFull>(`/problems/${problemId}/testcases/${id}`, json('PUT', { isHidden })),
    onSuccess: invalidate,
  });
}

export function useDeleteTestCase(problemId: string) {
  const invalidate = useInvalidateTests(problemId);
  return useMutation({
    mutationFn: (id: string) => api<void>(`/problems/${problemId}/testcases/${id}`, json('DELETE')),
    onSuccess: invalidate,
  });
}

export function useBulkTestCases(problemId: string) {
  const invalidate = useInvalidateTests(problemId);
  return useMutation({
    mutationFn: (input: TestCaseBulkInput) => post<{ created: number }>(`/problems/${problemId}/testcases/bulk`, input),
    onSuccess: invalidate,
  });
}
