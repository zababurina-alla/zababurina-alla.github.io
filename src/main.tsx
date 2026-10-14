import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/base.css';
import './styles/app.css';
import { loadRuntimeConfig } from './config';

const root = document.getElementById('root');
if (!root) throw new Error('Нет элемента #root в index.html');

// Сначала config.json (адрес API, где можно записывать), потом приложение: модули данных читают настройку при загрузке.
void loadRuntimeConfig().then(async () => {
  const { App } = await import('./App');
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
