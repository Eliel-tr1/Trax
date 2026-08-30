import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme-bridge.css'
import './index.css'
import { DirectionProvider } from '@radix-ui/react-direction'
import App from './App.jsx'

// apply saved theme before render
document.documentElement.dataset.theme = localStorage.getItem('theme') || 'light'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DirectionProvider dir="rtl">
      <App />
    </DirectionProvider>
  </StrictMode>,
)
