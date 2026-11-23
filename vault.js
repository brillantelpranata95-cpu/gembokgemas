import { parseOtpInput } from './src/migrate.js';
import {
  accountFingerprint,
  addAccounts,
  changeMasterPassword,
  createAccountFromBase32,
  createVault,
  deleteAccount,
  exportBackup,
  getSessionKey,
  getVaultMeta,
  hasVault,
  importBackup,
  isSessionActive,
  loadAccounts,
  lockVault,
  resetVault,
  unlockVault,
  updateAccount
} from './src/storage.js';
import {
  avatarPalette,
  downloadText,
  errorMessage,
  formatDateForFile,
  formatDateTime,
  initials,
  maskSecret,
  setBusy,
  showToast
} from './src/util.js';

const $ = (id) => document.getElementById(id);
const TABS = new Set(['accounts', 'import', 'backup', 'settings']);
const METHODS = new Set(['camera', 'upload', 'paste', 'manual']);
const MAX_BATCH_SIZE = 100;
const MAX_BACKUP_BYTES = 8 * 1024 * 1024;
const DEFAULT_CAMERA_STATUS =
  'Kamera hanya aktif saat kamu menekannya.';
const DEFAULT_UPLOAD_STATUS =
  'Format PNG, JPG, atau WebP. Beberapa QR ekspor bisa diunggah sekaligus.';

const els = {
  gateWrap: $('gateWrap'),
  gateSetup: $('gateSetup'),
  gateUnlock: $('gateUnlock'),
  gateSetupForm: $('gateSetupForm'),
  gateSetupPassword: $('gateSetupPassword'),
  gateSetupConfirm: $('gateSetupConfirm'),
  gateSetupError: $('gateSetupError'),
  gateSetupSubmit: $('gateSetupSubmit'),
  gateUnlockForm: $('gateUnlockForm'),
  gateUnlockPassword: $('gateUnlockPassword'),
  gateUnlockError: $('gateUnlockError'),
  gateUnlockSubmit: $('gateUnlockSubmit'),
  gateForgotBtn: $('gateForgotBtn'),
  vaultBadge: $('vaultBadge'),
  vaultBadgeText: $('vaultBadgeText'),
  lockBtn: $('lockBtn'),
  workspace: $('workspace'),
  panels: [...document.querySelectorAll('[data-panel]')],
  tabs: [...document.querySelectorAll('.tab')],
  methodTabs: [...document.querySelectorAll('.method-tab')],
  methodPanels: [...document.querySelectorAll('[data-method-panel]')],
  accountsCountText: $('accountsCountText'),
  accountsAddBtn: $('accountsAddBtn'),
  accountSearch: $('accountSearch'),
  accountsTable: $('accountsTable'),
  accountsBody: $('accountsBody'),
  accountsEmpty: $('accountsEmpty'),
  accountsEmptyTitle: $('accountsEmptyTitle'),
  accountsEmptyText: $('accountsEmptyText'),
  accountsEmptyActions: $('accountsEmptyActions'),
  accountsEmptyImport: $('accountsEmptyImport'),
  accountsEmptyManual: $('accountsEmptyManual'),
  cameraBox: $('cameraBox'),
  cameraVideo: $('cameraVideo'),
  cameraPlaceholder: $('cameraPlaceholder'),
  cameraStartBtn: $('cameraStartBtn'),
  cameraStopBtn: $('cameraStopBtn'),
  cameraStatus: $('cameraStatus'),
  qrDropZone: $('qrDropZone'),
  qrFileInput: $('qrFileInput'),
  uploadStatus: $('uploadStatus'),
  pasteInput: $('pasteInput'),
  pasteBtn: $('pasteBtn'),
  pasteStatus: $('pasteStatus'),
  manualForm: $('manualForm'),
  manualIssuer: $('manualIssuer'),
  manualName: $('manualName'),
  manualSecret: $('manualSecret'),
  manualAlgorithm: $('manualAlgorithm'),
  manualDigits: $('manualDigits'),
  manualPeriod: $('manualPeriod'),
  manualType: $('manualType'),
  manualCounterWrap: $('manualCounterWrap'),
  manualCounter: $('manualCounter'),
  manualError: $('manualError'),
  manualSubmit: $('manualSubmit'),
  batchStatus: $('batchStatus'),
  batchTitle: $('batchTitle'),
  batchText: $('batchText'),
  batchDots: $('batchDots'),
  resetScanBtn: $('resetScanBtn'),
  importWarnings: $('importWarnings'),
  importWarningsList: $('importWarningsList'),
  candidateCard: $('candidateCard'),
  candidateCount: $('candidateCount'),
  candidateClearBtn: $('candidateClearBtn'),
  candidateSelectAll: $('candidateSelectAll'),
  candidateBody: $('candidateBody'),
  candidateIncomplete: $('candidateIncomplete'),
  candidateAddBtn: $('candidateAddBtn'),
  exportMeta: $('exportMeta'),
  exportBtn: $('exportBtn'),
  exportStatus: $('exportStatus'),
  backupFile: $('backupFile'),
  backupFileName: $('backupFileName'),
  backupPassword: $('backupPassword'),
  restoreBtn: $('restoreBtn'),
  restoreStatus: $('restoreStatus'),
  lockNowBtn: $('lockNowBtn'),
  changePasswordForm: $('changePasswordForm'),
  currentPassword: $('currentPassword'),
  newPassword: $('newPassword'),
  confirmPassword: $('confirmPassword'),
  changePasswordError: $('changePasswordError'),
  changePasswordBtn: $('changePasswordBtn'),
  resetInput: $('resetInput'),
  resetBtn: $('resetBtn'),
  editDialog: $('editDialog'),
  editIssuer: $('editIssuer'),
  editName: $('editName'),
  editError: $('editError'),
  editCancel: $('editCancel'),
  editSave: $('editSave'),
  toast: $('toast')
};

const state = {
  key: null,
  accounts: [],
  unlocked: false,
  activeTab: 'accounts',
  importMethod: 'camera',
  importState: makeImportState(),
  selection: new Map(),
  candidateList: [],
  stream: null,
  scanning: false,
  scanFrame: null,
  scanCanvas: null,
  seenCodes: new Set(),
  lastScanAt: 0,
  editingId: null,
  uploading: false,
  sessionTimer: null
};

function makeImportState() {
  return {
    standalone: [],
    batch: null,
    warnings: []
  };
}

function setBadge(open) {
  els.vaultBadge.classList.toggle('is-open', open);
  els.vaultBadge.classList.toggle('is-locked', !open);
  els.vaultBadgeText.textContent = open ? 'Terbuka' : 'Terkunci';
}

function resetReveals() {
  for (const button of document.querySelectorAll('.reveal')) {
    const input = document.getElementById(button.dataset.target);
    if (input) input.type = 'password';
    button.classList.remove('is-visible');
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', 'Tampilkan kata sandi');
  }
}

function setStatus(element, text, tone = '') {
  if (!element) return;
  element.textContent = text;
  element.classList.remove('is-error', 'is-success');
  if (tone === 'error' || tone === 'success') {
    element.classList.add(`is-${tone}`);
  }
}

function showFormError(element, message) {
  if (!element) return;
  element.textContent = message;
  element.classList.remove('hidden');
}

function hideFormError(element) {
  if (!element) return;
  element.textContent = '';
  element.classList.add('hidden');
}

