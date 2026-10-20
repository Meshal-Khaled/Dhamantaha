const locale = (arabic) => arabic ? 'ar-SA-u-ca-gregory' : 'en-GB';
const numberFormats = new Map();
const dateFormats = new Map();
const currencies = typeof Intl.supportedValuesOf === 'function' ? new Set(Intl.supportedValuesOf('currency')) : null;

function numberFormat(arabic, currency) {
  const key = `${arabic ? 'ar' : 'en'}:${currency || 'number'}`;
  if (!numberFormats.has(key)) {
    numberFormats.set(key, new Intl.NumberFormat(locale(arabic), currency ? { style: 'currency', currency } : {}));
  }
  return numberFormats.get(key);
}

export function formatNumber(value, arabic = false) {
  return typeof value === 'number' && Number.isFinite(value) ? numberFormat(arabic).format(value) : '—';
}

/** Unknown currency stays unknown; never substitute SAR or another denomination. */
export function formatMoney(value, currency, arabic = false) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const code = typeof currency === 'string' ? currency.trim().toUpperCase() : '';
  if (!/^[A-Z]{3}$/.test(code) || (currencies && !currencies.has(code))) return formatNumber(value, arabic);
  try { return numberFormat(arabic, code).format(value); }
  catch { return formatNumber(value, arabic); }
}

/** Date-only receipt fields are Gregorian calendar dates, not UTC timestamps to shift locally. */
export function formatDate(value, arabic = false) {
  if (value == null || value === '') return '—';
  const dateOnly = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (typeof value === 'string' && !dateOnly) return '—';
  const date = dateOnly ? new Date(`${value}T12:00:00Z`) : value instanceof Date ? value : typeof value === 'number' ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return '—';
  if (dateOnly && date.toISOString().slice(0, 10) !== value) return '—';
  const key = `${arabic ? 'ar' : 'en'}:${dateOnly ? 'date' : 'timestamp'}`;
  if (!dateFormats.has(key)) {
    dateFormats.set(key, new Intl.DateTimeFormat(locale(arabic), { day: 'numeric', month: 'short', year: 'numeric', calendar: 'gregory', ...(dateOnly ? { timeZone: 'UTC' } : {}) }));
  }
  return dateFormats.get(key).format(date);
}

const fieldNames = {
  merchantName: ['Store', 'المتجر'], purchaseDate: ['Purchase date', 'تاريخ الشراء'],
  receiptNumber: ['Receipt number', 'رقم الفاتورة'], currency: ['Currency', 'العملة'],
  total: ['Total', 'الإجمالي'], warrantyNotes: ['Warranty terms', 'شروط الضمان'],
  description: ['Product name', 'اسم المنتج'], quantity: ['Quantity', 'الكمية'],
  unitPrice: ['Unit price', 'سعر الوحدة'], totalPrice: ['Product total', 'إجمالي المنتج'],
  productIdentifier: ['Model or product code', 'طراز المنتج أو رمزه'],
  statedOnReceipt: ['Warranty on the receipt', 'الضمان المذكور في الفاتورة'],
  sourceText: ['Printed warranty terms', 'شروط الضمان المطبوعة'],
  durationValue: ['Warranty duration', 'مدة الضمان'], durationUnit: ['Warranty duration unit', 'وحدة مدة الضمان'],
  expirationDate: ['Warranty end date', 'تاريخ انتهاء الضمان'],
  branchName: ['Branch', 'الفرع'], customerServicePhone: ['Customer service', 'خدمة العملاء'],
  displayName: ['Product name', 'اسم المنتج'], category: ['Category', 'الفئة'],
  warranty: ['Warranty', 'الضمان'], provider: ['Warranty provider', 'مزوّد الضمان'], items: ['Products', 'المنتجات'],
  returnPolicy: ['Return & refund policy', 'سياسة الإرجاع والاسترداد'],
  returnDurationValue: ['Return period', 'مدة الإرجاع'], exchangeDurationValue: ['Exchange period', 'مدة الاستبدال'],
};

