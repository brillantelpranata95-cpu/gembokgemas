import { generateTOTP, totpRemaining } from './src/otp.js';
import {
  createVault,
  generateHotpCode,
  getSessionKey,
  hasVault,
  isSessionActive,
  loadAccounts,
  lockVault,
  resetVault,
  unlockVault
} from './src/storage.js';
import {
  avatarPalette,
  copyText,
  errorMessage,
  formatCode,
  initials,
  setBusy,
  showToast
} from './src/util.js';

const $ = (id) => document.getElementById(id);
const RING_CIRCUMFERENCE = 2 * Math.PI * 15.5;

const els = {
  loadingPane: $('loadingPane'),
  setupPane: $('setupPane'),
  unlockPane: $('unlockPane'),
  mainPane: $('mainPane'),
  setupForm: $('setupForm'),
  setupPassword: $('setupPassword'),
  setupConfirm: $('setupConfirm'),
  setupError: $('setupError'),
  setupSubmit: $('setupSubmit'),
  unlockForm: $('unlockForm'),
  unlockPassword: $('unlockPassword'),
  unlockError: $('unlockError'),
  unlockSubmit: $('unlockSubmit'),
  forgotBtn: $('forgotBtn'),
  searchBox: $('searchBox'),
  searchInput: $('searchInput'),
  listMeta: $('listMeta'),
  accountCount: $('accountCount'),
  accountList: $('accountList'),
  emptyState: $('emptyState'),
  noResults: $('noResults'),
  clearSearchBtn: $('clearSearchBtn'),
  emptyImportBtn: $('emptyImportBtn'),
  emptyManualBtn: $('emptyManualBtn'),
  addBtn: $('addBtn'),
  lockBtn: $('lockBtn'),
  settingsBtn: $('settingsBtn'),
  mainFooter: $('mainFooter'),
  headerSub: $('headerSub'),
  toast: $('toast')
};

const state = {
  accounts: [],
  codes: new Map(),
  hotpCodes: new Map(),
  rowEls: new Map(),
  pendingCodes: new Set(),
  busyHotp: new Set(),
  search: '',
  unlocked: false,
  tickTimer: null,
  sessionTimer: null
};

const collator = new Intl.Collator('id', { sensitivity: 'base' });

function showPane(pane) {
  for (const item of [
    els.loadingPane,
    els.setupPane,
    els.unlockPane,
    els.mainPane
  ]) {
    item.classList.toggle('hidden', item !== pane);
  }
  const inMain = pane === els.mainPane;
  els.mainFooter.classList.toggle('hidden', !inMain);
  els.lockBtn.classList.toggle('hidden', !inMain);
  els.settingsBtn.classList.toggle('hidden', !inMain);
}

function stopTimers() {
  if (state.tickTimer) clearInterval(state.tickTimer);
  if (state.sessionTimer) clearInterval(state.sessionTimer);
  state.tickTimer = null;
  state.sessionTimer = null;
}

function resetSensitiveState() {
  state.accounts = [];
  state.codes.clear();
  state.hotpCodes.clear();
  state.rowEls.clear();
  state.pendingCodes.clear();
  state.busyHotp.clear();
  state.search = '';
  state.unlocked = false;
  stopTimers();
  els.accountList.replaceChildren();
  els.searchInput.value = '';
}

function resetReveals() {
  for (const button of document.querySelectorAll('.reveal')) {
    const input = document.getElementById(button.dataset.target);
    if (input) input.type = 'password';
    button.classList.remove('is-visible');
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', 'Intip kata sandi');
  }
}

function showSetup() {
  resetSensitiveState();
  showPane(els.setupPane);
  els.headerSub.textContent = '2FA jadul · Est. 199X';
  els.setupForm.reset();
  els.setupError.classList.add('hidden');
  els.setupError.textContent = '';
  resetReveals();
  setTimeout(() => els.setupPassword.focus(), 60);
}

