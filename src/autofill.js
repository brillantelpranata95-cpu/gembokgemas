/**
 * Isi kode OTP ke kolom verifikasi di halaman aktif.
 *
 * Fungsi ini sengaja berdiri sendiri (tanpa closure/import) karena dikirim ke
 * halaman lewat chrome.scripting.executeScript dan harus bisa diserialisasi.
 * Hanya kode saat ini yang dikirim ke halaman; secret tidak pernah ikut.
 */
export function fillOtpInPage(code) {
  const codeText = String(code || '');
  if (!/^\d{4,10}$/.test(codeText)) {
    return { ok: false, reason: 'BAD_CODE' };
  }

  const inputTypes = new Set(['text', 'tel', 'number', 'password']);
  const strongHint =
    /(one.?time|otp|totp|passcode|2fa|mfa|verification.?code|verify.?code|auth(?:entication|enticator)?.?code|kode.?verifikasi|kode.?otp)/;
  const weakHint = /(code|token|kode)/;
  const unsafeHint =
    /(search|username|user-name|login|email|e-mail|current-password|new-password|phone|address|zip|postal|coupon|promo|gift|payment|billing|quantity|amount)/;
  // Kolom pembayaran tidak boleh diisi kode OTP, bahkan jika menyebut "security code".
  const paymentHint =
    /(^|[^a-z])(card|cardholder|credit|debit|cvv|cvc)([^a-z]|$)|(^|[^a-z])cc-/;
  const cardSecurityHint = /security.?code/;

  const identityText = (input) =>
    [
      input.name,
      input.id,
      input.getAttribute('placeholder'),
      input.getAttribute('aria-label'),
      input.getAttribute('autocomplete'),
      input.getAttribute('data-testid')
    ]
      .filter(Boolean)
      .join(' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase();

  const isVisible = (input) => {
    if (!input || input.disabled || input.readOnly) return false;
    if (!inputTypes.has((input.type || 'text').toLowerCase())) return false;
    const style = window.getComputedStyle(input);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0'
    ) {
      return false;
    }
    const rect = input.getBoundingClientRect();
    return rect.width >= 8 && rect.height >= 8;
  };

  const isUnsafe = (input) => {
    const identity = identityText(input);
    if (paymentHint.test(identity)) return true;
    if (cardSecurityHint.test(identity) && !strongHint.test(identity)) {
      return true;
    }
    return unsafeHint.test(identity) && !strongHint.test(identity);
  };

  // Kumpulkan juga input di dalam open shadow root.
  const roots = [document];
  for (let index = 0; index < roots.length; index += 1) {
    for (const element of roots[index].querySelectorAll('*')) {
      if (element.shadowRoot) roots.push(element.shadowRoot);
    }
  }

  const inputs = [];
  for (const root of roots) {
    for (const input of root.querySelectorAll('input')) {
      if (!isVisible(input)) continue;
      const identity = identityText(input);
      if (
        (input.type || '').toLowerCase() === 'password' &&
        !strongHint.test(identity)
      ) {
        continue;
      }
      inputs.push(input);
    }
  }

  if (!inputs.length) return { ok: false, reason: 'NO_FIELD' };

  const scored = inputs
    .map((input) => {
      const identity = identityText(input);
      const classText = String(input.className || '').toLowerCase();
      const hints = `${identity} ${classText}`;
      const autocomplete = (
        input.getAttribute('autocomplete') || ''
      ).toLowerCase();
      let score = 0;
      if (autocomplete.includes('one-time-code')) score += 120;
      if (strongHint.test(hints)) score += 60;
      else if (weakHint.test(hints)) score += 18;
      if ((input.getAttribute('inputmode') || '') === 'numeric') score += 14;
      if ((input.type || '').toLowerCase() === 'tel') score += 6;
      const maxLength = Number(input.maxLength);
      if (maxLength > 0 && maxLength <= 10) {
        score += maxLength === codeText.length ? 24 : 8;
      }
      if (isUnsafe(input)) score -= 80;
      return { input, score, maxLength };
    })
    .sort((left, right) => right.score - left.score);

  let focused = document.activeElement;
  while (focused && focused.shadowRoot && focused.shadowRoot.activeElement) {
    focused = focused.shadowRoot.activeElement;
  }

  const focusedEntry = inputs.includes(focused)
    ? scored.find((entry) => entry.input === focused)
    : null;

  let target = null;
  if (focusedEntry && focusedEntry.score >= 20) {
    target = focusedEntry;
  }
  if (!target && scored[0] && scored[0].score >= 40) {
    target = scored[0];
  }
  if (
    !target &&
    focusedEntry &&
    !isUnsafe(focusedEntry.input)
  ) {
    // Pengguna sudah mengarahkan kursor ke kolom yang dimaksud.
    target = focusedEntry;
  }
  if (!target) return { ok: false, reason: 'NO_FIELD' };

  const setValue = (input, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    );
    if (descriptor?.set) descriptor.set.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const reveal = (input) => {
    try {
      input.focus({ preventScroll: true });
      input.scrollIntoView({ block: 'center', inline: 'nearest' });
    } catch {
      input.focus();
    }
  };

  if (target.maxLength === 1) {
    const scope =
      target.input.closest('form') ||
      target.input.parentElement?.parentElement ||
      document;
    const boxes = [...scope.querySelectorAll('input')].filter(
      (input) =>
        inputs.includes(input) &&
        Number(input.maxLength) === 1 &&
        !isUnsafe(input)
    );
    if (boxes.length < 4) return { ok: false, reason: 'NO_FIELD' };
    if (boxes.length !== codeText.length) {
      return { ok: false, reason: 'MISMATCH' };
    }
    boxes.forEach((box, index) => setValue(box, codeText[index]));
    reveal(boxes[boxes.length - 1]);
    return { ok: true, mode: 'split', count: boxes.length };
  }

  if (target.maxLength > 0 && target.maxLength < codeText.length) {
    return { ok: false, reason: 'MISMATCH' };
  }

  setValue(target.input, codeText);
  reveal(target.input);
  return { ok: true, mode: 'single', count: 1 };
}
