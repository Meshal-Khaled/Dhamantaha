import { useDeferredValue, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronRight, FileImage, FileText, Plus, ReceiptText, Search } from 'lucide-react';
import Button from '../components/Button.jsx';
import StatusPill from '../components/StatusPill.jsx';
import WarrantyMeter from '../components/WarrantyMeter.jsx';
import usePageTitle from '../components/usePageTitle.js';
import { formatDate, formatMoney, formatNumber, localizeError } from '../lib/format.js';
import { deadlineText } from '../lib/policy-labels.js';
import { FILTERS, SORTS, itemCountText, matchesFilter, receiptStatus, receiptTitle, sortCards } from '../lib/receipt-view.js';
import { cardSearchText, walletSummary } from '../lib/wallet-view.js';
import { useSettings } from '../state/settings.jsx';
import { useWallet } from '../state/wallet.jsx';

const PAGE = 25;

function ReceiptRow({ card }) {
  const { t, arabic } = useSettings();
  const title = receiptTitle(card);
  const lead = card.lead;
  const subtitle = !card.analyzed ? t('receipts.unreadHint')
    : card.names.length && !(card.itemCount === 1 && title === card.names[0]) ? card.names.join(arabic ? '، ' : ', ')
      : card.receipt.merchantName ? '' : t('receipts.noStore');
  const FileIcon = card.record.mime === 'application/pdf' ? FileText : FileImage;
  return <li>
    <Link to={`/receipts/${card.record.id}`} className="receipt-row">
      <span className="receipt-row__file" aria-hidden="true"><FileIcon size={22} /></span>
      <span className="receipt-row__main">
        <strong><bdi>{title}</bdi></strong>
        <small><bdi>{subtitle}{card.itemCount > 1 && subtitle ? ` · ${itemCountText(card.itemCount, arabic)}` : ''}</bdi></small>
      </span>
      <span className="receipt-row__cell" data-label={t('receipts.col.date')}>{formatDate(card.receipt.purchaseDate || card.record.createdAt, arabic)}</span>
      <span className="receipt-row__cell receipt-row__total" data-label={t('receipts.col.total')}><bdi>{formatMoney(card.total, card.receipt.currency, arabic)}</bdi></span>
      <span className="receipt-row__warranty">
        {card.analyzed && lead?.warrantyDays !== null && lead?.warrantyDays !== undefined
          ? <WarrantyMeter days={lead.warrantyDays} percent={lead.warrantyProgress} label={card.coveredCount > 1 ? t('receipts.nextEnd') : t('receipts.col.warranty')} compact />
          : <span className="muted">{card.analyzed ? deadlineText(null, arabic) : '—'}</span>}
      </span>
      <span className="receipt-row__status"><StatusPill status={receiptStatus(card)} /></span>
      <ChevronRight className="receipt-row__chevron mirror" size={20} aria-hidden="true" />
    </Link>
  </li>;
}

