import { base64ToBytes, bytesToBase64 } from './crypto.js';
import { base32Decode } from './otp.js';

const utf8 = new TextDecoder('utf-8');
const MIGRATION_ALGORITHMS = { 1: 'SHA1', 2: 'SHA256', 3: 'SHA512' };
const OTP_ALGORITHMS = new Set(['SHA1', 'SHA256', 'SHA512']);

function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function readVarint(bytes, state) {
  let result = 0n;
  let shift = 0n;
  while (true) {
    if (state.pos >= bytes.length) throw new Error('Data QR tidak lengkap.');
    const byte = bytes[state.pos];
    state.pos += 1;
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7n;
    if (shift > 63n) throw new Error('Data QR tidak valid.');
  }
  return result;
}

function readLengthDelimited(bytes, state) {
  const length = Number(readVarint(bytes, state));
  if (
    !Number.isSafeInteger(length) ||
    length < 0 ||
    state.pos + length > bytes.length
  ) {
    throw new Error('Data QR tidak valid.');
  }
  const value = bytes.subarray(state.pos, state.pos + length);
  state.pos += length;
  return value;
}

function skipField(bytes, state, wireType) {
  if (wireType === 0) {
    readVarint(bytes, state);
  } else if (wireType === 1) {
    if (state.pos + 8 > bytes.length) throw new Error('Data QR tidak valid.');
    state.pos += 8;
  } else if (wireType === 2) {
    readLengthDelimited(bytes, state);
  } else if (wireType === 5) {
    if (state.pos + 4 > bytes.length) throw new Error('Data QR tidak valid.');
    state.pos += 4;
  } else {
    throw new Error('Data QR tidak valid.');
  }
}

function readString(bytes, state) {
  return utf8.decode(readLengthDelimited(bytes, state)).trim();
}

function parseOtpParameters(bytes) {
  const state = { pos: 0 };
  const value = {
    secret: null,
    name: '',
    issuer: '',
    algorithm: 1,
    digits: 1,
    type: 2,
    counter: 0
  };

  while (state.pos < bytes.length) {
    const tag = Number(readVarint(bytes, state));
    const field = tag >>> 3;
    const wire = tag & 0x07;

    if (field === 1 && wire === 2) {
      const secret = readLengthDelimited(bytes, state);
      value.secret = secret.length ? new Uint8Array(secret) : null;
    } else if (field === 2 && wire === 2) {
      value.name = readString(bytes, state);
    } else if (field === 3 && wire === 2) {
      value.issuer = readString(bytes, state);
    } else if (field === 4 && wire === 0) {
      value.algorithm = Number(readVarint(bytes, state));
    } else if (field === 5 && wire === 0) {
      value.digits = Number(readVarint(bytes, state));
    } else if (field === 6 && wire === 0) {
      value.type = Number(readVarint(bytes, state));
    } else if (field === 7 && wire === 0) {
      value.counter = Number(readVarint(bytes, state));
    } else {
      skipField(bytes, state, wire);
    }
  }
  return value;
}

function parseMigrationPayload(bytes) {
  const state = { pos: 0 };
  const payload = {
    otpParameters: [],
    version: 0,
    batchSize: 1,
    batchIndex: 0,
    batchId: 0
  };

  while (state.pos < bytes.length) {
    const tag = Number(readVarint(bytes, state));
    const field = tag >>> 3;
    const wire = tag & 0x07;

    if (field === 1 && wire === 2) {
      payload.otpParameters.push(
        parseOtpParameters(readLengthDelimited(bytes, state))
      );
    } else if (field === 2 && wire === 0) {
      payload.version = Number(readVarint(bytes, state));
    } else if (field === 3 && wire === 0) {
      payload.batchSize = Number(readVarint(bytes, state));
    } else if (field === 4 && wire === 0) {
      payload.batchIndex = Number(readVarint(bytes, state));
    } else if (field === 5 && wire === 0) {
      payload.batchId = Number(readVarint(bytes, state));
    } else {
      skipField(bytes, state, wire);
    }
  }
  return payload;
}

function decodeMigrationData(data) {
  let value = String(data ?? '').trim();
  // URLSearchParams turns a literal '+' into a space.
  value = value.replace(/ /g, '+').replace(/[\r\n\t]/g, '');
  value = value.replace(/-/g, '+').replace(/_/g, '/');
  const remainder = value.length % 4;
  if (remainder === 1) throw new Error('Data QR tidak valid.');
  if (remainder) value += '='.repeat(4 - remainder);
  try {
    return base64ToBytes(value);
  } catch {
    throw new Error('Data QR tidak valid.');
  }
}

function splitNames(issuerValue, nameValue) {
  let issuer = String(issuerValue ?? '').trim();
  let name = String(nameValue ?? '').trim();
  const colon = name.indexOf(':');
  if (colon > 0) {
    const prefix = name.slice(0, colon).trim();
    const rest = name.slice(colon + 1).trim();
    if (!issuer) issuer = prefix;
    if (rest) name = rest;
  }
  if (issuer && name.toLowerCase().startsWith(`${issuer.toLowerCase()}:`)) {
    name = name.slice(issuer.length + 1).trim();
  }
  return { issuer, name };
}