export function fieldLabel(path, arabic = false) {
  const text = typeof path === 'string' ? path : '';
  const leaf = text.split('.').pop();
  const name = fieldNames[leaf];
  const label = name ? name[arabic ? 1 : 0] : arabic ? 'بيانات الشراء' : 'Purchase information';
  const item = /(?:^|\.)items\[(\d+)\]/.exec(text);
  return item ? `${arabic ? 'المنتج' : 'Product'} ${formatNumber(Number(item[1]) + 1, arabic)} · ${label}` : label;
}

const arabicErrors = {
  unauthorized_client: 'تعذّر التحقق من مفتاح التطبيق. راجع إعدادات الاتصال.',
  rate_limited: 'أُرسلت طلبات كثيرة مؤخرًا. انتظر قليلًا ثم أعد المحاولة.',
  daily_limit_reached: 'وصلت الخدمة إلى حد التحليل اليومي. حاول مجددًا غدًا.',
  server_busy: 'خدمة التحليل مشغولة حاليًا. حاول مجددًا بعد قليل.',
  analysis_quota_exceeded: 'وصلت خدمة التحليل إلى حد الاستخدام. حاول مجددًا لاحقًا.',
  analysis_unavailable: 'خدمة التحليل غير متاحة حاليًا. فاتورتك محفوظة؛ حاول مجددًا بعد قليل.',
  analysis_malformed: 'تعذّر قراءة نتيجة التحليل. فاتورتك محفوظة ويمكنك إعادة المحاولة.',
  analysis_timeout: 'استغرق التحليل وقتًا أطول من المتوقع. فاتورتك محفوظة؛ أعد المحاولة.',
  client_timeout: 'انتهت مهلة الاتصال. فاتورتك محفوظة؛ تحقق من الشبكة ثم أعد المحاولة.',
  network_error: 'تعذّر الاتصال بخدمة التحليل. تحقق من الإنترنت؛ الفواتير المحفوظة متاحة دون اتصال.',
  non_json_response: 'لم يستجب عنوان الخدمة بالشكل المتوقع. تحقق من الشبكة وعنوان الخدمة في الإعدادات.',
  unexpected_response: 'وصلت استجابة غير متوقعة من الخدمة. حاول مجددًا بعد قليل.',
  unsupported_file_type: 'اختر صورة فاتورة أو ملف PDF مدعومًا.',
  file_too_large: 'الملف أكبر من الحجم المسموح للتحليل. اختر نسخة أصغر.',
  image_too_large: 'أبعاد الصورة كبيرة جدًا. التقط صورة عادية للفاتورة ثم حاول مجددًا.',
  invalid_file: 'تعذّر قراءة الملف. التقط صورة جديدة أو أعد تصدير ملف PDF.',
  pdf_password_protected: 'ملف PDF محمي بكلمة مرور. اختر نسخة غير محمية.',
  pdf_too_many_pages: 'عدد صفحات PDF أكبر من المسموح. اختر الصفحات التي تحتوي على الفاتورة فقط.',
  too_many_pages: 'عدد صفحات PDF أكبر من المسموح. اختر الصفحات التي تحتوي على الفاتورة فقط.',
  invalid_upload: 'تعذّر رفع الملف. اختر صورة واحدة أو ملف PDF واحدًا ثم أعد المحاولة.',
  no_file: 'اختر صورة أو ملف PDF للفاتورة أولًا.',
  analysis_not_configured: 'خدمة التحليل غير مهيأة حاليًا. حاول مجددًا لاحقًا.',
  unreadable_receipt: 'الصورة غير واضحة أو لا تحتوي على فاتورة مقروءة. حاول بصورة أوضح.',
  not_a_receipt: 'لم يُتعرّف على فاتورة شراء في الملف. اختر صورة أو PDF للفاتورة.',
  internal_error: 'حدث خطأ في خدمة التحليل. حاول مجددًا بعد قليل.',
  storage_error: 'تعذّر الوصول إلى مساحة التخزين. حرّر بعض المساحة ثم أعد المحاولة.',
  viewer_unavailable: 'ثبّت تطبيقًا لعرض الصور أو ملفات PDF لفتح الأصل.',
};

