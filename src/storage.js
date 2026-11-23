import {
  PBKDF2_ITERATIONS,
  base64ToBytes,
  bytesToBase64,
  decryptJson,
  deriveKey,
  encryptJson,
  keyFromBase64,
  keyToBase64,
  randomBytes
} from './crypto.js';
import { generateHOTP, base32Decode } from './otp.js';

const VAULT_KEY = 'vault';
const SESSION_KEY = 'unlocked';
const WRITE_LOCK = 'authvault:vault-write';
const ALLOWED_ALGORITHMS = new Set(['SHA1', 'SHA256', 'SHA512']);

async function readLocal(key) {
  const result = await chrome.storage.local.get(key);
  return result?.[key];
}

async function readSession() {
  const result = await chrome.storage.session.get(SESSION_KEY);
  return result?.[SESSION_KEY] || null;
}

function withVaultLock(task) {
  const locks = globalThis.navigator?.locks;
  if (locks?.request) return locks.request(WRITE_LOCK, task);
  return task();
}

async function storeSession(key) {
  await chrome.storage.session.set({
    [SESSION_KEY]: {
      key: await keyToBase64(key),
      exp: 0,
      createdAt: Date.now()
    }
  });
}

function normalizeStoredAccounts(accounts) {
  if (!Array.isArray(accounts)) return [];
  return accounts.filter(
    (account) =>
      account &&
      typeof account === 'object' &&
      typeof account.id === 'string' &&
      typeof account.secret === 'string'
  );
}

function randomId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

export function accountFingerprint(account) {
  return [
    account.type === 'hotp' ? 'hotp' : 'totp',
    String(account.issuer || '').trim().toLowerCase(),
    String(account.name || '').trim().toLowerCase(),
    account.secret,
    account.algorithm,
    account.digits,
    account.period
  ].join('|');
}

export function normalizeAccount(input) {
  const type = input?.type === 'hotp' ? 'hotp' : 'totp';
  const issuer = String(input?.issuer || '').trim().slice(0, 80);
  const name = String(input?.name || '').trim().slice(0, 160);
  if (!issuer && !name) throw new Error('NAME_REQUIRED');

  const algorithm = ALLOWED_ALGORITHMS.has(input?.algorithm)
    ? input.algorithm
    : 'SHA1';
  const digits = Number(input?.digits);
  if (!Number.isInteger(digits) || digits < 6 || digits > 8) {
    throw new Error('INVALID_DIGITS');
  }
  const period = Number(input?.period || 30);
  if (!Number.isInteger(period) || period < 1 || period > 3600) {
    throw new Error('INVALID_PERIOD');
  }
  let secretBytes;
  try {
    secretBytes = base64ToBytes(input?.secret);
  } catch {
    throw new Error('INVALID_SECRET');
  }
  if (!secretBytes.length) throw new Error('INVALID_SECRET');

  return {
    id: typeof input?.id === 'string' && input.id ? input.id : randomId(),
    type,
    issuer,
    name: name || issuer || 'Akun',
    secret: bytesToBase64(secretBytes),
    algorithm,
    digits,
    period,
    counter: Math.max(0, Math.floor(Number(input?.counter) || 0)),
    createdAt: Number(input?.createdAt) || Date.now()
  };
}

export function createAccountFromBase32(input) {
  let secret;
  try {
    secret = base32Decode(input?.secret);
  } catch {
    throw new Error('INVALID_SECRET');
  }
  return normalizeAccount({
    type: input?.type === 'hotp' ? 'hotp' : 'totp',
    issuer: input?.issuer,
    name: input?.name,
    secret: bytesToBase64(secret),
    algorithm: input?.algorithm,
    digits: input?.digits || 6,
    period: input?.period || 30,
    counter: input?.counter || 0
  });
}

export async function hasVault() {
  return Boolean(await readLocal(VAULT_KEY));
}

export async function getVaultMeta() {
  const vault = await readLocal(VAULT_KEY);
  if (!vault) return null;
  return {
    createdAt: vault.createdAt || null,
    updatedAt: vault.updatedAt || null,
    iterations: vault.iterations || PBKDF2_ITERATIONS
  };
}

async function normalizeSessionLifetime(session) {
  if (session.exp > 0 && session.exp <= Date.now()) {
    await chrome.storage.session.remove(SESSION_KEY);
    return false;
  }
  // Sesi lama yang masih aktif diubah menjadi sesi tanpa batas waktu.
  if (session.exp !== 0) {
    session.exp = 0;
    await chrome.storage.session.set({ [SESSION_KEY]: session });
  }
  return true;
}

