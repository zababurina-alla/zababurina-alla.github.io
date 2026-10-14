import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/base.css';
import './styles/app.css';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Нет элемента #root в index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
