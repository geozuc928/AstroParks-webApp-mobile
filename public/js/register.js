(function () {
  'use strict';

  const form      = document.getElementById('registerForm');
  const alertEl   = document.getElementById('alert');
  const submitBtn = document.getElementById('submitBtn');
  const pwInput   = document.getElementById('password');
  const cpInput   = document.getElementById('confirm_password');

  // Live password match feedback
  cpInput.addEventListener('input', () => {
    if (cpInput.value && cpInput.value !== pwInput.value) {
      cpInput.style.borderColor = 'var(--error)';
    } else {
      cpInput.style.borderColor = '';
    }
  });

  // Auto-uppercase license plate
  const plateInput = document.getElementById('license_plate');
  plateInput.addEventListener('input', () => {
    const pos = plateInput.selectionStart;
    plateInput.value = plateInput.value.toUpperCase();
    plateInput.setSelectionRange(pos, pos);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert();

    const email           = document.getElementById('email').value.trim();
    const license_plate   = plateInput.value.trim();
    const password        = pwInput.value;
    const confirm_password = cpInput.value;

    // Client-side validation
    if (!email || !license_plate || !password || !confirm_password) {
      return showAlert('error', 'Please fill in all fields');
    }
    if (password !== confirm_password) {
      return showAlert('error', 'Passwords do not match');
    }
    if (password.length < 8) {
      return showAlert('error', 'Password must be at least 8 characters');
    }

    setLoading(true);

    try {
      const res  = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, license_plate, password, confirm_password }),
      });
      const data = await res.json();

      if (!res.ok) {
        showAlert('error', data.error || 'Registration failed');
        return;
      }

      showAlert('success', data.message);
      form.reset();
      form.style.display = 'none';
    } catch {
      showAlert('error', 'Network error — please check your connection');
    } finally {
      setLoading(false);
    }
  });

  function showAlert(type, message) {
    alertEl.className = `alert alert-${type} show`;
    alertEl.textContent = message;
    alertEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function clearAlert() {
    alertEl.className = 'alert';
    alertEl.textContent = '';
  }

  function setLoading(loading) {
    submitBtn.disabled = loading;
    submitBtn.innerHTML = loading
      ? '<span class="spinner"></span>Creating account…'
      : 'Create Account';
  }
})();
