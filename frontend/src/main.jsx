import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import CheaterView from './components/screens/system/CheaterView.jsx'
import { I18nProvider } from './i18n.jsx'

const _view = new URLSearchParams(window.location.search).get('view');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider>
      {_view === 'cheater' ? <CheaterView /> : <App />}
    </I18nProvider>
  </StrictMode>,
)
