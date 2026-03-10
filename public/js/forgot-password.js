(function () {
  'use strict';

  const form      = document.getElementById('forgotForm');
  const alertEl   = document.getElementById('alert');
  const submitBtn = document.getElementById('submitBtn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert();

    const email = document.getElementById('email').value.trim();
    if (!email) {
      return showAlert('error', 'Please enter your email address');
    }

    setLoading(true);

    try {
      const res  = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        showAlert('error', data.error || 'Something went wrong');
        return;
      }

      showAlert('success', data.message);
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
  }

  function clearAlert() {
    alertEl.className = 'alert';
    alertEl.textContent = '';
  }

  function setLoading(loading) {
    submitBtn.disabled = loading;
    submitBtn.innerHTML = loading
      ? '<span class="spinner"></span>Sending…'
      : 'Send Reset Link';
  }
})();
