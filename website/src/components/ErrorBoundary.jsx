import { Component } from 'react';
import { TriangleAlert } from 'lucide-react';
import { loadPreferences } from '../lib/preferences.js';
import { translate } from '../i18n/translate.js';
import { useSettings } from '../state/settings.jsx';

function Fallback() {
  // Outside the settings provider (a crash while it starts) the saved language is read directly.
  const settings = useSettings();
  const t = settings?.t ?? ((key) => translate(loadPreferences().language, key));
  return <section className="container notice-page" role="alert">
    <TriangleAlert size={44} aria-hidden="true" />
    <h1>{t('error.title')}</h1>
    <p>{t('error.body')}</p>
    <div className="notice-page__actions">
      <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>{t('error.reload')}</button>
      <a className="btn btn--secondary" href="/">{t('error.home')}</a>
    </div>
  </section>;
}

/** A page that throws while drawing shows this message instead of leaving a blank screen. */
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error) { console.error('[Dhamantaha] A page failed to render.', error); }

  render() { return this.state.failed ? <Fallback /> : this.props.children; }
}
