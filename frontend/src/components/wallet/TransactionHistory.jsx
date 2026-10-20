import React from 'react';
import { s } from './walletStyles';

/** Sent and received transactions with explorer links. */
export default function TransactionHistory({ txs, usd, explorerUrl }) {
  return (
    <div style={s.card}>
      <h3 style={{ marginBottom: 16, color: 'var(--color-text)' }}>Transaction History</h3>
      {txs.length === 0 && <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>No transactions yet. Fund your wallet and make a purchase.</p>}
      {txs.map((tx) => {
        const counterpartyKey = tx.type === 'sent' ? tx.to : tx.from;
        const counterpartyFed = tx.type === 'sent' ? tx.to_federation : tx.from_federation;
        return (
          <div key={tx.id} style={s.tx}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={tx.type === 'sent' ? s.sent : s.recv}>
                {tx.type === 'sent' ? '↑ Sent' : '↓ Received'} {parseFloat(tx.amount).toFixed(2)} XLM
              </div>
              {usd(parseFloat(tx.amount)) && (
                <div style={{ fontSize: 11, color: 'var(--color-text-faint)', marginTop: 1 }}>
                  {usd(parseFloat(tx.amount))}
                </div>
              )}
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{new Date(tx.created_at).toLocaleString()}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                {tx.type === 'sent' ? 'To: ' : 'From: '}
                {counterpartyFed && (
                  <span style={{ fontWeight: 600, marginRight: 4 }}>{counterpartyFed}</span>
                )}
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--color-text-faint)', wordBreak: 'break-all' }}>
                  {counterpartyKey}
                </span>
                <button
                  title="Copy public key"
                  onClick={() => navigator.clipboard.writeText(counterpartyKey)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: '0 4px', color: 'var(--color-text-muted)', verticalAlign: 'middle' }}
                >⧉</button>
              </div>
              <div style={s.hash}>{tx.transaction_hash}</div>
            </div>
            <a href={explorerUrl('tx', tx.transaction_hash)}
              target="_blank" rel="noreferrer"
              style={{ fontSize: 12, color: 'var(--color-primary)', flexShrink: 0, marginLeft: 12 }}>View ↗</a>
          </div>
        );
      })}
    </div>
  );
}
