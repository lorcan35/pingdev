import { useState, useEffect, useCallback, useRef } from 'react';
import { subscribeJobStream } from '../lib/api';

export interface SSEStreamEvent {
  type: string;
  data: Record<string, unknown>;
  receivedAt: string;
}

export function useSSE(port: number, jobId: string | null) {
  const [events, setEvents] = useState<SSEStreamEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const connect = useCallback(() => {
    if (!jobId) return;

    // Cleanup previous
    cleanupRef.current?.();

    setEvents([]);
    setConnected(true);
    setError(null);

    cleanupRef.current = subscribeJobStream(
      port,
      jobId,
      (type, data) => {
        setEvents(prev => [...prev, { type, data, receivedAt: new Date().toISOString() }]);
        if (type === 'complete' || type === 'error') {
          setConnected(false);
        }
      },
      (err) => {
        setError(err.message);
        setConnected(false);
      },
    );
  }, [port, jobId]);

  const disconnect = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    setConnected(false);
  }, []);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  return { events, connected, error, connect, disconnect };
}
