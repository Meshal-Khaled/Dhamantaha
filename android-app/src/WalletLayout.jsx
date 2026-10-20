import { useEffect, useRef } from 'react';
import { ArrowLeft, Camera, Check, CircleCheck, CirclePlus, Clock3, FileText, FileUp, House, LoaderCircle, PencilLine, ReceiptText, Settings, ShieldCheck, Trash2 } from 'lucide-react';
import { HomeScreen, ReceiptsScreen, SettingsScreen, ResultView, ReceiptEditor, translate } from './WalletScreens.jsx';
import brand from '../resources/app-icon.png';
import { describeError } from './api.js';
import { formatNumber, localizeError } from './format.js';

const formatBytes = (n, arabic) => `${formatNumber(n >= 1048576 ? Math.round(n / 1048576 * 10) / 10 : Math.max(1, Math.round(n / 1024)), arabic)} ${n >= 1048576 ? 'MB' : 'KB'}`;
const toastMessages = {
  receipt_saved: ['Original saved on this device', 'تم حفظ الأصل على جهازك'],
  receipt_exists: ['This receipt is already saved. Opened it.', 'هذه الفاتورة محفوظة مسبقًا، وفتحناها لك.'],
  analysis_saved: ['Analysis saved', 'تم حفظ نتيجة التحليل'],
  receipt_deleted: ['Receipt deleted', 'تم حذف الفاتورة'],
  changes_saved: ['Changes saved', 'تم حفظ التعديلات'],
  connection_saved: ['Connection saved', 'تم حفظ الاتصال'],
};

function ConfirmationDialog({ id, title, children, onCancel, busy, actions }) {
  const dialog = useRef(null);
  useEffect(() => {
    const node = dialog.current;
    if (!node.open) node.showModal();
    return () => { if (node.open) node.close(); };
  }, []);
  return <dialog ref={dialog} className="confirmation-dialog" aria-labelledby={`${id}-title`} onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id={`${id}-title`}>{title}</h2><div className="dialog-content">{children}</div><div className="dialog-actions">{actions}</div>
  </dialog>;
}

function AnalysisStatus({ arabic, elapsed }) {
  const t = translate(arabic);
  return <section className="analysis-status" aria-label={t('Receipt analysis progress', 'تقدم تحليل الفاتورة')}>
    <ol className="analysis-steps"><li className="complete"><Check size={15} aria-hidden="true" />{t('Saved', 'محفوظة')}</li><li className="current" aria-current="step"><LoaderCircle size={15} className="spin" aria-hidden="true" />{t('Reading', 'جارٍ القراءة')}</li><li><CircleCheck size={15} aria-hidden="true" />{t('Ready', 'جاهزة')}</li></ol>
    <p role="status">{t('Reading your purchase details. Your original is already safe on this phone.', 'نقرأ بيانات الشراء. الفاتورة الأصلية محفوظة على هاتفك.')}</p><span className="elapsed" aria-hidden="true"><Clock3 size={13} />{formatNumber(elapsed, arabic)} {t('seconds', 'ثانية')} · {t('May take up to 85 seconds', 'قد يستغرق حتى ٨٥ ثانية')}</span>
  </section>;
}