function clearSensitiveForms() {
  els.gateSetupForm.reset();
  els.gateUnlockForm.reset();
  hideFormError(els.gateSetupError);
  hideFormError(els.gateUnlockError);
  els.manualForm.reset();
  updateManualType();
  hideFormError(els.manualError);
  els.pasteInput.value = '';
  els.backupFile.value = '';
  els.backupFileName.textContent = 'Belum ada file dipilih';
  els.backupPassword.value = '';
  hideFormError(els.changePasswordError);
  els.changePasswordForm.reset();
  els.resetInput.value = '';
  els.accountSearch.value = '';
  els.editIssuer.value = '';
  els.editName.value = '';
  hideFormError(els.editError);
  setStatus(els.restoreStatus, '');
  setStatus(els.exportStatus, '');
  if (els.editDialog.open) els.editDialog.close();
  resetReveals();
}

function showGateSetup() {
  lockUi('setup');
}

function showGateUnlock(message = '') {
  lockUi('unlock', message);
}

function lockUi(mode, message = '') {
  state.unlocked = false;
  state.key = null;
  state.accounts = [];
  state.editingId = null;
  stopSessionHeartbeat();
  stopCamera();
  resetImportState();
  clearSensitiveForms();
  if (els.editDialog.open) els.editDialog.close();
  els.gateWrap.classList.remove('hidden');
  els.workspace.classList.add('hidden');
  els.lockBtn.classList.add('hidden');
  els.gateSetup.classList.toggle('hidden', mode !== 'setup');
  els.gateUnlock.classList.toggle('hidden', mode !== 'unlock');
  setBadge(false);
  els.accountsBody.replaceChildren();
  els.accountsCountText.textContent = '0 akun';
  els.accountsTable.classList.add('hidden');
  els.accountsEmpty.classList.remove('hidden');
  els.accountsEmptyActions.classList.remove('hidden');
  els.accountsEmptyTitle.textContent = 'Belum ada akun';
  els.accountsEmptyText.textContent =
    'Impor dari Google Authenticator atau tambahkan akun secara manual untuk mulai membuat kode.';
  if (mode === 'setup') {
    setTimeout(() => els.gateSetupPassword.focus(), 60);
  } else {
    setTimeout(() => els.gateUnlockPassword.focus(), 60);
  }
  if (message) showToast(els.toast, message, 'error');
}

function updateUrl() {
  const params = new URLSearchParams();
  params.set('tab', state.activeTab);
  if (state.activeTab === 'import') {
    params.set('method', state.importMethod);
  }
  history.replaceState(null, '', `${location.pathname}?${params}`);
}

function switchTab(name, { syncUrl = true } = {}) {
  if (!TABS.has(name)) name = 'accounts';
  state.activeTab = name;
  for (const tab of els.tabs) {
    const active = tab.dataset.tab === name;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  }
  for (const panel of els.panels) {
    panel.classList.toggle('hidden', panel.dataset.panel !== name);
  }
  if (name !== 'import') stopCamera();
  if (name === 'accounts') renderAccountsTable();
  if (name === 'import') {
    switchMethod(state.importMethod, { syncUrl: false });
    refreshImportUi();
  }
  if (name === 'backup') refreshBackupMeta();
  if (syncUrl) updateUrl();
}

function switchMethod(name, { syncUrl = true } = {}) {
  if (!METHODS.has(name)) name = 'camera';
  state.importMethod = name;
  for (const tab of els.methodTabs) {
    const active = tab.dataset.method === name;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  }
  for (const panel of els.methodPanels) {
    panel.classList.toggle('hidden', panel.dataset.methodPanel !== name);
  }
  if (name !== 'camera') stopCamera();
  if (syncUrl && state.activeTab === 'import') updateUrl();
}

async function enterWorkspace(key, accounts) {
  state.key = key;
  state.unlocked = true;
  els.gateWrap.classList.add('hidden');
  els.workspace.classList.remove('hidden');
  els.lockBtn.classList.remove('hidden');
  setBadge(true);
  if (accounts !== undefined) {
    state.accounts = accounts;
  } else {
    try {
      state.accounts = await loadAccounts(key);
    } catch (error) {
      console.error('Gagal memuat akun:', error);
      showGateUnlock('Sesi tidak valid. Buka kunci lagi.');
      return;
    }
  }
  renderAccountsTable();
  await refreshBackupMeta();
  startSessionHeartbeat();
  switchTab(state.activeTab);
}

async function refreshAccounts() {
  if (!state.unlocked) return false;
  try {
    state.accounts = await loadAccounts(state.key);
  } catch (error) {
    if (handleSessionError(error)) return false;
    showToast(els.toast, errorMessage(error), 'error');
    return false;
  }
  renderAccountsTable();
  refreshImportUi();
  await refreshBackupMeta();
  return true;
}

async function refreshBackupMeta() {
  if (!state.unlocked) {
    els.exportMeta.textContent = '—';
    return;
  }
  try {
    const meta = await getVaultMeta();
    if (!meta) {
      els.exportMeta.textContent = '—';
      return;
    }
    const updated = meta.updatedAt
      ? formatDateTime(meta.updatedAt)
      : 'baru dibuat';
    els.exportMeta.textContent = `${state.accounts.length} akun · ${updated}`;
  } catch {
    els.exportMeta.textContent = '—';
  }
}

function handleSessionError(error) {
  if (
    ['LOCKED', 'WRONG_PASSWORD', 'NO_VAULT', 'INVALID_SESSION_KEY'].includes(
      error?.message
    )
  ) {
    showGateUnlock('Sesi berakhir. Buka kunci lagi.');
    return true;
  }
  return false;
}

async function checkSession() {
  if (!state.unlocked) return;
  try {
    const active = await isSessionActive();
    if (!active) showGateUnlock('Sesi berakhir. Buka kunci lagi.');
  } catch (error) {
    console.error('Gagal memeriksa sesi:', error);
  }
}

async function handleGateSetup(event) {
  event.preventDefault();
  hideFormError(els.gateSetupError);
  const password = els.gateSetupPassword.value;
  const confirmation = els.gateSetupConfirm.value;
  if (password.length < 8) {
    showFormError(els.gateSetupError, 'Kata sandi minimal 8 karakter.');
    return;
  }
  if (password !== confirmation) {
    showFormError(
      els.gateSetupError,
      'Kata sandi dan konfirmasi tidak sama.'
    );
    return;
  }
  setBusy(els.gateSetupSubmit, true, 'Membuat brankas…');
  try {
    const key = await createVault(password);
    els.gateSetupForm.reset();
    resetReveals();
    await enterWorkspace(key, []);
    showToast(els.toast, 'Brankas dibuat. Tambahkan akun pertamamu.');
  } catch (error) {
    if (error.message === 'VAULT_EXISTS') {
      showGateUnlock();
      return;
    }
    showFormError(els.gateSetupError, errorMessage(error));
  } finally {
    setBusy(els.gateSetupSubmit, false);
  }
}

async function handleGateUnlock(event) {
  event.preventDefault();
  hideFormError(els.gateUnlockError);
  const password = els.gateUnlockPassword.value;
  if (!password) {
    showFormError(els.gateUnlockError, 'Masukkan kata sandi.');
    return;
  }
  setBusy(els.gateUnlockSubmit, true, 'Membuka kunci…');
  try {
    const result = await unlockVault(password);
    els.gateUnlockForm.reset();
    resetReveals();
    await enterWorkspace(result.key, result.accounts);
    showToast(els.toast, 'Brankas dibuka.');
  } catch (error) {
    if (error.message === 'NO_VAULT') {
      showGateSetup();
      return;
    }
    showFormError(els.gateUnlockError, errorMessage(error));
  } finally {
    setBusy(els.gateUnlockSubmit, false);
  }
}

