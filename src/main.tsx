import { createRoot } from 'react-dom/client';

import { App } from './App';
import { VerifyPage } from './pages/VerifyPage';
import './index.css';

const rootEl = document.getElementById('root');
// /verify/<code> is the public page behind a transcript's QR code; everything else is the portal.
const verifyCode = /^\/verify\/([^/]+)\/?$/.exec(window.location.pathname)?.[1];

if (rootEl) createRoot(rootEl).render(verifyCode ? <VerifyPage code={decodeURIComponent(verifyCode)} /> : <App />);
