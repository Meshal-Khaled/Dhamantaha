import brand from '../assets/brand.png';
import { useSettings } from '../state/settings.jsx';

/** The slim header of the pages made for the presentation: the logo and the language switch, no links into the site. */
export function EventHeader() {
  const { t, language, update } = useSettings();
  const other = language === 'ar' ? 'en' : 'ar';
  return <header className="event-header">
    <div className="container container--event event-header__bar">
      <span className="brand-link brand-link--static">
        <img src={brand} width="40" height="40" alt="" />
        <span translate="no">{t('brand.name')}</span>
      </span>
      <button type="button" className="lang-button" lang={other} onClick={() => update({ language: other })} aria-label={t('header.switchLanguage')}>{t('header.otherLanguage')}</button>
    </div>
  </header>;
}

export function EventFooter() {
  const { t } = useSettings();
  return <footer className="event-footer">
    <span translate="no">{t('brand.name')}</span> · {t('teams.footer')}
  </footer>;
}
