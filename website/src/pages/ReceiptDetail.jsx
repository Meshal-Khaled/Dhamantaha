import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Check, ChevronRight, CircleCheck, Clock3, Download, ExternalLink, FileText, KeyRound, LoaderCircle, PencilLine, Phone, ScanText, ShieldQuestion, Store, Trash2, TriangleAlert, Undo2 } from 'lucide-react';
import Button from '../components/Button.jsx';
import Dialog from '../components/Dialog.jsx';
import EditDialog from '../components/EditDialog.jsx';
import ItemExtras, { ItemIcon } from '../components/ItemExtras.jsx';
import StatusPill from '../components/StatusPill.jsx';
import WarrantyMeter from '../components/WarrantyMeter.jsx';
import { describeError } from '../lib/api.js';
import { fieldLabel, formatDate, formatMoney, formatNumber } from '../lib/format.js';
import { deadlineText, endedPolicy } from '../lib/policy-labels.js';
import { receiptWallet } from '../lib/receipt-store.js';
import { formatBytes, receiptStatus, receiptTitle } from '../lib/receipt-view.js';
import { itemName, linePrice, products, receiptCards, receiptPolicy } from '../lib/wallet-view.js';
import { useSettings } from '../state/settings.jsx';
import { useToast } from '../state/toast.jsx';
import { useWallet } from '../state/wallet.jsx';

function ProgressPanel() {
  const { t, arabic } = useSettings();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return <section className="card progress-panel" aria-live="polite">
    <h2>{t('detail.progress.title')}</h2>
    <ol className="progress-steps">
      <li className="progress-steps__done"><Check size={16} aria-hidden="true" />{t('detail.progress.saved')}</li>
      <li className="progress-steps__current" aria-current="step"><LoaderCircle size={16} className="spin" aria-hidden="true" />{t('detail.progress.reading')}</li>
      <li><CircleCheck size={16} aria-hidden="true" />{t('detail.progress.ready')}</li>
    </ol>
    <p>{t('detail.progress.note')}</p>
    <p className="muted"><Clock3 size={15} aria-hidden="true" />{t('detail.progress.seconds', { n: formatNumber(elapsed, arabic) })}</p>
  </section>;
}

function Failure({ error, onRetry, retryLabel }) {
  const { t, arabic } = useSettings();
  return <section className="alert alert--bad alert--panel" role="alert">
    <TriangleAlert size={22} aria-hidden="true" />
    <div>
      <h2>{t('detail.error.title')}</h2>
      <p>{describeError(error, arabic)}</p>
      {error.code === 'unauthorized_client' && <p><Link to="/settings">{t('detail.keyLink')}</Link></p>}
      {error.requestId && <details className="technical"><summary>{t('detail.error.reference')}</summary><p><bdi>{error.requestId}</bdi></p></details>}
    </div>
    {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>{retryLabel ?? t('common.tryAgain')}</Button>}
  </section>;
}

function PeriodLine({ date, days, label, kind }) {
  const { arabic } = useSettings();
  const ended = days !== null && days < 0;
  return <div className={`period${ended ? ' period--ended' : ''}`}>
    {ended ? <strong>{endedPolicy(kind, arabic)}</strong> : <>
      <span>{label}</span>
      <strong title={days === null ? undefined : formatDate(date, arabic)}>{deadlineText(days, arabic)}</strong>
    </>}
  </div>;
}

function ReturnCard({ receipt }) {
  const { t } = useSettings();
  const policy = receiptPolicy(receipt);
  return <section className="card">
    <h2 className="card__title"><Undo2 size={20} aria-hidden="true" />{t('detail.return.title')}</h2>
    {policy.text ? <>
      {policy.returnEnd && <PeriodLine date={policy.returnEnd} days={policy.returnDays} label={t('detail.return.refund')} kind="refund" />}
      {policy.exchangeEnd && <PeriodLine date={policy.exchangeEnd} days={policy.exchangeDays} label={t('detail.return.exchange')} kind="exchange" />}
      <p className="policy-text" dir="auto">{policy.text}</p>
    </> : <p className="muted">{t('detail.return.none')}</p>}
  </section>;
}

