import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type {
  AssignmentDetail,
  AssignmentInput,
  ClassroomDetail,
  ClassroomSummary,
  Leaderboard,
} from '@judgehint/shared';
import { useSocketConnected, useSocketEvent } from '@/features/realtime/SocketProvider';
import { api, post } from '@/lib/api';
import { getSocket } from '@/lib/socket';

export const classKeys = {
  list: ['classrooms', 'list'] as const,
  detail: (id: string) => ['classrooms', 'detail', id] as const,
  assignment: (id: string) => ['assignments', 'detail', id] as const,
  leaderboard: (id: string) => ['assignments', 'leaderboard', id] as const,
};

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export function useClassrooms() {
  return useQuery({ queryKey: classKeys.list, queryFn: () => api<ClassroomSummary[]>('/classrooms') });
}

export function useClassroom(id: string) {
  return useQuery({ queryKey: classKeys.detail(id), queryFn: () => api<ClassroomDetail>(`/classrooms/${id}`) });
}

export function useCreateClassroom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => post<ClassroomSummary>('/classrooms', { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['classrooms'] }),
  });
}

export function useJoinClassroom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (joinCode: string) => post<ClassroomSummary>('/classrooms/join', { joinCode }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['classrooms'] }),
  });
}

export function useRemoveMember(classroomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api<void>(`/classrooms/${classroomId}/members/${userId}`, json('DELETE')),
    onSuccess: () => qc.invalidateQueries({ queryKey: classKeys.detail(classroomId) }),
  });
}

export function useAssignment(id: string | undefined) {
  return useQuery({
    queryKey: classKeys.assignment(id ?? ''),
    queryFn: () => api<AssignmentDetail>(`/assignments/${id}`),
    enabled: !!id,
  });
}

/** Create (with classroomId) or update (with assignmentId) an assignment. */
export function useSaveAssignment(target: { classroomId: string } | { assignmentId: string }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AssignmentInput) =>
      'assignmentId' in target
        ? api<AssignmentDetail>(`/assignments/${target.assignmentId}`, json('PUT', input))
        : post<AssignmentDetail>(`/classrooms/${target.classroomId}/assignments`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['classrooms'] });
      void qc.invalidateQueries({ queryKey: ['assignments'] });
    },
  });
}

export function useDeleteAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/assignments/${id}`, json('DELETE')),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['classrooms'] }),
  });
}

/**
 * Leaderboard kept live over Socket.IO: joins the assignment room (again after reconnects) and
 * applies pushed updates; polls only while the socket is down.
 */
export function useLiveLeaderboard(assignmentId: string) {
  const qc = useQueryClient();
  const live = useSocketConnected();

  useEffect(() => {
    if (!live) return;
    const socket = getSocket();
    socket.emit('join:assignment', { assignmentId });
    return () => {
      socket.emit('leave:assignment', { assignmentId });
    };
  }, [assignmentId, live]);

  useSocketEvent('leaderboard:update', (board) => {
    if (board.assignmentId !== assignmentId) return;
    qc.setQueryData(classKeys.leaderboard(assignmentId), board);
    // The viewer's own row on the assignment page comes from the same data.
    void qc.invalidateQueries({ queryKey: classKeys.assignment(assignmentId) });
  });

  return useQuery({
    queryKey: classKeys.leaderboard(assignmentId),
    queryFn: () => api<Leaderboard>(`/assignments/${assignmentId}/leaderboard`),
    refetchInterval: live ? false : 5000,
  });
}
