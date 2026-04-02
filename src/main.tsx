import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// Catch unhandled errors to make them visible
window.addEventListener('error', (e) => {
  document.getElementById('root')!.innerHTML = `
    <div style="padding:40px;color:#EF4444;font-family:monospace;background:#0F172A;min-height:100vh">
      <h1 style="color:#F1F5F9">Runtime Error</h1>
      <pre style="white-space:pre-wrap;color:#F59E0B">${e.message}</pre>
      <pre style="white-space:pre-wrap;color:#94A3B8;font-size:12px">${e.filename}:${e.lineno}</pre>
    </div>
  `
})

window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled rejection:', e.reason)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
