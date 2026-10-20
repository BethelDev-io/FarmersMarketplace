import { useCallback, useState } from 'react';
import { api } from '../api/client';

/** Account activity alerts with mark-as-read. Failures are silent. */
export function useWalletAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadAlerts = useCallback(() => {
    api.getAlerts().then(res => {
      setAlerts(res.data ?? []);
      setUnreadCount(res.unreadCount ?? 0);
    }).catch(() => {});
  }, []);

  async function markAlertRead(id) {
    await api.markAlertRead(id).catch(() => {});
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, read_at: new Date().toISOString() } : a));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }

  return { alerts, unreadCount, loadAlerts, markAlertRead };
}