function ItemCard({ entry, record, currency }) {
  const { t, arabic, priceView } = useSettings();
  const { item } = entry;
  const name = itemName(item) || t('edit.product');
  const { quantity, unitPrice, total } = linePrice(item);
  const provider = item.warranty?.provider;
  const printed = item.description?.normalize('NFKC').trim();
  const noWarranty = entry.warrantyDays === null && !item.warranty?.sourceText && !item.localPolicy?.warranty;
  const showUnit = priceView === 'unit' && quantity > 1 && unitPrice !== null;
  return <article className="card item-card" id={`product-${entry.index}`}>
    <header className="item-card__head">
      <ItemIcon item={item} />
      <div className="item-card__title">
        <h3><bdi>{name}</bdi></h3>
        {quantity > 1 && priceView === 'total' && <p className="muted small">{t('detail.item.quantity')} {formatNumber(quantity, arabic)}</p>}
      </div>
      <strong className="item-card__price"><bdi>{showUnit ? `${formatNumber(quantity, arabic)} × ${formatMoney(unitPrice, currency, arabic)}` : formatMoney(total, currency, arabic)}</bdi></strong>
    </header>

    {noWarranty ? <p className="muted">{t('detail.item.noWarranty')}</p> : <>
      <WarrantyMeter days={entry.warrantyDays} percent={entry.warrantyProgress} label={t('detail.item.warranty')} />
      {entry.warrantyEnd && <p className="muted small">{t(entry.warrantyDays !== null && entry.warrantyDays < 0 ? 'detail.item.endedOn' : 'detail.item.nextWarranty', { date: formatDate(entry.warrantyEnd, arabic) })}</p>}
    </>}
    {entry.returnSource === 'local' && <PeriodLine date={entry.returnEnd} days={entry.returnDays} label={t('detail.return.refund')} kind="return" />}

    {(provider || item.productIdentifier || item.category) && <dl className="facts facts--inline">
      {provider && <div><dt>{t('detail.item.provider')}</dt><dd><bdi>{provider}</bdi></dd></div>}
      {item.productIdentifier && <div><dt>{t('detail.item.code')}</dt><dd><bdi>{item.productIdentifier}</bdi></dd></div>}
      {item.category && <div><dt>{t('detail.item.category')}</dt><dd><bdi>{item.category.normalize('NFKC')}</bdi></dd></div>}
    </dl>}
    {item.warranty?.sourceText && <details className="more"><summary>{t('detail.item.terms')}</summary><p className="policy-text" dir="auto">{item.warranty.sourceText}</p></details>}
    {(item.localPolicy?.warranty || item.localPolicy?.returns) && <p className="muted small">{t('detail.item.localNote')}</p>}
    {printed && printed !== name && <p className="muted small"><span>{t('detail.item.printed')}: </span><bdi dir="auto">{printed}</bdi></p>}
    <ItemExtras record={record} entry={entry} />
  </article>;
}

