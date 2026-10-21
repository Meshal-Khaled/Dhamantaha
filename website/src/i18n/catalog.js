import { common } from './messages/common.js';
import { home } from './messages/home.js';
import { receipts } from './messages/receipts.js';
import { settings } from './messages/settings.js';
import { info } from './messages/info.js';

const parts = [common, home, receipts, settings, info];

/** Every message, by language. test/i18n.test.js keeps both languages complete. */
export const catalogs = {
  en: Object.assign({}, ...parts.map((part) => part.en)),
  ar: Object.assign({}, ...parts.map((part) => part.ar)),
};

export const SUPPORT_EMAIL = 'arcos.workspace@gmail.com';
