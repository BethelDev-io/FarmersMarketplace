import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30000;

/** Live payment updates over SSE, reconnecting with exponential backoff. */
export function useWalletStream({ onPayment }) {
  const [reconnecting, setReconnecting] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);

  const esRef = useRef(null);
  const reconnectTimer = useRef(null);
  const reconnectDelay = useRef(RECONNECT_BASE_MS);
  const unmounted = useRef(false);
  const onPaymentRef = useRef(onPayment);

  useEffect(() => {
    onPaymentRef.current = onPayment;
  });

  const connectStream = useCallback(async () => {
    if (unmounted.current || typeof EventSource === 'undefined') return;
    if (typeof api.getWalletStreamUrl !== 'function') return;
    let url;
    try {
      url = await api.getWalletStreamUrl();
    } catch {
      url = '';
    }
    if (unmounted.current) return;
    if (!url || !url.includes('token=') || url.endsWith('token=')) {
      reconnectTimer.current = setTimeout(connectStream, 1000);
      return;
    }
    const es = new EventSource(url);
    esRef.current = es;
    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.type === 'payment') onPaymentRef.current(payload);
      } catch {}
    };
    es.addEventListener('error', () => {
      es.close();
      esRef.current = null;
      if (unmounted.current) return;
      setSseConnected(false);
      reconnectDelay.current = Math.min(reconnectDelay.current * 2, RECONNECT_MAX_MS);
      setReconnecting(true);
      // The embedded token may have expired mid-stream (a likely cause of the
      // error); refresh it before reconnecting so we don't loop forever on a stale token.
      if (typeof api.refresh === 'function') {
        api.refresh().catch(() => {});
      }
      reconnectTimer.current = setTimeout(() => {
        connectStream();
      }, reconnectDelay.current);
    });
    es.onopen = () => {
      reconnectDelay.current = RECONNECT_BASE_MS;
      setReconnecting(false);
      setSseConnected(true);
    };
  }, []);

  useEffect(() => {
    unmounted.current = false;
    connectStream();
    return () => {
      unmounted.current = true;
      clearTimeout(reconnectTimer.current);
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
    };
  }, [connectStream]);

  return { reconnecting, sseConnected };
}
