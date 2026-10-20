import { useCallback, useState } from 'react';
import { api } from '../api/client';
import { getStellarErrorMessage } from '../utils/stellarErrors';
import { getErrorMessage } from '../utils/errorMessages';

/** Payment streams the user sends or receives, plus cancel/decrease/withdraw actions. */
export function useWalletStreams({ onWithdrawn }) {
  const [streams, setStreams] = useState([]);
  const [streamsMsg, setStreamsMsg] = useState(null);
  const [streamActionId, setStreamActionId] = useState(null);

  const loadStreams = useCallback(() => {
    if (typeof api.getPaymentStreams !== 'function') return;
    api.getPaymentStreams()
      .then(res => setStreams(res.data ?? res))
      .catch(() => {});
  }, []);

  async function cancelStream(id) {
    setStreamActionId(id);
    setStreamsMsg(null);
    try {
      await api.cancelPaymentStream(id);
      setStreamsMsg({ type: 'ok', text: 'Stream canceled.' });
      loadStreams();
    } catch (e) {
      setStreamsMsg({ type: 'err', text: getStellarErrorMessage(e) || getErrorMessage(e) });
    } finally {
      setStreamActionId(null);
    }
  }

  async function decreaseStreamRate(id, currentRate) {
    const input = prompt('New rate per second (must be lower than current rate):', currentRate);
    if (input == null) return;
    const rate = parseFloat(input);
    if (!rate || rate <= 0 || rate >= currentRate) {
      setStreamsMsg({ type: 'err', text: 'New rate must be a positive number lower than the current rate.' });
      return;
    }
    setStreamActionId(id);
    setStreamsMsg(null);
    try {
      await api.decreasePaymentStreamRate(id, rate);
      setStreamsMsg({ type: 'ok', text: 'Stream rate decreased.' });
      loadStreams();
    } catch (e) {
      setStreamsMsg({ type: 'err', text: getStellarErrorMessage(e) || getErrorMessage(e) });
    } finally {
      setStreamActionId(null);
    }
  }

  async function withdrawStream(id) {
    setStreamActionId(id);
    setStreamsMsg(null);
    try {
      const res = await api.withdrawPaymentStream(id);
      setStreamsMsg({ type: 'ok', text: `Withdrew ${res.amount ?? ''} from stream.`.trim() });
      loadStreams();
      onWithdrawn();
    } catch (e) {
      setStreamsMsg({ type: 'err', text: getStellarErrorMessage(e) || getErrorMessage(e) });
    } finally {
      setStreamActionId(null);
    }
  }

  return { streams, streamsMsg, streamActionId, loadStreams, cancelStream, decreaseStreamRate, withdrawStream };
}
