/**
 * Lekta Control Center: mali prijavni "gate" kad nema valjane sesije. Ne kopira cijeli
 * #authModal iz app.ts (vezan na tudji DOM/druge brige) - isti GoTrue tok (src/auth/session.ts:
 * e-mail magic-link/kod ILI lozinka), minimalan markup, bez innerHTML (isti obrazac kao
 * admin-panel.ts). Lozinka je i dalje PRAVA provjera (nesto sto korisnik zna) - ne postoji
 * "prijava bez provjere" put, to bi ponistilo admin_users gate nizvodno.
 */

import { adminAuthConfig, adminSessionStore, requestEmailOtp, verifyEmailOtp, signInWithPassword, setPassword } from './admin-auth';
import type { Session } from '../auth/session';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Nakon uspjesne prijave (bilo kojim putem) ponudi postavljanje lozinke za sljedeci put -
 * skipabilno, jedan ekran. Izvezeno zasebno jer ga admin-shell.ts poziva i za magic-link
 * povratak (nikad ne prolazi kroz ostatak ovog gatea, resolveAdminToken odmah uspije).
 */
export function renderSetPasswordStep(mount: HTMLElement, accessToken: string): Promise<void> {
  return new Promise((resolve) => {
    const wrap = el('div', 'admin-auth-gate');
    const card = el('div', 'admin-auth-card paper');
    card.appendChild(el('h1', 'admin-auth-title', 'Postavi lozinku'));
    card.appendChild(
      el('p', 'admin-auth-desc', 'Opcionalno: postavi lozinku da se sljedeći put prijaviš odmah, bez čekanja e-maila.'),
    );

    const field = el('div', 'field');
    const label = el('label', undefined, 'Nova lozinka');
    label.htmlFor = 'adminAuthNewPassword';
    const input = el('input', 'input') as HTMLInputElement;
    input.type = 'password';
    input.id = 'adminAuthNewPassword';
    input.autocomplete = 'new-password';
    field.append(label, input);

    const actions = el('div', 'admin-auth-actions');
    const setBtn = el('button', 'btn btn-primary', 'Postavi i uđi') as HTMLButtonElement;
    setBtn.type = 'button';
    const skipBtn = el('button', 'btn btn-ghost btn-sm', 'Preskoči') as HTMLButtonElement;
    skipBtn.type = 'button';
    actions.append(setBtn, skipBtn);

    const status = el('p', 'admin-auth-status');
    card.append(field, actions, status);
    wrap.appendChild(card);
    mount.replaceChildren(wrap);

    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') setBtn.click(); });
    input.focus();
    skipBtn.addEventListener('click', () => { wrap.remove(); resolve(); });
    setBtn.addEventListener('click', () => { void submit(); });

    async function submit() {
      const password = input.value;
      if (!password || password.length < 8) {
        status.textContent = 'Lozinka mora imati barem 8 znakova.';
        status.className = 'admin-auth-status is-error';
        return;
      }
      setBtn.disabled = true;
      status.textContent = 'Spremam…';
      status.className = 'admin-auth-status';
      const res = await setPassword(adminAuthConfig, accessToken, password);
      setBtn.disabled = false;
      if (!res.ok) {
        status.textContent = res.message;
        status.className = 'admin-auth-status is-error';
        return;
      }
      wrap.remove();
      resolve();
    }
  });
}

