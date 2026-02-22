
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {/* Wrapped App in HashRouter so that navigation hooks can be used at the top level of the App component */}
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
