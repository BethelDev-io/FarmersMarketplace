import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { isValidEmail } from '../utils/validation';
import { getErrorMessage } from '../utils/errorMessages';
import { authStyles as s } from './Auth';

export function VerifyEmailPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState(token ? 'verifying' : 'missingToken');
  const [email, setEmail] = useState(user?.email || '');
  const [emailError, setEmailError] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resent, setResent] = useState(false);
  // Verification tokens are single-use: a StrictMode double-run must not send a second request.
  const requested = useRef(false);

  useEffect(() => {
    if (!token || requested.current) return;
    requested.current = true;
    api.verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        // 400 means the token is unknown, used or expired; anything else is a real error.
        if (err.status === 400) setStatus('expired');
        else { setStatus('error'); setFormError(getErrorMessage(err)); }
      });
  }, [token]);

  async function handleResend(e) {
    e.preventDefault();
    setFormError('');
    if (!isValidEmail(email)) { setEmailError(t('auth.invalidEmail')); return; }
    setEmailError('');
    setSubmitting(true);
    try {
      await api.resendVerification(email.trim());
      setResent(true);
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const canResend = status === 'expired' || status === 'missingToken';

  return (
    <div style={s.wrap}>
      <Helmet>
        <title>Verify email – Farmers Marketplace</title>
        <meta name="description" content="Verify your email address for Farmers Marketplace." />
      </Helmet>
      <div style={s.card}>
        <div style={s.title}>{t('auth.verify.title')}</div>
        {status === 'verifying' && <div role="status">{t('auth.verify.verifying')}</div>}
        {status === 'success' && (
          <>
            <div role="status">{t('auth.verify.success')}</div>
            <Link to="/login" style={s.link}>{t('auth.backToLogin')}</Link>
          </>
        )}
        {status === 'error' && <div role="alert" style={s.formErr}>{formError}</div>}
        {canResend && (
          <>
            <div role="alert">{t(status === 'expired' ? 'auth.verify.expired' : 'auth.verify.missingToken')}</div>
            {resent ? (
              <div role="status" style={{ marginTop: 16 }}>{t('auth.verify.resent')}</div>
            ) : (
              <form onSubmit={handleResend} noValidate style={{ marginTop: 16 }}>
                <div style={s.field}>
                  <label style={s.label} htmlFor="verify-email">{t('auth.email')}</label>
                  <input id="verify-email" style={emailError ? s.inputErr : s.input} type="email"
                    value={email} onChange={e => { setEmail(e.target.value); setEmailError(''); }} autoComplete="email"
                    aria-invalid={!!emailError}
                    aria-describedby={emailError ? 'verify-email-err' : undefined} />
                  {emailError && <div id="verify-email-err" style={s.err} role="alert">{emailError}</div>}
                </div>
                {formError && <div style={s.formErr} role="alert">{formError}</div>}
                <button style={s.btn} type="submit" disabled={submitting}>{t('auth.verify.resendBtn')}</button>
              </form>
            )}
          </>
        )}
        {status !== 'success' && <Link to="/login" style={s.link}>{t('auth.backToLogin')}</Link>}
      </div>
    </div>
  );
}
