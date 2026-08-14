/**
 * StreamFlow — Onboarding / Wallet Connect Page
 */

import {
  isFreighterInstalled, connectWallet, generateKeypair,
  fundWithFriendbot, getAccountBalance, truncateAddress, setDemoAddress,
} from '../stellar.js';
import { trackPageView, trackEvent } from '../analytics.js';
import { navigate } from '../router.js';
import { seedDemoData } from '../contracts.js';

export function renderOnboarding(app) {
  trackPageView('/onboarding');

  let step = 1; // 1: connect, 2: fund, 3: role select
  let walletAddress = '';
  let demoKeypair = null;
  let isLoading = false;
  let selectedRole = '';
  let balance = 0;

  function render() {
    app.innerHTML = `
      <nav class="navbar">
        <div class="container">
          <a href="/" data-link class="navbar-brand">
            <img src="/logo.svg" alt="StreamFlow">
            <span>Stream<span class="gradient-text">Flow</span></span>
          </a>
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
      <div class="icon-large">🔗</div>
      <h2 style="margin-bottom: var(--space-sm);">Connect Your Wallet</h2>
      <p class="text-muted mb-lg">Connect your Stellar wallet to start streaming payroll.</p>

      <div class="flex flex-col gap-md">
        ${isFreighterInstalled() ? `
          <button class="btn btn-primary w-full" id="btn-freighter" ${isLoading ? 'disabled' : ''}>
            ${isLoading ? '<span class="spinner"></span>' : '🦊'} Connect Freighter
          </button>
        ` : `
          <div class="card-flat" style="padding: var(--space-md); text-align: left;">
            <p style="font-size: 0.85rem; color: var(--accent-amber); margin-bottom: var(--space-sm);">
              ⚠️ Freighter wallet not detected
            </p>
            <p style="font-size: 0.8rem;" class="text-muted">
              <a href="https://www.freighter.app/" target="_blank">Install Freighter</a> for the full experience, or use Demo Mode below.
            </p>
          </div>
        `}

        <div class="text-muted" style="font-size: 0.85rem;">— or —</div>

        <button class="btn btn-outline w-full" id="btn-demo" ${isLoading ? 'disabled' : ''}>
          ${isLoading ? '<span class="spinner"></span>' : '🧪'} Demo Mode (Testnet)
        </button>

        <p class="text-muted" style="font-size: 0.75rem;">
          Demo mode generates a testnet keypair and funds it via Friendbot.
        </p>
      </div>
    `;
  }

  function renderStep2() {
    return `
      <div class="icon-large">✅</div>
      <h2 style="margin-bottom: var(--space-sm);">Wallet Connected</h2>

      <div class="wallet-status mb-lg">
        <span class="dot" style="width: 8px; height: 8px; border-radius: 50%; background: var(--accent-emerald); flex-shrink: 0;"></span>
        <span>${truncateAddress(walletAddress)}</span>
      </div>

      <div class="card-flat mb-lg" style="padding: var(--space-md);">
        <div class="flex flex-between">
          <span class="text-muted" style="font-size: 0.85rem;">Balance</span>
          <span class="mono font-semibold">${balance.toFixed(2)} XLM</span>
        </div>
      </div>

      ${isLoading ? `
        <div class="loading-overlay" style="padding: var(--space-lg);">
          <div class="spinner spinner-lg"></div>
          <span>Funding account via Friendbot...</span>
        </div>
      ` : `
        <button class="btn btn-primary w-full" id="btn-continue">
          Continue →
        </button>
      `}
    `;
  }

  function renderStep3() {
    return `
      <div class="icon-large">👤</div>
      <h2 style="margin-bottom: var(--space-sm);">Select Your Role</h2>
      <p class="text-muted mb-md">Choose how you'll use StreamFlow today.</p>

      <div class="role-selector">
        <div class="role-option ${selectedRole === 'employer' ? 'selected' : ''}" data-role="employer">
          <div class="role-icon">🏢</div>
          <h4>Employer</h4>
          <p style="font-size: 0.8rem;" class="text-muted">Create & manage payroll streams</p>
        </div>
        <div class="role-option ${selectedRole === 'employee' ? 'selected' : ''}" data-role="employee">
          <div class="role-icon">💼</div>
          <h4>Employee</h4>
          <p style="font-size: 0.8rem;" class="text-muted">View earnings & withdraw</p>
        </div>
      </div>

      <button class="btn btn-primary w-full mt-md" id="btn-launch" ${!selectedRole ? 'disabled' : ''}>
        Launch Dashboard →
      </button>
    `;
  }

  function attachListeners() {
    const freighterBtn = document.getElementById('btn-freighter');
    freighterBtn?.addEventListener('click', async () => {
      isLoading = true;
      render();
      try {
        walletAddress = await connectWallet();
        const bal = await getAccountBalance(walletAddress);
        balance = bal.xlm;
        step = 2;
        isLoading = false;
        render();
      } catch (err) {
        isLoading = false;
        showToast(err.message, 'error');
        render();
      }
    });

    const demoBtn = document.getElementById('btn-demo');
    demoBtn?.addEventListener('click', async () => {
      isLoading = true;
      render();
      try {
        demoKeypair = generateKeypair();
        walletAddress = demoKeypair.publicKey;
        setDemoAddress(walletAddress);
        step = 2;
        render();

        // Fund via Friendbot
        await fundWithFriendbot(walletAddress);
        const bal = await getAccountBalance(walletAddress);
        balance = bal.xlm;

        // Seed demo data
        const employeeKeypair = generateKeypair();
        seedDemoData(walletAddress, employeeKeypair.publicKey);

        isLoading = false;
        trackEvent('onboarding', 'demo_mode', walletAddress);
        render();
      } catch (err) {
        // Even if friendbot fails, continue with demo
        isLoading = false;
        balance = 10000;
        seedDemoData(walletAddress, 'GDEMO' + '0'.repeat(48) + 'EMPL');
        trackEvent('onboarding', 'demo_mode_offline', walletAddress);
        render();
      }
    });

    const continueBtn = document.getElementById('btn-continue');
    continueBtn?.addEventListener('click', () => {
      step = 3;
      render();
    });

    document.querySelectorAll('[data-role]').forEach(el => {
      el.addEventListener('click', () => {
        selectedRole = el.dataset.role;
        render();
      });
    });

    const launchBtn = document.getElementById('btn-launch');
    launchBtn?.addEventListener('click', () => {
      if (!selectedRole) return;
      localStorage.setItem('streamflow_role', selectedRole);
      localStorage.setItem('streamflow_address', walletAddress);
      trackEvent('onboarding', 'role_selected', selectedRole);
      navigate(selectedRole === 'employer' ? '/employer' : '/employee');
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
