import { useState, useEffect, useCallback } from 'react';
import { fetchHealth } from '../lib/api';
export function useHealth(port, intervalMs = 10_000) {
    const [state, setState] = useState({
        port,
        health: null,
        error: null,
        loading: true,
    });
    const refresh = useCallback(async () => {
        try {
            const health = await fetchHealth(port);
            setState({ port, health, error: null, loading: false });
        }
        catch (err) {
            setState({ port, health: null, error: String(err), loading: false });
        }
    }, [port]);
    useEffect(() => {
        refresh();
        const id = setInterval(refresh, intervalMs);
        return () => clearInterval(id);
    }, [refresh, intervalMs]);
    return { ...state, refresh };
}
export function useMultiHealth(ports, intervalMs = 10_000) {
    const [states, setStates] = useState(new Map());
    useEffect(() => {
        const refresh = async () => {
            const results = await Promise.allSettled(ports.map(async (port) => {
                try {
                    const health = await fetchHealth(port);
                    return { port, health, error: null, loading: false };
                }
                catch (err) {
                    return { port, health: null, error: String(err), loading: false };
                }
            }));
            const map = new Map();
            for (const result of results) {
                if (result.status === 'fulfilled') {
                    map.set(result.value.port, result.value);
                }
            }
            setStates(map);
        };
        refresh();
        const id = setInterval(refresh, intervalMs);
        return () => clearInterval(id);
    }, [ports.join(','), intervalMs]);
    return states;
}
//# sourceMappingURL=useHealth.js.map