function showUnlock(message = '') {
  resetSensitiveState();
  showPane(els.unlockPane);
  els.headerSub.textContent = 'Terenkripsi · Masih terkunci';
  els.unlockForm.reset();
  els.unlockError.classList.add('hidden');
  els.unlockError.textContent = '';
  resetReveals();
  setTimeout(() => els.unlockPassword.focus(), 60);
  if (message) showToast(els.toast, message, 'error');
}

function showMain() {
  state.unlocked = true;
  showPane(els.mainPane);
  renderAccounts();
  startTicker();
  startSessionHeartbeat();
}

function updateHeader() {
  if (!state.unlocked) return;
  els.headerSub.textContent = `${state.accounts.length} akun · Aman terenkripsi`;
  els.accountCount.textContent = `${state.accounts.length} akun`;
}

function sortAccounts(accounts) {
  return [...accounts].sort((left, right) =>
    collator.compare(
      `${left.issuer || ''} ${left.name || ''}`,
      `${right.issuer || ''} ${right.name || ''}`
    )
  );
}

function filteredAccounts() {
  const term = state.search.trim().toLowerCase();
  if (!term) return sortAccounts(state.accounts);
  return sortAccounts(state.accounts).filter((account) =>
    `${account.issuer || ''} ${account.name || ''}`
      .toLowerCase()
      .includes(term)
  );
}

function renderAccounts() {
  const hasAccounts = state.accounts.length > 0;
  const filtered = filteredAccounts();
  const hasTerm = Boolean(state.search.trim());

  els.searchBox.classList.toggle('hidden', !hasAccounts);
  els.listMeta.classList.toggle('hidden', !hasAccounts);
  els.emptyState.classList.toggle('hidden', hasAccounts || hasTerm);
  els.noResults.classList.toggle(
    'hidden',
    !(hasAccounts && hasTerm && filtered.length === 0)
  );
  els.accountList.classList.toggle(
    'hidden',
    !hasAccounts || filtered.length === 0
  );

  state.rowEls.clear();
  els.accountList.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const account of filtered) {
    fragment.appendChild(createAccountRow(account));
  }
  els.accountList.appendChild(fragment);

  updateHeader();
}