async function handleForgot() {
  const confirmed = window.confirm(
    'Kata sandi tidak bisa dipulihkan. Reset akan menghapus brankas ini beserta semua akun di dalamnya.\n\nJika punya cadangan terenkripsi, kamu bisa memulihkannya setelah membuat brankas baru.\n\nReset sekarang?'
  );
  if (!confirmed) return;
  try {
    await resetVault();
    state.activeTab = 'accounts';
    updateUrl();
    showGateSetup();
    showToast(els.toast, 'Brankas direset. Buat kata sandi baru.');
  } catch (error) {
    showToast(els.toast, errorMessage(error), 'error');
  }
}

async function handleLock() {
  await lockVault();
  showGateUnlock();
  showToast(els.toast, 'Brankas dikunci.');
}
function sortAccounts(accounts) {
  return [...accounts].sort((left, right) =>
    `${left.issuer || ''} ${left.name || ''}`.localeCompare(
      `${right.issuer || ''} ${right.name || ''}`,
      'id',
      { sensitivity: 'base' }
    )
  );
}

function typeChip(account) {
  const chip = document.createElement('span');
  chip.className = `type-chip${account.type === 'hotp' ? ' is-hotp' : ''}`;
  chip.textContent =
    account.type === 'hotp'
      ? `HOTP · #${account.counter || 0}`
      : `TOTP · ${account.period || 30}s`;
  return chip;
}

function actionButton(action, id, label, svg, danger = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `icon-action${danger ? ' is-danger' : ''}`;
  button.dataset.action = action;
  button.dataset.id = id;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.innerHTML = svg;
  return button;
}

const EDIT_ICON =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>';
const DELETE_ICON =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6M14 11v6"></path></svg>';

function renderAccountsTable() {
  const hasAccounts = state.accounts.length > 0;
  if (!hasAccounts) els.accountSearch.value = '';
  const term = els.accountSearch.value.trim().toLowerCase();
  const filtered = sortAccounts(
    state.accounts.filter((account) => {
      if (!term) return true;
      return `${account.issuer || ''} ${account.name || ''}`
        .toLowerCase()
        .includes(term);
    })
  );

  els.accountSearch.parentElement.classList.toggle('hidden', !hasAccounts);
  els.accountsCountText.textContent = hasAccounts
    ? `${state.accounts.length} akun tersimpan terenkripsi`
    : 'Belum ada akun';
  els.accountsTable.classList.toggle('hidden', filtered.length === 0);
  els.accountsEmpty.classList.toggle('hidden', filtered.length > 0);

  if (filtered.length === 0) {
    const searching = hasAccounts && Boolean(term);
    els.accountsEmptyTitle.textContent = searching
      ? 'Tidak ada hasil'
      : 'Belum ada akun';
    els.accountsEmptyText.textContent = searching
      ? `Tidak ada akun yang cocok dengan “${term}”. Coba kata kunci lain.`
      : 'Impor dari Google Authenticator atau tambahkan akun secara manual untuk mulai membuat kode.';
    els.accountsEmptyActions.classList.toggle('hidden', searching);
  }

  els.accountsBody.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const account of filtered) {
    const row = document.createElement('tr');
    const palette = avatarPalette(
      account.issuer || account.name || account.id
    );

    const serviceCell = document.createElement('td');
    const service = document.createElement('div');
    service.className = 'service-cell';
    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.textContent = initials(account.issuer || account.name);
    avatar.style.setProperty('--avatar-fg', palette.fg);
    avatar.style.setProperty('--avatar-bg', palette.bg);
    const serviceName = document.createElement('div');
    serviceName.className = 'service-name';
    const strong = document.createElement('strong');
    strong.textContent = account.issuer || account.name || 'Akun';
    serviceName.appendChild(strong);
    service.append(avatar, serviceName);
    serviceCell.appendChild(service);

    const accountCell = document.createElement('td');
    accountCell.className = 'account-cell';
    accountCell.textContent =
      account.issuer && account.name ? account.name : '—';

    const typeCell = document.createElement('td');
    typeCell.appendChild(typeChip(account));

    const dateCell = document.createElement('td');
    dateCell.className = 'date-cell';
    dateCell.textContent = formatDateTime(account.createdAt);

    const actionsCell = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'row-actions';
    const displayName = [account.issuer, account.name]
      .filter(Boolean)
      .join(' — ');
    actions.append(
      actionButton('edit', account.id, `Edit ${displayName}`, EDIT_ICON),
      actionButton(
        'delete',
        account.id,
        `Hapus ${displayName}`,
        DELETE_ICON,
        true
      )
    );
    actionsCell.appendChild(actions);

    row.append(serviceCell, accountCell, typeCell, dateCell, actionsCell);
    fragment.appendChild(row);
  }
  els.accountsBody.appendChild(fragment);
}

function openEditDialog(account) {
  state.editingId = account.id;
  els.editIssuer.value = account.issuer || '';
  els.editName.value = account.name || '';
  hideFormError(els.editError);
  if (!els.editDialog.open) els.editDialog.showModal();
  setTimeout(() => els.editIssuer.focus(), 40);
}

async function handleEditSave() {
  if (!state.editingId) return;
  hideFormError(els.editError);
  const issuer = els.editIssuer.value.trim();
  const name = els.editName.value.trim();
  if (!issuer && !name) {
    showFormError(els.editError, 'Isi nama layanan atau nama akun.');
    return;
  }
  setBusy(els.editSave, true, 'Menyimpan…');
  try {
    await updateAccount(state.editingId, { issuer, name });
    els.editDialog.close();
    await refreshAccounts();
    showToast(els.toast, 'Akun diperbarui.');
  } catch (error) {
    if (handleSessionError(error)) {
      els.editDialog.close();
      return;
    }
    showFormError(els.editError, errorMessage(error));
  } finally {
    setBusy(els.editSave, false);
  }
}

async function handleAccountsClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const account = state.accounts.find(
    (item) => item.id === button.dataset.id
  );
  if (!account) return;

  if (button.dataset.action === 'edit') {
    openEditDialog(account);
    return;
  }

  if (button.dataset.action === 'delete') {
    const displayName =
      [account.issuer, account.name].filter(Boolean).join(' — ') ||
      'akun ini';
    const confirmed = window.confirm(
      `Hapus akun “${displayName}”?\n\nPastikan kamu masih punya akses ke layanan tersebut. Tindakan ini tidak bisa dibatalkan.`
    );
    if (!confirmed) return;
    try {
      await deleteAccount(account.id);
      await refreshAccounts();
      showToast(els.toast, 'Akun dihapus.');
    } catch (error) {
      if (handleSessionError(error)) return;
      showToast(els.toast, errorMessage(error), 'error');
    }
  }
}

