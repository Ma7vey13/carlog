import { useRef, useState } from 'react';
import type { Id } from '../../core/model';
import { getDb } from '../../db/db';
import { storeScans } from '../../db/scans';
import { processFiles, ScanError } from '../../scan/process';
import { PlusIcon } from '../../ui/icons';

interface Props {
  cameraLabel: string;
  filesLabel: string;
  /** Camera button as the primary one. */
  primary?: boolean;
  /** Prefix for the inputs' test ids: `${prefix}camera-input`, `${prefix}files-input`. */
  testIdPrefix?: string;
  /** Called with the stored scan ids, in the picked order. */
  onStored: (scanIds: Id[]) => void | Promise<void>;
}

/** Camera, gallery or PDF → compressed pages stored as scans (SPEC section 6). */
export function ScanPicker({ cameraLabel, filesLabel, primary = false, testIdPrefix = '', onStored }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFiles = async (list: FileList | null) => {
    const files = [...(list ?? [])];
    if (!files.length) return;
    setError(null);
    setProgress('Обрабатываю…');
    try {
      const pages = await processFiles(files, setProgress);
      setProgress('Сохраняю…');
      await onStored(await storeScans(getDb(), pages));
    } catch (err) {
      console.error(err);
      setError(err instanceof ScanError ? err.message : 'Не удалось обработать файл. Попробуйте ещё раз или выберите другой файл.');
    } finally {
      setProgress(null);
      if (cameraRef.current) cameraRef.current.value = '';
      if (filesRef.current) filesRef.current.value = '';
    }
  };

  return (
    <div className="stack">
      <div className="btn-row">
        <button type="button" className={primary ? 'btn btn--primary' : 'btn btn--secondary'} disabled={!!progress} onClick={() => cameraRef.current?.click()}>
          <PlusIcon width={18} height={18} /> {cameraLabel}
        </button>
        <button type="button" className="btn btn--secondary" disabled={!!progress} onClick={() => filesRef.current?.click()}>
          {filesLabel}
        </button>
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        data-testid={`${testIdPrefix}camera-input`}
        onChange={(e) => void onFiles(e.target.files)}
      />
      <input
        ref={filesRef}
        type="file"
        accept="image/*,application/pdf,.pdf"
        multiple
        hidden
        data-testid={`${testIdPrefix}files-input`}
        onChange={(e) => void onFiles(e.target.files)}
      />
      {progress && (
        <p className="muted" role="status">
          {progress}
        </p>
      )}
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
