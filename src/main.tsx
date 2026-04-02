import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// Catch unhandled errors to make them visible
window.addEventListener('error', (e) => {
  const isDarkMode = document.documentElement.classList.contains('dark')
  const errorColor = isDarkMode ? '#EF4444' : '#DC2626'
  const backgroundColor = isDarkMode ? '#0F172A' : '#F8FAFC'
  const titleColor = isDarkMode ? '#F1F5F9' : '#0F172A'
  const messageColor = isDarkMode ? '#F59E0B' : '#D97706'
  const stackColor = isDarkMode ? '#94A3B8' : '#475569'
  
  document.getElementById('root')!.innerHTML = `
    <div style="padding:40px;color:${errorColor};font-family:monospace;background:${backgroundColor};min-height:100vh">
      <h1 style="color:${titleColor}">Runtime Error</h1>
      <pre style="white-space:pre-wrap;color:${messageColor}">${e.message}</pre>
      <pre style="white-space:pre-wrap;color:${stackColor};font-size:12px">${e.filename}:${e.lineno}</pre>
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