function handleAccountSearch() {
  renderAccountsTable();
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

function resetImportState() {
  state.importState = makeImportState();
  state.selection = new Map();
  state.candidateList = [];
  state.seenCodes.clear();
  state.lastScanAt = 0;
}

function allImportAccounts() {
  const accounts = [...state.importState.standalone];
  const batch = state.importState.batch;
  if (batch) {
    for (let index = 0; index < batch.batchSize; index += 1) {
      const slot = batch.batches.get(index);
      if (slot) accounts.push(...slot.accounts);
    }
  }
  return accounts;
}

function currentImportFingerprints() {
  return new Set(allImportAccounts().map((account) => accountFingerprint(account)));
}

function takeUniqueAccounts(accounts) {
  const seen = currentImportFingerprints();
  const fresh = [];
  for (const account of accounts) {
    const fingerprint = accountFingerprint(account);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    fresh.push(account);
  }
  return fresh;
}

function addWarnings(warnings) {
  for (const warning of warnings || []) {
    const text = String(warning || '').trim();
    if (text && !state.importState.warnings.includes(text)) {
      state.importState.warnings.push(text);
    }
  }
}

function batchDoneCount(batch = state.importState.batch) {
  if (!batch) return 0;
  let done = 0;
  for (let index = 0; index < batch.batchSize; index += 1) {
    if (batch.batches.has(index)) done += 1;
  }
  return done;
}

function isBatchComplete(batch = state.importState.batch) {
  return !batch || batchDoneCount(batch) >= batch.batchSize;
}

function ingestParsed(result) {
  addWarnings(result.warnings);

  if (result.kind !== 'migration' || result.batchSize <= 1) {
    const fresh = takeUniqueAccounts(result.accounts);
    state.importState.standalone.push(...fresh);
    return {
      added: fresh.length,
      duplicate: fresh.length === 0,
      batch: null,
      batchComplete: true
    };
  }

  if (
    !Number.isInteger(result.batchSize) ||
    result.batchSize < 1 ||
    result.batchSize > MAX_BATCH_SIZE ||
    !Number.isInteger(result.batchIndex) ||
    result.batchIndex < 0 ||
    result.batchIndex >= result.batchSize
  ) {
    addWarnings([
      'QR batch memiliki metadata yang tidak valid. Akun dari QR ini dimuat sebagai impor tunggal.'
    ]);
    const fresh = takeUniqueAccounts(result.accounts);
    state.importState.standalone.push(...fresh);
    return {
      added: fresh.length,
      duplicate: fresh.length === 0,
      batch: null,
      batchComplete: true
    };
  }

  let batch = state.importState.batch;
  if (
    batch &&
    (batch.batchId !== result.batchId || batch.batchSize !== result.batchSize)
  ) {
    addWarnings([
      'Batch QR baru terdeteksi. Progres pemindaian batch sebelumnya direset.'
    ]);
    batch = null;
  }
  if (!batch) {
    batch = {
      batchId: result.batchId,
      batchSize: result.batchSize,
      batches: new Map()
    };
    state.importState.batch = batch;
  }

  if (batch.batches.has(result.batchIndex)) {
    return {
      added: 0,
      duplicate: true,
      batch,
      batchComplete: isBatchComplete(batch)
    };
  }

  const fresh = takeUniqueAccounts(result.accounts);
  batch.batches.set(result.batchIndex, {
    accounts: fresh,
    warnings: [...(result.warnings || [])]
  });
  return {
    added: fresh.length,
    duplicate: fresh.length === 0,
    batch,
    batchComplete: isBatchComplete(batch)
  };
}

function handleDecodedText(text, source = 'paste') {
  const { results, errors } = parseOtpInput(text);
  const statusElement =
    source === 'camera'
      ? els.cameraStatus
      : source === 'upload'
        ? els.uploadStatus
        : els.pasteStatus;

  if (!results.length) {
    setStatus(
      statusElement,
      errors[0] || 'QR tidak berisi tautan otpauth yang didukung.',
      'error'
    );
    return { ok: false, added: 0, complete: false, batch: null };
  }

  addWarnings(errors);
  let added = 0;
  for (const result of results) {
    added += ingestParsed(result).added;
  }
  refreshImportUi();

  const batch = state.importState.batch;
  const complete = isBatchComplete(batch);
  const done = batch ? batchDoneCount(batch) : 0;
  const candidateTotal = state.candidateList.length;

  if (source === 'camera') {
    if (batch && !complete) {
      setStatus(
        els.cameraStatus,
        `QR ${done} dari ${batch.batchSize} terbaca${
          added ? ` · ${added} akun baru` : ''
        }. Arahkan kamera ke QR berikutnya.`,
        'success'
      );
    } else {
      setStatus(
        els.cameraStatus,
        added
          ? `QR terbaca · ${candidateTotal} akun siap diimpor.`
          : 'QR ini sudah pernah dipindai.',
        added ? 'success' : ''
      );
      stopCamera(false);
    }
  } else {
    let message;
    if (added) {
      message = `${added} akun ditambahkan ke daftar impor.`;
    } else if (batch && !complete) {
      message = `QR ${done} dari ${batch.batchSize} sudah terbaca. Pindai QR berikutnya.`;
    } else {
      message = 'Akun dari QR ini sudah ada di daftar.';
    }
    if (batch && !complete && added) {
      message += ` Masih ada ${batch.batchSize - done} QR lagi.`;
    }
    setStatus(statusElement, message, added ? 'success' : '');
  }

  return { ok: true, added, complete, batch, candidates: candidateTotal };
}

function buildCandidateList() {
  const vaultFingerprints = new Set(
    state.accounts.map((account) => accountFingerprint(account))
  );
  const seen = new Set();
  const list = [];

  for (const account of allImportAccounts()) {
    const fingerprint = accountFingerprint(account);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    const duplicate = vaultFingerprints.has(fingerprint);
    if (duplicate) {
      state.selection.set(fingerprint, false);
    } else if (!state.selection.has(fingerprint)) {
      state.selection.set(fingerprint, true);
    }
    list.push({ account, fingerprint, duplicate });
  }

  for (const fingerprint of [...state.selection.keys()]) {
    if (!seen.has(fingerprint)) state.selection.delete(fingerprint);
  }

  list.sort((left, right) =>
    `${left.account.issuer || ''} ${left.account.name || ''}`.localeCompare(
      `${right.account.issuer || ''} ${right.account.name || ''}`,
      'id',
      { sensitivity: 'base' }
    )
  );
  state.candidateList = list;
}

function availableCandidates() {
  return state.candidateList.filter((candidate) => !candidate.duplicate);
}

function selectedCandidates() {
  return state.candidateList.filter(
    (candidate) =>
      !candidate.duplicate &&
      state.selection.get(candidate.fingerprint) === true
  );
}

function refreshImportUi() {
  buildCandidateList();
  renderBatchStatus();
  renderWarnings();
  renderCandidates();
}

function renderBatchStatus() {
  const batch = state.importState.batch;
  els.batchStatus.classList.toggle('hidden', !batch);
  if (!batch) return;

  const done = batchDoneCount(batch);
  const complete = done >= batch.batchSize;
  const accountCount = allImportAccounts().length;
  els.batchTitle.textContent = complete
    ? 'Semua QR sudah dipindai'
    : 'Progres pemindaian';
  els.batchText.textContent = complete
    ? `${done} dari ${batch.batchSize} QR terbaca · ${accountCount} akun ditemukan. Periksa daftar di bawah sebelum menambahkan.`
    : `${done} dari ${batch.batchSize} QR ekspor sudah dipindai · ${accountCount} akun ditemukan. Pindai QR berikutnya dari layar Google Authenticator.`;

  const fragment = document.createDocumentFragment();
  for (let index = 0; index < batch.batchSize; index += 1) {
    const dot = document.createElement('span');
    dot.className = 'batch-dot';
    if (batch.batches.has(index)) dot.classList.add('is-done');
    dot.textContent = `QR ${index + 1}`;
    fragment.appendChild(dot);
  }
  els.batchDots.replaceChildren(fragment);
}

function renderWarnings() {
  const warnings = state.importState.warnings;
  els.importWarnings.classList.toggle('hidden', warnings.length === 0);
  if (!warnings.length) {
    els.importWarningsList.replaceChildren();
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const warning of warnings) {
    const item = document.createElement('li');
    item.textContent = warning;
    fragment.appendChild(item);
  }
  els.importWarningsList.replaceChildren(fragment);
}

function renderCandidates() {
  const list = state.candidateList;
  els.candidateCard.classList.toggle('hidden', list.length === 0);
  if (!list.length) {
    els.candidateBody.replaceChildren();
    els.candidateIncomplete.classList.add('hidden');
    els.candidateSelectAll.checked = false;
    els.candidateSelectAll.indeterminate = false;
    els.candidateSelectAll.disabled = true;
    els.candidateAddBtn.disabled = true;
    els.candidateAddBtn.textContent = 'Tambahkan 0 akun';
    return;
  }

  const selected = selectedCandidates();
  const available = availableCandidates();
  const duplicates = list.length - available.length;
  els.candidateCount.textContent = duplicates
    ? `${selected.length} dari ${list.length} akun dipilih · ${duplicates} sudah ada`
    : `${selected.length} dari ${list.length} akun dipilih`;

  const batch = state.importState.batch;
  const incomplete = batch && !isBatchComplete(batch);
  els.candidateIncomplete.classList.toggle('hidden', !incomplete);
  if (incomplete) {
    els.candidateIncomplete.textContent = `Masih ada ${
      batch.batchSize - batchDoneCount(batch)
    } QR batch yang belum dipindai.`;
  }

  const fragment = document.createDocumentFragment();
  for (const { account, fingerprint, duplicate } of list) {
    const row = document.createElement('tr');

    const checkCell = document.createElement('td');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.fp = fingerprint;
    checkbox.disabled = duplicate;
    checkbox.checked =
      !duplicate && state.selection.get(fingerprint) === true;
    const displayName =
      [account.issuer, account.name].filter(Boolean).join(' — ') || 'akun';
    checkbox.setAttribute('aria-label', `Pilih ${displayName}`);
    checkCell.appendChild(checkbox);

    const serviceCell = document.createElement('td');
    const service = document.createElement('div');
    service.className = 'service-cell';
    const palette = avatarPalette(account.issuer || account.name || account.id);
    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.textContent = initials(account.issuer || account.name);
    avatar.style.setProperty('--avatar-fg', palette.fg);
    avatar.style.setProperty('--avatar-bg', palette.bg);
    const serviceName = document.createElement('div');
    serviceName.className = 'service-name';
    const strong = document.createElement('strong');
    strong.textContent = account.issuer || account.name || 'Akun';
    serviceName.appendChild(strong);
    service.append(avatar, serviceName);
    serviceCell.appendChild(service);

    const accountCell = document.createElement('td');
    accountCell.className = 'account-cell';
    accountCell.textContent =
      account.issuer && account.name ? account.name : '—';

    const typeCell = document.createElement('td');
    typeCell.appendChild(typeChip(account));

    const secretCell = document.createElement('td');
    secretCell.className = 'secret-cell';
    secretCell.textContent = maskSecret();

    const statusCell = document.createElement('td');
    const statusPill = document.createElement('span');
    statusPill.className = `status-pill${duplicate ? ' is-duplicate' : ''}`;
    statusPill.textContent = duplicate ? 'Sudah ada' : 'Siap';
    statusCell.appendChild(statusPill);

    row.append(
      checkCell,
      serviceCell,
      accountCell,
      typeCell,
      secretCell,
      statusCell
    );
    fragment.appendChild(row);
  }
  els.candidateBody.replaceChildren(fragment);

  els.candidateSelectAll.disabled = available.length === 0;
  els.candidateSelectAll.checked =
    available.length > 0 && selected.length === available.length;
  els.candidateSelectAll.indeterminate =
    selected.length > 0 && selected.length < available.length;
  els.candidateAddBtn.disabled = selected.length === 0;
  els.candidateAddBtn.textContent = `Tambahkan ${selected.length} akun`;
}

function handleCandidateToggle(event) {
  const checkbox = event.target.closest('input[type="checkbox"][data-fp]');
  if (!checkbox) return;
  state.selection.set(checkbox.dataset.fp, checkbox.checked);
  const selected = selectedCandidates();
  const available = availableCandidates();
  els.candidateSelectAll.checked =
    available.length > 0 && selected.length === available.length;
  els.candidateSelectAll.indeterminate =
    selected.length > 0 && selected.length < available.length;
  els.candidateAddBtn.disabled = selected.length === 0;
  els.candidateAddBtn.textContent = `Tambahkan ${selected.length} akun`;
  els.candidateCount.textContent = `${selected.length} dari ${state.candidateList.length} akun dipilih${
    state.candidateList.length - available.length
      ? ` · ${state.candidateList.length - available.length} sudah ada`
      : ''
  }`;
}

function handleCandidateSelectAll() {
  const target = els.candidateSelectAll.checked;
  for (const candidate of state.candidateList) {
    state.selection.set(
      candidate.fingerprint,
      candidate.duplicate ? false : target
    );
  }
  renderCandidates();
}

function clearImportState(message = 'Daftar impor dibersihkan.') {
  stopCamera();
  resetImportState();
  refreshImportUi();
  setStatus(els.cameraStatus, DEFAULT_CAMERA_STATUS);
  setStatus(els.uploadStatus, DEFAULT_UPLOAD_STATUS);
  setStatus(els.pasteStatus, '');
  if (message) showToast(els.toast, message);
}

function handleResetScan() {
  clearImportState('Pemindaian direset.');
}

async function handleCandidateAdd() {
  const chosen = selectedCandidates();
  if (!chosen.length) return;
  if (!state.unlocked) {
    showGateUnlock('Sesi berakhir. Buka kunci lagi.');
    return;
  }

  els.candidateAddBtn.disabled = true;
  const previousLabel = els.candidateAddBtn.textContent;
  els.candidateAddBtn.textContent = 'Menambahkan…';
  try {
    const result = await addAccounts(chosen.map((candidate) => candidate.account));
    await refreshAccounts();
    resetImportState();
    refreshImportUi();
    const parts = [`${result.added} akun ditambahkan`];
    if (result.skipped) parts.push(`${result.skipped} duplikat dilewati`);
    showToast(els.toast, `${parts.join(', ')}.`, 'success');
  } catch (error) {
    if (handleSessionError(error)) return;
    showToast(els.toast, errorMessage(error), 'error');
  } finally {
    els.candidateAddBtn.textContent = previousLabel;
    els.candidateAddBtn.disabled = false;
    refreshImportUi();
  }
}

/* ------------------------------------------------------------------ */
/* Kamera                                                              */
/* ------------------------------------------------------------------ */

function cameraErrorMessage(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Akses kamera ditolak. Izinkan kamera di pengaturan situs ekstensi ini, atau gunakan tab Gambar.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'Tidak ada kamera yang terdeteksi. Gunakan tab Gambar untuk mengunggah screenshot QR.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Kamera sedang dipakai aplikasi lain atau tidak bisa dibuka. Tutup aplikasi tersebut lalu coba lagi.';
    case 'OverconstrainedError':
      return 'Kamera tidak mendukung mode yang diminta. Coba lagi atau gunakan tab Gambar.';
    default:
      return `Kamera tidak bisa dimulai${error?.message ? `: ${error.message}` : '.'}`;
  }
}

