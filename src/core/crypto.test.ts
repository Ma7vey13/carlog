import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  createVault,
  CorruptFileError,
  decryptBytes,
  decryptJson,
  encryptBytes,
  encryptJson,
  KDF_ITERATIONS,
  parseVault,
  passwordProblems,
  unlockVault,
  WrongPasswordError,
} from './crypto';

// Tests use few iterations for speed; one test checks the real default.
const FAST = 1000;

describe('vault and keys', () => {
  it('uses at least 600 000 PBKDF2 iterations by default (SPEC section 3)', () => {
    expect(KDF_ITERATIONS).toBeGreaterThanOrEqual(600_000);
  });

  it('unlocks with the right password and rejects a wrong one', async () => {
    const { vault } = await createVault('correct horse battery staple', '2026-01-01T00:00:00Z', FAST);
    expect(vault).toMatchObject({ format: 'carlog.vault.v1', cipher: 'AES-GCM-256', kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: FAST } });
    expect(base64ToBytes(vault.kdf.salt)).toHaveLength(16);
    await expect(unlockVault(vault, 'correct horse battery staple')).resolves.toBeDefined();
    await expect(unlockVault(vault, 'wrong horse')).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('keys are not extractable', async () => {
    const { key } = await createVault('long enough password', undefined, FAST);
    expect(key.extractable).toBe(false);
    await expect(globalThis.crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  });

  it('vault.json holds no secret: the password does not appear and the salt differs every time', async () => {
    const a = await createVault('same password here', undefined, FAST);
    const b = await createVault('same password here', undefined, FAST);
    expect(JSON.stringify(a.vault)).not.toContain('same password');
    expect(a.vault.kdf.salt).not.toBe(b.vault.kdf.salt);
    expect(parseVault(JSON.parse(JSON.stringify(a.vault)))).toEqual(a.vault);
    expect(() => parseVault({ format: 'x' })).toThrow(CorruptFileError);
  });
});

describe('files', () => {
  it('round-trips bytes and JSON with a fresh IV each time', async () => {
    const { key } = await createVault('long enough password', undefined, FAST);
    const data = new TextEncoder().encode('Колодки тормозные перед.(OEM) SFN — 3 600 ₽');
    const one = await encryptBytes(key, data);
    const two = await encryptBytes(key, data);
    expect(one[0]).toBe(1);
    expect(bytesToBase64(one)).not.toBe(bytesToBase64(two));
    expect(new TextDecoder().decode(await decryptBytes(key, one))).toBe('Колодки тормозные перед.(OEM) SFN — 3 600 ₽');
    expect(await decryptJson(key, await encryptJson(key, { a: [1, 'б'] }))).toEqual({ a: [1, 'б'] });
  });

  it('ciphertext does not contain the plaintext', async () => {
    const { key } = await createVault('long enough password', undefined, FAST);
    const file = await encryptJson(key, { shop: 'Автосервис «Пример»', km: 293000 });
    const asText = new TextDecoder('utf-8', { fatal: false }).decode(file);
    expect(asText).not.toContain('Пример');
    expect(asText).not.toContain('293000');
  });

  it('a different key or a tampered file is rejected', async () => {
    const a = await createVault('first password!!', undefined, FAST);
    const b = await createVault('second password!', undefined, FAST);
    const file = await encryptJson(a.key, { x: 1 });
    await expect(decryptJson(b.key, file)).rejects.toBeInstanceOf(WrongPasswordError);
    const tampered = file.slice();
    tampered[tampered.length - 1]! ^= 1;
    await expect(decryptBytes(a.key, tampered)).rejects.toBeInstanceOf(WrongPasswordError);
    await expect(decryptBytes(a.key, new Uint8Array([9, 1, 2]))).rejects.toBeInstanceOf(CorruptFileError);
  });

  it('base64 handles large binary data', () => {
    const big = new Uint8Array(300_000).map((_, i) => i % 256);
    expect(base64ToBytes(bytesToBase64(big))).toEqual(big);
  });
});

describe('password rules', () => {
  it('asks for a long password', () => {
    expect(passwordProblems('short')).toHaveLength(1);
    expect(passwordProblems('aaaaaaaaaaaaaaa')).toEqual(['не из одного повторяющегося символа']);
    expect(passwordProblems('лошадь батарейка скрепка')).toEqual([]);
  });
});
