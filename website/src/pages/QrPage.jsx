import { useId, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { CircleAlert, Download, Pencil, Printer, RotateCcw } from 'lucide-react';
import Button from '../components/Button.jsx';
import useNoIndex from '../components/useNoIndex.js';
import usePageTitle from '../components/usePageTitle.js';
import { isPrivateHost, normalizeAddress, pageAddress, qrMatrix, qrPath, qrPixels, qrSvg, siteForCode } from '../lib/qr.js';
import { PUBLIC_SITE } from '../lib/site.js';
import { useSettings } from '../state/settings.jsx';

function save(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * A large QR code for the teams page, to show on a screen, print, or paste into slides. The code always leads to the
 * teams page of the public website, whatever address this page is opened from. The address can be changed on the page
 * (or with ?url=) when the website moves to another name.
 */
export default function QrPage() {
  const { t } = useSettings();
  usePageTitle('qr.tab');
  useNoIndex();
  const inputId = useId();
  const [params] = useSearchParams();
  const [typed, setTyped] = useState(() => params.get('url') ?? '');
  const [startsOpen] = useState(() => Boolean(params.get('url')));
  const standard = useMemo(() => pageAddress(siteForCode(window.location.origin, PUBLIC_SITE)), []);
  const custom = normalizeAddress(typed);
  const invalid = typed.trim() !== '' && custom === null;
  const address = custom ?? standard;
  const matrix = useMemo(() => qrMatrix(address), [address]);
  const { size, d } = useMemo(() => qrPath(matrix), [matrix]);
  const host = new URL(address).hostname;

  const downloadSvg = () => save(new Blob([qrSvg(matrix)], { type: 'image/svg+xml' }), 'dhamantaha-teams-qr.svg');
  const downloadPng = () => {
    const { width, height, data } = qrPixels(matrix, Math.ceil(1000 / size));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0);
    canvas.toBlob((blob) => { if (blob) save(blob, 'dhamantaha-teams-qr.png'); }, 'image/png');
  };

  return <div className="container container--event qr-page">
    {isPrivateHost(host) && <p className="alert alert--warn qr-warning" role="note"><CircleAlert size={18} aria-hidden="true" />{t('qr.local', { host })}</p>}
    {/* The card is always dark on white, whatever the theme, because that is what phone cameras read best. */}
    <section className="qr-card" data-theme="light" aria-labelledby="qr-title">
      <h1 id="qr-title">{t('qr.title')}</h1>
      <p className="muted">{t('qr.lead')}</p>
      <svg className="qr-code" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={t('qr.alt', { url: address })} shapeRendering="crispEdges">
        <rect width={size} height={size} fill="#ffffff" />
        <path d={d} fill="#0a2925" />
      </svg>
      <div className="qr-address">
        <small>{t('qr.address')}</small>
        <code dir="ltr">{address}</code>
      </div>
      <div className="qr-actions">
        <Button variant="secondary" size="sm" onClick={downloadSvg}><Download size={18} aria-hidden="true" />{t('qr.download.svg')}</Button>
        <Button variant="secondary" size="sm" onClick={downloadPng}><Download size={18} aria-hidden="true" />{t('qr.download.png')}</Button>
        <Button variant="secondary" size="sm" onClick={() => window.print()}><Printer size={18} aria-hidden="true" />{t('qr.print')}</Button>
      </div>
    </section>
    <details className="qr-edit" open={startsOpen || undefined}>
      <summary><Pencil size={16} aria-hidden="true" />{t('qr.edit')}</summary>
      <div className="qr-edit__body">
        <div className="field">
          <label htmlFor={inputId}>{t('qr.edit.label')}</label>
          <input className="input" id={inputId} dir="ltr" value={typed} onChange={(event) => setTyped(event.target.value)}
            placeholder={new URL(standard).host} inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            aria-invalid={invalid} aria-describedby={`${inputId}-hint`} />
          <small className="muted" id={`${inputId}-hint`}>{t('qr.edit.hint')}</small>
          {invalid && <small className="field__error" role="alert"><CircleAlert size={14} aria-hidden="true" />{t('qr.edit.invalid', { example: new URL(standard).host })}</small>}
        </div>
        {typed && <Button variant="ghost" size="sm" onClick={() => setTyped('')}><RotateCcw size={16} aria-hidden="true" />{t('qr.edit.reset')}</Button>}
      </div>
    </details>
  </div>;
}
