import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'sonner';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: '#162032',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          color: '#F8FAFC',
        },
      }}
    />
  </React.StrictMode>
);
