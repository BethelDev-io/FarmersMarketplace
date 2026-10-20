import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';

const s = {
  wrap: { minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, textAlign: 'center' },
  content: { maxWidth: 500 },
  title: { fontSize: 48, fontWeight: 700, color: '#2d6a4f', marginBottom: 16 },
  body: { fontSize: 18, color: '#595959', marginBottom: 32, lineHeight: 1.6 },
  links: { display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' },
  link: {
    padding: '12px 24px',
    background: '#2d6a4f',
    color: '#fff',
    textDecoration: 'none',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 600,
    minHeight: 44,
    display: 'inline-flex',
    alignItems: 'center',
  },
  linkSecondary: {
    padding: '12px 24px',
    background: '#f0f0f0',
    color: '#2d6a4f',
    textDecoration: 'none',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 600,
    minHeight: 44,
    display: 'inline-flex',
    alignItems: 'center',
  },
  page:   { maxWidth: 600, margin: '0 auto', padding: '60px 24px', textAlign: 'center' },
  icon:   { fontSize: 48, marginBottom: 12 },
  title:  { fontSize: 24, fontWeight: 700, color: '#2d6a4f', marginBottom: 8 },
  body:   { fontSize: 14, color: '#555', marginBottom: 24, lineHeight: 1.6 },
  links:  { display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' },
  link:   { display: 'inline-block', padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14, textDecoration: 'none', minHeight: 44, boxSizing: 'border-box', lineHeight: '24px' },
  primary:   { background: '#2d6a4f', color: '#fff' },
  secondary: { background: '#fff', color: '#2d6a4f', border: '1px solid #2d6a4f' },
};

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <div style={s.wrap}>
      <Helmet>
        <title>{t('notFound.title')} – Farmers Marketplace</title>
      </Helmet>
      <div style={s.content}>
        <div style={s.title}>{t('notFound.title')}</div>
        <div style={s.body}>{t('notFound.body')}</div>
        <div style={s.links}>
          <Link to="/marketplace" style={s.link}>{t('notFound.toMarketplace')}</Link>
          <Link to="/" style={s.linkSecondary}>{t('notFound.toHome')}</Link>
        </div>
  return (
    <div style={s.page}>
      <Helmet>
        <title>{t('notFound.title')} – Farmers Marketplace</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div style={s.icon} aria-hidden="true">🌾</div>
      <h1 style={s.title}>{t('notFound.heading')}</h1>
      <p style={s.body}>{t('notFound.body')}</p>
      <div style={s.links}>
        <Link to="/marketplace" style={{ ...s.link, ...s.primary }}>{t('notFound.toMarketplace')}</Link>
        <Link to="/" style={{ ...s.link, ...s.secondary }}>{t('notFound.toHome')}</Link>
      </div>
    </div>
  );
}