let qrDecoderPromise = null;

function ensureQrDecoder() {
  if (window.jsQR) return Promise.resolve();
  if (!qrDecoderPromise) {
    qrDecoderPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'lib/jsQR.js';
      script.async = true;
      script.onload = () => {
        if (window.jsQR) resolve();
        else reject(new Error('QR decoder tidak termuat.'));
      };
      script.onerror = () => reject(new Error('QR decoder tidak termuat.'));
      document.head.appendChild(script);
    }).catch((error) => {
      qrDecoderPromise = null;
      throw error;
    });
  }
  return qrDecoderPromise;
}

async function startCamera() {
  if (state.scanning) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus(
      els.cameraStatus,
      'Kamera tidak tersedia di lingkungan ini. Gunakan tab Gambar untuk mengunggah screenshot QR.',
      'error'
    );
    return;
  }
  try {
    await ensureQrDecoder();
  } catch {
    setStatus(els.cameraStatus, 'Decoder QR tidak termuat. Muat ulang halaman.', 'error');
    return;
  }

  stopCamera(false);
  els.cameraStartBtn.disabled = true;
  setStatus(els.cameraStatus, 'Meminta akses kamera…');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });
    state.stream = stream;
    els.cameraVideo.srcObject = stream;
    try {
      await els.cameraVideo.play();
    } catch {
      // Some browsers resolve play() only after the first frame.
    }
    els.cameraVideo.classList.remove('hidden');
    els.cameraPlaceholder.classList.add('hidden');
    els.cameraStopBtn.disabled = false;
    state.scanning = true;
    state.lastScanAt = 0;
    setStatus(
      els.cameraStatus,
      'Kamera aktif. Arahkan ke QR ekspor Google Authenticator.',
      'success'
    );
    state.scanFrame = requestAnimationFrame(scanTick);
  } catch (error) {
    console.error('Gagal membuka kamera:', error);
    stopCamera(true);
    setStatus(els.cameraStatus, cameraErrorMessage(error), 'error');
  }
}