function makeAccount({
  type,
  secret,
  issuer,
  name,
  algorithm,
  digits,
  period = 30,
  counter = 0
}) {
  const names = splitNames(issuer, name);
  return {
    id: newId(),
    type,
    secret: bytesToBase64(secret),
    issuer: names.issuer,
    name: names.name || names.issuer || 'Akun',
    algorithm,
    digits,
    period,
    counter,
    createdAt: Date.now()
  };
}

export function parseMigrationUrl(raw) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    throw new Error('Tautan migrasi tidak valid.');
  }
  if (url.protocol !== 'otpauth-migration:') {
    throw new Error('Bukan tautan migrasi Google Authenticator.');
  }
  const data = url.searchParams.get('data');
  if (!data) throw new Error('Tautan migrasi tidak memiliki data.');

  const payload = parseMigrationPayload(decodeMigrationData(data));
  if (!payload.otpParameters.length) {
    throw new Error('QR tidak berisi akun.');
  }

  const accounts = [];
  const warnings = [];

  for (const parameter of payload.otpParameters) {
    const label =
      [parameter.issuer, parameter.name].filter(Boolean).join(':') || 'Akun';
    if (!parameter.secret || !parameter.secret.length) {
      warnings.push(`Akun "${label}" tidak memiliki secret dan dilewati.`);
      continue;
    }
    const algorithm = MIGRATION_ALGORITHMS[parameter.algorithm];
    if (!algorithm) {
      if (parameter.algorithm === 4) {
        warnings.push(`Akun "${label}" memakai MD5 yang tidak didukung.`);
      } else {
        warnings.push(`Akun "${label}" memakai algoritma tidak dikenal.`);
      }
      continue;
    }
    const type = parameter.type === 1 ? 'hotp' : 'totp';
    const digits = parameter.digits === 2 ? 8 : 6;
    accounts.push(
      makeAccount({
        type,
        secret: parameter.secret,
        issuer: parameter.issuer,
        name: parameter.name,
        algorithm,
        digits,
        period: 30,
        counter: Number.isSafeInteger(parameter.counter)
          ? Math.max(0, parameter.counter)
          : 0
      })
    );
  }

  return {
    accounts,
    warnings,
    version: payload.version,
    batchSize: Math.max(1, payload.batchSize || 1),
    batchIndex: Math.max(0, payload.batchIndex || 0),
    batchId: payload.batchId || 0
  };
}

export function parseOtpAuthUri(raw) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    throw new Error('Tautan otpauth tidak valid.');
  }
  if (url.protocol !== 'otpauth:') {
    throw new Error('Bukan tautan otpauth://.');
  }
  const type = url.hostname.toLowerCase();
  if (type !== 'totp' && type !== 'hotp') {
    throw new Error('Tipe OTP tidak didukung.');
  }

  let label = '';
  try {
    label = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  } catch {
    label = url.pathname.replace(/^\/+/, '');
  }

  const parameters = url.searchParams;
  const secretValue = parameters.get('secret');
  if (!secretValue) throw new Error('Tautan tidak memiliki secret.');
  const secret = base32Decode(secretValue);

  const algorithm = (parameters.get('algorithm') || 'SHA1')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (!OTP_ALGORITHMS.has(algorithm)) {
    throw new Error('Algoritma OTP tidak didukung.');
  }

  const digits = Number(parameters.get('digits') || 6);
  if (!Number.isInteger(digits) || digits < 6 || digits > 8) {
    throw new Error('Jumlah digit OTP tidak didukung.');
  }

  const period = Number(parameters.get('period') || 30);
  if (!Number.isInteger(period) || period < 1 || period > 3600) {
    throw new Error('Periode OTP tidak didukung.');
  }

  const counter = Math.max(0, Math.floor(Number(parameters.get('counter') || 0)));
  const names = splitNames(parameters.get('issuer') || '', label);

  return {
    account: makeAccount({
      type,
      secret,
      issuer: names.issuer,
      name: names.name,
      algorithm,
      digits,
      period,
      counter: type === 'hotp' ? counter : 0
    }),
    warnings: []
  };
}

const OTP_URL_PATTERN = /otpauth(?:-migration)?:\/\/[^\s"'<>]+/gi;

export function parseOtpInput(text) {
  const input = String(text ?? '').replace(/&amp;/g, '&');
  const matches = input.match(OTP_URL_PATTERN) || [];
  const results = [];
  const errors = [];

  for (const match of matches) {
    const url = match.replace(/[).,;\]}]+$/g, '');
    try {
      if (/^otpauth-migration:\/\//i.test(url)) {
        results.push({ kind: 'migration', url, ...parseMigrationUrl(url) });
      } else {
        const parsed = parseOtpAuthUri(url);
        results.push({
          kind: 'otpauth',
          url,
          accounts: [parsed.account],
          warnings: parsed.warnings
        });
      }
    } catch (error) {
      errors.push(error.message || 'Tautan tidak bisa dibaca.');
    }
  }

  return { results, errors };
}
