import { useState } from 'react';
import { api } from '../api/client';
import { getErrorMessage } from '../utils/errorMessages';

const EMPTY_FORM = { asset_code: '', asset_issuer: '' };

/** Add and remove custom asset trustlines. */
export function useTrustlines({ confirm, onChanged }) {
  const [showTrustlineForm, setShowTrustlineForm] = useState(false);
  const [tlForm, setTlForm]       = useState(EMPTY_FORM);
  const [tlMsg, setTlMsg]         = useState(null);
  const [tlLoading, setTlLoading] = useState(false);
  const [removingAsset, setRemovingAsset] = useState(null);

  function toggleForm() {
    setShowTrustlineForm(v => !v);
    setTlMsg(null);
  }

  async function addTrustline(assetCode, assetIssuer) {
    setTlLoading(true);
    setTlMsg(null);
    try {
      await api.addTrustline({ asset_code: assetCode, asset_issuer: assetIssuer });
      setTlMsg({ type: 'ok', text: 'Trustline for ' + assetCode + ' added.' });
      setShowTrustlineForm(false);
      setTlForm(EMPTY_FORM);
      onChanged();
    } catch (e) {
      setTlMsg({ type: 'err', text: getErrorMessage(e) });
    } finally {
      setTlLoading(false);
    }
  }

  async function removeTrustline(assetCode, assetIssuer) {
    const ok = await confirm({
      title: 'Remove trustline for ' + assetCode + '?',
      description: 'You must have a zero balance of this asset before removing its trustline.',
      confirmLabel: 'Remove trustline',
      destructive: true,
    });
    if (!ok) return;
    setRemovingAsset(assetCode);
    setTlMsg(null);
    try {
      await api.removeTrustline({ asset_code: assetCode, asset_issuer: assetIssuer });
      setTlMsg({ type: 'ok', text: 'Trustline for ' + assetCode + ' removed.' });
      onChanged();
    } catch (e) {
      setTlMsg({ type: 'err', text: getErrorMessage(e) });
    } finally {
      setRemovingAsset(null);
    }
  }

  return {
    showTrustlineForm, toggleForm,
    tlForm, setTlForm,
    tlMsg, tlLoading, removingAsset,
    addTrustline, removeTrustline,
  };
}
