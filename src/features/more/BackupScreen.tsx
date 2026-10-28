import { useRef, useState } from 'react';
import { usePageHeader } from '../../app/pageHeader';
import { hrefFor } from '../../app/routes';
import { formatBytes, formatLocalDateTime, plural } from '../../core/format';
import { ZipError } from '../../core/zip';
import { backupFileName, buildBackup, importBackup, missingScanHashes, type ImportResult } from '../../db/backup';
import { getDb } from '../../db/db';
import { fetchScanOnDemand } from '../../sync/session';
import { ConfirmDialog } from '../../ui/Dialog';
import { helpHref } from '../help/guides';

/** "Ещё → Резервная копия" (SPEC section 8): ZIP export to the device and import back. */
export function BackupScreen() {
  usePageHeader('Резервная копия', hrefFor('/more'));
  return (
    <div className="stack">
      <ExportCard />
      <ImportCard />
      <a className="menu-link card" href={helpHref('backup')}>
        <span>Инструкция: резервная копия и восстановление</span>
        <span className="muted" aria-hidden="true">
          ›
        </span>
      </a>
    </div>
  );
}

function saveFile(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function ExportCard() {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setError(null);
    setResult(null);
    try {
      const db = getDb();
      // Scans that are only on GitHub: try to fetch them first, so the copy is complete.
      const missing = await missingScanHashes(db);
      for (const [i, sha] of missing.entries()) {
        setBusy(`Скачиваю сканы с GitHub: ${i + 1} из ${missing.length}…`);
        await fetchScanOnDemand(sha);
      }
      setBusy('Собираю архив…');
      const backup = await buildBackup(db, __APP_VERSION__);
      const name = backupFileName();
      saveFile(backup.zip, name);
      setResult(
        `Сохранено: ${name}, ${formatBytes(backup.zip.length)} — записей ${backup.records}, сканов ${backup.scans}.` +
          (backup.missingScans
            ? ` ${backup.missingScans} ${plural(backup.missingScans, 'скан есть', 'скана есть', 'сканов есть')} только на GitHub и в копию не попали: введите пароль данных и сделайте копию ещё раз при интернете.`
            : ''),
      );
    } catch (err) {
      console.error(err);
      setError('Не удалось собрать резервную копию. Попробуйте ещё раз.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card" aria-label="Сохранить копию">
      <h2 className="card__title">Сохранить копию на устройство</h2>
      <p className="hint">
        Все записи и сканы одним ZIP-файлом. Пригодится, если пропадёт телефон, браузер очистит данные или будет недоступен GitHub.
      </p>
      <p className="notice notice--warning">
        Файл <strong>не зашифрован</strong>: в нём ваши документы, ФИО, номер полиса. Храните его как паспорт — на своём компьютере или
        флешке, не отправляйте в мессенджеры и облака без шифрования.
      </p>
      <button type="button" className="btn btn--primary" style={{ justifySelf: 'start' }} disabled={!!busy} onClick={() => void run()}>
        {busy ? 'Сохраняю…' : 'Сохранить резервную копию'}
      </button>
      {busy && (
        <p className="hint" role="status">
          {busy}
        </p>
      )}
      {result && (
        <p className="notice notice--info" role="status" data-testid="backup-done">
          {result}
        </p>
      )}
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function ImportCard() {
  const ref = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (f: File) => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await importBackup(getDb(), new Uint8Array(await f.arrayBuffer())));
    } catch (err) {
      setError(err instanceof ZipError ? err.message : 'Не удалось прочитать файл.');
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };

  return (
    <section className="card" aria-label="Восстановить из копии">
      <h2 className="card__title">Восстановить из копии</h2>
      <p className="hint">
        Записи из копии сливаются с тем, что есть на устройстве: более новая версия записи побеждает, ничего не удаляется. Повторный
        импорт той же копии ничего не меняет.
      </p>
      <button type="button" className="btn btn--secondary" style={{ justifySelf: 'start' }} disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? 'Восстанавливаю…' : 'Выбрать файл копии'}
      </button>
      <input
        ref={ref}
        type="file"
        accept=".zip,application/zip"
        hidden
        data-testid="backup-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setFile(f);
        }}
      />
      {result && (
        <div className="notice notice--info" role="status" data-testid="restore-done">
          <p className="notice__title">Готово{result.createdAt ? ` — копия от ${formatLocalDateTime(result.createdAt)}` : ''}</p>
          <p>
            Добавлено или обновлено записей: {result.received}
            {result.newerHere ? `, на устройстве новее и оставлено: ${result.newerHere}` : ''}. Сканов добавлено: {result.scansAdded}.
            {result.scansDamaged ? ` Повреждённых файлов сканов пропущено: ${result.scansDamaged}.` : ''}
          </p>
          <p>Чтобы восстановленное попало на другие устройства, нажмите «Отправить».</p>
        </div>
      )}
      {error && (
        <p className="notice notice--error" role="alert" data-testid="restore-error">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={file !== null}
        title="Восстановить из копии?"
        confirmLabel="Восстановить"
        onConfirm={() => {
          const f = file;
          setFile(null);
          if (f) void run(f);
        }}
        onCancel={() => {
          setFile(null);
          if (ref.current) ref.current.value = '';
        }}
      >
        <p>
          Файл «{file?.name}» ({file ? formatBytes(file.size) : ''}). Записи сольются с данными на устройстве, ничего не удалится.
        </p>
      </ConfirmDialog>
    </section>
  );
}
