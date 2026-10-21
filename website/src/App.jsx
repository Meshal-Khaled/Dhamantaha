import { Suspense, lazy, useEffect, useRef } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Footer from './components/Footer.jsx';
import Header from './components/Header.jsx';
import Home from './pages/Home.jsx';
import { SettingsProvider, useSettings } from './state/settings.jsx';
import { ToastProvider } from './state/toast.jsx';
import { WalletProvider } from './state/wallet.jsx';

const Receipts = lazy(() => import('./pages/Receipts.jsx'));
const ReceiptDetail = lazy(() => import('./pages/ReceiptDetail.jsx'));
const Add = lazy(() => import('./pages/Add.jsx'));
const SettingsPage = lazy(() => import('./pages/Settings.jsx'));
const HowItWorks = lazy(() => import('./pages/HowItWorks.jsx'));
const Privacy = lazy(() => import('./pages/Privacy.jsx'));
const Help = lazy(() => import('./pages/Help.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

function Shell() {
  const { t } = useSettings();
  const { pathname } = useLocation();
  const main = useRef(null);
  const firstRender = useRef(true);

  // A new page starts at the top, and keyboard focus moves into it so screen readers announce the change.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    window.scrollTo(0, 0);
    main.current?.focus({ preventScroll: true });
  }, [pathname]);

  // A file dropped outside the Add page's drop area would make the browser leave the site and open the file.
  useEffect(() => {
    const keepPage = (event) => { if (event.dataTransfer?.types?.includes('Files')) event.preventDefault(); };
    window.addEventListener('dragover', keepPage);
    window.addEventListener('drop', keepPage);
    return () => { window.removeEventListener('dragover', keepPage); window.removeEventListener('drop', keepPage); };
  }, []);

  const skip = (event) => {
    event.preventDefault();
    main.current?.focus();
  };

  return <>
    <a className="skip-link" href="#main" onClick={skip}>{t('nav.skip')}</a>
    <Header />
    <main id="main" ref={main} tabIndex={-1} className="site-main">
      <ErrorBoundary key={pathname}>
        <Suspense fallback={<p className="page-loading" role="status">{t('common.loading')}</p>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/receipts" element={<Receipts />} />
            <Route path="/receipts/:id" element={<ReceiptDetail />} />
            <Route path="/add" element={<Add />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/help" element={<Help />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </main>
    <Footer />
  </>;
}

export default function App() {
  return <BrowserRouter>
    <SettingsProvider>
      <ToastProvider>
        <WalletProvider>
          <Shell />
        </WalletProvider>
      </ToastProvider>
    </SettingsProvider>
  </BrowserRouter>;
}