export default function ReceiptDetail() {
  const { id } = useParams();
  const { t, arabic, clientKey } = useSettings();
  const { records, loading, busy, failures, unsaved, health, analyze, retryUnsaved, remove } = useWallet();
  const toast = useToast();
  const navigate = useNavigate();
  const record = records.find((row) => row.id === id);
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // The original lives in its own store; load it once for the preview and the open and download links.
  useEffect(() => {
    let alive = true;
    setFile(null);
    setPreviewFailed(false);
    receiptWallet.get(id).then((result) => { if (alive) setFile(result.file); }).catch(() => {});
    return () => { alive = false; };
  }, [id]);
  useEffect(() => {
    if (!file) { setFileUrl(null); return; }
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const analysis = unsaved[id] ?? record?.analysis ?? null;
  const card = useMemo(() => (record ? receiptCards([{ ...record, analysis }])[0] : null), [record, analysis]);
  const entries = useMemo(() => (record && analysis ? products([{ ...record, analysis }]) : []), [record, analysis]);
  const title = card ? receiptTitle(card) : '';

  useEffect(() => {
    if (title) document.title = `${title} · ${t('brand.name')}`;
  }, [title, t]);

  if (!record) {
    return <div className="container page">
      {loading ? <p className="loading-line" role="status">{t('detail.opening')}</p> : <section className="empty">
        <span className="empty__icon"><FileText size={32} aria-hidden="true" /></span>
        <h1 className="empty__title">{t('detail.missing.title')}</h1>
        <p>{t('detail.missing.body')}</p>
        <Button to="/receipts">{t('detail.missing.link')}</Button>
      </section>}
    </div>;
  }

  const receipt = analysis?.receipt ?? {};
  const analyzing = busy[id] === 'analyzing';
  const failure = failures[id];
  const hasUnsaved = Boolean(unsaved[id]);
  const keyMissing = !analysis && health.state === 'ok' && health.body?.clientKeyRequired && !clientKey;
  const phone = receipt.customerServicePhone;
  const review = analysis?.review;
  const isImage = file?.type?.startsWith('image/');

  const startAnalyze = () => { if (record.analysis) setDialog('again'); else analyze(id); };
  const confirmAnalyze = () => { setDialog(null); analyze(id); };
  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await remove(id);
      toast(t('toast.deleted'));
      navigate('/receipts', { replace: true });
    } catch (error) {
      toast(describeError(error, arabic), 'error');
      setDeleting(false);
      setDialog(null);
    }
  };

  return <div className="container page">
    <nav className="breadcrumb" aria-label={t('nav.receipts')}>
      <Link to="/receipts">{t('nav.receipts')}</Link>
      <ChevronRight size={16} className="mirror" aria-hidden="true" />
      <span aria-current="page"><bdi>{title}</bdi></span>
    </nav>

    <header className="detail-head">
      <div className="detail-head__title">
        <h1><bdi>{title}</bdi></h1>
        <p className="muted">
          {[receipt.branchName, receipt.purchaseDate && formatDate(receipt.purchaseDate, arabic), receipt.receiptNumber].filter(Boolean).join(' · ') || `${t('detail.fact.saved')} ${formatDate(record.createdAt, arabic)}`}
        </p>
      </div>
      <div className="detail-head__meta">
        <StatusPill status={receiptStatus(card)} />
        {analysis && <strong className="detail-head__total"><bdi>{formatMoney(card.total, receipt.currency, arabic)}</bdi></strong>}
      </div>
    </header>

    <div className="detail-grid">
      <div className="detail-main">
        {analyzing && <ProgressPanel />}
        {failure && !analyzing && <Failure error={failure} onRetry={hasUnsaved ? () => retryUnsaved(id) : () => analyze(id)} retryLabel={hasUnsaved ? t('detail.unsaved.retry') : undefined} />}
        {hasUnsaved && !analyzing && <p className="muted"><TriangleAlert size={16} aria-hidden="true" />{t('detail.unsaved.body')}</p>}

        {!analysis && !analyzing && <section className="card unread">
          <span className="unread__icon"><ScanText size={30} aria-hidden="true" /></span>
          <div>
            <h2>{t('detail.unread.title')}</h2>
            <p>{t('detail.unread.body')}</p>
            {keyMissing && <p className="alert-inline"><KeyRound size={16} aria-hidden="true" />{t('detail.keyNeeded')} <Link to="/settings">{t('detail.keyLink')}</Link></p>}
            <Button onClick={() => analyze(id)}><ScanText size={18} aria-hidden="true" />{t('detail.actions.analyze')}</Button>
          </div>
        </section>}

        {analysis && <>
          <section className="card summary-card">
            <div className="summary-card__head">
              <span className="summary-card__avatar"><Store size={22} aria-hidden="true" /></span>
              <h2>{t('detail.title.fallback')}</h2>
            </div>
            <dl className="facts">
              {receipt.branchName && <div><dt>{t('detail.fact.branch')}</dt><dd><bdi>{receipt.branchName}</bdi></dd></div>}
              <div><dt>{t('detail.fact.date')}</dt><dd>{formatDate(receipt.purchaseDate, arabic)}</dd></div>
              {receipt.receiptNumber && <div><dt>{t('detail.fact.number')}</dt><dd><bdi>{receipt.receiptNumber}</bdi></dd></div>}
              <div><dt>{t('detail.fact.total')}</dt><dd><bdi>{formatMoney(card.total, receipt.currency, arabic)}</bdi></dd></div>
              {phone && <div><dt>{t('detail.fact.service')}</dt><dd><a className="phone-link" href={`tel:${phone.replace(/[\s-]/g, '')}`}><Phone size={15} aria-hidden="true" /><bdi dir="ltr">{phone}</bdi></a></dd></div>}
              <div><dt>{t('detail.fact.saved')}</dt><dd>{formatDate(record.createdAt, arabic)}</dd></div>
            </dl>
            {receipt.warrantyNotes && <p className="policy-text" dir="auto">{receipt.warrantyNotes}</p>}
          </section>

          <section aria-labelledby="items-title">
            <h2 id="items-title" className="section-heading">{t('detail.items.title')}</h2>
            <div className="stack">
              {entries.map((entry) => <ItemCard key={entry.index} entry={entry} record={record} currency={receipt.currency} />)}
            </div>
          </section>

          <ReturnCard receipt={receipt} />

          {(review?.missingFields?.length > 0 || review?.uncertainties?.length > 0) && <section className="card review-card">
            <h2 className="card__title"><ShieldQuestion size={20} aria-hidden="true" />{t('detail.review.title')}</h2>
            {review.missingFields?.length > 0 && <p>{t('detail.review.check')}: {review.missingFields.map((field) => fieldLabel(field, arabic)).join(arabic ? '، ' : ', ')}</p>}
            {review.uncertainties?.map((entry, i) => <p key={i}><strong>{fieldLabel(entry.field, arabic)}</strong>: <span dir="auto">{entry.note}</span></p>)}
          </section>}

          {analysis.requestId && <details className="technical"><summary>{t('detail.reference')}</summary><p><bdi>{analysis.requestId}</bdi></p></details>}
        </>}
      </div>

      <aside className="detail-aside">
        <section className="card original-card" aria-labelledby="original-title">
          <h2 id="original-title" className="card__title">{t('detail.original.title')}</h2>
          <div className="original-card__preview">
            {isImage && fileUrl && !previewFailed ? <img src={fileUrl} alt={t('detail.original.title')} onError={() => setPreviewFailed(true)} /> : <div className="original-card__pdf"><FileText size={44} aria-hidden="true" /><span>{t(isImage ? 'detail.original.noPreview' : 'detail.original.pdf')}</span></div>}
          </div>
          <p className="original-card__meta" dir="auto">{record.name} · {formatBytes(record.size, arabic)}</p>
          {fileUrl && <div className="original-card__actions">
            <Button variant="secondary" size="sm" href={fileUrl} target="_blank" rel="noopener"><ExternalLink size={16} aria-hidden="true" />{t('common.openInTab')}</Button>
            <Button variant="secondary" size="sm" href={fileUrl} download={record.name}><Download size={16} aria-hidden="true" />{t('common.download')}</Button>
          </div>}
        </section>

        <section className="card actions-card" aria-labelledby="actions-title">
          <h2 id="actions-title" className="card__title">{t('detail.actions.title')}</h2>
          {record.analysis && <Button block disabled={analyzing || hasUnsaved} onClick={startAnalyze}>
            {analyzing ? <LoaderCircle size={18} className="spin" aria-hidden="true" /> : <ScanText size={18} aria-hidden="true" />}{t('detail.actions.analyzeAgain')}
          </Button>}
          {record.analysis && <Button variant="secondary" block disabled={analyzing} onClick={() => setDialog('edit')}><PencilLine size={18} aria-hidden="true" />{t('detail.actions.edit')}</Button>}
          <Button variant="dangerGhost" block disabled={analyzing} onClick={() => setDialog('delete')}><Trash2 size={18} aria-hidden="true" />{t('detail.actions.delete')}</Button>
        </section>
      </aside>
    </div>

    <EditDialog open={dialog === 'edit'} record={record} onClose={() => setDialog(null)} />

    <Dialog open={dialog === 'again'} onClose={() => setDialog(null)} title={t('detail.again.title')}
      actions={<>
        <Button variant="secondary" onClick={() => setDialog(null)}>{t('detail.again.keep')}</Button>
        <Button onClick={confirmAnalyze}>{t('detail.actions.analyzeAgain')}</Button>
      </>}>
      <p>{t('detail.again.body')}</p>
    </Dialog>

    <Dialog open={dialog === 'delete'} onClose={() => setDialog(null)} title={t('detail.delete.title')} busy={deleting}
      actions={<>
        <Button variant="secondary" disabled={deleting} onClick={() => setDialog(null)}>{t('detail.delete.keep')}</Button>
        <Button variant="danger" disabled={deleting} onClick={confirmDelete}>{t('detail.delete.confirm')}</Button>
      </>}>
      <p>{t('detail.delete.body')}</p>
    </Dialog>
  </div>;
}
