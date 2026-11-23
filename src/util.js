const AVATAR_COLORS = [
  { fg: '#2a2140', bg: '#7fc8ff' },
  { fg: '#2a2140', bg: '#ff92c8' },
  { fg: '#2a2140', bg: '#c9b6ff' },
  { fg: '#2a2140', bg: '#a9f0d8' },
  { fg: '#2a2140', bg: '#ffe58a' },
  { fg: '#2a2140', bg: '#ffc9a8' },
  { fg: '#2a2140', bg: '#b8e6ff' },
  { fg: '#2a2140', bg: '#ffc2e2' }
];

export function stringHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function avatarPalette(value) {
  return AVATAR_COLORS[stringHash(value) % AVATAR_COLORS.length];
}

export function initials(value) {
  const text = String(value || '').trim();
  if (!text) return '?';
  const character = Array.from(text)[0];
  return character.toUpperCase();
}

export function formatCode(code) {
  const value = String(code || '');
  if (value.length === 6) return `${value.slice(0, 3)} ${value.slice(3)}`;
  if (value.length === 8) return `${value.slice(0, 4)} ${value.slice(4)}`;
  if (value.length === 7) return `${value.slice(0, 3)} ${value.slice(3, 5)} ${value.slice(5)}`;
  return value;
}

export function maskSecret() {
  return '••••••••';
}

export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to a temporary textarea below.
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  textarea.remove();
  return copied;
}

export function showToast(element, message, tone = 'success') {
  if (!element) return;
  element.textContent = message;
  element.dataset.tone = tone;
  element.classList.add('show');
  clearTimeout(showToast._timers?.get(element));
  const timers = (showToast._timers ||= new Map());
  timers.set(
    element,
    setTimeout(() => element.classList.remove('show'), 2400)
  );
}

export function errorMessage(error) {
  const code = error?.message || '';
  const messages = {
    WRONG_PASSWORD: 'Kata sandi salah, gan. Coba lagi.',
    WEAK_PASSWORD: 'Kata sandi minimal 8 karakter. Jangan yang pendek-pendek, ya!',
    LOCKED: 'Brankas masih terkunci. Buka kunci lagi, ya.',
    NO_VAULT: 'Brankas belum dibuat, gan. Bikin dulu, yuk!',
    VAULT_EXISTS: 'Brankas udah ada, kok.',
    NAME_REQUIRED: 'Isi nama layanan atau nama akun, gan.',
    INVALID_SECRET: 'Secret nggak valid. Pakai format Base32, ya.',
    INVALID_DIGITS: 'Jumlah digit harus 6 sampai 8, gan.',
    INVALID_PERIOD: 'Periode harus antara 1 dan 3600 detik, ya.',
    INVALID_BACKUP: 'File cadangan nggak dikenali, gan.',
    INVALID_SESSION_KEY: 'Sesi nggak valid. Buka kunci lagi, ya.',
    ACCOUNT_NOT_FOUND: 'Akun nggak ketemu, gan.',
    NOT_HOTP: 'Akun ini bukan HOTP, kok.',
    NO_FILE: 'Pilih file dulu, ya.'
  };
  if (messages[code]) return messages[code];
  if (/incorrect|bad decrypt|operationerror/i.test(`${code} ${error?.name || ''}`)) {
    return 'Kata sandi salah, gan. Coba lagi.';
  }
  return code || 'Ada yang error. Coba lagi, ya.';
}

export function formatDateTime(timestamp) {
  if (!timestamp) return '—';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}

export function formatDateForFile(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function setBusy(button, busy, busyLabel = 'Lagi diproses… sabar…') {
  if (!button) return;
  if (busy) {
    if (!button.dataset.originalLabel) {
      button.dataset.originalLabel = button.textContent;
    }
    button.textContent = busyLabel;
    button.disabled = true;
  } else {
    if (button.dataset.originalLabel) {
      button.textContent = button.dataset.originalLabel;
      delete button.dataset.originalLabel;
    }
    button.disabled = false;
  }
}

export function debounce(callback, delay = 120) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
}

export function typeLabel(account) {
  if (account.type === 'hotp') {
    return `HOTP · #${account.counter || 0}`;
  }
  return `TOTP · ${account.period || 30} dtk · ${account.digits || 6} digit`;
}
