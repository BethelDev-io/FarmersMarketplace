import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { getErrorMessage } from '../utils/errorMessages';

const s = {
  banner: { background: '#fff8e1', borderBottom: '1px solid #f5a623', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap', fontSize: 14, color: '#6b4e00' },
  btn: { padding: '6px 12px', background: '#2d6a4f', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', minHeight: 36 },
  dismiss: { background: 'none', border: 'none', cursor: 'pointer', color: '#6b4e00', minHeight: 36, fontSize: 16 },
};

// Shown when an action returns 403 email_not_verified (#1390).
export default function EmailVerificationBanner({ email, onDismiss }) {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  async function handleResend() {
    setMessage('');
    setSending(true);
    try {
      await api.resendVerification(email);
      setMessage(t('auth.banner.resent'));
    } catch (err) {
      setMessage(getErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div role="status" style={s.banner}>
      <span>{t('auth.banner.notVerified')}</span>
      <button type="button" style={s.btn} onClick={handleResend} disabled={sending || !email}>
        {t('auth.banner.resend')}
      </button>
      {message && <span>{message}</span>}
      <button type="button" style={s.dismiss} onClick={onDismiss} aria-label={t('auth.banner.dismiss')}>✕</button>
    </div>
  );
}
