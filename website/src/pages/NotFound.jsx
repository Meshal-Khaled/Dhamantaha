import { FileQuestionMark } from 'lucide-react';
import Button from '../components/Button.jsx';
import usePageTitle from '../components/usePageTitle.js';
import { useSettings } from '../state/settings.jsx';

export default function NotFound() {
  const { t } = useSettings();
  usePageTitle('notfound.title');
  return <div className="container notice-page">
    <FileQuestionMark size={44} aria-hidden="true" />
    <h1>{t('notfound.title')}</h1>
    <p>{t('notfound.body')}</p>
    <div className="notice-page__actions"><Button to="/">{t('notfound.home')}</Button></div>
  </div>;
}
