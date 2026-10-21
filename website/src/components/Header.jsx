import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { Menu, Moon, Plus, Settings, Sun, X } from 'lucide-react';
import brand from '../assets/brand.png';
import Button from './Button.jsx';
import { useSettings } from '../state/settings.jsx';

const links = [
  { to: '/', label: 'nav.home', end: true },
  { to: '/receipts', label: 'nav.receipts' },
  { to: '/how-it-works', label: 'nav.how' },
  { to: '/help', label: 'nav.help' },
];

export default function Header() {
  const { t, language, resolvedTheme, update } = useSettings();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { setOpen(false); }, [pathname]);

  const other = language === 'ar' ? 'en' : 'ar';
  const dark = resolvedTheme === 'dark';
  const toggleTheme = () => update({ theme: dark ? 'light' : 'dark' });
  const switchLanguage = () => update({ language: other });

  return <header className="site-header">
    <div className="container site-header__bar">
      <Link to="/" className="brand-link" aria-label={t('brand.home')}>
        <img src={brand} width="40" height="40" alt="" />
        <span translate="no">{t('brand.name')}</span>
      </Link>
      <nav className="site-nav" aria-label={t('nav.main')}>
        {links.map((link) => <NavLink key={link.to} to={link.to} end={link.end}>{t(link.label)}</NavLink>)}
      </nav>
      <div className="site-actions">
        <button type="button" className="lang-button" lang={other} onClick={switchLanguage} aria-label={t('header.switchLanguage')}>{t('header.otherLanguage')}</button>
        <button type="button" className="icon-button site-actions__extra" onClick={toggleTheme} aria-label={dark ? t('header.themeToLight') : t('header.themeToDark')}>
          {dark ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
        </button>
        <Link to="/settings" className="icon-button site-actions__extra" aria-label={t('nav.settings')}><Settings size={20} aria-hidden="true" /></Link>
        <Button to="/add" size="sm" className="site-cta" aria-label={t('nav.add')}><Plus size={18} aria-hidden="true" /><span>{t('nav.add')}</span></Button>
        <button type="button" className="icon-button menu-button" aria-expanded={open} aria-controls="mobile-menu"
          aria-label={open ? t('nav.closeMenu') : t('nav.openMenu')} onClick={() => setOpen(!open)}>
          {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>
      </div>
    </div>
    {open && <nav id="mobile-menu" className="mobile-menu" aria-label={t('nav.main')}>
      <div className="container mobile-menu__list">
        {links.map((link) => <NavLink key={link.to} to={link.to} end={link.end}>{t(link.label)}</NavLink>)}
        <NavLink to="/settings">{t('nav.settings')}</NavLink>
        <NavLink to="/privacy">{t('nav.privacy')}</NavLink>
        <button type="button" className="mobile-menu__theme" onClick={toggleTheme}>
          {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
          {dark ? t('header.themeToLight') : t('header.themeToDark')}
        </button>
      </div>
    </nav>}
  </header>;
}
