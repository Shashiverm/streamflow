/**
 * StreamFlow — Onboarding & Multi-Wallet Connection Page
 * Connects Freighter, Albedo (Web & Mobile), xBull, Rabet, Hana,
 * Instant 1-Click Testnet Demo Accounts, and Stellar Secret Keys.
 */

import {
  SUPPORTED_WALLETS,
  connectWallet,
  fundWithFriendbot,
  getAccountBalance,
  truncateAddress,
  CONTRACTS,
  getActiveSecretKey,
  getConnectedWalletType,
  disconnectWallet,
} from '../stellar.js';
import { trackPageView, trackEvent } from '../analytics.js';
import { navigate } from '../router.js';

export function renderOnboarding(app) {
  trackPageView('/onboarding');

  let step = 1; // 1: connect wallet, 2: account status / fund, 3: select role
  let walletAddress = localStorage.getItem('streamflow_address') || '';
  let walletType = localStorage.getItem('streamflow_wallet_type') || 'freighter';
  let isLoading = false;
  let connectingWalletId = null;
  let isFunding = false;
  let selectedRole = localStorage.getItem('streamflow_role') || '';
  let balance = 0;
  let activeTab = 'all'; // 'all' | 'mobile' | 'extension' | 'quick'
  let secretKeyInput = '';
  let showSecretInput = false;
  let copiedText = '';
  let walletStatusMap = {};

  // Probe wallet availability
  async function probeWallets() {
    for (const w of SUPPORTED_WALLETS) {
      try {
        walletStatusMap[w.id] = await w.isAvailable();
      } catch {
        walletStatusMap[w.id] = false;
      }
    }
  }
  probeWallets();

  // If already connected, auto-check balance and jump to step 2
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
      <div id="toast-container" class="toast-container"></div>

      <nav class="navbar">
        <div class="container navbar-container">
          <a href="/" data-link class="navbar-brand">
            <img src="/logo.svg" alt="StreamFlow" width="28" height="28">
            <span>Stream<span class="gradient-text">Flow</span></span>
          </a>
          <div class="flex gap-sm align-center">
            ${walletAddress ? `
              <div class="nav-wallet-chip">
                <span class="dot"></span>
                <span class="chip-text">${truncateAddress(walletAddress)}</span>
                <span class="chip-badge">${walletType.toUpperCase()}</span>
              </div>
            ` : ''}
            <a href="/" data-link class="btn btn-ghost btn-sm">Home</a>
          </div>
        </div>
      </nav>

      <div class="onboarding-wrapper">
        <div class="container" style="max-width: 680px; width: 100%;">
          <!-- Progress Stepper -->
          <div class="stepper mb-lg">
            <div class="step-item ${step >= 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}">
              <div class="step-circle">${step > 1 ? '✓' : '1'}</div>
              <div class="step-title">Connect Wallet</div>
            </div>
            <div class="step-line ${step >= 2 ? 'active' : ''}"></div>
            <div class="step-item ${step >= 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}">
              <div class="step-circle">${step > 2 ? '✓' : '2'}</div>
              <div class="step-title">Fund & Verify</div>
            </div>
            <div class="step-line ${step >= 3 ? 'active' : ''}"></div>
            <div class="step-item ${step >= 3 ? 'active' : ''}">
              <div class="step-circle">3</div>
              <div class="step-title">Select Portal</div>
            </div>
          </div>

          <div class="card onboarding-card">
            ${step === 1 ? renderStep1() : ''}
            ${step === 2 ? renderStep2() : ''}
            ${step === 3 ? renderStep3() : ''}
          </div>
        </div>
      </div>
    `;

    attachListeners();
  }

  function renderStep1() {
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    return `
      <div class="text-center mb-md">
        <div class="icon-large mb-xs">🔐</div>
        <h2>Connect Stellar Wallet</h2>
        <p class="text-muted" style="font-size: 0.9rem;">
          Choose your preferred wallet to access real Soroban streaming payroll on Stellar Testnet.
        </p>
      </div>

      ${isMobileDevice ? `
        <div class="mobile-wallet-tip mb-md">
          <span style="font-size: 1.1rem;">📱</span>
          <div style="font-size: 0.85rem; text-align: left;">
            <strong>Mobile User Detected:</strong> We recommend <strong>Albedo</strong> (opens in-browser, no download needed) or <strong>Instant Demo Account</strong> for instant 10,000 XLM testing.
          </div>
        </div>
      ` : ''}

      <!-- Filter Tabs -->
      <div class="wallet-tabs mb-md">
        <button class="wallet-tab-btn ${activeTab === 'all' ? 'active' : ''}" data-tab="all">All Wallets</button>
        <button class="wallet-tab-btn ${activeTab === 'mobile' ? 'active' : ''}" data-tab="mobile">Mobile & Web</button>
        <button class="wallet-tab-btn ${activeTab === 'extension' ? 'active' : ''}" data-tab="extension">Extensions</button>
        <button class="wallet-tab-btn ${activeTab === 'quick' ? 'active' : ''}" data-tab="quick">⚡ Instant Demo</button>
      </div>

      <!-- Wallet Options Grid -->
      <div class="wallet-list flex flex-col gap-sm">
        ${renderWalletCards()}
      </div>

      <!-- Secret Key Accordion -->
      <div class="mt-md pt-sm" style="border-top: 1px solid var(--border-subtle);">
        ${!showSecretInput ? `
          <button class="btn btn-ghost w-full" id="btn-toggle-secret-input" style="font-size: 0.85rem;">
            🔑 Or connect with a Stellar Secret Key / Seed
          </button>
        ` : `
          <div class="card-flat" style="padding: var(--space-md); text-align: left;">
            <div class="flex flex-between mb-xs">
              <label class="form-label" style="margin: 0; font-size: 0.85rem;">Stellar Secret Key (Testnet)</label>
              <button class="btn btn-ghost btn-sm" id="btn-close-secret-input" style="padding: 2px 6px;">✕</button>
            </div>
            <p class="text-muted" style="font-size: 0.75rem; margin-bottom: var(--space-sm);">
              56-character key starting with 'S'
            </p>
            <input type="password" class="form-input mono mb-sm" id="input-custom-secret"
              placeholder="S..." value="${secretKeyInput}" autocomplete="off">
            <button class="btn btn-outline w-full" id="btn-submit-custom-secret" ${isLoading ? 'disabled' : ''}>
              ${isLoading && connectingWalletId === 'secretKey' ? '<span class="spinner"></span> Verifying Key...' : 'Authorize & Connect Key'}
            </button>
          </div>
        `}
      </div>

      <div class="mt-md text-center" style="font-size: 0.75rem; color: var(--text-muted);">
        🌐 Network: <strong>Stellar Testnet</strong> • 📜 Soroban Stream: <span class="mono">${truncateAddress(CONTRACTS.STREAM)}</span>
      </div>
    `;
  }

  function renderWalletCards() {
    let filtered = SUPPORTED_WALLETS;
    if (activeTab === 'mobile') {
      filtered = SUPPORTED_WALLETS.filter(w => w.id === 'albedo' || w.id === 'instant' || w.id === 'freighter');
    } else if (activeTab === 'extension') {
      filtered = SUPPORTED_WALLETS.filter(w => w.id === 'freighter' || w.id === 'xbull' || w.id === 'rabet' || w.id === 'hana');
    } else if (activeTab === 'quick') {
      filtered = SUPPORTED_WALLETS.filter(w => w.id === 'instant' || w.id === 'secretKey');
    }

    return filtered.map((w) => {
      const isAvailable = walletStatusMap[w.id];
      const isConnectingThis = isLoading && connectingWalletId === w.id;

      return `
        <div class="wallet-option-card flex flex-between align-center" data-wallet-id="${w.id}">
          <div class="flex align-center gap-md" style="flex: 1; min-width: 0;">
            <div class="wallet-icon-box">${w.icon}</div>
            <div style="text-align: left; min-width: 0;">
              <div class="flex align-center gap-xs" style="flex-wrap: wrap;">
                <span class="font-semibold wallet-name">${w.name}</span>
                <span class="badge ${w.id === 'albedo' || w.id === 'instant' ? 'badge-active' : 'badge-neutral'}" style="font-size: 0.65rem;">
                  ${w.badge}
                </span>
              </div>
              <p class="wallet-desc text-muted">${w.desc}</p>
            </div>
          </div>

          <div class="flex align-center gap-xs wallet-action-area">
            ${w.installUrl && !isAvailable && w.id !== 'albedo' ? `
              <a href="${w.installUrl}" target="_blank" class="btn btn-ghost btn-sm wallet-install-link" style="font-size: 0.75rem;">
                Install ↗
              </a>
            ` : ''}
            <button class="btn ${w.id === 'instant' || w.id === 'albedo' ? 'btn-primary' : 'btn-outline'} btn-sm btn-connect-wallet"
              data-id="${w.id}" ${isLoading ? 'disabled' : ''}>
              ${isConnectingThis ? '<span class="spinner"></span>' : 'Connect'}
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderStep2() {
    const secret = getActiveSecretKey();
    const isInstant = walletType === 'instant';

    return `
      <div class="text-center mb-md">
        <div class="icon-large mb-xs">⚡</div>
        <h2>Wallet Connected</h2>
        <div class="flex flex-center gap-xs mt-xs">
          <span class="badge badge-active">Stellar Testnet</span>
          <span class="badge badge-neutral">${walletType.toUpperCase()}</span>
        </div>
      </div>

      <!-- Public Key Box -->
      <div class="card-flat mb-md" style="padding: var(--space-md); text-align: left;">
        <div class="flex flex-between align-center mb-xs">
          <span class="text-muted" style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;">
            Stellar Public Address
          </span>
          <button class="btn btn-ghost btn-sm" id="btn-copy-address" style="font-size: 0.75rem; padding: 2px 8px;">
            ${copiedText === 'address' ? '✓ Copied' : '📋 Copy'}
          </button>
        </div>
        <div class="mono font-bold" style="color: var(--accent-emerald); font-size: 0.85rem; word-break: break-all; line-height: 1.4;">
          ${walletAddress}
        </div>
      </div>

      ${isInstant && secret ? `
        <!-- Instant Secret Key Box -->
        <div class="card-flat mb-md" style="padding: var(--space-md); text-align: left; border-color: rgba(245, 158, 11, 0.3);">
          <div class="flex flex-between align-center mb-xs">
            <span style="font-size: 0.75rem; color: var(--accent-amber); font-weight: 600;">
              🔑 Auto-Generated Secret Key (Demo)
            </span>
            <button class="btn btn-ghost btn-sm" id="btn-copy-secret" style="font-size: 0.75rem; padding: 2px 8px;">
              ${copiedText === 'secret' ? '✓ Copied' : '📋 Copy'}
            </button>
          </div>
          <div class="mono text-muted" style="font-size: 0.75rem; word-break: break-all;">
            ${secret}
          </div>
        </div>
      ` : ''}

      <!-- Balance Card -->
      <div class="card-flat mb-lg" style="padding: var(--space-md); text-align: left;">
        <div class="flex flex-between align-center">
          <div>
            <span class="text-muted" style="font-size: 0.8rem; display: block;">Available Testnet Balance</span>
            <span class="mono font-bold" id="account-bal-display" style="color: var(--accent-cyan); font-size: 1.4rem;">
              ${balance.toFixed(2)} XLM
            </span>
          </div>
          <button class="btn btn-ghost btn-sm" id="btn-refresh-balance" title="Refresh balance">
            🔄 Refresh
          </button>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex flex-col gap-sm">
        <button class="btn btn-outline w-full" id="btn-friendbot" ${isFunding ? 'disabled' : ''}>
          ${isFunding ? '<span class="spinner"></span> Requesting 10,000 XLM...' : '💧 Fund 10,000 Testnet XLM (Friendbot)'}
        </button>

        <button class="btn btn-primary btn-lg w-full" id="btn-go-roles">
          Continue to Select Portal →
        </button>

        <div class="flex flex-between align-center mt-xs">
          <button class="btn btn-ghost btn-sm text-muted" id="btn-change-wallet">
            ← Switch Wallet
          </button>
          <button class="btn btn-ghost btn-sm text-danger" id="btn-disconnect">
            Disconnect
          </button>
        </div>
      </div>
    `;
  }

  function renderStep3() {
    return `
      <div class="text-center mb-md">
        <div class="icon-large mb-xs">💼</div>
        <h2>Select Your Portal</h2>
        <p class="text-muted" style="font-size: 0.9rem;">
          Select how you want to interact with StreamFlow using <span class="mono text-accent">${truncateAddress(walletAddress)}</span>.
        </p>
      </div>

      <div class="role-selector mb-lg">
        <div class="role-option ${selectedRole === 'employer' ? 'selected' : ''}" data-role="employer">
          <div class="role-icon">🏢</div>
          <h3 style="font-size: 1.1rem; margin-bottom: 4px;">Employer Portal</h3>
          <p style="font-size: 0.8rem;" class="text-muted">
            Create real-time Soroban payroll streams, top-up balances, manage corporate treasury.
          </p>
          <div class="role-tag">Manage Payroll</div>
        </div>

        <div class="role-option ${selectedRole === 'employee' ? 'selected' : ''}" data-role="employee">
          <div class="role-icon">👷</div>
          <h3 style="font-size: 1.1rem; margin-bottom: 4px;">Employee Portal</h3>
          <p style="font-size: 0.8rem;" class="text-muted">
            Watch salary accrue second-by-second, withdraw instantly, offramp via SEP-24 anchors.
          </p>
          <div class="role-tag">Accrue & Withdraw</div>
        </div>
      </div>

      <div class="flex flex-col gap-sm">
        <button class="btn btn-primary btn-lg w-full" id="btn-launch-dashboard" ${!selectedRole ? 'disabled' : ''}>
          Launch Portal →
        </button>
        <button class="btn btn-ghost btn-sm text-muted" id="btn-back-step2">
          ← Back to Account Details
        </button>
      </div>
    `;
  }

  function attachListeners() {
    // Tab switching
    document.querySelectorAll('.wallet-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        render();
      });
    });

    // Wallet connect triggers
    document.querySelectorAll('.btn-connect-wallet').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const walletId = btn.dataset.id;
        if (!walletId) return;

        if (walletId === 'secretKey') {
          showSecretInput = true;
          render();
          return;
        }

        isLoading = true;
        connectingWalletId = walletId;
        render();

        try {
          walletAddress = await connectWallet(walletId);
          walletType = walletId;
          const bal = await getAccountBalance(walletAddress);
          balance = bal.xlm;
          step = 2;
          isLoading = false;
          connectingWalletId = null;
          showToast(`Connected successfully via ${walletId.toUpperCase()}!`, 'success');
          render();
        } catch (err) {
          isLoading = false;
          connectingWalletId = null;
          showToast(err.message || `Failed to connect ${walletId}.`, 'error');
          render();
        }
      });
    });

    // Secret Key Toggle
    document.getElementById('btn-toggle-secret-input')?.addEventListener('click', () => {
      showSecretInput = true;
      render();
    });

    document.getElementById('btn-close-secret-input')?.addEventListener('click', () => {
      showSecretInput = false;
      render();
    });

    // Submit Secret Key
    document.getElementById('btn-submit-custom-secret')?.addEventListener('click', async () => {
      const input = document.getElementById('input-custom-secret')?.value;
      if (!input) {
        showToast('Please enter a valid 56-char Stellar secret key starting with S.', 'error');
        return;
      }

      isLoading = true;
      connectingWalletId = 'secretKey';
      render();

      try {
        walletAddress = await connectWallet('secretKey', { secretKey: input });
        walletType = 'secretKey';
        const bal = await getAccountBalance(walletAddress);
        balance = bal.xlm;
        step = 2;
        isLoading = false;
        connectingWalletId = null;
        showToast('Secret key connected successfully!', 'success');
        render();
      } catch (err) {
        isLoading = false;
        connectingWalletId = null;
        showToast(err.message || 'Invalid Stellar secret key.', 'error');
        render();
      }
    });

    // Copy address button
    document.getElementById('btn-copy-address')?.addEventListener('click', () => {
      if (walletAddress) {
        navigator.clipboard.writeText(walletAddress);
        copiedText = 'address';
        render();
        setTimeout(() => {
          copiedText = '';
          render();
        }, 2000);
      }
    });

    // Copy secret button
    document.getElementById('btn-copy-secret')?.addEventListener('click', () => {
      const secret = getActiveSecretKey();
      if (secret) {
        navigator.clipboard.writeText(secret);
        copiedText = 'secret';
        render();
        setTimeout(() => {
          copiedText = '';
          render();
        }, 2000);
      }
    });

    // Refresh balance
    document.getElementById('btn-refresh-balance')?.addEventListener('click', async () => {
      if (!walletAddress) return;
      try {
        const bal = await getAccountBalance(walletAddress);
        balance = bal.xlm;
        const balEl = document.getElementById('account-bal-display');
        if (balEl) balEl.textContent = `${balance.toFixed(2)} XLM`;
        showToast('Balance updated!', 'info');
      } catch {
        showToast('Could not fetch balance.', 'error');
      }
    });

    // Friendbot Funding
    document.getElementById('btn-friendbot')?.addEventListener('click', async () => {
      if (!walletAddress) return;
      isFunding = true;
      render();
      try {
        await fundWithFriendbot(walletAddress);
        const bal = await getAccountBalance(walletAddress);
        balance = bal.xlm;
        isFunding = false;
        showToast('Account successfully funded with 10,000 Testnet XLM!', 'success');
        render();
      } catch (err) {
        isFunding = false;
        showToast(`Friendbot note: ${err.message}`, 'info');
        render();
      }
    });

    // Continue to roles
    document.getElementById('btn-go-roles')?.addEventListener('click', () => {
      step = 3;
      render();
    });

    // Switch / change wallet
    document.getElementById('btn-change-wallet')?.addEventListener('click', () => {
      step = 1;
      render();
    });

    // Disconnect
    document.getElementById('btn-disconnect')?.addEventListener('click', () => {
      disconnectWallet();
      walletAddress = '';
      step = 1;
      showToast('Wallet disconnected', 'info');
      render();
    });

    // Role options selection
    document.querySelectorAll('.role-option').forEach((el) => {
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
        showToast('Please select either Employer or Employee portal.', 'error');
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
  setTimeout(() => toast.remove(), 4500);
}
