import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './components/auth/AuthProvider'
import ErrorBoundary from './components/ErrorBoundary'
import { ThemeProvider } from './components/ThemeProvider'
import './i18n'
import './index.css'
import './web-admin-api'

window.__CHAT2API_WEB_ADMIN__ = true

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <HashRouter>
            <App />
          </HashRouter>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