export default function Receipts() {
  const { t, arabic } = useSettings();
  const { records, loading, loadError, refresh } = useWallet();
  usePageTitle('nav.receipts');
  const [params, setParams] = useSearchParams();
  const filter = FILTERS.includes(params.get('filter')) ? params.get('filter') : 'all';
  const sort = SORTS.includes(params.get('sort')) ? params.get('sort') : 'newest';
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const deferred = useDeferredValue(query);

  const summary = useMemo(() => walletSummary(records), [records]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((name) => [name, summary.cards.filter((card) => matchesFilter(card, name)).length])), [summary]);
  const normalized = deferred.trim().normalize('NFKC').toLocaleLowerCase();
  const shown = useMemo(
    () => sortCards(summary.cards.filter((card) => matchesFilter(card, filter) && cardSearchText(card).includes(normalized)), sort),
    [summary, filter, normalized, sort],
  );

  const choose = (name, value, fallback) => {
    const next = new URLSearchParams(params);
    if (value === fallback) next.delete(name); else next.set(name, value);
    setParams(next, { replace: true });
    setLimit(PAGE);
  };
  const clearFilters = () => { setQuery(''); setParams({}, { replace: true }); setLimit(PAGE); };
  const filtering = filter !== 'all' || normalized !== '';

  return <div className="container page">
    <header className="page-head">
      <div>
        <h1>{t('receipts.title')}</h1>
        <p className="page-head__lead">{t('receipts.subtitle')}</p>
      </div>
      <Button to="/add"><Plus size={18} aria-hidden="true" />{t('nav.add')}</Button>
    </header>

    <div className="stat-row">
      <Link to="/receipts" className="stat"><strong>{loading ? '—' : formatNumber(records.length, arabic)}</strong><span>{t('receipts.stat.receipts')}</span></Link>
      <Link to="/receipts?filter=active" className="stat"><strong>{loading ? '—' : formatNumber(counts.active, arabic)}</strong><span>{t('receipts.stat.active')}</span></Link>
      <Link to="/receipts?filter=soon" className="stat"><strong>{loading ? '—' : formatNumber(summary.upcoming.length, arabic)}</strong><span>{t('receipts.stat.soon')}</span></Link>
    </div>

    {loadError && <div className="alert alert--bad" role="alert">
      <p>{localizeError(loadError, arabic) || t('receipts.loadError')}</p>
      <Button variant="secondary" size="sm" onClick={refresh}>{t('common.tryAgain')}</Button>
    </div>}

    {records.length > 0 && <div className="toolbar">
      <label className="search">
        <Search size={18} aria-hidden="true" />
        <span className="sr-only">{t('receipts.search.label')}</span>
        <input type="search" name="q" autoComplete="off" className="search__input" placeholder={t('receipts.search.placeholder')} value={query}
          onChange={(event) => { setQuery(event.target.value); setLimit(PAGE); }} />
      </label>
      <div className="toolbar__filters" role="group" aria-label={t('receipts.filter.label')}>
        {FILTERS.map((name) => <button key={name} type="button" className="chip" aria-pressed={filter === name} onClick={() => choose('filter', name, 'all')}>
          {t(`receipts.filter.${name}`)}<span className="chip__count">{formatNumber(counts[name], arabic)}</span>
        </button>)}
      </div>
      <label className="select">
        <span>{t('receipts.sort.label')}</span>
        <select value={sort} onChange={(event) => choose('sort', event.target.value, 'newest')}>
          {SORTS.map((name) => <option key={name} value={name}>{t(`receipts.sort.${name}`)}</option>)}
        </select>
      </label>
    </div>}

    {loading && !records.length ? <p className="loading-line" role="status">{t('common.loading')}</p>
      : !records.length ? <section className="empty">
        <span className="empty__icon"><ReceiptText size={32} aria-hidden="true" /></span>
        <h2>{t('receipts.empty.title')}</h2>
        <p>{t('receipts.empty.body')}</p>
        <Button to="/add" size="lg"><Plus size={20} aria-hidden="true" />{t('nav.add')}</Button>
      </section>
        : !shown.length ? <section className="empty">
          <span className="empty__icon"><Search size={32} aria-hidden="true" /></span>
          <h2>{t('receipts.noMatch.title')}</h2>
          <p>{t('receipts.noMatch.body')}</p>
          {filtering && <Button variant="secondary" onClick={clearFilters}>{t('receipts.clearFilters')}</Button>}
        </section>
          : <>
            <div className="receipt-table">
              <div className="receipt-head" aria-hidden="true">
                <span /><span>{t('receipts.col.receipt')}</span><span>{t('receipts.col.date')}</span><span>{t('receipts.col.total')}</span><span>{t('receipts.col.warranty')}</span><span>{t('receipts.col.status')}</span><span />
              </div>
              <ul className="receipt-list">{shown.slice(0, limit).map((card) => <ReceiptRow key={card.record.id} card={card} />)}</ul>
            </div>
            <div className="list-foot">
              <span>{t('receipts.showing', { shown: formatNumber(Math.min(limit, shown.length), arabic), total: formatNumber(shown.length, arabic) })}</span>
              {shown.length > limit && <Button variant="secondary" size="sm" onClick={() => setLimit(limit + PAGE)}>{t('receipts.showMore')}</Button>}
            </div>
          </>}

    <p className="storage-note">{t('receipts.storageNote')}</p>
  </div>;
}
