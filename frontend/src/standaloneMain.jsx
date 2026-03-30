import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './App.css';
import { I18nProvider } from './i18n.jsx';
import QuestionsEditorStandalone from './components/screens/system/QuestionsEditorStandalone.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider>
      <QuestionsEditorStandalone />
    </I18nProvider>
  </StrictMode>,
);
