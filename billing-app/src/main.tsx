import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { registerChunkErrorRecovery } from './lib/chunkReload';
import { initSentry } from './lib/sentry';
import './index.css';

initSentry();
registerChunkErrorRecovery();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
