import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
}

const { base32Decode, generateHOTP, generateTOTP } = await import(
  '../src/otp.js'
);
const { deriveKey, encryptJson, decryptJson, bytesToBase64 } = await import(
  '../src/crypto.js'
);
const { parseMigrationUrl, parseOtpAuthUri, parseOtpInput } = await import(
  '../src/migrate.js'
);

function ascii(value) {
  return new TextEncoder().encode(value);
}

function accountFromAscii(secret, overrides = {}) {
  return {
    type: 'totp',
    secret: bytesToBase64(ascii(secret)),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    ...overrides
  };
}

// Base32 RFC 4648 test vector.
assert.equal(
  new TextDecoder().decode(
    base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
  ),
  '12345678901234567890'
);

// RFC 4226 HOTP vectors.
const hotpSecret = ascii('12345678901234567890');
const hotpExpected = [
  '755224',
  '287082',
  '359152',
  '969429',
  '338314',
  '254676',
  '287922',
  '162583',
  '399871',
  '520489'
];
for (let counter = 0; counter < hotpExpected.length; counter += 1) {
  assert.equal(
    await generateHOTP(hotpSecret, counter, 'SHA1', 6),
    hotpExpected[counter]
  );
}

// RFC 6238 TOTP vectors.
const totpCases = [
  {
    secret: '12345678901234567890',
    algorithm: 'SHA1',
    expected: '94287082'
  },
  {
    secret: '12345678901234567890123456789012',
    algorithm: 'SHA256',
    expected: '46119246'
  },
  {
    secret:
      '1234567890123456789012345678901234567890123456789012345678901234',
    algorithm: 'SHA512',
    expected: '90693936'
  }
];
for (const testCase of totpCases) {
  const result = await generateTOTP(
    accountFromAscii(testCase.secret, {
      algorithm: testCase.algorithm,
      digits: 8
    }),
    59000
  );
  assert.equal(result.code, testCase.expected);
  assert.equal(result.remaining, 1);
  assert.equal(result.counter, 1);
}

// AES-GCM + PBKDF2 round trip.
const salt = webcrypto.getRandomValues(new Uint8Array(16));
const key = await deriveKey('correct horse battery staple', salt, 1000);
const encrypted = await encryptJson(key, { hello: 'dunia', count: 2 });
assert.deepEqual(await decryptJson(key, encrypted), {
  hello: 'dunia',
  count: 2
});
const wrongKey = await deriveKey('wrong password', salt, 1000);
await assert.rejects(() => decryptJson(wrongKey, encrypted));

// Minimal protobuf encoder for the Google Authenticator migration payload.
function varint(value) {
  const output = [];
  let current = value;
  while (current > 0x7f) {
    output.push((current & 0x7f) | 0x80);
    current = Math.floor(current / 128);
  }
  output.push(current);
  return output;
}

function fieldVarint(field, value) {
  return [(field << 3) | 0, ...varint(value)];
}

function fieldBytes(field, bytes) {
  return [(field << 3) | 2, ...varint(bytes.length), ...bytes];
}

function otpParameters({
  secret,
  name,
  issuer,
  algorithm = 1,
  digits = 1,
  type = 2,
  counter = 0
}) {
  return [
    ...fieldBytes(1, [...ascii(secret)]),
    ...fieldBytes(2, [...new TextEncoder().encode(name)]),
    ...fieldBytes(3, [...new TextEncoder().encode(issuer)]),
    ...fieldVarint(4, algorithm),
    ...fieldVarint(5, digits),
    ...fieldVarint(6, type),
    ...fieldVarint(7, counter)
  ];
}

const params = otpParameters({
  secret: '12345678901234567890',
  name: 'alice@example.com',
  issuer: 'GitHub'
});
const migrationBytes = [
  ...fieldBytes(1, params),
  ...fieldVarint(2, 1),
  ...fieldVarint(3, 2),
  ...fieldVarint(4, 0),
  ...fieldVarint(5, 98765)
];
const migrationData = Buffer.from(migrationBytes).toString('base64');
const migrationUrl = `otpauth-migration://offline?data=${encodeURIComponent(
  migrationData
)}`;
const migration = parseMigrationUrl(migrationUrl);
assert.equal(migration.accounts.length, 1);
assert.equal(migration.accounts[0].issuer, 'GitHub');
assert.equal(migration.accounts[0].name, 'alice@example.com');
assert.equal(migration.accounts[0].algorithm, 'SHA1');
assert.equal(migration.accounts[0].digits, 6);
assert.equal(migration.batchSize, 2);
assert.equal(migration.batchIndex, 0);
assert.equal(migration.batchId, 98765);
assert.equal(
  new TextDecoder().decode(
    Uint8Array.from(atob(migration.accounts[0].secret), (char) =>
      char.charCodeAt(0)
    )
  ),
  '12345678901234567890'
);

// Raw '+' characters in migration data are turned into spaces by URLSearchParams.
const plusyBase64 = Buffer.from([
  ...fieldBytes(1, params),
  ...fieldVarint(3, 1)
]).toString('base64');
if (plusyBase64.includes('+')) {
  const rawPlusUrl = `otpauth-migration://offline?data=${plusyBase64}`;
  assert.equal(parseMigrationUrl(rawPlusUrl).accounts.length, 1);
}

