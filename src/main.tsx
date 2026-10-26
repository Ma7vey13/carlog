import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { requestPersistenceOnFirstRun } from './app/storage';
import { getDb } from './db/db';
import { ensureSeed } from './db/seed';
import './styles/global.css';
import './styles/forms.css';
import './styles/review.css';

void requestPersistenceOnFirstRun();
ensureSeed(getDb()).catch((err: unknown) => console.error('Не удалось подготовить базу данных', err));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
