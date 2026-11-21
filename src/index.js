import './utils/disableConsole';
import React from 'react';
import ReactDOM from 'react-dom/client';
import './firebase'; // Import Firebase to initialize it
import './styles/tailwind.css'; // Import Tailwind CSS
import App from './App';
import reportWebVitals from './reportWebVitals';
import { registerServiceWorker } from './serviceWorker';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

registerServiceWorker();

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log)).
// Performance data is not sent anywhere unless a callback is supplied.
reportWebVitals();
