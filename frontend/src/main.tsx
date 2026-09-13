import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { Wordmark } from './components/ui/Wordmark'
import { Toast } from './components/ui/Toast'

// Task 15 chỉ dựng scaffold + component nền. App shell/router thật là việc của task sau;
// ở đây chỉ mount <Toast/> (cần có mặt một lần, toàn cục) và Wordmark để xác nhận Tailwind chạy.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="p-6">
      <Wordmark />
    </div>
    <Toast />
  </StrictMode>,
)