function createAccountRow(account) {
  const label = account.issuer || account.name || 'akun ini';
  const palette = avatarPalette(account.issuer || account.name || account.id);
  const row = document.createElement('div');
  row.className = 'account';
  row.dataset.id = account.id;
  row.setAttribute('role', 'listitem');

  const main = document.createElement('button');
  main.type = 'button';
  main.className = 'account-main';
  main.title =
    account.type === 'hotp' ? 'Buat kode HOTP berikutnya (klik!)' : 'Salin kode (klik!)';
  main.setAttribute(
    'aria-label',
    account.type === 'hotp'
      ? `Buat kode HOTP baru untuk ${label} — klik, ya`
      : `Salin kode ${label} ke clipboard`
  );

  const avatar = document.createElement('span');
  avatar.className = 'avatar';
  avatar.textContent = initials(account.issuer || account.name);
  avatar.style.setProperty('--avatar-fg', palette.fg);
  avatar.style.setProperty('--avatar-bg', palette.bg);

  const meta = document.createElement('span');
  meta.className = 'meta';
  const issuer = document.createElement('span');
  issuer.className = 'issuer';
  issuer.textContent = account.issuer || account.name || 'Akun tanpa nama';
  const name = document.createElement('span');
  name.className = 'account-name';
  if (account.issuer) {
    name.textContent = account.name || 'Akun tanpa nama';
  } else if (account.type === 'hotp') {
    name.textContent = 'HOTP';
  } else {
    name.textContent = `TOTP · ${account.period || 30} dtk`;
  }
  meta.append(issuer, name);

  const code = document.createElement('span');
  code.className = 'code';
  if (account.type === 'hotp') {
    const generated = state.hotpCodes.get(account.id);
    code.textContent = generated ? formatCode(generated.code) : 'Ketuk!';
    if (!generated) code.classList.add('tap');
    row.title = generated
      ? `Kode HOTP #${generated.usedCounter} · ketuk lagi buat kode baru`
      : 'Ketuk buat dapet kode HOTP baru!';
  } else {
    const cached = state.codes.get(account.id);
    const counter = Math.floor(
      Date.now() / 1000 / (Number(account.period) || 30)
    );
    code.textContent =
      cached && cached.counter === counter ? formatCode(cached.code) : '··· ···';
  }

  const ring = document.createElement('span');
  if (account.type === 'hotp') {
    ring.className = 'hotp-badge';
    ring.innerHTML =
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"></path><path d="M21 3v6h-6"></path></svg>';
  } else {
    ring.className = 'ring';
    ring.innerHTML =
      '<svg viewBox="0 0 36 36" aria-hidden="true"><circle class="ring-track" cx="18" cy="18" r="15.5"></circle><circle class="ring-progress" cx="18" cy="18" r="15.5"></circle></svg><span class="ring-label"></span>';
    updateRingElement(ring, totpRemaining(account.period), account.period);
  }

  main.append(avatar, meta, code, ring);
  main.addEventListener('click', () => {
    if (account.type === 'hotp') {
      handleHotpClick(account, row);
    } else {
      handleTotpClick(account, row);
    }
  });

  row.appendChild(main);
  if (account.type === 'hotp') {
    row.classList.add('no-fill');
  } else {
    const fill = document.createElement('button');
    fill.type = 'button';
    fill.className = 'fill-btn';
    fill.textContent = 'Isi!';
    fill.title = `Isi kode ${label} ke kolom OTP di halaman ini`;
    fill.setAttribute('aria-label', `Isi kode ${label} ke kolom OTP di halaman ini`);
    fill.addEventListener('click', () => {
      fillCodeIntoPage(account, row, fill);
    });
    row.appendChild(fill);
  }

  state.rowEls.set(account.id, row);
  return row;
}

function updateRingElement(ring, remaining, period) {
  if (!ring) return;
  const progress = ring.querySelector('.ring-progress');
  const label = ring.querySelector('.ring-label');
  if (!progress || !label) return;
  const safePeriod = Number(period) || 30;
  const safeRemaining = Math.min(safePeriod, Math.max(0, remaining));
  progress.style.strokeDasharray = `${RING_CIRCUMFERENCE}`;
  progress.style.strokeDashoffset = `${
    RING_CIRCUMFERENCE * (1 - safeRemaining / safePeriod)
  }`;
  label.textContent = String(Math.ceil(safeRemaining));
  ring.classList.toggle('is-danger', safeRemaining <= 5);
  ring.classList.toggle('is-warn', safeRemaining > 5 && safeRemaining <= 10);
}

function setRowCode(accountId, value) {
  const row = state.rowEls.get(accountId);
  if (!row) return;
  const codeElement = row.querySelector('.code');
  if (!codeElement) return;
  codeElement.classList.remove('tap');
  if (value) {
    const nextText = formatCode(value);
    if (codeElement.textContent !== nextText) codeElement.textContent = nextText;
  } else if (codeElement.textContent !== '··· ···') {
    codeElement.textContent = '··· ···';
  }
}

function flashRow(row) {
  row.classList.add('flash');
  clearTimeout(row._flashTimer);
  row._flashTimer = setTimeout(() => row.classList.remove('flash'), 750);
}

function requestTotpCode(account) {
  const key = `${account.id}:${Math.floor(
    Date.now() / 1000 / (Number(account.period) || 30)
  )}`;
  if (state.pendingCodes.has(key)) return;
  state.pendingCodes.add(key);
  generateTOTP(account)
    .then((result) => {
      const currentCounter = Math.floor(
        Date.now() / 1000 / (Number(account.period) || 30)
      );
      if (result.counter !== currentCounter) return;
      state.codes.set(account.id, {
        code: result.code,
        counter: result.counter
      });
      setRowCode(account.id, result.code);
      updateRingForAccount(account, result.remaining, result.period);
    })
    .catch((error) => {
      console.error('Gagal membuat kode TOTP:', error);
      setRowCode(account.id, null);
    })
    .finally(() => state.pendingCodes.delete(key));
}