/** Prikaze gate ako nema tokena; rezolvira se novim tokenom nakon uspjesne prijave. */
export function renderAdminAuthGate(mount: HTMLElement): Promise<string> {
  return new Promise((resolve) => {
    let email = '';
    const wrap = el('div', 'admin-auth-gate');
    const card = el('div', 'admin-auth-card paper');
    wrap.appendChild(card);

    function renderEmailStep() {
      card.replaceChildren();
      card.appendChild(el('h1', 'admin-auth-title', 'Prijava'));
      card.appendChild(el('p', 'admin-auth-desc', 'Unesi e-mail admin računa.'));

      const field = el('div', 'field');
      const label = el('label', undefined, 'E-mail');
      label.htmlFor = 'adminAuthEmail';
      const input = el('input', 'input') as HTMLInputElement;
      input.type = 'email';
      input.id = 'adminAuthEmail';
      input.autocomplete = 'email';
      input.placeholder = 'ti@primjer.hr';
      field.append(label, input);

      const linkBtn = el('button', 'btn btn-primary', 'Pošalji poveznicu za prijavu') as HTMLButtonElement;
      linkBtn.type = 'button';
      const linkStatus = el('p', 'admin-auth-status');

      const divider = el('p', 'admin-auth-divider', 'ili');

      const pwField = el('div', 'field');
      const pwLabel = el('label', undefined, 'Lozinka (ako si je postavio/la)');
      pwLabel.htmlFor = 'adminAuthPassword';
      const pwInput = el('input', 'input') as HTMLInputElement;
      pwInput.type = 'password';
      pwInput.id = 'adminAuthPassword';
      pwInput.autocomplete = 'current-password';
      pwField.append(pwLabel, pwInput);
      const pwBtn = el('button', 'btn btn-secondary', 'Prijavi se lozinkom') as HTMLButtonElement;
      pwBtn.type = 'button';
      const pwStatus = el('p', 'admin-auth-status');

      card.append(field, linkBtn, linkStatus, divider, pwField, pwBtn, pwStatus);

      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') linkBtn.click(); });
      input.focus();
      linkBtn.addEventListener('click', () => { void sendLink(); });
      pwInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') pwBtn.click(); });
      pwBtn.addEventListener('click', () => { void loginWithPassword(); });

      async function sendLink() {
        const value = input.value.trim();
        if (!value) {
          linkStatus.textContent = 'Unesi e-mail.';
          linkStatus.className = 'admin-auth-status is-error';
          return;
        }
        linkBtn.disabled = true;
        linkStatus.textContent = 'Šaljem…';
        linkStatus.className = 'admin-auth-status';
        // redirectTo: klik na poveznicu u e-mailu vraca se OVAMO (bez query/hash - cist URL) s
        // tokenima u fragmentu koje admin-shell.ts cita preko consumeMagicLinkFragment().
        const redirectTo = location.origin + location.pathname;
        const res = await requestEmailOtp(adminAuthConfig, value, fetch, redirectTo);
        linkBtn.disabled = false;
        if (!res.ok) {
          linkStatus.textContent = res.message;
          linkStatus.className = 'admin-auth-status is-error';
          return;
        }
        email = value;
        renderCodeStep();
      }

      async function loginWithPassword() {
        const value = input.value.trim();
        const password = pwInput.value;
        if (!value || !password) {
          pwStatus.textContent = 'Unesi e-mail i lozinku.';
          pwStatus.className = 'admin-auth-status is-error';
          return;
        }
        pwBtn.disabled = true;
        pwStatus.textContent = 'Prijavljujem…';
        pwStatus.className = 'admin-auth-status';
        const res = await signInWithPassword(adminAuthConfig, value, password);
        pwBtn.disabled = false;
        if (!res.ok) {
          pwStatus.textContent = res.message;
          pwStatus.className = 'admin-auth-status is-error';
          return;
        }
        adminSessionStore.save(res.session);
        wrap.remove();
        resolve(res.session.accessToken);
      }
    }

    function renderCodeStep() {
      card.replaceChildren();
      card.appendChild(el('h1', 'admin-auth-title', 'Provjeri e-mail'));
      card.appendChild(
        el(
          'p',
          'admin-auth-desc',
          `Poslali smo poveznicu na ${email} - klikni je i vrati te ovamo prijavljen/a. Ako e-mail umjesto toga prikazuje 6-znamenkasti kod, upiši ga ovdje.`,
        ),
      );

      const field = el('div', 'field');
      const label = el('label', undefined, 'Kod iz e-maila (ako ga vidiš)');
      label.htmlFor = 'adminAuthCode';
      const input = el('input', 'input') as HTMLInputElement;
      input.type = 'text';
      input.id = 'adminAuthCode';
      input.inputMode = 'numeric';
      input.autocomplete = 'one-time-code';
      field.append(label, input);

      const actions = el('div', 'admin-auth-actions');
      const verifyBtn = el('button', 'btn btn-primary', 'Potvrdi') as HTMLButtonElement;
      verifyBtn.type = 'button';
      const backBtn = el('button', 'btn btn-ghost btn-sm', 'Natrag') as HTMLButtonElement;
      backBtn.type = 'button';
      actions.append(verifyBtn, backBtn);

      const status = el('p', 'admin-auth-status');
      card.append(field, actions, status);

      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') verifyBtn.click(); });
      input.focus();
      backBtn.addEventListener('click', renderEmailStep);
      verifyBtn.addEventListener('click', () => { void verify(); });

      async function verify() {
        const code = input.value.trim();
        if (!code) {
          status.textContent = 'Unesi kod.';
          status.className = 'admin-auth-status is-error';
          return;
        }
        verifyBtn.disabled = true;
        status.textContent = 'Provjeravam…';
        status.className = 'admin-auth-status';
        const res = await verifyEmailOtp(adminAuthConfig, email, code);
        verifyBtn.disabled = false;
        if (!res.ok) {
          status.textContent = res.message;
          status.className = 'admin-auth-status is-error';
          return;
        }
        const session: Session = res.session;
        adminSessionStore.save(session);
        await renderSetPasswordStep(mount, session.accessToken);
        resolve(session.accessToken);
      }
    }

    renderEmailStep();
    mount.replaceChildren(wrap);
  });
}
