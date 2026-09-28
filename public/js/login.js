(() => {
  let kind = 'team';
  const form = document.getElementById('loginForm'); const err = document.getElementById('err'); const go = document.getElementById('go');
  const resetRequest = document.getElementById('resetRequest'); const resetConfirm = document.getElementById('resetConfirm');
  const forgot = document.getElementById('forgotPassword'); const token = new URLSearchParams(location.search).get('reset');
  const HOME = { admin: '/admin', mx: '/mx', dp: '/dp', cx: '/account' };

  function showReset(mode) {
    form.hidden = mode !== 'login'; forgot.hidden = mode !== 'login';
    resetRequest.hidden = mode !== 'request'; resetConfirm.hidden = mode !== 'confirm';
  }
  forgot.addEventListener('click', () => showReset('request'));
  document.querySelectorAll('.resetBack').forEach((button) => button.addEventListener('click', () => showReset('login')));
  if (token) { const hidden = document.createElement('input'); hidden.type = 'hidden'; hidden.name = 'token'; hidden.value = token; resetConfirm.append(hidden); showReset('confirm'); }

  document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
    kind = b.dataset.kind;
    document.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    err.textContent = '';
  }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault(); err.textContent = ''; go.disabled = true; go.textContent = 'Signing in…';
    try {
      const r = await fetch(kind === 'admin' ? '/api/v2/admin/login' : '/api/v2/auth/login', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || 'Could not sign in');
      location.href = HOME[j.data.user.role] || '/';
    } catch (x) { err.textContent = x.message; go.disabled = false; go.textContent = 'Sign in'; }
  });

  resetRequest.addEventListener('submit', async (e) => {
    e.preventDefault(); const error = document.getElementById('resetRequestErr'); const message = document.getElementById('resetRequestMessage');
    error.textContent = ''; message.textContent = '';
    try {
      const r = await fetch('/api/v2/auth/password-reset/request', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: JSON.stringify({ identifier: resetRequest.elements.identifier.value }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.message || 'Could not request a reset link');
      message.textContent = j.data.message;
    } catch (x) { error.textContent = x.message; }
  });

  resetConfirm.addEventListener('submit', async (e) => {
    e.preventDefault(); const error = document.getElementById('resetConfirmErr'); error.textContent = '';
    try {
      const r = await fetch('/api/v2/auth/password-reset/confirm', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: JSON.stringify({ token: resetConfirm.elements.token.value, password: resetConfirm.elements.password.value }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.message || 'Could not update the password');
      history.replaceState(null, '', '/login'); showReset('login'); err.textContent = j.data.message;
    } catch (x) { error.textContent = x.message; }
  });
})();