function stopCamera(resetStatus = true) {
  state.scanning = false;
  if (state.scanFrame) {
    cancelAnimationFrame(state.scanFrame);
    state.scanFrame = null;
  }
  if (state.stream) {
    for (const track of state.stream.getTracks()) {
      try {
        track.stop();
      } catch {
        // Ignore tracks that already ended.
      }
    }
    state.stream = null;
  }
  const video = els.cameraVideo;
  if (video) {
    try {
      video.pause();
    } catch {
      // Ignore pause failures on detached videos.
    }
    video.srcObject = null;
    video.classList.add('hidden');
  }
  els.cameraPlaceholder.classList.remove('hidden');
  els.cameraStartBtn.disabled = false;
  els.cameraStopBtn.disabled = true;
  if (resetStatus) setStatus(els.cameraStatus, DEFAULT_CAMERA_STATUS);
}

function scanTick(timestamp) {
  if (!state.scanning) return;

  if (timestamp - state.lastScanAt >= 120) {
    state.lastScanAt = timestamp;
    const video = els.cameraVideo;
    if (window.jsQR && video.readyState >= 2 && video.videoWidth > 0) {
      try {
        const maxSide = 960;
        const scale = Math.min(
          1,
          maxSide / Math.max(video.videoWidth, video.videoHeight)
        );
        const width = Math.max(1, Math.round(video.videoWidth * scale));
        const height = Math.max(1, Math.round(video.videoHeight * scale));
        if (!state.scanCanvas) {
          state.scanCanvas = document.createElement('canvas');
        }
        const canvas = state.scanCanvas;
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(video, 0, 0, width, height);
        const image = context.getImageData(0, 0, width, height);
        const found = window.jsQR(image.data, width, height, {
          inversionAttempts: 'dontInvert'
        });
        if (found?.data && !state.seenCodes.has(found.data)) {
          state.seenCodes.add(found.data);
          handleDecodedText(found.data, 'camera');
        }
      } catch (error) {
        console.error('Pemindaian QR dari kamera gagal:', error);
      }
    }
  }

  if (state.scanning) state.scanFrame = requestAnimationFrame(scanTick);
}

/* ------------------------------------------------------------------ */
/* Unggah gambar                                                       */
/* ------------------------------------------------------------------ */

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Gambar tidak bisa dibuka.'));
    };
    image.src = url;
  });
}

function decodeCanvas(canvas) {
  if (!window.jsQR) return null;
  try {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    return window.jsQR(image.data, canvas.width, canvas.height, {
      inversionAttempts: 'attemptBoth'
    });
  } catch {
    return null;
  }
}