// otpauth:// parsing, including issuer:account labels.
const otpauth = parseOtpAuthUri(
  'otpauth://totp/GitHub:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&algorithm=SHA1&digits=6&period=30'
).account;
assert.equal(otpauth.issuer, 'GitHub');
assert.equal(otpauth.name, 'user@example.com');
assert.equal(otpauth.period, 30);

const hotpAuth = parseOtpAuthUri(
  'otpauth://hotp/Example:alice?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Example&counter=7'
).account;
assert.equal(hotpAuth.type, 'hotp');
assert.equal(hotpAuth.counter, 7);

const parsedInput = parseOtpInput(`${migrationUrl}\notpauth://totp/A:b?secret=JBSWY3DPEHPK3PXP`);
assert.equal(parsedInput.results.length, 2);
assert.equal(parsedInput.errors.length, 0);

// Exercise the whole vault storage flow with an in-memory chrome.storage mock.
const localStore = new Map();
const sessionStore = new Map();
function mockArea(store) {
  return {
    async get(key) {
      if (typeof key === 'string') return { [key]: store.get(key) };
      return Object.fromEntries(store);
    },
    async set(values) {
      for (const [key, value] of Object.entries(values)) {
        store.set(key, structuredClone(value));
      }
    },
    async remove(key) {
      if (key === undefined) store.clear();
      else store.delete(key);
    }
  };
}
globalThis.chrome = {
  storage: {
    local: mockArea(localStore),
    session: mockArea(sessionStore)
  }
};

const storage = await import('../src/storage.js');
await storage.resetVault();
const key1 = await storage.createVault('password-123');
assert.equal(await storage.hasVault(), true);
assert.equal(sessionStore.get('unlocked').exp, 0);

const toAdd = [
  accountFromAscii('12345678901234567890', {
    issuer: 'GitHub',
    name: 'alice@example.com'
  }),
  {
    ...accountFromAscii('ABCDEFGHIJKLMNOP', {
      issuer: 'Example',
      name: 'bob',
      type: 'hotp',
      digits: 6
    }),
    counter: 4
  }
];
assert.deepEqual(await storage.addAccounts(toAdd), {
  added: 2,
  skipped: 0,
  total: 2
});
assert.deepEqual(await storage.addAccounts(toAdd), {
  added: 0,
  skipped: 2,
  total: 2
});

const loaded = await storage.loadAccounts(key1);
assert.equal(loaded.length, 2);
assert.equal(localStore.get('vault').ct.includes('alice'), false);

const hotpResult = await storage.generateHotpCode(loaded[1].id);
assert.equal(hotpResult.usedCounter, 4);
assert.equal(hotpResult.nextCounter, 5);
assert.equal(
  hotpResult.code,
  await generateHOTP(ascii('ABCDEFGHIJKLMNOP'), 4, 'SHA1', 6)
);

const backup = await storage.exportBackup();
assert.ok(backup.includes('"app": "gembokgemas"'));
const legacyBackup = backup.replace('"app": "gembokgemas"', '"app": "authvault"');
assert.ok(legacyBackup.includes('"app": "authvault"'));
await assert.rejects(
  () => storage.importBackup(backup, 'wrong-password', 'merge'),
  /WRONG_PASSWORD/
);

const changed = await storage.changeMasterPassword('password-123', 'new-password-456');
assert.ok(changed.key);
const oldSeen = await storage.unlockVault('password-123').then(
  () => true,
  () => false
);
assert.equal(oldSeen, false);
const unlocked = await storage.unlockVault('new-password-456');
assert.equal(unlocked.accounts.length, 2);

const merge = await storage.importBackup(backup, 'password-123', 'merge');
assert.equal(merge.added, 0);
assert.equal(merge.skipped, 2);

const legacyMerge = await storage.importBackup(legacyBackup, 'password-123', 'merge');
assert.equal(legacyMerge.added, 0);
assert.equal(legacyMerge.skipped, 2);

// Sesi baru tidak memakai batas waktu dan bertahan sampai Chrome ditutup.
assert.equal(await storage.isSessionActive(), true);
assert.equal(sessionStore.get('unlocked').exp, 0);

// Sesi lama yang masih aktif dimigrasikan menjadi sesi tanpa batas waktu.
const liveSession = sessionStore.get('unlocked');
liveSession.exp = Date.now() + 60000;
sessionStore.set('unlocked', liveSession);
assert.equal(await storage.isSessionActive(), true);
assert.equal(sessionStore.get('unlocked').exp, 0);

// Sesi lama yang sudah kedaluwarsa tetap harus dibuka ulang.
liveSession.exp = Date.now() - 1;
sessionStore.set('unlocked', liveSession);
assert.equal(await storage.isSessionActive(), false);
assert.equal(await storage.getSessionKey(), null);

await storage.resetVault();
assert.equal(await storage.hasVault(), false);

console.log('All core tests passed.');
