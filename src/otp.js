import { base64ToBytes } from './crypto.js';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const HASH_NAMES = {
  SHA1: 'SHA-1',
  SHA256: 'SHA-256',
  SHA512: 'SHA-512'
};

export function normalizeSecret(value) {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[\s=-]/g, '');
}

export function base32Decode(value) {
  const clean = normalizeSecret(value);
  if (!clean) throw new Error('Secret masih kosong, gan.');
  if (/[^A-Z2-7]/.test(clean)) {
    throw new Error('Secret Base32 ada karakter aneh, gan. Cek lagi.');
  }
  const output = [];
  let buffer = 0;
  let bitsLeft = 0;
  for (const character of clean) {
    buffer = (buffer << 5) | BASE32_ALPHABET.indexOf(character);
    bitsLeft += 5;
    if (bitsLeft >= 8) {
      bitsLeft -= 8;
      output.push((buffer >>> bitsLeft) & 0xff);
    }
  }
  if (!output.length) throw new Error('Secret Base32 terlalu pendek, ya.');
  return new Uint8Array(output);
}

function counterBytes(counter) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(counter));
  return bytes;
}

export async function generateHOTP(
  secretBytes,
  counter,
  algorithm = 'SHA1',
  digits = 6
) {
  const hash = HASH_NAMES[algorithm];
  if (!hash) throw new Error('Algoritma OTP nggak didukung, gan.');
  if (!Number.isInteger(digits) || digits < 6 || digits > 8) {
    throw new Error('Jumlah digit nggak didukung, gan.');
  }
  if (counter < 0) throw new Error('Counter nggak valid, gan.');

  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash },
    false,
    ['sign']
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, counterBytes(counter))
  );
  const offset = signature[signature.length - 1] & 0x0f;
  const binary =
    ((signature[offset] & 0x7f) << 24) |
    (signature[offset + 1] << 16) |
    (signature[offset + 2] << 8) |
    signature[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export async function generateTOTP(account, now = Date.now()) {
  const period = Number(account.period) || 30;
  const digits = Number(account.digits) || 6;
  const seconds = Math.floor(now / 1000);
  const counter = Math.floor(seconds / period);
  const remaining = period - (seconds % period);
  const code = await generateHOTP(
    base64ToBytes(account.secret),
    counter,
    account.algorithm,
    digits
  );
  return { code, counter, remaining, period };
}

export function totpRemaining(period, now = Date.now()) {
  const safePeriod = Number(period) || 30;
  const seconds = Math.floor(now / 1000);
  return safePeriod - (seconds % safePeriod);
}