function rotateCanvas(source, angle) {
  const swapped = angle % 180 !== 0;
  const canvas = document.createElement('canvas');
  canvas.width = swapped ? source.height : source.width;
  canvas.height = swapped ? source.width : source.height;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((angle * Math.PI) / 180);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

function decodeImageSource(source) {
  const naturalWidth = source.width || source.naturalWidth || 0;
  const naturalHeight = source.height || source.naturalHeight || 0;
  if (!naturalWidth || !naturalHeight) return null;

  const scale = Math.min(1, 1600 / Math.max(naturalWidth, naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(naturalHeight * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  const direct = decodeCanvas(canvas);
  if (direct?.data) return direct.data;

  for (const angle of [90, 180, 270]) {
    const rotated = decodeCanvas(rotateCanvas(canvas, angle));
    if (rotated?.data) return rotated.data;
  }
  return null;
}

async function decodeQrFile(file) {
  let source = null;
  if (typeof createImageBitmap === 'function') {
    try {
      source = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      try {
        source = await createImageBitmap(file);
      } catch {
        source = null;
      }
    }
  }
  if (!source) source = await loadImageElement(file);
  try {
    return decodeImageSource(source);
  } finally {
    source.close?.();
  }
}

async function handleQrFiles(fileList) {
  if (state.uploading) return;
  const picked = [...fileList].filter(
    (file) =>
      file &&
      (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name))
  );
  if (!picked.length) {
    setStatus(els.uploadStatus, 'Pilih file gambar terlebih dahulu.', 'error');
    return;
  }
  try {
    await ensureQrDecoder();
  } catch {
    setStatus(
      els.uploadStatus,
      'Decoder QR tidak termuat. Muat ulang halaman.',
      'error'
    );
    return;
  }

  const limit = 12;
  const files = picked.slice(0, limit);
  state.uploading = true;
  let decoded = 0;
  let added = 0;
  const failed = [];

  try {
    for (let index = 0; index < files.length; index += 1) {
      setStatus(
        els.uploadStatus,
        `Membaca gambar ${index + 1} dari ${files.length}…`
      );
      try {
        const text = await decodeQrFile(files[index]);
        if (!text) {
          failed.push(files[index].name);
          continue;
        }
        decoded += 1;
        const info = handleDecodedText(text, 'upload');
        if (info.ok) added += info.added;
      } catch (error) {
        console.error('Gagal membaca gambar QR:', error);
        failed.push(files[index].name);
      }
    }
  } finally {
    state.uploading = false;
    els.qrFileInput.value = '';
  }

  const batch = state.importState.batch;
  const incomplete = batch && !isBatchComplete(batch);
  let message;
  if (!decoded) {
    message = `Tidak ada QR yang bisa dibaca dari ${files.length} gambar. Coba screenshot yang lebih jelas atau tempel tautannya di tab Tempel.`;
  } else {
    message = `${decoded} dari ${files.length} gambar terbaca · ${added} akun ditambahkan ke daftar.`;
    if (failed.length) {
      message += ` Gagal dibaca: ${failed.slice(0, 3).join(', ')}${
        failed.length > 3 ? ', …' : ''
      }.`;
    }
    if (incomplete) {
      message += ` Masih ada ${
        batch.batchSize - batchDoneCount(batch)
      } QR batch yang belum dipindai.`;
    }
    if (picked.length > files.length) {
      message += ` Hanya ${limit} file pertama yang diproses.`;
    }
  }
  setStatus(
    els.uploadStatus,
    message,
    decoded ? (added ? 'success' : '') : 'error'
  );
}

function handleQrFileInput() {
  const files = els.qrFileInput.files;
  if (files?.length) {
    handleQrFiles(files).catch((error) => {
      console.error('Impor gambar gagal:', error);
      setStatus(els.uploadStatus, 'Gagal memproses gambar.', 'error');
    });
  }
}

function bindDropZone() {
  const zone = els.qrDropZone;
  for (const type of ['dragenter', 'dragover']) {
    zone.addEventListener(type, (event) => {
      event.preventDefault();
      event.stopPropagation();
      zone.classList.add('is-dragging');
    });
  }
  zone.addEventListener('dragleave', (event) => {
    if (event.relatedTarget && zone.contains(event.relatedTarget)) return;
    zone.classList.remove('is-dragging');
  });
  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    event.stopPropagation();
    zone.classList.remove('is-dragging');
    if (event.dataTransfer?.files?.length) {
      handleQrFiles(event.dataTransfer.files).catch((error) => {
        console.error('Impor gambar gagal:', error);
        setStatus(els.uploadStatus, 'Gagal memproses gambar.', 'error');
      });
    }
  });
}

/* ------------------------------------------------------------------ */
/* Tempel tautan                                                       */
/* ------------------------------------------------------------------ */

function handlePaste() {
  const text = els.pasteInput.value.trim();
  if (!text) {
    setStatus(
      els.pasteStatus,
      'Tempel minimal satu tautan otpauth atau otpauth-migration.',
      'error'
    );
    return;
  }
  const info = handleDecodedText(text, 'paste');
  if (info.ok && info.added > 0) els.pasteInput.value = '';
}

/* ------------------------------------------------------------------ */
/* Input manual                                                        */
/* ------------------------------------------------------------------ */

function updateManualType() {
  const hotp = els.manualType.value === 'hotp';
  els.manualCounterWrap.classList.toggle('hidden', !hotp);
  if (hotp && !els.manualCounter.value) els.manualCounter.value = '0';
}

async function handleManualSubmit(event) {
  event.preventDefault();
  hideFormError(els.manualError);

  const issuer = els.manualIssuer.value.trim();
  const name = els.manualName.value.trim();
  const secret = els.manualSecret.value.trim();
  if (!issuer && !name) {
    showFormError(els.manualError, 'Isi nama layanan atau nama akun.');
    return;
  }
  if (!secret) {
    showFormError(els.manualError, 'Masukkan secret Base32 dari layanan.');
    return;
  }
  const period = Number(els.manualPeriod.value || 30);
  if (!Number.isInteger(period) || period < 1 || period > 3600) {
    showFormError(els.manualError, 'Periode harus antara 1 dan 3600 detik.');
    return;
  }

  let account;
  try {
    account = createAccountFromBase32({
      type: els.manualType.value === 'hotp' ? 'hotp' : 'totp',
      issuer,
      name,
      secret,
      algorithm: els.manualAlgorithm.value,
      digits: Number(els.manualDigits.value) || 6,
      period,
      counter: Math.max(0, Math.floor(Number(els.manualCounter.value) || 0))
    });
  } catch (error) {
    showFormError(els.manualError, errorMessage(error));
    return;
  }

  const fingerprint = accountFingerprint(account);
  if (
    state.accounts.some(
      (existing) => accountFingerprint(existing) === fingerprint
    )
  ) {
    showFormError(
      els.manualError,
      'Akun dengan secret ini sudah ada di brankas.'
    );
    return;
  }

  setBusy(els.manualSubmit, true, 'Menambahkan…');
  try {
    const result = await addAccounts([account]);
    await refreshAccounts();
    els.manualForm.reset();
    updateManualType();
    if (result.added) {
      showToast(els.toast, 'Akun ditambahkan.');
    } else {
      showFormError(
        els.manualError,
        'Akun dengan secret ini sudah ada di brankas.'
      );
    }
  } catch (error) {
    if (handleSessionError(error)) return;
    showFormError(els.manualError, errorMessage(error));
  } finally {
    setBusy(els.manualSubmit, false);
  }
}

/* ------------------------------------------------------------------ */
/* Cadangan                                                            */
/* ------------------------------------------------------------------ */

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'ukuran tidak diketahui';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

async function handleExport() {
  if (!state.unlocked) return;
  setStatus(els.exportStatus, '');
  setBusy(els.exportBtn, true, 'Menyiapkan cadangan…');
  try {
    const text = await exportBackup();
    const filename = `authvault-backup-${formatDateForFile()}.json`;
    downloadText(filename, text);
    setStatus(els.exportStatus, `Cadangan terunduh: ${filename}`, 'success');
    showToast(els.toast, 'Cadangan terenkripsi diunduh.');
    await refreshBackupMeta();
  } catch (error) {
    if (handleSessionError(error)) return;
    setStatus(els.exportStatus, errorMessage(error), 'error');
  } finally {
    setBusy(els.exportBtn, false);
  }
}

function handleBackupFileChange() {
  const file = els.backupFile.files?.[0];
  setStatus(els.restoreStatus, '');
  if (!file) {
    els.backupFileName.textContent = 'Belum ada file dipilih';
    return;
  }
  els.backupFileName.textContent = `${file.name} · ${formatFileSize(file.size)}`;
  if (file.size > MAX_BACKUP_BYTES) {
    setStatus(
      els.restoreStatus,
      'File melebihi batas 8 MB dan tidak akan diproses.',
      'error'
    );
  }
}

async function handleRestore() {
  const file = els.backupFile.files?.[0];
  if (!file) {
    setStatus(els.restoreStatus, 'Pilih file cadangan terlebih dahulu.', 'error');
    return;
  }
  if (file.size > MAX_BACKUP_BYTES) {
    setStatus(
      els.restoreStatus,
      'File melebihi batas 8 MB dan tidak akan diproses.',
      'error'
    );
    return;
  }
  const password = els.backupPassword.value;
  if (!password) {
    setStatus(
      els.restoreStatus,
      'Masukkan kata sandi yang dipakai saat cadangan dibuat.',
      'error'
    );
    return;
  }
  const mode =
    document.querySelector('input[name="restoreMode"]:checked')?.value ||
    'merge';
  if (mode === 'replace') {
    const confirmed = window.confirm(
      'Ganti brankas saat ini?\n\nSemua akun di brankas ini akan dihapus dan diganti dengan isi file cadangan. Kata sandi utama akan menjadi kata sandi file cadangan tersebut.\n\nLanjutkan?'
    );
    if (!confirmed) return;
  }

  setStatus(els.restoreStatus, '');
  setBusy(els.restoreBtn, true, 'Memulihkan…');
  try {
    const text = await file.text();
    const result = await importBackup(text, password, mode);
    if (result.mode === 'replace') state.key = result.key;
    await refreshAccounts();
    els.backupFile.value = '';
    els.backupPassword.value = '';
    els.backupFileName.textContent = 'Belum ada file dipilih';
    const message =
      result.mode === 'replace'
        ? `Brankas diganti dengan ${result.added} akun dari cadangan.`
        : result.added
          ? `${result.added} akun dipulihkan${
              result.skipped
                ? `, ${result.skipped} duplikat dilewati`
                : ''
            }.`
          : 'Tidak ada akun baru; semua akun di cadangan sudah ada.';
    setStatus(
      els.restoreStatus,
      message,
      result.added ? 'success' : ''
    );
    showToast(
      els.toast,
      result.mode === 'replace'
        ? 'Brankas berhasil diganti dari cadangan.'
        : message,
      'success'
    );
  } catch (error) {
    if (error.message === 'WRONG_PASSWORD') {
      setStatus(els.restoreStatus, 'Kata sandi cadangan salah.', 'error');
      return;
    }
    if (handleSessionError(error)) return;
    setStatus(els.restoreStatus, errorMessage(error), 'error');
  } finally {
    setBusy(els.restoreBtn, false);
  }
}

/* ------------------------------------------------------------------ */
/* Pengaturan                                                          */
/* ------------------------------------------------------------------ */

async function handleChangePassword(event) {
  event.preventDefault();
  hideFormError(els.changePasswordError);
  const current = els.currentPassword.value;
  const next = els.newPassword.value;
  const confirmation = els.confirmPassword.value;
  if (!current) {
    showFormError(els.changePasswordError, 'Masukkan kata sandi saat ini.');
    return;
  }
  if (next.length < 8) {
    showFormError(els.changePasswordError, 'Kata sandi baru minimal 8 karakter.');
    return;
  }
  if (next !== confirmation) {
    showFormError(
      els.changePasswordError,
      'Kata sandi baru dan konfirmasi tidak sama.'
    );
    return;
  }

  setBusy(els.changePasswordBtn, true, 'Mengubah…');
  try {
    const result = await changeMasterPassword(current, next);
    state.key = result.key;
    els.changePasswordForm.reset();
    await refreshBackupMeta();
    showToast(els.toast, 'Kata sandi utama diubah.');
  } catch (error) {
    if (['LOCKED', 'NO_VAULT', 'INVALID_SESSION_KEY'].includes(error.message)) {
      handleSessionError(error);
      return;
    }
    showFormError(els.changePasswordError, errorMessage(error));
  } finally {
    setBusy(els.changePasswordBtn, false);
  }
}

async function handleResetVault() {
  if (els.resetInput.value.trim() !== 'RESET') {
    showToast(els.toast, 'Ketik RESET untuk mengonfirmasi.', 'error');
    els.resetInput.focus();
    return;
  }
  const confirmed = window.confirm(
    'Reset brankas sekarang?\n\nSemua akun di brankas ini akan dihapus dari Chrome. Cadangan terenkripsi yang sudah diunduh tetap bisa dipulihkan nanti.\n\nTindakan ini tidak bisa dibatalkan.'
  );
  if (!confirmed) return;

  setBusy(els.resetBtn, true, 'Mereset…');
  try {
    await resetVault();
    state.activeTab = 'accounts';
    updateUrl();
    showGateSetup();
    showToast(els.toast, 'Brankas direset. Buat kata sandi baru.');
  } catch (error) {
    showToast(els.toast, errorMessage(error), 'error');
  } finally {
    setBusy(els.resetBtn, false);
  }
}

/* ------------------------------------------------------------------ */
/* Sesi                                                                */
/* ------------------------------------------------------------------ */

function stopSessionHeartbeat() {
  if (state.sessionTimer) clearInterval(state.sessionTimer);
  state.sessionTimer = null;
}

function startSessionHeartbeat() {
  stopSessionHeartbeat();
  state.sessionTimer = setInterval(() => {
    if (state.unlocked) checkSession();
  }, 20000);
}

function handleVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    if (state.scanning) stopCamera();
    return;
  }
  if (state.unlocked) checkSession();
}

