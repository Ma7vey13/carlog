// Encryption for everything that goes to carlog-data (SPEC section 8). WebCrypto only, so the same
// module runs in the browser and in Node 20+ (the Claude Code CLI of stage 5).
//
//   key  = PBKDF2-SHA256(password, salt from vault.json, ≥ 600 000 iterations) → AES-GCM 256
//   file = [version byte 0x01][12-byte random IV][AES-GCM ciphertext + 16-byte tag]
//
// The password is never stored. vault.json holds only public parameters and an encrypted check
// string that tells a wrong password from a right one.

export const VAULT_FORMAT = 'carlog.vault.v1';
export const KDF_ITERATIONS = 600_000;
const FILE_VERSION = 1;
const IV_BYTES = 12;
const SALT_BYTES = 16;
const CHECK_TEXT = 'carlog-vault-check';

export interface Vault {
  format: typeof VAULT_FORMAT;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: 'AES-GCM-256';
  /** Encrypted CHECK_TEXT, base64. */
  check: string;
  createdAt: string;
}

export class WrongPasswordError extends Error {
  constructor() {
    super('Неверный пароль');
  }
}

export class CorruptFileError extends Error {}

const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

// --- base64 for binary (chunked: large scans would overflow String.fromCharCode(...all)) ------

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64.replace(/\s/g, ''));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

// --- keys -----------------------------------------------------------------------------------

/**
 * Derives the AES key. `extractable: false` — the key can encrypt and decrypt but can never be
 * read back, so storing it in IndexedDB ("Запомнить на этом устройстве") does not expose it.
 */
export async function deriveKey(password: string, salt: Uint8Array, iterations: number, extractable = false): Promise<CryptoKey> {
  const material = await subtle().importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt'],
  );
}

// --- files ----------------------------------------------------------------------------------

export async function encryptBytes(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  const iv = randomBytes(IV_BYTES);
  const cipher = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, data as BufferSource));
  const out = new Uint8Array(1 + IV_BYTES + cipher.length);
  out[0] = FILE_VERSION;
  out.set(iv, 1);
  out.set(cipher, 1 + IV_BYTES);
  return out;
}

/** Throws WrongPasswordError when the key does not fit (GCM tag check fails). */
export async function decryptBytes(key: CryptoKey, file: Uint8Array): Promise<Uint8Array> {
  if (file.length < 1 + IV_BYTES + 16 || file[0] !== FILE_VERSION) throw new CorruptFileError('Файл повреждён или в неизвестном формате');
  const iv = file.subarray(1, 1 + IV_BYTES);
  try {
    const plain = await subtle().decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, file.subarray(1 + IV_BYTES) as BufferSource);
    return new Uint8Array(plain);
  } catch {
    throw new WrongPasswordError();
  }
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<Uint8Array> {
  return encryptBytes(key, enc.encode(JSON.stringify(value)));
}

export async function decryptJson<T = unknown>(key: CryptoKey, file: Uint8Array): Promise<T> {
  return JSON.parse(dec.decode(await decryptBytes(key, file))) as T;
}

// --- vault ----------------------------------------------------------------------------------

/** New vault for a new password. `iterations` may be lowered only in tests. */
export async function createVault(password: string, now = new Date().toISOString(), iterations = KDF_ITERATIONS): Promise<{ vault: Vault; key: CryptoKey }> {
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(password, salt, iterations);
  const check = await encryptBytes(key, enc.encode(CHECK_TEXT));
  return {
    key,
    vault: {
      format: VAULT_FORMAT,
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: bytesToBase64(salt) },
      cipher: 'AES-GCM-256',
      check: bytesToBase64(check),
      createdAt: now,
    },
  };
}

export function parseVault(value: unknown): Vault {
  const v = value as Partial<Vault> | null;
  if (!v || v.format !== VAULT_FORMAT || !v.kdf?.salt || !v.check || typeof v.kdf.iterations !== 'number') {
    throw new CorruptFileError('vault.json в неизвестном формате');
  }
  return v as Vault;
}

/** Key for a password, verified against the vault check string. Throws WrongPasswordError. */
export async function unlockVault(vault: Vault, password: string): Promise<CryptoKey> {
  const key = await deriveKey(password, base64ToBytes(vault.kdf.salt), vault.kdf.iterations);
  await verifyKey(vault, key);
  return key;
}

/** Throws WrongPasswordError if the key is not the vault's key. */
export async function verifyKey(vault: Vault, key: CryptoKey): Promise<void> {
  const text = dec.decode(await decryptBytes(key, base64ToBytes(vault.check)));
  if (text !== CHECK_TEXT) throw new WrongPasswordError();
}

/** Minimum password rules shown in the setup wizard. */
export function passwordProblems(password: string): string[] {
  const problems: string[] = [];
  if (password.length < 12) problems.push('не короче 12 символов (лучше 4–5 случайных слов)');
  if (/^(.)\1+$/.test(password)) problems.push('не из одного повторяющегося символа');
  return problems;
}