const localMessages = new Map([
  ['Choose a receipt photo or PDF.', 'اختر صورة فاتورة أو ملف PDF.'],
  ['Choose a nonempty file up to 20 MB.', 'اختر ملفًا غير فارغ لا يتجاوز ٢٠ ميغابايت.'],
  ['Choose a file up to 20 MB.', 'اختر ملفًا لا يتجاوز ٢٠ ميغابايت.'],
  ['Could not read this file. Choose it again.', 'تعذّر قراءة الملف. اختره مجددًا.'],
  ['Could not open the saved receipt.', 'تعذّر فتح الفاتورة المحفوظة. أعد المحاولة.'],
  ['This receipt no longer exists.', 'هذه الفاتورة لم تعد موجودة على الجهاز.'],
  ['Could not open receipt storage in this browser.', 'تعذّر فتح محفظة الفواتير في المتصفح. أعد فتح الصفحة.'],
  ['Close other Dhamantaha tabs and try again.', 'أغلق صفحات ضمنتها الأخرى ثم أعد المحاولة.'],
  ['Could not access device storage. Free some space and try again.', 'تعذّر الوصول إلى مساحة التخزين. حرّر بعض المساحة ثم أعد المحاولة.'],
  ['The receipt is saved, but its analysis could not be saved. Free some space and try again.', 'الفاتورة محفوظة، لكن تعذّر حفظ نتيجة التحليل. حرّر مساحة ثم أعد حفظ النتيجة.'],
  ['Enter a valid price.', 'أدخل سعرًا صحيحًا يساوي صفرًا أو أكثر.'],
  ['Enter a valid purchase date.', 'أدخل تاريخ شراء صحيحًا.'],
  ['Choose a purchase date and a valid duration (0–3650).', 'حدد تاريخ الشراء وأدخل مدة صحيحة بين ٠ و٣٦٥٠.'],
  ['Could not save preferences.', 'تعذّر حفظ التفضيلات. أعد المحاولة.'],
  ['Could not save connection settings.', 'تعذّر حفظ إعدادات الاتصال. أعد المحاولة.'],
  ['Could not load app lock settings. Close Settings and try again.', 'تعذّر تحميل إعدادات القفل. أغلق الإعدادات ثم افتحها مجددًا.'],
  ['Authentication could not be completed. Try again.', 'تعذّر إكمال التحقق من الهوية. أعد المحاولة.'],
  ['Authentication cancelled. Tap Unlock to try again.', 'أُلغي التحقق من الهوية. اضغط فتح القفل للمحاولة مجددًا.'],
  ['Could not authenticate. Try again and use your phone password or PIN if needed.', 'تعذّر التحقق من الهوية. أعد المحاولة باستخدام كلمة مرور الهاتف أو رمز القفل.'],
  ['Could not save app lock settings. Try again.', 'تعذّر حفظ إعدادات قفل التطبيق. أعد المحاولة.'],
]);

/** Known app errors get actionable Arabic; unknown errors retain the safe English message. */
export function localizeError(error, arabic = false) {
  const message = typeof error === 'string' ? error : typeof error?.message === 'string' ? error.message : '';
  if (!arabic) return message || 'Something went wrong. Try again.';
  const code = error?.code;
  const translated = arabicErrors[code] || localMessages.get(message);
  if (translated) {
    const retry = Number(error?.retryAfterSeconds);
    return Number.isFinite(retry) && retry > 0 ? `${translated} أعد المحاولة بعد ${formatNumber(Math.ceil(retry), true)} ثانية.` : translated;
  }
  if (code === 'rejected_locally') {
    if (/not supported/i.test(message)) return arabicErrors.unsupported_file_type;
    if (/larger than/i.test(message)) return arabicErrors.file_too_large;
  }
  return message || 'حدث خطأ غير متوقع. أعد المحاولة.';
}
