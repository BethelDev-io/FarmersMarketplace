import { useState } from 'react';
import { api } from '../api/client';
import { getErrorMessage } from '../utils/errorMessages';

const EMPTY_FORM = { destination: '', amount: '', memo: '' };

/** Withdraw XLM to a Stellar public key or federation address. */
export function useWalletSend({ availableBalance, onSent }) {
  const [sendForm, setSendForm] = useState(EMPTY_FORM);
  const [sending, setSending]   = useState(false);
  const [sendMsg, setSendMsg]   = useState(null);

  const sendAmount = parseFloat(sendForm.amount);
  const sendExceedsBalance = sendForm.amount !== '' && !isNaN(sendAmount) && sendAmount > availableBalance;

  async function handleSend(e) {
    e.preventDefault();
    setSendMsg(null);
    const amount = parseFloat(sendForm.amount);
    if (!sendForm.destination.trim())
      return setSendMsg({ type: 'err', text: 'Destination address is required.' });
    if (!/^G[A-Z2-7]{55}$/.test(sendForm.destination.trim()) && !sendForm.destination.includes('*'))
      return setSendMsg({ type: 'err', text: 'Invalid destination. Enter a Stellar public key (G...) or federation address (name*domain).' });
    if (!amount || amount <= 0)
      return setSendMsg({ type: 'err', text: 'Amount must be greater than 0.' });
    if (amount > availableBalance)
      return setSendMsg({ type: 'err', text: `Insufficient balance. You have ${availableBalance.toFixed(2)} XLM available.` });
    if (sendForm.memo.length > 28)
      return setSendMsg({ type: 'err', text: 'Memo must be 28 characters or fewer.' });
    setSending(true);
    try {
      const res = await api.withdrawFunds(sendForm.destination.trim(), amount);
      setSendMsg({ type: 'ok', text: 'Withdrew ' + res.amount + ' XLM', txHash: res.txHash });
      setSendForm(EMPTY_FORM);
      onSent();
    } catch (e) {
      setSendMsg({ type: 'err', text: getErrorMessage(e) });
    } finally {
      setSending(false);
    }
  }

  return { sendForm, setSendForm, sending, sendMsg, sendExceedsBalance, handleSend };
}