export async function isSessionActive() {
  const session = await readSession();
  if (!session?.key) return false;
  return normalizeSessionLifetime(session);
}

export async function getSessionKey() {
  const session = await readSession();
  if (!session?.key) return null;
  if (!(await normalizeSessionLifetime(session))) return null;
  try {
    return await keyFromBase64(session.key);
  } catch {
    await chrome.storage.session.remove(SESSION_KEY);
    return null;
  }
}

export async function lockVault() {
  await chrome.storage.session.remove(SESSION_KEY);
}

async function requireSessionKey() {
  const key = await getSessionKey();
  if (!key) throw new Error('LOCKED');
  return key;
}

export async function createVault(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('WEAK_PASSWORD');
  }
  return withVaultLock(async () => {
    if (await hasVault()) throw new Error('VAULT_EXISTS');
    const salt = randomBytes(16);
    const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
    const createdAt = Date.now();
    const encrypted = await encryptJson(key, {
      accounts: [],
      createdAt,
      updatedAt: createdAt
    });
    const vault = {
      v: 1,
      salt: bytesToBase64(salt),
      iterations: PBKDF2_ITERATIONS,
      iv: encrypted.iv,
      ct: encrypted.ct,
      createdAt,
      updatedAt: createdAt
    };
    await chrome.storage.local.set({ [VAULT_KEY]: vault });
    await storeSession(key);
    return key;
  });
}

export async function unlockVault(password) {
  const vault = await readLocal(VAULT_KEY);
  if (!vault) throw new Error('NO_VAULT');
  const key = await deriveKey(
    password,
    base64ToBytes(vault.salt),
    vault.iterations || PBKDF2_ITERATIONS
  );
  let data;
  try {
    data = await decryptJson(key, vault);
  } catch {
    throw new Error('WRONG_PASSWORD');
  }
  await storeSession(key);
  return {
    key,
    accounts: normalizeStoredAccounts(data.accounts),
    vault
  };
}

export async function loadAccounts(key) {
  const vault = await readLocal(VAULT_KEY);
  if (!vault) return [];
  let data;
  try {
    data = await decryptJson(key, vault);
  } catch {
    throw new Error('WRONG_PASSWORD');
  }
  return normalizeStoredAccounts(data.accounts);
}

async function mutateVault(mutator) {
  const key = await requireSessionKey();
  return withVaultLock(async () => {
    const vault = await readLocal(VAULT_KEY);
    if (!vault) throw new Error('NO_VAULT');
    let data;
    try {
      data = await decryptJson(key, vault);
    } catch {
      throw new Error('LOCKED');
    }
    data.accounts = normalizeStoredAccounts(data.accounts);
    const result = await mutator(data);
    const encrypted = await encryptJson(key, data);
    vault.iv = encrypted.iv;
    vault.ct = encrypted.ct;
    vault.updatedAt = Date.now();
    await chrome.storage.local.set({ [VAULT_KEY]: vault });
    return result;
  });
}

export async function addAccounts(accounts) {
  const prepared = accounts.map(normalizeAccount);
  return mutateVault((data) => {
    const existing = new Set(data.accounts.map(accountFingerprint));
    let added = 0;
    let skipped = 0;
    for (const account of prepared) {
      const fingerprint = accountFingerprint(account);
      if (existing.has(fingerprint)) {
        skipped += 1;
        continue;
      }
      existing.add(fingerprint);
      data.accounts.push(account);
      added += 1;
    }
    return { added, skipped, total: data.accounts.length };
  });
}

export async function updateAccount(id, patch) {
  return mutateVault((data) => {
    const account = data.accounts.find((item) => item.id === id);
    if (!account) throw new Error('ACCOUNT_NOT_FOUND');
    if (Object.prototype.hasOwnProperty.call(patch, 'issuer')) {
      account.issuer = String(patch.issuer || '').trim().slice(0, 80);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
      account.name = String(patch.name || '').trim().slice(0, 160);
    }
    if (!account.issuer && !account.name) throw new Error('NAME_REQUIRED');
    if (!account.name) account.name = account.issuer || 'Akun';
    return account;
  });
}

export async function deleteAccount(id) {
  return mutateVault((data) => {
    const index = data.accounts.findIndex((item) => item.id === id);
    if (index === -1) throw new Error('ACCOUNT_NOT_FOUND');
    data.accounts.splice(index, 1);
    return true;
  });
}

