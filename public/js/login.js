(function () {
  'use strict';

  const form      = document.getElementById('loginForm');
  const alertEl   = document.getElementById('alert');
  const submitBtn = document.getElementById('submitBtn');

  // Show URL-based notices (e.g. after email verification)
  const params = new URLSearchParams(window.location.search);
  if (params.get('verified') === '1') {
    showAlert('success', 'Email verified! You can now sign in.');
  } else if (params.get('verified') === 'already') {
    showAlert('success', 'Your email was already verified. Please sign in.');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert();

    const identifier = document.getElementById('identifier').value.trim();
    const password   = document.getElementById('password').value;

    if (!identifier || !password) {
      return showAlert('error', 'Please fill in all fields');
    }

    setLoading(true);

    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'UNVERIFIED') {
          showAlert('warning', data.error);
        } else {
          showAlert('error', data.error || 'Login failed');
        }
        return;
      }

      // Redirect based on role
      const role = data.user?.role;
      if (role === 'admin') {
        window.location.href = '/dashboard-admin.html';
      } else if (role === 'manager') {
        window.location.href = '/dashboard-manager.html';
      } else {
        showAlert('success', 'Signed in successfully!');
      }
    } catch {
      showAlert('error', 'Network error — please check your connection');
    } finally {
      setLoading(false);
    }
  });

  function showAlert(type, message) {
    alertEl.className = `alert alert-${type} show`;
    alertEl.textContent = message;
  }

  function clearAlert() {
    alertEl.className = 'alert';
    alertEl.textContent = '';
  }

  function setLoading(loading) {
    submitBtn.disabled = loading;
    submitBtn.innerHTML = loading
      ? '<span class="spinner"></span>Signing in…'
      : 'Sign In';
  }
})();
