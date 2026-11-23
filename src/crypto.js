const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const PBKDF2_ITERATIONS = 600000;

export function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(value) {
  const normalized = String(value ?? '')
    .replace(/\s+/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  if (!normalized) return new Uint8Array(0);
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export async function deriveKey(password, salt, iterations = PBKDF2_ITERATIONS) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function keyToBase64(key) {
  const raw = await crypto.subtle.exportKey('raw', key);
  return bytesToBase64(new Uint8Array(raw));
}

export async function keyFromBase64(value) {
  const raw = base64ToBytes(value);
  if (raw.length !== 32) throw new Error('INVALID_SESSION_KEY');
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, [
    'encrypt',
    'decrypt'
  ]);
}

export async function encryptJson(key, value) {
  const iv = randomBytes(12);
  const plaintext = encoder.encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );
  return {
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(ciphertext))
  };
}

export async function decryptJson(key, encrypted) {
  if (!encrypted?.iv || !encrypted?.ct) {
    throw new Error('INVALID_VAULT');
  }
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64ToBytes(encrypted.iv)
    },
    key,
    base64ToBytes(encrypted.ct)
  );
  return JSON.parse(decoder.decode(plaintext));
}