function tick() {
  if (!state.unlocked) return;
  const now = Date.now();
  for (const account of state.accounts) {
    if (account.type === 'hotp') continue;
    const period = Number(account.period) || 30;
    const seconds = Math.floor(now / 1000);
    const counter = Math.floor(seconds / period);
    const remaining = period - (seconds % period);
    const cached = state.codes.get(account.id);
    if (!cached || cached.counter !== counter) {
      if (cached) setRowCode(account.id, null);
      requestTotpCode(account);
    } else {
      setRowCode(account.id, cached.code);
    }
    updateRingForAccount(account, remaining, period);
  }
}

function updateRingForAccount(account, remaining, period) {
  const row = state.rowEls.get(account.id);
  if (!row) return;
  updateRingElement(row.querySelector('.ring'), remaining, period);
}

function startTicker() {
  stopTimers();
  tick();
  state.tickTimer = setInterval(tick, 1000);
  startSessionHeartbeat();
}

function startSessionHeartbeat() {
  if (state.sessionTimer) clearInterval(state.sessionTimer);
  state.sessionTimer = setInterval(async () => {
    if (!state.unlocked) return;
    try {
      const active = await isSessionActive();
      if (!active) showUnlock('Sesi habis, gan. Buka kunci lagi, ya.');
    } catch (error) {
      console.error('Gagal memeriksa sesi:', error);
    }
  }, 30000);
}

async function handleTotpClick(account, row) {
  try {
    const result = await generateTOTP(account);
    state.codes.set(account.id, {
      code: result.code,
      counter: result.counter
    });
    setRowCode(account.id, result.code);
    updateRingForAccount(account, result.remaining, result.period);
    const copied = await copyText(result.code);
    flashRow(row);
    showToast(
      els.toast,
      copied ? 'Kode berhasil disalin — tinggal tempel, gan!' : 'Gagal nyalin kode. Coba klik lagi, ya.',
      copied ? 'success' : 'error'
    );
  } catch (error) {
    console.error('Gagal membuat kode TOTP:', error);
    showToast(els.toast, 'Gagal bikin kode. Coba lagi, ya.', 'error');
  }
}

async function handleHotpClick(account, row) {
  if (state.busyHotp.has(account.id)) return;
  state.busyHotp.add(account.id);
  const codeElement = row.querySelector('.code');
  const previousLabel = codeElement.textContent;
  row.setAttribute('aria-busy', 'true');
  codeElement.textContent = '···';
  try {
    const result = await generateHotpCode(account.id);
    account.counter = result.nextCounter;
    state.hotpCodes.set(account.id, {
      code: result.code,
      usedCounter: result.usedCounter
    });
    codeElement.classList.remove('tap');
    codeElement.textContent = formatCode(result.code);
    row.title = `Kode HOTP #${result.usedCounter} · ketuk lagi buat kode baru`;
    row.removeAttribute('aria-busy');
    const copied = await copyText(result.code);
    flashRow(row);
    showToast(
      els.toast,
      copied
        ? `Kode HOTP #${result.usedCounter} tersalin!`
        : 'Kode jadi, tapi gagal disalin. Coba lagi.',
      copied ? 'success' : 'error'
    );
  } catch (error) {
    codeElement.textContent = previousLabel;
    row.removeAttribute('aria-busy');
    if (error.message === 'LOCKED') {
      showUnlock('Sesi habis, gan. Buka kunci lagi, ya.');
      return;
    }
    showToast(els.toast, errorMessage(error), 'error');
  } finally {
    state.busyHotp.delete(account.id);
  }
}

