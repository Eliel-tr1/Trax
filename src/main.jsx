// Build ID is set at build time (vite define injects process.env.BUILD_ID;
// deploy scripts write the same timestamp into build-id.txt).
import { initBuildId, startBuildPolling } from './buildVersion'
import './registerSW'

initBuildId(typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : null)
startBuildPolling()

import { StrictMode } from 'react'
import ErrorBoundary from './components/ErrorBoundary'
import { createRoot } from 'react-dom/client'
import './theme-bridge.css'
import './index.css'
import { DirectionProvider } from '@radix-ui/react-direction'
import App from './App.jsx'

// apply saved theme before render
document.documentElement.dataset.theme = localStorage.getItem('theme') || 'light'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <DirectionProvider dir="rtl">
        <App />
      </DirectionProvider>
    </ErrorBoundary>
  </StrictMode>,
)