export default function WalletLayout({ wallet: w }) {
  const arabic = w.appearance.language === 'ar';
  const t = translate(arabic);
  useEffect(() => {
    if (!w.editing) return;
    const frame = requestAnimationFrame(() => document.querySelector('.editor-card')?.scrollIntoView({ block: 'start' }));
    return () => cancelAnimationFrame(frame);
  }, [w.editing]);
  const navItems = [['home', House, t('Home', 'الرئيسية')], ['saved', ReceiptText, t('Receipts', 'الفواتير')], ['add', CirclePlus, t('Add receipt', 'إضافة فاتورة')], ['settings', Settings, t('Settings', 'الإعدادات')]];
  const selected = w.page === 'details' ? 'saved' : w.page;
  return <div className={`app theme-${w.appearance.theme} font-${w.appearance.font}`} dir={arabic ? 'rtl' : 'ltr'} lang={w.appearance.language}>
    <div className="phone">
      <header className="head"><button className="brand" disabled={w.busy} onClick={() => w.navigate('home')} aria-label={t('Dhamantaha Home', 'ضمنتها الرئيسية')}><img src={brand} width="46" height="46" alt="" /><strong>{t('Dhamantaha', 'ضمنتها')}</strong></button><span className="private-badge"><ShieldCheck size={15} aria-hidden="true" />{t('On your device', 'على جهازك')}</span></header>
      <main className="main" id="main-content" aria-busy={w.busy}>
        {w.storageError && <section className="card error" role="alert"><p>{localizeError(w.storageError, arabic)}</p><button className="link" disabled={w.busy} onClick={w.refreshSaved}>{t('Reload receipts', 'إعادة تحميل الفواتير')}</button></section>}
        {w.busy && w.phase !== 'analyzing' && <p role="status" className="operation-status"><LoaderCircle className="spin" size={17} aria-hidden="true" />{w.phase === 'saving' ? t('Saving on this device…', 'جارٍ الحفظ على جهازك…') : w.phase === 'deleting' ? t('Deleting receipt…', 'جارٍ حذف الفاتورة…') : t('Opening receipt…', 'جارٍ فتح الفاتورة…')}</p>}
        {w.page === 'home' && <HomeScreen saved={w.saved} arabic={arabic} busy={w.busy} loading={w.loadingSaved} onNavigate={w.navigate} onOpen={w.openReceipt} />}
        {w.page === 'saved' && <ReceiptsScreen saved={w.saved} arabic={arabic} busy={w.busy} loading={w.loadingSaved} onOpen={w.openReceipt} onAdd={() => w.navigate('add')} />}
        {w.page === 'settings' && <SettingsScreen settings={w.settings} appearance={w.appearance} onAppearance={w.changeAppearance} arabic={arabic} health={w.health} onRetry={w.connect} log={w.log} onSave={w.saveConnection} onGuard={w.onGuard} />}
        {w.page === 'add' && <>
          <h1 className="title">{t('Add receipt', 'إضافة فاتورة')}</h1><p className="desc">{t('Keep the original. We’ll help with the details.', 'احفظ الأصل، واترك قراءة التفاصيل علينا.')}</p>
          <section className="upload"><span className="upload-symbol"><ReceiptText size={36} aria-hidden="true" /></span><h2>{t('Start with your receipt', 'ابدأ بفاتورتك')}</h2><p>{t('Take a clear photo or choose a photo or PDF.', 'التقط صورة واضحة، أو اختر صورة أو ملف PDF.')}</p><div className="upload-actions">{w.native && <button className="btn full" disabled={w.busy} onClick={w.takePhoto}><Camera size={19} aria-hidden="true" />{t('Take photo', 'التقاط صورة')}</button>}<button className="secondary full" disabled={w.busy} onClick={() => w.fileInput.current?.click()}><FileUp size={19} aria-hidden="true" />{t('Choose photo or PDF', 'اختيار صورة أو PDF')}</button></div><input ref={w.fileInput} type="file" accept="image/*,application/pdf" hidden onChange={w.onFile} /></section>
          <div className="import-stages"><span><Check size={15} aria-hidden="true" />{t('Save original', 'حفظ الأصل')}</span><span><ReceiptText size={15} aria-hidden="true" />{t('Read details', 'قراءة البيانات')}</span><span><ShieldCheck size={15} aria-hidden="true" />{t('Track warranty', 'متابعة الضمان')}</span></div>
          <p className="tip privacy-note"><ShieldCheck size={16} aria-hidden="true" />{t('Save offline and analyze later. Originals up to 20 MB stay on your phone.', 'احفظ دون اتصال وحلّل لاحقًا. الأصول حتى ٢٠ ميغابايت تبقى على هاتفك.')}</p>
        </>}
        {w.page === 'details' && w.picked && <>
          <div className="back"><button className="icon-button" disabled={w.busy} onClick={() => w.navigate('saved')} aria-label={t('Back to receipts', 'العودة للفواتير')}><ArrowLeft className="directional" size={21} aria-hidden="true" /></button><h1>{t('Receipt details', 'تفاصيل الفاتورة')}</h1></div>
          {w.phase === 'analyzing' && <AnalysisStatus arabic={arabic} elapsed={w.elapsed} />}
          {(w.outcome?.ok || w.picked.record.analysis) && <ResultView body={w.outcome?.ok ? w.outcome.result.body : w.picked.record.analysis} arabic={arabic} priceView={w.appearance.priceView} />}
          {w.editing ? <ReceiptEditor body={w.picked.record.analysis} initialIndex={w.picked.productIndex} arabic={arabic} busy={w.busy} onSave={w.saveEdits} onCancel={w.cancelEditing} onGuard={w.onGuard} /> : <button className="secondary full edit-button" disabled={w.busy || !!w.pendingAnalysis} onClick={() => w.setEditing(true)}><PencilLine size={17} aria-hidden="true" />{t('Edit purchase & policy durations', 'تعديل بيانات الشراء ومدد الضمان والإرجاع')}</button>}
          <details className="card receipt-photo-card"><summary>{t('Original receipt', 'الفاتورة الأصلية')}<small className="filename" dir="auto">{w.picked.name} · {formatBytes(w.picked.file.size, arabic)}</small></summary>{w.picked.previewUrl ? <img className="receipt-photo" src={w.picked.previewUrl} alt={t('Saved receipt', 'الفاتورة المحفوظة')} loading="lazy" /> : <div className="pdf"><FileText size={32} aria-hidden="true" />PDF · {formatBytes(w.picked.file.size, arabic)}</div>}<button className="secondary full" disabled={w.busy} onClick={w.openOriginal}>{w.native ? t('Open original', 'فتح الأصل') : t('Download original', 'تحميل الأصل')}</button></details>
          <button className="btn full analyze-button" disabled={w.busy || !!w.pendingAnalysis} onClick={w.send}><ReceiptText size={18} aria-hidden="true" />{w.phase === 'analyzing' ? t('Reading…', 'جارٍ القراءة…') : w.picked.record.analysis ? t('Analyze again', 'إعادة التحليل') : t('Analyze receipt', 'تحليل الفاتورة')}</button>
          {w.health.state === 'down' && <p className="tip">{t('Connection unavailable. Check your network before analyzing.', 'الاتصال غير متاح. تحقق من الشبكة قبل التحليل.')}</p>}
          {w.pendingAnalysis && <button className="secondary full" disabled={w.busy} onClick={w.retrySave}>{t('Retry saving analysis', 'إعادة حفظ نتيجة التحليل')}</button>}
          {w.outcome && !w.outcome.ok && <section className="card error" role="alert"><h2>{t('Could not analyze this receipt', 'تعذّر تحليل الفاتورة')}</h2><p>{describeError(w.outcome.error, arabic)}</p>{w.outcome.error.requestId && <details className="technical"><summary>{t('Reference', 'المرجع')}</summary><p className="request-id">{w.outcome.error.requestId}</p></details>}</section>}
          <button className="delete-link link" disabled={w.busy} onClick={w.requestDelete}><Trash2 size={16} aria-hidden="true" />{t('Delete receipt', 'حذف الفاتورة')}</button>
        </>}
      </main>
      <nav className="nav" aria-label={t('Main navigation', 'التنقل الرئيسي')}>{navItems.map(([target, Icon, label]) => <button key={target} disabled={w.busy} className={selected === target ? 'active' : ''} aria-current={selected === target ? 'page' : undefined} onClick={() => w.navigate(target)}><span className="nav-icon"><Icon size={23} strokeWidth={1.8} aria-hidden="true" /></span><span>{label}</span></button>)}</nav>
      {w.toast && <div className="toast" role="status"><CircleCheck size={17} aria-hidden="true" />{toastMessages[w.toast]?.[arabic ? 1 : 0]}</div>}
      {w.leaveDialog && <ConfirmationDialog id="leave-dialog" title={w.leaveDialog === 'analysis' ? t('Save this analysis?', 'حفظ نتيجة التحليل؟') : t('Save your changes?', 'حفظ التعديلات؟')} onCancel={w.stay} busy={w.busy} actions={<><button className="btn full" disabled={w.busy} onClick={() => w.leave(true)}>{w.leaveDialog === 'analysis' ? t('Save result & continue', 'حفظ النتيجة والمتابعة') : t('Save & continue', 'حفظ ومتابعة')}</button><button className="secondary full" disabled={w.busy} onClick={w.stay}>{t('Stay here', 'البقاء هنا')}</button><button className="link destructive" disabled={w.busy} onClick={() => w.leave(false)}>{t('Leave without saving', 'المغادرة دون حفظ')}</button></>}><p>{w.leaveDialog === 'analysis' ? t('Your original is saved, but this analysis is not. Save it before leaving so it is available offline.', 'الأصل محفوظ، لكن نتيجة التحليل لم تُحفظ بعد. احفظها لتكون متاحة دون اتصال.') : t('Keep your edits before changing screens.', 'احفظ تعديلاتك قبل الانتقال إلى شاشة أخرى.')}</p>{w.storageError && <p className="dialog-error" role="alert">{localizeError(w.storageError, arabic)}</p>}</ConfirmationDialog>}
      {w.confirmAnalyze && <ConfirmationDialog id="analysis-dialog" title={t('Read this receipt again?', 'إعادة قراءة الفاتورة؟')} onCancel={() => w.setConfirmAnalyze(false)} busy={w.busy} actions={<><button className="btn full" onClick={w.confirmSend}>{t('Analyze again', 'إعادة التحليل')}</button><button className="secondary full" onClick={() => w.setConfirmAnalyze(false)}>{t('Keep current details', 'الاحتفاظ بالبيانات الحالية')}</button></>}><p>{t('A successful new analysis replaces the current purchase details and manual policy edits. Your original receipt stays saved.', 'التحليل الجديد الناجح يستبدل بيانات الشراء وتعديلات المدد الحالية. تبقى الفاتورة الأصلية محفوظة.')}</p></ConfirmationDialog>}
      {w.confirmDelete && <ConfirmationDialog id="delete-dialog" title={t('Delete this receipt?', 'حذف الفاتورة؟')} onCancel={() => w.setConfirmDelete(false)} busy={w.busy} actions={<><button className="danger full" disabled={w.busy} onClick={w.deleteReceipt}>{t('Delete permanently', 'حذف نهائي')}</button><button className="secondary full" disabled={w.busy} onClick={() => w.setConfirmDelete(false)}>{t('Keep receipt', 'إبقاء الفاتورة')}</button></>}><p>{t('This removes the original file and saved details from this device. This cannot be undone.', 'سيُحذف الأصل والبيانات المحفوظة من هذا الجهاز. لا يمكن التراجع عن الحذف.')}</p></ConfirmationDialog>}
    </div>
  </div>;
}
