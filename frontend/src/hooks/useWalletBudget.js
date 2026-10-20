import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { getErrorMessage } from '../utils/errorMessages';

/** Buyer monthly spending budget. Only fetched when `enabled`. */
export function useWalletBudget({ enabled }) {
  const [budget, setBudget] = useState(null);
  const [budgetInput, setBudgetInput] = useState('');
  const [budgetMsg, setBudgetMsg] = useState(null);

  useEffect(() => {
    if (!enabled || typeof api.getBudget !== 'function') return;
    api.getBudget()
      .then((res) => {
        setBudget(res);
        setBudgetInput(res.budget != null ? String(res.budget) : '');
      })
      .catch(() => {});
  }, [enabled]);

  async function saveBudget(e) {
    e.preventDefault();
    if (typeof api.setBudget !== 'function') return;

    setBudgetMsg(null);
    try {
      const value = budgetInput.trim() === '' ? null : parseFloat(budgetInput);
      const res = await api.setBudget(value);
      setBudget(res);
      setBudgetMsg({ type: 'ok', text: 'Monthly budget updated' });
    } catch (e) {
      setBudgetMsg({ type: 'err', text: getErrorMessage(e) });
    }
  }

  return { budget, budgetInput, setBudgetInput, budgetMsg, saveBudget };
}
