import { ThemeProvider } from 'next-themes'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { installToastLayer } from '@/app/toast-layer'
import { AppToaster } from '@/app/toaster'
import { TooltipProvider } from '@/components/ui/tooltip'
import App from './App.tsx'
import './index.css'

// Before anything renders: its listeners have to run ahead of any sheet's (src/app/toast-layer.ts).
installToastLayer()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={300}>
        <App />
        <AppToaster />
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
)