function fillErrorMessage(reason) {
  switch (reason) {
    case 'NO_FIELD':
      return 'Kolom OTP nggak ketemu. Klik dulu kolomnya di halaman, baru tekan Isi lagi, gan.';
    case 'MISMATCH':
      return 'Jumlah digit nggak cocok sama kolomnya. Cek lagi, ya.';
    case 'BAD_CODE':
      return 'Kode TOTP nggak valid.';
    default:
      return 'Kolom kode nggak bisa diisi otomatis, gan.';
  }
}

async function freshTotpForFill(account) {
  let result = await generateTOTP(account);
  if (result.period > 2 && result.remaining <= 1) {
    await new Promise((resolve) => setTimeout(resolve, 1100));
    result = await generateTOTP(account);
  }
  state.codes.set(account.id, {
    code: result.code,
    counter: result.counter
  });
  setRowCode(account.id, result.code);
  updateRingForAccount(account, result.remaining, result.period);
  return result;
}

async function fillCodeIntoPage(account, row, button) {
  if (button.disabled) return;
  button.disabled = true;
  button.textContent = '…';
  row.setAttribute('aria-busy', 'true');
  try {
    if (!(await isSessionActive())) {
      showUnlock('Sesi habis, gan. Buka kunci lagi, ya.');
      return;
    }
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });
    if (!tab?.id) {
      showToast(
        els.toast,
        'Tab aktif nggak ketemu. Buka halaman login dulu, baru coba lagi, gan.',
        'error'
      );
      return;
    }
    if (!tab.url) {
      showToast(
        els.toast,
        'Halaman aktif nggak bisa diakses. Buka popup lewat ikon GembokGemas di toolbar, gan.',
        'error'
      );
      return;
    }
    if (!/^https?:/i.test(tab.url)) {
      showToast(
        els.toast,
        'Halaman ini nggak bisa diisi otomatis. Buka situs login biasa, ya.',
        'error'
      );
      return;
    }

    const result = await freshTotpForFill(account);
    const { fillOtpInPage } = await import('./src/autofill.js');
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fillOtpInPage,
      args: [result.code]
    });
    const outcome = injection?.result;
    if (!outcome?.ok) {
      showToast(els.toast, fillErrorMessage(outcome?.reason), 'error');
      return;
    }

    flashRow(row);
    showToast(els.toast, 'Bip bip! Kode masuk ke kolom verifikasi. Beres!', 'success');
  } catch (error) {
    if (error?.message === 'LOCKED') {
      showUnlock('Sesi habis, gan. Buka kunci lagi, ya.');
      return;
    }
    console.error('Gagal mengisi kode ke halaman:', error);
    const blocked = /cannot access|chrome:\/\/|extensions gallery|not allowed/i.test(
      error?.message || ''
    );
    showToast(
      els.toast,
      blocked
        ? 'Halaman ini melarang isi-otomatis. Salin manual aja, gan.'
        : 'Gagal isi kode. Coba salin manual, ya.',
      'error'
    );
  } finally {
    row.removeAttribute('aria-busy');
    button.disabled = false;
    button.textContent = 'Isi!';
  }
}

function showFormError(element, message, form) {
  element.textContent = message;
  element.classList.remove('hidden');
  if (form) {
    form.classList.remove('shake');
    void form.offsetWidth;
    form.classList.add('shake');
  }
}

function openVault(tab, method = '') {
  const params = new URLSearchParams({ tab });
  if (method) params.set('method', method);
  chrome.tabs.create({ url: chrome.runtime.getURL(`vault.html?${params}`) });
}

async function handleSetupSubmit(event) {
  event.preventDefault();
  els.setupError.classList.add('hidden');
  const password = els.setupPassword.value;
  const confirmation = els.setupConfirm.value;
  if (password.length < 8) {
    showFormError(
      els.setupError,
      'Kata sandi minimal 8 karakter. Jangan yang pendek-pendek, ya!',
      els.setupForm
    );
    return;
  }
  if (password !== confirmation) {
    showFormError(
      els.setupError,
      'Kata sandi dan konfirmasinya beda. Ketik ulang, gan!',
      els.setupForm
    );
    return;
  }

  setBusy(els.setupSubmit, true, 'Lagi bikin brankas… sabar, ya…');
  try {
    await createVault(password);
    state.accounts = [];
    els.setupForm.reset();
    resetReveals();
    showMain();
    showToast(els.toast, 'Brankas jadi! Sekarang tambah akun pertamamu, gan.');
  } catch (error) {
    if (error.message === 'VAULT_EXISTS') {
      showUnlock();
      return;
    }
    showFormError(els.setupError, errorMessage(error), els.setupForm);
  } finally {
    setBusy(els.setupSubmit, false);
  }
}

