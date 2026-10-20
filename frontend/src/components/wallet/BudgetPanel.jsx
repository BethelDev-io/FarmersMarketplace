import React from 'react';
import { s, msgTone } from './walletStyles';

/** Buyer monthly spending budget: edit the limit and see progress against it. */
export default function BudgetPanel({ budget, budgetInput, setBudgetInput, budgetMsg, onSave }) {
  const percentUsed = Number(budget?.percentUsed || 0);

  return (
    <div style={s.card}>
      <h3 style={{ marginBottom: 12, color: 'var(--color-text)' }}>Monthly Budget</h3>
      <form onSubmit={onSave}>
        <label style={s.label}>Budget limit (XLM)</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            style={{ ...s.input, marginBottom: 0 }}
            type="number"
            min="0"
            step="any"
            placeholder="Optional"
            value={budgetInput}
            onChange={(e) => setBudgetInput(e.target.value)}
          />
          <button type="submit" style={{ ...s.btn, marginTop: 0, whiteSpace: 'nowrap' }}>Save</button>
        </div>
      </form>

      {budget?.budget != null && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
            Spent: {Number(budget.spentThisMonth || 0).toFixed(2)} / {Number(budget.budget).toFixed(2)} XLM
          </div>
          <div style={{ height: 12, background: 'var(--color-track)', borderRadius: 999, overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.min(100, percentUsed)}%`,
                height: '100%',
                background: percentUsed >= 80 ? 'var(--color-danger)' : 'var(--color-primary)',
                transition: 'width 200ms ease',
              }}
            />
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>
            Remaining: {Number(budget.remaining || 0).toFixed(2)} XLM
          </div>
          {percentUsed >= 80 && (
            <div style={{ ...s.msg, background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)', marginTop: 10 }}>
              Warning: you have used {percentUsed.toFixed(0)}% of your monthly budget.
            </div>
          )}
        </div>
      )}

      {budgetMsg && (
        <div style={{ ...s.msg, ...msgTone(budgetMsg.type) }}>
          {budgetMsg.text}
        </div>
      )}
    </div>
  );
}
