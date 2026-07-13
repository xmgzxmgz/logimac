import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Device, fetchDevices, scanDevices as apiScan } from '../api/client';

let socket: Socket | null = null;
function getSocket(): Socket {
  if (!socket) socket = io(window.location.origin, { transports: ['websocket', 'polling'] });
  return socket;
}

export function useDevices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setDevices(await fetchDevices());
      setError(null);
    } catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  }, []);

  const scan = useCallback(async () => {
    try {
      setLoading(true);
      setDevices(await apiScan());
      setError(null);
    } catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    refresh();
    const s = getSocket();
    s.on('devices', (d: Device[]) => { setDevices(d); setLoading(false); });
    s.on('device:connected', () => refresh());
    s.on('device:disconnected', () => refresh());
    return () => { s.off('devices'); s.off('device:connected'); s.off('device:disconnected'); };
  }, [refresh]);

  return { devices, loading, error, refresh, scan };
}