async function handleUnlockSubmit(event) {
  event.preventDefault();
  els.unlockError.classList.add('hidden');
  const password = els.unlockPassword.value;
  if (!password) {
    showFormError(els.unlockError, 'Isi kata sandinya dulu, gan.', els.unlockForm);
    return;
  }
  setBusy(els.unlockSubmit, true, 'Lagi buka kunci… bip…');
  try {
    const result = await unlockVault(password);
    state.accounts = result.accounts;
    els.unlockForm.reset();
    resetReveals();
    showMain();
  } catch (error) {
    if (error.message === 'NO_VAULT') {
      showSetup();
      return;
    }
    showFormError(els.unlockError, errorMessage(error), els.unlockForm);
  } finally {
    setBusy(els.unlockSubmit, false);
  }
}

async function handleForgot() {
  const confirmed = window.confirm(
    'Kata sandi nggak bisa dipulihkan, bro. Reset bakal hapus semua akun di brankas ini.\n\nPunya cadangan terenkripsi? Tenang, tetap bisa dipulihkan setelah bikin brankas baru.\n\nYakin reset sekarang?'
  );
  if (!confirmed) return;
  try {
    await resetVault();
    showSetup();
    showToast(els.toast, 'Brankas direset. Bikin kata sandi baru, ya!');
  } catch (error) {
    showToast(els.toast, errorMessage(error), 'error');
  }
}

async function handleLock() {
  await lockVault();
  showUnlock();
  showToast(els.toast, 'Brankas terkunci. Aman…');
}

function bindEvents() {
  els.setupForm.addEventListener('submit', handleSetupSubmit);
  els.unlockForm.addEventListener('submit', handleUnlockSubmit);
  els.forgotBtn.addEventListener('click', handleForgot);
  els.lockBtn.addEventListener('click', handleLock);
  els.settingsBtn.addEventListener('click', () => openVault('settings'));
  els.addBtn.addEventListener('click', () => openVault('import'));
  els.emptyImportBtn.addEventListener('click', () => openVault('import'));
  els.emptyManualBtn.addEventListener('click', () =>
    openVault('import', 'manual')
  );
  els.clearSearchBtn.addEventListener('click', () => {
    state.search = '';
    els.searchInput.value = '';
    renderAccounts();
    els.searchInput.focus();
  });
  els.searchInput.addEventListener('input', (event) => {
    state.search = event.target.value;
    renderAccounts();
  });
  for (const button of document.querySelectorAll('.reveal')) {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.target);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.classList.toggle('is-visible', show);
      button.setAttribute('aria-pressed', String(show));
      button.setAttribute(
        'aria-label',
        show ? 'Tutup intipan kata sandi' : 'Intip kata sandi'
      );
      input.focus();
    });
  }
  window.addEventListener('pagehide', stopTimers);
}

async function init() {
  bindEvents();
  if (!(await hasVault())) {
    showSetup();
    return;
  }
  const key = await getSessionKey();
  if (!key) {
    showUnlock();
    return;
  }
  try {
    state.accounts = await loadAccounts(key);
    showMain();
  } catch (error) {
    console.error('Gagal membuka brankas:', error);
    await lockVault();
    showUnlock('Sesi nggak valid. Buka kunci lagi, ya.');
  }
}

init().catch((error) => {
  console.error('GembokGemas gagal dimuat:', error);
  showUnlock('Gagal muat brankas. Coba buka ulang ekstensi, gan.');
});
