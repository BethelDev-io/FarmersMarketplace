import React from 'react';
import { s, msgTone } from './walletStyles';

const COMMON_ASSETS = [
  { code: 'USDC', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN', label: 'USDC (Circle)' },
  { code: 'AQUA', issuer: 'GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA', label: 'AQUA' },
];

/** Asset balances with add (quick-add or custom) and remove trustline actions. */
export default function TrustlinePanel({ wallet, trustlines }) {
  const {
    showTrustlineForm, toggleForm, tlForm, setTlForm,
    tlMsg, tlLoading, removingAsset, addTrustline, removeTrustline,
  } = trustlines;
  const customBalances = (wallet?.balances ?? []).filter(b => b.asset_type !== 'native');

  return (
    <div style={s.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, color: 'var(--color-text)' }}>Asset Balances</h3>
        <button style={s.btnSm} onClick={toggleForm}>
          {showTrustlineForm ? 'Cancel' : '+ Add Trustline'}
        </button>
      </div>

      {tlMsg && (
        <div style={{ ...s.msg, ...msgTone(tlMsg.type), marginBottom: 12 }}>
          {tlMsg.text}
        </div>
      )}

      {showTrustlineForm && (
        <div style={{ background: 'var(--color-primary-subtle)', border: '1px solid var(--color-primary-border)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary)', marginBottom: 10 }}>Quick Add</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {wallet?.rewardToken && (
              <button key={wallet.rewardToken.code} style={{ ...s.btnOutline, background: 'var(--color-warning-soft)', borderColor: 'var(--color-warning-border)' }} disabled={tlLoading} onClick={() => addTrustline(wallet.rewardToken.code, wallet.rewardToken.issuer)}>
                ⭐ {wallet.rewardToken.code} (Reward Token)
              </button>
            )}
            {COMMON_ASSETS.map(a => (
              <button key={a.code} style={s.btnOutline} disabled={tlLoading} onClick={() => addTrustline(a.code, a.issuer)}>
                {a.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>Custom Asset</div>
          <label style={s.label}>Asset Code</label>
          <input
            style={s.input}
            placeholder="e.g. USDC"
            value={tlForm.asset_code}
            onChange={e => setTlForm(f => ({ ...f, asset_code: e.target.value.toUpperCase() }))}
            maxLength={12}
          />
          <label style={s.label}>Issuer Address</label>
          <input
            style={s.input}
            placeholder="G..."
            spellCheck={false}
            value={tlForm.asset_issuer}
            onChange={e => setTlForm(f => ({ ...f, asset_issuer: e.target.value.trim() }))}
          />
          <button
            style={{ ...s.btn, marginTop: 12 }}
            disabled={tlLoading || !tlForm.asset_code || !tlForm.asset_issuer}
            onClick={() => addTrustline(tlForm.asset_code, tlForm.asset_issuer)}
          >
            {tlLoading ? 'Adding...' : 'Add Trustline'}
          </button>
        </div>
      )}

      {customBalances.length === 0 ? (
        <p style={{ color: 'var(--color-text-faint)', fontSize: 14 }}>No custom asset trustlines yet. Add one above to hold USDC or other Stellar assets.</p>
      ) : (
        customBalances.map(b => {
          const isRewardToken = wallet?.rewardToken && b.asset_code === wallet.rewardToken.code && b.asset_issuer === wallet.rewardToken.issuer;
          return (
            <div key={b.asset_code + '-' + b.asset_issuer} style={s.assetRow}>
              <div>
                <div style={s.assetCode}>
                  {isRewardToken && <span style={{ marginRight: 6 }} title="Reward token">⭐</span>}
                  {b.asset_code}
                </div>
                <div style={s.assetIssuer}>{b.asset_issuer ? b.asset_issuer.slice(0, 12) + '...' + b.asset_issuer.slice(-6) : ''}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={s.assetBal}>{b.balance.toFixed(2)}</div>
                <button
                  style={s.btnDanger}
                  disabled={removingAsset === b.asset_code}
                  onClick={() => removeTrustline(b.asset_code, b.asset_issuer)}
                  title="Remove trustline (requires zero balance)"
                >
                  {removingAsset === b.asset_code ? '...' : 'Remove'}
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
