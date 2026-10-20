import React, { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';
import { getStellarErrorMessage } from '../utils/stellarErrors';
import { getErrorMessage } from '../utils/errorMessages';
import { showToast } from '../utils/toast';
import { useConfirm } from '../hooks/useConfirm';
import { useXlmRate } from '../utils/useXlmRate';
import { useNetwork } from '../context/NetworkContext';
import { useWalletData } from '../hooks/useWalletData';
import { useWalletAlerts } from '../hooks/useWalletAlerts';
import { useClaimableBalances } from '../hooks/useClaimableBalances';
import { useWalletStream } from '../hooks/useWalletStream';
import { useWalletStreams } from '../hooks/useWalletStreams';
import { useTrustlines } from '../hooks/useTrustlines';
import { useWalletSend } from '../hooks/useWalletSend';
import { useWalletBudget } from '../hooks/useWalletBudget';
import { s } from '../components/wallet/walletStyles';
import WalletToast from '../components/wallet/WalletToast';
import TestnetDisclaimer from '../components/wallet/TestnetDisclaimer';
import WalletBalanceCard from '../components/wallet/WalletBalanceCard';
import ClaimableBalances from '../components/wallet/ClaimableBalances';
import BudgetPanel from '../components/wallet/BudgetPanel';
import TrustlinePanel from '../components/wallet/TrustlinePanel';
import SendForm from '../components/wallet/SendForm';
import AlertsPanel from '../components/wallet/AlertsPanel';
import PaymentStreams from '../components/wallet/PaymentStreams';
import TransactionHistory from '../components/wallet/TransactionHistory';

export default function Wallet() {
  const { confirm, confirmDialog } = useConfirm();
  const { user } = useAuth();
  const { network, explorerUrl } = useNetwork();
  const { usd } = useXlmRate();
  const [toasts, setToasts] = useState([]);
  const [funding, setFunding] = useState(false);
  const [fundMsg, setFundMsg] = useState(null);

  const { wallet, setWallet, txs, loading, loadError, load: loadWallet, refreshTransactions } = useWalletData();
  const { alerts, unreadCount, loadAlerts, markAlertRead } = useWalletAlerts();
  const handleBalance = useCallback((balance) => {
    setWallet(prev => prev ? { ...prev, balance } : prev);
  }, [setWallet]);
  const { claimableBalances, claimableLoading, claimingId, loadClaimables, claim } = useClaimableBalances({ onBalance: handleBalance });

  const load = useCallback(async () => {
    await loadWallet();
    loadAlerts();
    loadClaimables();
  }, [loadWallet, loadAlerts, loadClaimables]);

  const streamsApi = useWalletStreams({ onWithdrawn: load });
  const trustlines = useTrustlines({ confirm, onChanged: load });
  const { budget, budgetInput, setBudgetInput, budgetMsg, saveBudget } = useWalletBudget({ enabled: user?.role === 'buyer' });

  const availableBalance = wallet ? (wallet.availableBalance ?? Math.max(0, wallet.balance - 1)) : 0;
  const send = useWalletSend({ availableBalance, onSent: load });

  const addToast = useCallback((payment) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, ...payment }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }, []);

  const handlePayment = useCallback((payload) => {
    if (payload.balance !== null) {
      handleBalance(payload.balance);
    } else {
      load();
    }
    refreshTransactions();
    addToast({ amount: payload.amount, from: payload.from });
  }, [handleBalance, load, refreshTransactions, addToast]);

  const { reconnecting, sseConnected } = useWalletStream({ onPayment: handlePayment });

  useEffect(() => {
    load();
    streamsApi.loadStreams();
  }, [load, streamsApi.loadStreams]);

  async function handleFund() {
    setFunding(true);
    setFundMsg(null);
    try {
      const res = await api.fundWallet();
      setFundMsg({ type: 'ok', text: res.message });
      load();
    } catch (e) {
      const msg = getStellarErrorMessage(e) || getErrorMessage(e);
      setFundMsg({ type: 'err', text: msg });
      showToast(msg, 'error');
    } finally {
      setFunding(false);
    }
  }

  return (
    <div style={s.page}>
      <Helmet>
        <title>My Wallet – Farmers Marketplace</title>
        <meta name="description" content="Manage your Stellar XLM wallet, view balance and transaction history." />
      </Helmet>
      <WalletToast toasts={toasts} usd={usd} />
      <div style={s.title}>My Wallet</div>

      {reconnecting && (
        <div role="status" style={{ background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning-strong)', borderRadius: 8, padding: '8px 14px', marginBottom: 16, fontSize: 13, color: 'var(--color-warning-text)' }}>
          ⟳ Reconnecting to live updates…
        </div>
      )}

      {/* SSE connection indicator */}
      <div
        role="status"
        aria-label={sseConnected ? 'Live updates connected' : 'Live updates disconnected'}
        title={sseConnected ? 'Live updates connected' : 'Live updates disconnected'}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16, fontSize: 12, color: sseConnected ? 'var(--color-primary)' : 'var(--color-text-faint)' }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: sseConnected ? 'var(--color-success)' : 'var(--color-text-subtle)',
            display: 'inline-block',
            boxShadow: sseConnected ? '0 0 0 3px var(--color-primary-soft)' : 'none',
            transition: 'background 0.3s, box-shadow 0.3s',
          }}
        />
        {sseConnected ? 'Live' : 'Offline'}
      </div>

      {network !== 'mainnet' && <TestnetDisclaimer />}

      {network === 'mainnet' && (
        <div style={{ background: 'var(--color-danger)', color: 'var(--color-on-primary)', borderRadius: 10, padding: '14px 16px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'flex-start' }} role="alert">
          <span style={{ fontSize: 20, flexShrink: 0 }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>Mainnet — Real Funds</div>
            You are connected to <strong>Stellar Mainnet</strong>. All transactions use <strong>real XLM</strong> with real monetary value. Proceed with caution.
          </div>
        </div>
      )}

      {loadError && (
        <div style={{ ...s.msg, background: 'var(--color-danger-soft)', color: 'var(--color-danger)', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{loadError}</span>
          <button style={{ background: 'var(--color-danger)', color: 'var(--color-on-primary)', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }} onClick={load}>Retry</button>
        </div>
      )}

      {loading && !loadError ? <Spinner /> : (
        <>
          <WalletBalanceCard
            wallet={wallet}
            usd={usd}
            network={network}
            funding={funding}
            fundMsg={fundMsg}
            onFund={handleFund}
          />

          <ClaimableBalances
            balances={claimableBalances}
            loading={claimableLoading}
            claimingId={claimingId}
            onClaim={claim}
          />

          {user?.role === 'buyer' && (
            <BudgetPanel
              budget={budget}
              budgetInput={budgetInput}
              setBudgetInput={setBudgetInput}
              budgetMsg={budgetMsg}
              onSave={saveBudget}
            />
          )}

          <TrustlinePanel wallet={wallet} trustlines={trustlines} />

          <SendForm send={send} availableBalance={availableBalance} explorerUrl={explorerUrl} />

          <div style={s.card}>
            <h3 style={{ marginBottom: 4, color: 'var(--color-text)' }}>Referral Program</h3>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 16 }}>Earn 1 XLM for every friend who joins and places their first order.</p>
            <div style={{ background: 'var(--color-surface-muted)', padding: 16, borderRadius: 8, border: '1px dashed var(--color-border-input)' }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 600 }}>Your Referral Code</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-primary)', fontFamily: 'monospace', letterSpacing: 1 }}>
                {wallet?.referralCode || '-'}
              </div>
            </div>
          </div>

          <AlertsPanel alerts={alerts} unreadCount={unreadCount} onMarkRead={markAlertRead} />

          <PaymentStreams
            streams={streamsApi.streams}
            streamsMsg={streamsApi.streamsMsg}
            streamActionId={streamsApi.streamActionId}
            publicKey={wallet?.publicKey}
            streamsApi={streamsApi}
          />

          <TransactionHistory txs={txs} usd={usd} explorerUrl={explorerUrl} />
        </>
      )}
      {confirmDialog}
    </div>
  );
}
