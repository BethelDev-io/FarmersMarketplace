import React from 'react';
import { s, msgTone } from './walletStyles';

/** Withdraw XLM to a Stellar public key or federation address. */
export default function SendForm({ send, availableBalance, explorerUrl }) {
  const { sendForm, setSendForm, sending, sendMsg, sendExceedsBalance, handleSend } = send;

  return (
    <div style={s.card}>
      <h3 style={{ marginBottom: 4, color: 'var(--color-text)' }}>Withdraw XLM</h3>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 8 }}>Transfer XLM from your platform wallet to any Stellar public key.</p>
      <form onSubmit={handleSend} noValidate>
        <label style={s.label}>Destination Address</label>
        <input
          style={s.input} type="text" placeholder="G... or name*domain" spellCheck={false}
          value={sendForm.destination}
          onChange={e => setSendForm(f => ({ ...f, destination: e.target.value }))}
        />
        <label style={s.label}>Amount (XLM)</label>
        <input
          style={{ ...s.input, borderColor: sendExceedsBalance ? 'var(--color-danger)' : undefined }}
          type="number" min="0.0000001" step="any" placeholder="0.00"
          value={sendForm.amount}
          onChange={e => setSendForm(f => ({ ...f, amount: e.target.value }))}
          aria-describedby={sendExceedsBalance ? 'send-balance-warning' : undefined}
        />
        {sendExceedsBalance && (
          <div id="send-balance-warning" role="alert" style={{ color: 'var(--color-danger)', fontSize: 13, marginTop: 4 }}>
            Insufficient balance. You have {availableBalance.toFixed(2)} XLM available.
          </div>
        )}
        <label style={s.label}>Memo <span style={{ color: 'var(--color-text-faint)', fontWeight: 400 }}>(optional, max 28 chars)</span></label>
        <input
          style={s.input} type="text" maxLength={28} placeholder="e.g. payment for order #42"
          value={sendForm.memo}
          onChange={e => setSendForm(f => ({ ...f, memo: e.target.value }))}
        />
        <button type="submit" style={{ ...s.btn, opacity: sendExceedsBalance ? 0.5 : 1 }} disabled={sending || sendExceedsBalance}>
          {sending ? 'Withdrawing...' : 'Withdraw XLM'}
        </button>
      </form>
      {sendMsg && (
        <div style={{ ...s.msg, ...msgTone(sendMsg.type) }}>
          {sendMsg.text}
          {sendMsg.txHash && (
            <div style={{ marginTop: 6, fontSize: 12 }}>
              TX: <a href={explorerUrl('tx', sendMsg.txHash)} target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)', wordBreak: 'break-all' }}>{sendMsg.txHash}</a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
