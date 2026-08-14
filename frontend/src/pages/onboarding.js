/**
 * StreamFlow — Onboarding & Wallet Connection Page
 * Real Stellar Desktop Extension (Freighter) and Testnet Account Connection.
 */

import {
  isFreighterAvailable,
  connectFreighter,
  connectSecretKey,
  fundWithFriendbot,
  getAccountBalance,
  truncateAddress,
  CONTRACTS,
} from '../stellar.js';
import { trackPageView, trackEvent } from '../analytics.js';
import { navigate } from '../router.js';

export function renderOnboarding(app) {
  trackPageView('/onboarding');

  let step = 1; // 1: connect wallet, 2: account status / fund, 3: select role
  let walletAddress = localStorage.getItem('streamflow_address') || '';
  let walletType = localStorage.getItem('streamflow_wallet_type') || 'freighter';
  let isLoading = false;
  let isFunding = false;
  let selectedRole = localStorage.getItem('streamflow_role') || '';
  let balance = 0;
  let freighterInstalled = false;
  let showSecretKeyInput = false;

  // Check if Freighter is available
  isFreighterAvailable().then((installed) => {
    freighterInstalled = installed;
    const badge = document.getElementById('freighter-status-badge');
    if (badge) {
      badge.innerHTML = installed
        ? '<span class="badge badge-active" style="font-size: 0.75rem;">Freighter Detected</span>'
        : '<span class="badge badge-paused" style="font-size: 0.75rem;">Extension Not Detected</span>';
    }
  });

  // If already connected, auto-check balance and jump to step 2 or 3
  if (walletAddress) {
    step = 2;
    getAccountBalance(walletAddress)
      .then((b) => {
        balance = b.xlm;
        const balEl = document.getElementById('account-bal-display');
        if (balEl) balEl.textContent = `${balance.toFixed(2)} XLM`;
      })
      .catch(() => {});
  }

  function render() {
    app.innerHTML = `
      <nav class="navbar">
        <div class="container">
          <a href="/" data-link class="navbar-brand">
            <img src="/logo.svg" alt="StreamFlow">
            <span>Stream<span class="gradient-text">Flow</span></span>
          </a>
          <div class="flex gap-md" style="align-items: center;">
            <div id="freighter-status-badge">
              ${freighterInstalled
                ? '<span class="badge badge-active" style="font-size: 0.75rem;">Freighter Detected</span>'
                : '<span class="badge badge-paused" style="font-size: 0.75rem;">Extension Not Detected</span>'}
            </div>
            <a href="/" data-link class="btn btn-ghost btn-sm">Home</a>
          </div>
        </div>
      </nav>

      <div class="onboarding">
        <div class="card onboarding-card">
          ${step === 1 ? renderStep1() : ''}
          ${step === 2 ? renderStep2() : ''}
          ${step === 3 ? renderStep3() : ''}
        </div>
      </div>
    `;

    attachListeners();
  }

  function renderStep1() {
    return `
      <div class="icon-large">🔐</div>
      <h2 style="margin-bottom: var(--space-xs);">Connect Stellar Wallet</h2>
      <p class="text-muted mb-lg" style="font-size: 0.9rem;">
        Connect your desktop wallet to access Soroban payroll contracts on Stellar Testnet.
      </p>

      <div class="flex flex-col gap-md">
        <button class="btn btn-primary btn-lg w-full" id="btn-connect-freighter" ${isLoading ? 'disabled' : ''}>
          ${isLoading ? '<span class="spinner"></span> Connecting...' : '🦊 Connect with Freighter Extension'}
        </button>

        <div class="card-flat" style="padding: var(--space-md); text-align: left;">
          <div class="flex flex-between mb-xs">
            <span class="font-semibold" style="font-size: 0.85rem;">Freighter Extension</span>
            <a href="https://www.freighter.app/" target="_blank" style="font-size: 0.8rem; color: var(--accent-cyan);">
              Install Extension ↗
            </a>
          </div>
          <p class="text-muted" style="font-size: 0.8rem; margin: 0;">
            Freighter is the official desktop browser extension for Stellar & Soroban.
          </p>
        </div>

        <div class="text-muted text-center" style="font-size: 0.8rem; margin: var(--space-xs) 0;">
          ──────── or ────────
        </div>

        ${!showSecretKeyInput ? `
          <button class="btn btn-outline w-full" id="btn-toggle-secret">
            🔑 Connect with Stellar Secret Key (Testnet)
          </button>
        ` : `
          <div class="form-group text-left">
            <label class="form-label">Stellar Testnet Secret Key (starts with S...)</label>
            <input type="password" class="form-input mono" id="input-secret-key"
              placeholder="S..." autocomplete="off">
            <button class="btn btn-outline w-full mt-sm" id="btn-submit-secret" ${isLoading ? 'disabled' : ''}>
              ${isLoading ? '<span class="spinner"></span>' : 'Authorize & Connect Key'}
            </button>
          </div>
        `}

        <div class="mt-md" style="font-size: 0.75rem; color: var(--text-muted);">
          🌐 Network: <strong>Stellar Testnet</strong><br>
          📜 Stream Contract: <span class="mono">${truncateAddress(CONTRACTS.STREAM)}</span>
        </div>
      </div>
    `;
  }

  function renderStep2() {
    return `
      <div class="icon-large">⚡</div>
      <h2 style="margin-bottom: var(--space-xs);">Wallet Connected</h2>
      <p class="text-muted mb-md" style="font-size: 0.85rem;">Connected to Stellar Testnet</p>

      <div class="wallet-status mb-md" style="text-align: left; word-break: break-all;">
        <div>
          <span class="text-muted" style="font-size: 0.75rem; display: block;">Public Address</span>
          <span class="mono font-semibold" style="color: var(--accent-emerald); font-size: 0.85rem;">${walletAddress}</span>
        </div>
      </div>

      <div class="card-flat mb-lg" style="padding: var(--space-md);">
        <div class="flex flex-between">
          <span class="text-muted" style="font-size: 0.85rem;">Testnet Balance</span>
          <span class="mono font-bold" id="account-bal-display" style="color: var(--accent-cyan); font-size: 1.1rem;">
            ${balance.toFixed(2)} XLM
          </span>
        </div>
      </div>

      <div class="flex flex-col gap-sm">
        <button class="btn btn-outline w-full" id="btn-friendbot" ${isFunding ? 'disabled' : ''}>
          ${isFunding ? '<span class="spinner"></span> Requesting Testnet XLM...' : '💧 Request 10,000 Testnet XLM (Friendbot)'}
        </button>

        <button class="btn btn-primary w-full" id="btn-go-roles">
          Continue to Role Selection →
        </button>

        <button class="btn btn-ghost btn-sm text-muted" id="btn-disconnect">
          Disconnect Wallet
        </button>
      </div>
    `;
  }

  function renderStep3() {
    return `
      <div class="icon-large">💼</div>
      <h2 style="margin-bottom: var(--space-xs);">Select Your Portal</h2>
      <p class="text-muted mb-lg" style="font-size: 0.9rem;">
        Choose which dashboard you want to access with <span class="mono text-accent">${truncateAddress(walletAddress)}</span>.
      </p>

      <div class="role-selector">
        <div class="role-option ${selectedRole === 'employer' ? 'selected' : ''}" data-role="employer">
          <div class="role-icon">🏢</div>
          <h4>Employer</h4>
          <p style="font-size: 0.8rem;" class="text-muted">Create payroll streams & manage treasury</p>
        </div>
        <div class="role-option ${selectedRole === 'employee' ? 'selected' : ''}" data-role="employee">
          <div class="role-icon">👷</div>
          <h4>Employee</h4>
          <p style="font-size: 0.8rem;" class="text-muted">View live earnings & withdraw instantly</p>
        </div>
      </div>

      <div class="flex flex-col gap-sm mt-lg">
        <button class="btn btn-primary btn-lg w-full" id="btn-launch-dashboard" ${!selectedRole ? 'disabled' : ''}>
          Launch Dashboard →
        </button>
        <button class="btn btn-ghost btn-sm text-muted" id="btn-back-step2">
          ← Back to Account Details
        </button>
      </div>
    `;
  }

  function attachListeners() {
    // 1. Connect Freighter Extension
    document.getElementById('btn-connect-freighter')?.addEventListener('click', async () => {
      isLoading = true;
      render();
      try {
        walletAddress = await connectFreighter();
        walletType = 'freighter';
        const bal = await getAccountBalance(walletAddress);
        balance = bal.xlm;
        step = 2;
        isLoading = false;
        showToast('Freighter wallet connected successfully!', 'success');
        render();
      } catch (err) {
        isLoading = false;
        showToast(err.message || 'Could not connect Freighter. Please make sure the extension is installed and unlocked.', 'error');
        render();
      }
    });

    // Toggle secret key option
    document.getElementById('btn-toggle-secret')?.addEventListener('click', () => {
      showSecretKeyInput = true;
      render();
    });

    // Connect with secret key
    document.getElementById('btn-submit-secret')?.addEventListener('click', async () => {
      const input = document.getElementById('input-secret-key')?.value;
      if (!input) {
        showToast('Please enter a valid Stellar secret key.', 'error');
        return;
      }

      isLoading = true;
      render();
      try {
        walletAddress = await connectSecretKey(input);
        walletType = 'secretKey';
        const bal = await getAccountBalance(walletAddress);
        balance = bal.xlm;
        step = 2;
        isLoading = false;
        showToast('Connected successfully!', 'success');
        render();
      } catch (err) {
        isLoading = false;
        showToast(err.message || 'Invalid Stellar secret key.', 'error');
        render();
      }
    });

    // 2. Fund with Friendbot
    document.getElementById('btn-friendbot')?.addEventListener('click', async () => {
      if (!walletAddress) return;
      isFunding = true;
      render();
      try {
        await fundWithFriendbot(walletAddress);
        const bal = await getAccountBalance(walletAddress);
        balance = bal.xlm;
        isFunding = false;
        showToast('Account funded with 10,000 Testnet XLM!', 'success');
        render();
      } catch (err) {
        isFunding = false;
        showToast(`Friendbot response: ${err.message}`, 'info');
        render();
      }
    });

    // Continue to roles
    document.getElementById('btn-go-roles')?.addEventListener('click', () => {
      step = 3;
      render();
    });

    // Disconnect
    document.getElementById('btn-disconnect')?.addEventListener('click', () => {
      localStorage.removeItem('streamflow_address');
      localStorage.removeItem('streamflow_wallet_type');
      localStorage.removeItem('streamflow_secret_key');
      localStorage.removeItem('streamflow_role');
      walletAddress = '';
      step = 1;
      showToast('Wallet disconnected', 'info');
      render();
    });

    // Role options
    document.querySelectorAll('[data-role]').forEach((el) => {
      el.addEventListener('click', () => {
        selectedRole = el.dataset.role;
        localStorage.setItem('streamflow_role', selectedRole);
        trackEvent('onboarding', 'role_selected', selectedRole);
        render();
      });
    });

    // Launch Dashboard
    document.getElementById('btn-launch-dashboard')?.addEventListener('click', () => {
      if (!selectedRole) {
        showToast('Please select a role to continue.', 'error');
        return;
      }
      localStorage.setItem('streamflow_role', selectedRole);
      navigate(selectedRole === 'employer' ? '/employer' : '/employee');
    });

    // Back to step 2
    document.getElementById('btn-back-step2')?.addEventListener('click', () => {
      step = 2;
      render();
    });
  }

  render();
}

function showToast(msg, type) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}
