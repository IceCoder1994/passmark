/**
 * Web Cryptography API (PBKDF2 + AES-256-GCM) implementation
 * Zero-Knowledge: master passwords are never stored or transmitted.
 */

const ITERATIONS = 100000;
const HASH = 'SHA-256';
const KEY_LENGTH = 256;
export const AUTH_CHECK_PAYLOAD = 'PASSMARK_VAULT_AUTHENTICATED_V1';

export function uint8ArrayToBase64(arr: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < arr.byteLength; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function generateSalt(length = 16): string {
  const salt = new Uint8Array(length);
  crypto.getRandomValues(salt);
  return uint8ArrayToBase64(salt);
}

/**
 * Derive AES-GCM 256-bit key from master password and salt using PBKDF2
 */
export async function deriveKey(masterPassword: string, saltBase64: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(masterPassword),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const saltBytes = base64ToUint8Array(saltBase64);

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes as BufferSource,
      iterations: ITERATIONS,
      hash: HASH,
    },
    passwordKey,
    {
      name: 'AES-GCM',
      length: KEY_LENGTH,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

export interface EncryptedPayload {
  v: number; // version
  iv: string; // base64
  data: string; // base64 ciphertext
}

/**
 * Encrypt plain text using AES-256-GCM
 */
export async function encryptText(plaintext: string, key: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const encodedData = encoder.encode(plaintext);
  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    encodedData
  );

  const payload: EncryptedPayload = {
    v: 1,
    iv: uint8ArrayToBase64(iv),
    data: uint8ArrayToBase64(new Uint8Array(ciphertextBuffer)),
  };

  return JSON.stringify(payload);
}

/**
 * Decrypt ciphertext using AES-256-GCM
 */
export async function decryptText(encryptedJsonStr: string, key: CryptoKey): Promise<string> {
  const payload: EncryptedPayload = JSON.parse(encryptedJsonStr);
  const iv = base64ToUint8Array(payload.iv);
  const ciphertext = base64ToUint8Array(payload.data);

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
    },
    key,
    ciphertext as BufferSource
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

/**
 * Encrypt any JS object/array
 */
export async function encryptObject<T>(obj: T, key: CryptoKey): Promise<string> {
  return encryptText(JSON.stringify(obj), key);
}

/**
 * Decrypt back to JS object/array
 */
export async function decryptObject<T>(encryptedJsonStr: string, key: CryptoKey): Promise<T> {
  const jsonStr = await decryptText(encryptedJsonStr, key);
  return JSON.parse(jsonStr) as T;
}