function handlePageHide() {
  stopCamera(false);
  stopSessionHeartbeat();
}

/* ------------------------------------------------------------------ */
/* Navigasi & event                                                    */
/* ------------------------------------------------------------------ */

function openImportMethod(method = '') {
  if (method && METHODS.has(method)) state.importMethod = method;
  switchTab('import');
  if (method === 'manual') {
    setTimeout(() => els.manualIssuer.focus(), 80);
  }
}

function bindRevealButtons() {
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
        show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'
      );
      input.focus();
    });
  }
}

function bindEvents() {
  els.gateSetupForm.addEventListener('submit', handleGateSetup);
  els.gateUnlockForm.addEventListener('submit', handleGateUnlock);
  els.gateForgotBtn.addEventListener('click', handleForgot);
  els.lockBtn.addEventListener('click', handleLock);

  for (const tab of els.tabs) {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  }
  for (const tab of els.methodTabs) {
    tab.addEventListener('click', () => switchMethod(tab.dataset.method));
  }

  els.accountsAddBtn.addEventListener('click', () => openImportMethod());
  els.accountsEmptyImport.addEventListener('click', () => openImportMethod());
  els.accountsEmptyManual.addEventListener('click', () =>
    openImportMethod('manual')
  );
  els.accountsBody.addEventListener('click', handleAccountsClick);
  els.accountSearch.addEventListener('input', handleAccountSearch);

  els.editCancel.addEventListener('click', () => els.editDialog.close());
  els.editSave.addEventListener('click', handleEditSave);
  els.editDialog.addEventListener('close', () => {
    state.editingId = null;
    hideFormError(els.editError);
  });

  els.cameraStartBtn.addEventListener('click', startCamera);
  els.cameraStopBtn.addEventListener('click', () => {
    stopCamera();
    setStatus(els.cameraStatus, 'Kamera dihentikan.');
  });
  els.qrFileInput.addEventListener('change', handleQrFileInput);
  bindDropZone();
  els.pasteBtn.addEventListener('click', handlePaste);

  els.manualForm.addEventListener('submit', handleManualSubmit);
  els.manualType.addEventListener('change', updateManualType);

  els.resetScanBtn.addEventListener('click', handleResetScan);
  els.candidateBody.addEventListener('change', handleCandidateToggle);
  els.candidateSelectAll.addEventListener('change', handleCandidateSelectAll);
  els.candidateClearBtn.addEventListener('click', () => clearImportState());
  els.candidateAddBtn.addEventListener('click', handleCandidateAdd);

  els.exportBtn.addEventListener('click', handleExport);
  els.backupFile.addEventListener('change', handleBackupFileChange);
  els.restoreBtn.addEventListener('click', handleRestore);

  els.lockNowBtn.addEventListener('click', handleLock);
  els.changePasswordForm.addEventListener('submit', handleChangePassword);
  els.resetBtn.addEventListener('click', handleResetVault);

  bindRevealButtons();
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', handlePageHide);
}

/* ------------------------------------------------------------------ */
/* Mulai                                                               */
/* ------------------------------------------------------------------ */

async function init() {
  const params = new URLSearchParams(location.search);
  const requestedTab = params.get('tab');
  const requestedMethod = params.get('method');
  if (TABS.has(requestedTab)) state.activeTab = requestedTab;
  if (METHODS.has(requestedMethod)) state.importMethod = requestedMethod;
  updateUrl();
  bindEvents();
  updateManualType();
  setStatus(els.cameraStatus, DEFAULT_CAMERA_STATUS);
  setStatus(els.uploadStatus, DEFAULT_UPLOAD_STATUS);

  if (!(await hasVault())) {
    showGateSetup();
    return;
  }
  const key = await getSessionKey();
  if (!key) {
    showGateUnlock();
    return;
  }
  try {
    const accounts = await loadAccounts(key);
    await enterWorkspace(key, accounts);
  } catch (error) {
    console.error('Gagal membuka brankas:', error);
    await lockVault();
    showGateUnlock('Sesi tidak valid. Buka kunci lagi.');
  }
}

init().catch((error) => {
  console.error('AuthVault gagal dimuat:', error);
  showGateUnlock('Gagal memuat brankas. Coba muat ulang halaman.');
});

