import React from 'react';
import { s, msgTone } from './walletStyles';

/** Balance summary, testnet notice and the testnet funding button. */
export default function WalletBalanceCard({ wallet, usd, network, funding, fundMsg, onFund }) {
  return (
    <div style={s.card}>
      <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 4 }}>XLM Balance</div>
      <div style={s.balance}>{wallet ? wallet.balance.toFixed(2) : '-'} XLM</div>
      {wallet && usd(wallet.balance) && (
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
          {usd(wallet.balance)} <span style={{ fontSize: 11, color: 'var(--color-text-subtle)' }}>approx.</span>
        </div>
      )}
      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 6 }}>
        Available to withdraw: {wallet ? (wallet.availableBalance ?? Math.max(0, wallet.balance - 1)).toFixed(2) : '-'} XLM
      </div>
      {wallet && wallet.availableBalance && usd(wallet.availableBalance) && (
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
          {usd(wallet.availableBalance)} <span style={{ fontSize: 11, color: 'var(--color-text-subtle)' }}>approx.</span>
        </div>
      )}
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>Includes 1.00 XLM base reserve</div>
      <div style={s.key}>{wallet?.publicKey}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 10 }}>
        <span style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)', border: '1px solid var(--color-warning-strong)', borderRadius: 4, padding: '1px 7px', fontWeight: 600, fontSize: 11 }}>TESTNET</span>
        {' '}XLM shown here has no real-world value.
      </div>
      {network !== 'mainnet' && (
        <>
          <button style={s.btn} onClick={onFund} disabled={funding}>
            {funding ? 'Funding...' : 'Fund with Testnet XLM'}
          </button>
          {fundMsg && (
            <div style={{ ...s.msg, ...msgTone(fundMsg.type) }}>
              {fundMsg.text}
            </div>
          )}
        </>
      )}
    </div>
  );
}
