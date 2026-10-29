import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { requestPersistenceOnFirstRun } from './app/storage';
import { getDb } from './db/db';
import { ARCHIVE_KEEP_DAYS, clearArchive } from './db/drafts';
import { ensureSeed } from './db/seed';
import { startSession } from './sync/session';
import './styles/global.css';
import './styles/forms.css';
import './styles/review.css';
import './styles/state.css';
import './styles/expenses.css';

void requestPersistenceOnFirstRun();
ensureSeed(getDb())
  // The inbox archive clears itself 30 days after a draft went there (D-092).
  .then(() => clearArchive(getDb(), { olderThanDays: ARCHIVE_KEEP_DAYS }).catch((err: unknown) => console.error('Не удалось очистить архив', err)))
  .then(() => startSession())
  .catch((err: unknown) => console.error('Не удалось подготовить базу данных', err));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
