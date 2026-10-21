import { Component } from 'react';
import { loadAppearance } from './appearance.js';

/**
 * Without this, one render error (for example a missing import on a single screen) unmounts the whole app and
 * leaves a blank white page that cannot recover. This shows a message and a way back instead.
 */
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('[Dhamantaha] A screen failed to render.', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const { language, theme } = loadAppearance();
    const arabic = language === 'ar';
    return (
      <main className={`app theme-${theme}`} dir={arabic ? 'rtl' : 'ltr'} lang={arabic ? 'ar' : 'en'}>
        <section className="card empty" role="alert">
          <h2>{arabic ? 'تعذّر عرض هذه الشاشة' : 'This screen could not be shown'}</h2>
          <p>{arabic ? 'فواتيرك محفوظة على جهازك ولم تتأثر. أعد التحميل للمتابعة.' : 'Your saved receipts are safe on this device. Reload to continue.'}</p>
          <button className="btn" onClick={() => window.location.reload()}>{arabic ? 'إعادة التحميل' : 'Reload'}</button>
        </section>
      </main>
    );
  }
}
