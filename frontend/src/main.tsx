import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App, router } from './app/routes'

// C7 (task-19-carry.md): App gộp sẵn QueryClientProvider → RouterProvider và mount <Toast/> ở
// cấp toàn cục (xem frontend/src/app/routes.tsx) — bảng route thật thay cho scaffold Task 15.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App router={router} />
  </StrictMode>,
)
