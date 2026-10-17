import { useQuery } from '@tanstack/react-query';
import type { AssignmentReport, UserStats } from '@judgehint/shared';
import { api, downloadFile } from '@/lib/api';

export const reportKeys = {
  assignment: (id: string) => ['reports', 'assignment', id] as const,
  myStats: ['reports', 'me'] as const,
};

export function useAssignmentReport(id: string) {
  return useQuery({
    queryKey: reportKeys.assignment(id),
    queryFn: () => api<AssignmentReport>(`/teacher/assignments/${id}/report`),
  });
}

export const downloadAssignmentCsv = (id: string) => downloadFile(`/teacher/assignments/${id}/report?format=csv`, 'bao-cao.csv');

export function useMyStats() {
  return useQuery({ queryKey: reportKeys.myStats, queryFn: () => api<UserStats>('/me/stats') });
}
