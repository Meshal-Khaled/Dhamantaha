import { useRef, useState } from 'react';
import Button from './Button.jsx';
import Dialog from './Dialog.jsx';
import { localizeError, formatNumber } from '../lib/format.js';
import { itemName, linePrice } from '../lib/wallet-view.js';
import { useSettings } from '../state/settings.jsx';
import { useToast } from '../state/toast.jsx';
import { useWallet } from '../state/wallet.jsx';

function draftFor(item) {
  return {
    description: itemName(item) || '',
    price: linePrice(item).total ?? '',
    warrantyAmount: item?.localPolicy?.warranty?.amount ?? '',
    warrantyUnit: item?.localPolicy?.warranty?.unit || 'months',
    returnAmount: item?.localPolicy?.returns?.amount ?? '',
    returnUnit: item?.localPolicy?.returns?.unit || 'days',
  };
}

function EditForm({ record, initialIndex, onClose }) {
  const { t, arabic } = useSettings();
  const { edit } = useWallet();
  const toast = useToast();
  const body = record.analysis;
  const [index, setIndex] = useState(initialIndex);
  const [shared, setShared] = useState(() => ({ merchant: body?.receipt?.merchantName || '', date: body?.receipt?.purchaseDate || '' }));
  const [drafts, setDrafts] = useState(() => (body?.items?.length ? body.items : [null]).map(draftFor));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const baseline = useRef({ shared: JSON.stringify(shared), drafts: drafts.map((draft) => JSON.stringify(draft)) });
  const form = useRef(null);

  const sharedDirty = JSON.stringify(shared) !== baseline.current.shared;
  const dirty = sharedDirty || drafts.some((draft, i) => JSON.stringify(draft) !== baseline.current.drafts[i]);
  const draft = drafts[index];
  const change = (key) => (event) => {
    const value = event.target.value;
    setDrafts((current) => current.map((entry, i) => (i === index ? { ...entry, [key]: value } : entry)));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.current.reportValidity()) return;
    const changes = drafts.flatMap((entry, i) => (sharedDirty || JSON.stringify(entry) !== baseline.current.drafts[i] ? [{ values: { ...shared, ...entry }, index: i }] : []));
    setSaving(true);
    setError('');
    try {
      if (changes.length) await edit(record.id, changes);
      toast(t('toast.changesSaved'));
      onClose();
    } catch (failure) {
      setError(localizeError(failure, arabic));
      setSaving(false);
    }
  };

  const duration = (prefix, title) => <div className="form-row">
    <label className="field">
      <span>{title}</span>
      <input className="input" name={`${prefix}-amount`} type="number" inputMode="numeric" min="0" max="3650" step="1"
        placeholder={t('edit.unspecified')} value={draft[`${prefix}Amount`]} onChange={change(`${prefix}Amount`)} />
    </label>
    <label className="field">
      <span>{t('edit.unit')}</span>
      <select className="input" name={`${prefix}-unit`} value={draft[`${prefix}Unit`]} onChange={change(`${prefix}Unit`)}>
        {['days', 'weeks', 'months', 'years'].map((unit) => <option key={unit} value={unit}>{t(`common.${unit}`)}</option>)}
      </select>
    </label>
  </div>;

  return <form ref={form} className="form" onSubmit={submit}>
    <fieldset disabled={saving} className="form__fields">
      {drafts.length > 1 && <label className="field">
        <span>{t('edit.product')}</span>
        <select className="input" value={index} onChange={(event) => setIndex(Number(event.target.value))}>
          {drafts.map((entry, i) => <option key={i} value={i}>{entry.description || formatNumber(i + 1, arabic)}</option>)}
        </select>
      </label>}
      <label className="field">
        <span>{t('edit.productName')}</span>
        <input className="input" name="product-name" value={draft.description} onChange={change('description')} required autoComplete="off" dir="auto" />
      </label>
      <label className="field">
        <span>{t('edit.store')}</span>
        <input className="input" name="store-name" value={shared.merchant} onChange={(event) => setShared((value) => ({ ...value, merchant: event.target.value }))} autoComplete="off" dir="auto" />
      </label>
      <div className="form-row">
        <label className="field">
          <span>{linePrice(body?.items?.[index]).quantity > 1 ? t('edit.itemTotal') : t('edit.price')}</span>
          <input className="input" name="price" type="number" inputMode="decimal" min="0" step="0.01" value={draft.price} onChange={change('price')} />
        </label>
        <label className="field">
          <span>{t('edit.date')}</span>
          <input className="input" name="purchase-date" type="date" value={shared.date} onChange={(event) => setShared((value) => ({ ...value, date: event.target.value }))} />
        </label>
      </div>
      {duration('warranty', t('edit.warrantyDuration'))}
      {duration('return', t('edit.returnPeriod'))}
      <p className="muted small">{t('edit.hint')}</p>
    </fieldset>
    {error && <div className="alert alert--bad" role="alert"><p>{error}</p></div>}
    <div className="dialog__actions">
      <Button variant="secondary" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
      <Button type="submit" disabled={!dirty || saving}>{t('common.saveChanges')}</Button>
    </div>
  </form>;
}

/** Edit the store, date, product names and prices, and the warranty and return periods of one receipt. */
export default function EditDialog({ open, record, initialIndex = 0, onClose }) {
  const { t } = useSettings();
  return <Dialog open={open} onClose={onClose} title={t('edit.title')} wide backdropCloses={false}>
    {record && <EditForm record={record} initialIndex={initialIndex} onClose={onClose} />}
  </Dialog>;
}
