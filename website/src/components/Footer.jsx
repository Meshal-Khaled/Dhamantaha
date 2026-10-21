import { Link } from 'react-router';
import { Lock } from 'lucide-react';
import brand from '../assets/brand.png';
import { SUPPORT_EMAIL } from '../i18n/catalog.js';
import { useSettings } from '../state/settings.jsx';

export default function Footer() {
  const { t } = useSettings();
  return <footer className="site-footer">
    <div className="container footer-grid">
      <div className="footer-brand">
        <Link to="/" className="brand-link brand-link--footer" aria-label={t('brand.home')}>
          <img src={brand} width="36" height="36" alt="" />
          <span translate="no">{t('brand.name')}</span>
        </Link>
        <p>{t('footer.about')}</p>
        <p className="footer-note"><Lock size={15} aria-hidden="true" /><span>{t('footer.privacyNote')}</span></p>
      </div>
      <nav aria-labelledby="footer-product">
        <h2 id="footer-product">{t('footer.product')}</h2>
        <ul>
          <li><Link to="/receipts">{t('nav.receipts')}</Link></li>
          <li><Link to="/add">{t('nav.add')}</Link></li>
          <li><Link to="/how-it-works">{t('nav.how')}</Link></li>
          <li><Link to="/settings">{t('nav.settings')}</Link></li>
        </ul>
      </nav>
      <nav aria-labelledby="footer-support">
        <h2 id="footer-support">{t('footer.support')}</h2>
        <ul>
          <li><Link to="/help">{t('nav.help')}</Link></li>
          <li><Link to="/privacy">{t('nav.privacy')}</Link></li>
          <li><a href={`mailto:${SUPPORT_EMAIL}?subject=Dhamantaha`}>{t('footer.contact')}</a></li>
        </ul>
      </nav>
    </div>
    <div className="container footer-bottom"><span>{t('footer.copyright', { year: new Date().getFullYear() })}</span></div>
  </footer>;
}