export async function generateHotpCode(id) {
  return mutateVault(async (data) => {
    const account = data.accounts.find((item) => item.id === id);
    if (!account) throw new Error('ACCOUNT_NOT_FOUND');
    if (account.type !== 'hotp') throw new Error('NOT_HOTP');
    const usedCounter = Math.max(0, Math.floor(Number(account.counter) || 0));
    const code = await generateHOTP(
      base64ToBytes(account.secret),
      usedCounter,
      account.algorithm,
      account.digits
    );
    account.counter = usedCounter + 1;
    return {
      code,
      usedCounter,
      nextCounter: account.counter
    };
  });
}

export async function changeMasterPassword(currentPassword, newPassword) {
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    throw new Error('WEAK_PASSWORD');
  }
  const vault = await readLocal(VAULT_KEY);
  if (!vault) throw new Error('NO_VAULT');
  const currentKey = await deriveKey(
    currentPassword,
    base64ToBytes(vault.salt),
    vault.iterations || PBKDF2_ITERATIONS
  );
  let data;
  try {
    data = await decryptJson(currentKey, vault);
  } catch {
    throw new Error('WRONG_PASSWORD');
  }
  const salt = randomBytes(16);
  const newKey = await deriveKey(newPassword, salt, PBKDF2_ITERATIONS);
  const encrypted = await encryptJson(newKey, data);
  const updated = {
    ...vault,
    salt: bytesToBase64(salt),
    iterations: PBKDF2_ITERATIONS,
    iv: encrypted.iv,
    ct: encrypted.ct,
    updatedAt: Date.now()
  };
  await chrome.storage.local.set({ [VAULT_KEY]: updated });
  await storeSession(newKey);
  return { key: newKey };
}

export async function exportBackup() {
  await requireSessionKey();
  const vault = await readLocal(VAULT_KEY);
  if (!vault) throw new Error('NO_VAULT');
  return JSON.stringify(
    {
      app: 'authvault',
      format: 1,
      exportedAt: new Date().toISOString(),
      vault
    },
    null,
    2
  );
}

function parseBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('INVALID_BACKUP');
  }
  if (parsed?.app !== 'authvault' || parsed.format !== 1) {
    throw new Error('INVALID_BACKUP');
  }
  const vault = parsed.vault;
  if (
    !vault ||
    typeof vault.salt !== 'string' ||
    typeof vault.iv !== 'string' ||
    typeof vault.ct !== 'string' ||
    !Number.isSafeInteger(vault.iterations) ||
    vault.iterations < 1000 ||
    vault.iterations > 5000000
  ) {
    throw new Error('INVALID_BACKUP');
  }
  return {
    v: 1,
    salt: vault.salt,
    iterations: vault.iterations,
    iv: vault.iv,
    ct: vault.ct,
    createdAt: Number(vault.createdAt) || Date.now(),
    updatedAt: Number(vault.updatedAt) || Date.now()
  };
}

export async function importBackup(text, password, mode = 'merge') {
  const backupVault = parseBackup(text);
  const backupKey = await deriveKey(
    String(password || ''),
    base64ToBytes(backupVault.salt),
    backupVault.iterations
  );
  let backupData;
  try {
    backupData = await decryptJson(backupKey, backupVault);
  } catch {
    throw new Error('WRONG_PASSWORD');
  }
  const backupAccounts = normalizeStoredAccounts(backupData.accounts);

  if (mode === 'replace') {
    return withVaultLock(async () => {
      const createdAt = backupVault.createdAt || Date.now();
      const encrypted = await encryptJson(backupKey, {
        accounts: backupAccounts,
        createdAt,
        updatedAt: Date.now()
      });
      const vault = {
        v: 1,
        salt: backupVault.salt,
        iterations: backupVault.iterations,
        iv: encrypted.iv,
        ct: encrypted.ct,
        createdAt,
        updatedAt: Date.now()
      };
      await chrome.storage.local.set({ [VAULT_KEY]: vault });
      await storeSession(backupKey);
      return {
        mode: 'replace',
        key: backupKey,
        added: backupAccounts.length,
        skipped: 0,
        total: backupAccounts.length
      };
    });
  }

  const result = await mutateVault((data) => {
    const existing = new Set(data.accounts.map(accountFingerprint));
    let added = 0;
    let skipped = 0;
    for (const raw of backupAccounts) {
      let account;
      try {
        account = normalizeAccount(raw);
      } catch {
        skipped += 1;
        continue;
      }
      const fingerprint = accountFingerprint(account);
      if (existing.has(fingerprint)) {
        skipped += 1;
        continue;
      }
      existing.add(fingerprint);
      data.accounts.push(account);
      added += 1;
    }
    return { mode: 'merge', added, skipped, total: data.accounts.length };
  });
  return result;
}

export async function resetVault() {
  await chrome.storage.local.remove(VAULT_KEY);
  await chrome.storage.session.remove(SESSION_KEY);
}
