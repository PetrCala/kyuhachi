import 'maplibre-gl/dist/maplibre-gl.css';
// Before ./App, and it has to stay there: lib/map-theme.ts reads the --map-*
// tokens off :root the moment it is evaluated, which happens as a side effect
// of importing App. In a dev build the stylesheet is injected by this very
// import, so loading it later leaves every map colour an empty string.
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('missing #root element');

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
