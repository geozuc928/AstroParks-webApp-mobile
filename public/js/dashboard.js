/* global initDashboard */

/**
 * Shared dashboard logic for admin and manager views.
 * Called by each dashboard page with { role: 'admin' | 'manager' }
 */
function initDashboard({ role }) {
  'use strict';

  const loadingEl    = document.getElementById('loading');
  const appEl        = document.getElementById('app');
  const alertEl      = document.getElementById('alert');
  const tableBody    = document.getElementById('userTableBody');
  const searchInput  = document.getElementById('searchInput');
  const headerUser   = document.getElementById('headerUser');
  const logoutBtn    = document.getElementById('logoutBtn');

  let allUsers = [];

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  (async function bootstrap() {
    try {
      // Verify session
      const meRes = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (!meRes.ok) {
        window.location.href = '/login.html';
        return;
      }
      const { user } = await meRes.json();

      // Role guard
      if (role === 'admin' && user.role !== 'admin') {
        window.location.href = user.role === 'manager'
          ? '/dashboard-manager.html'
          : '/login.html';
        return;
      }
      if (role === 'manager' && !['admin', 'manager'].includes(user.role)) {
        window.location.href = '/login.html';
        return;
      }

      headerUser.textContent = user.username;

      await loadUsers(role);

      loadingEl.classList.add('hidden');
      appEl.classList.remove('hidden');
    } catch {
      loadingEl.textContent = 'Failed to load. Please refresh.';
    }
  })();

  // ── Load users ─────────────────────────────────────────────────────────────
  async function loadUsers() {
    const endpoint = role === 'admin' ? '/api/dashboard/users' : '/api/dashboard/my-users';

    try {
      const res  = await fetch(endpoint, { credentials: 'same-origin' });
      const data = await res.json();

      if (!res.ok) {
        showAlert('error', data.error || 'Failed to load users');
        return;
      }

      allUsers = data.users || [];
      renderStats(allUsers);
      renderTable(allUsers);
    } catch {
      showAlert('error', 'Network error loading users');
    }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  function renderStats(users) {
    const statTotal    = document.getElementById('statTotal');
    const statVerified = document.getElementById('statVerified');

    if (statTotal)    statTotal.textContent    = users.length;
    if (statVerified) statVerified.textContent = users.filter(u => u.is_verified).length;

    if (role === 'admin') {
      const statManagers = document.getElementById('statManagers');
      const statAdmins   = document.getElementById('statAdmins');
      if (statManagers) statManagers.textContent = users.filter(u => u.role === 'manager').length;
      if (statAdmins)   statAdmins.textContent   = users.filter(u => u.role === 'admin').length;
    }
  }

  // ── Render table ───────────────────────────────────────────────────────────
  function renderTable(users) {
    if (!users.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="${role === 'admin' ? 9 : 6}"
              style="text-align:center;color:var(--text-muted);padding:32px;">
            No users found.
          </td>
        </tr>`;
      return;
    }

    tableBody.innerHTML = users.map(u => {
      const joined  = new Date(u.created_at * 1000).toLocaleDateString();
      const verified = u.is_verified
        ? '<span class="badge badge-verified">Verified</span>'
        : '<span class="badge badge-unverified">Unverified</span>';

      if (role === 'admin') {
        const roleSelect = `
          <select class="role-select" data-id="${u.id}" aria-label="Change role for ${u.username}">
            <option value="user"    ${u.role === 'user'    ? 'selected' : ''}>User</option>
            <option value="manager" ${u.role === 'manager' ? 'selected' : ''}>Manager</option>
            <option value="admin"   ${u.role === 'admin'   ? 'selected' : ''}>Admin</option>
          </select>`;

        const deleteBtn = `
          <button class="btn btn-secondary delete-btn"
                  data-id="${u.id}"
                  style="width:auto;padding:5px 10px;font-size:12px;margin-left:6px;border-color:var(--error);color:var(--error);"
                  aria-label="Delete ${u.username}">
            Delete
          </button>`;

        return `
          <tr>
            <td>${escHtml(u.username)}</td>
            <td>${escHtml(u.email)}</td>
            <td>${escHtml(u.phone)}</td>
            <td><code style="background:rgba(79,142,247,0.1);padding:2px 6px;border-radius:4px;">${escHtml(u.license_plate)}</code></td>
            <td>${u.property_name ? escHtml(u.property_name) : '<span style="color:var(--text-muted)">—</span>'}</td>
            <td>${verified}</td>
            <td>${roleSelect}</td>
            <td style="white-space:nowrap">${joined}</td>
            <td style="white-space:nowrap">${deleteBtn}</td>
          </tr>`;
      }

      // Manager view (read-only)
      return `
        <tr>
          <td>${escHtml(u.username)}</td>
          <td>${escHtml(u.email)}</td>
          <td>${escHtml(u.phone)}</td>
          <td><code style="background:rgba(79,142,247,0.1);padding:2px 6px;border-radius:4px;">${escHtml(u.license_plate)}</code></td>
          <td>${verified}</td>
          <td style="white-space:nowrap">${joined}</td>
        </tr>`;
    }).join('');

    // Attach admin event listeners
    if (role === 'admin') {
      tableBody.querySelectorAll('.role-select').forEach(sel => {
        sel.addEventListener('change', () => updateRole(Number(sel.dataset.id), sel.value));
      });
      tableBody.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteUser(Number(btn.dataset.id)));
      });
    }
  }

  // ── Update role ────────────────────────────────────────────────────────────
  async function updateRole(userId, newRole) {
    try {
      const res  = await fetch(`/api/dashboard/users/${userId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();

      if (!res.ok) {
        showAlert('error', data.error || 'Failed to update role');
        await loadUsers();
      } else {
        showAlert('success', `Role updated to "${newRole}"`);
        const user = allUsers.find(u => u.id === userId);
        if (user) user.role = newRole;
        renderStats(allUsers);
      }
    } catch {
      showAlert('error', 'Network error updating role');
    }
  }

  // ── Delete user ────────────────────────────────────────────────────────────
  async function deleteUser(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!confirm(`Delete user "${user?.username}"? This cannot be undone.`)) return;

    try {
      const res  = await fetch(`/api/dashboard/users/${userId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const data = await res.json();

      if (!res.ok) {
        showAlert('error', data.error || 'Failed to delete user');
      } else {
        showAlert('success', 'User deleted');
        allUsers = allUsers.filter(u => u.id !== userId);
        renderStats(allUsers);
        renderTable(allUsers);
      }
    } catch {
      showAlert('error', 'Network error deleting user');
    }
  }

  // ── Live search ────────────────────────────────────────────────────────────
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase();
    const filtered = q
      ? allUsers.filter(u =>
          u.username.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.license_plate.toLowerCase().includes(q)
        )
      : allUsers;
    renderTable(filtered);
  });

  // ── Logout ─────────────────────────────────────────────────────────────────
  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    window.location.href = '/login.html';
  });

  // ── Alert helper ───────────────────────────────────────────────────────────
  function showAlert(type, message) {
    alertEl.className = `alert alert-${type} show`;
    alertEl.textContent = message;
    setTimeout(() => { alertEl.className = 'alert'; }, 4000);
  }

  // ── XSS-safe HTML escape ───────────────────────────────────────────────────
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
