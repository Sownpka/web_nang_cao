import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ServerToClientEvents } from '@judgehint/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { submissionKeys, type SubmissionView } from '@/features/submissions/api';
import { refreshSession } from '@/lib/api';
import { getSocket } from '@/lib/socket';

const SocketContext = createContext<{ connected: boolean }>({ connected: false });

/** Whether live updates are flowing; queries fall back to polling while false. */
export const useSocketConnected = () => useContext(SocketContext).connected;

/** Subscribes to a server event for the lifetime of the component. */
export function useSocketEvent<E extends keyof ServerToClientEvents>(event: E, handler: ServerToClientEvents[E]) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const socket = getSocket();
    const listener = ((...args: Parameters<ServerToClientEvents[E]>) =>
      (ref.current as (...a: typeof args) => void)(...args)) as ServerToClientEvents[E];
    // socket.io's typed overloads do not narrow a generic event name.
    (socket.on as (e: E, l: ServerToClientEvents[E]) => void)(event, listener);
    return () => {
      (socket.off as (e: E, l: ServerToClientEvents[E]) => void)(event, listener);
    };
  }, [event]);
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    if (status !== 'authenticated') {
      socket.disconnect();
      return;
    }

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    // Server-side auth rejections are not retried by socket.io: refresh the token and reconnect.
    const onConnectError = async (err: Error) => {
      setConnected(false);
      if (err.message === 'TOKEN_EXPIRED' || err.message === 'INVALID_TOKEN') {
        if (await refreshSession()) socket.connect();
      }
    };

    // Keep cached submissions in step with the judge, wherever they are shown.
    const onProgress: ServerToClientEvents['submission:progress'] = (p) => {
      qc.setQueryData<SubmissionView>(submissionKeys.detail(p.submissionId), (old) =>
        old ? { ...old, verdict: 'RUNNING', progress: { testIndex: p.testIndex, total: p.total } } : old,
      );
    };
    const onDone: ServerToClientEvents['submission:done'] = (p) => {
      void qc.invalidateQueries({ queryKey: submissionKeys.detail(p.submissionId) });
      void qc.invalidateQueries({ queryKey: submissionKeys.lists() });
      void qc.invalidateQueries({ queryKey: ['problems', 'list'] });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('submission:progress', onProgress);
    socket.on('submission:done', onDone);
    socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('submission:progress', onProgress);
      socket.off('submission:done', onDone);
      socket.disconnect();
      setConnected(false);
    };
  }, [status, qc]);

  return <SocketContext.Provider value={{ connected }}>{children}</SocketContext.Provider>;
}
