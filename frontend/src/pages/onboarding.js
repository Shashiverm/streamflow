/**
 * StreamFlow — Onboarding & Wallet Connection
 */

import {
  SUPPORTED_WALLETS,
  connectWallet,
  fundWithFriendbot,
  getAccountBalance,
  truncateAddress,
  CONTRACTS,
  getActiveSecretKey,
  disconnectWallet,
  isMobileDevice,
} from '../stellar.js';
import { trackPageView, trackEvent } from '../analytics.js';
import { navigate } from '../router.js';

export function renderOnboarding(app) {
  trackPageView('/onboarding');

  const isMobile = isMobileDevice();
  let step = 1;
  let walletAddress = localStorage.getItem('streamflow_address') || '';
  let walletType = localStorage.getItem('streamflow_wallet_type') || 'freighter';
  let isLoading = false;
  let connectingWalletId = null;
  let isFunding = false;
  let selectedRole = localStorage.getItem('streamflow_role') || '';
  let balance = 0;
  let activeTab = isMobile ? 'mobile' : 'all';
  let secretKeyInput = '';
  let showSecretInput = false;
  let showFreighterModal = false;
  let copiedText = '';
  let walletStatusMap = {};

  async function probeWallets() {
    for (const w of SUPPORTED_WALLETS) {
      try { walletStatusMap[w.id] = await w.isAvailable(); } catch { walletStatusMap[w.id] = false; }
    }
  }
  probeWallets();

  if (walletAddress) {
    step = 2;
    getAccountBalance(walletAddress)
      .then((b) => { balance = b.xlm; const el = document.getElementById('account-bal-display'); if (el) el.textContent = `${balance.toFixed(2)} XLM`; })
      .catch(() => {});
  }

  function render() {
    app.innerHTML = `
      <div id="toast-container" class="toast-container"></div>

      <nav class="navbar">
        <div class="container navbar-container">
          <a href="/" data-link class="navbar-brand">
            <img src="/logo.svg" alt="StreamFlow" width="30" height="30">
            <span>Stream<span class="gradient-text">Flow</span></span>
          </a>
          <div class="flex gap-sm align-center">
            ${walletAddress ? `
              <div class="nav-wallet-chip">
                <span class="dot"></span>
                <span class="chip-text">${truncateAddress(walletAddress)}</span>
                <span class="badge badge-active" style="font-size: 0.65rem;">${walletType.toUpperCase()}</span>
              </div>
            ` : ''}
            <a href="/" data-link class="btn btn-ghost btn-sm">Home</a>
          </div>
        </div>
      </nav>

      <div class="page" style="display: flex; align-items: center; justify-content: center; min-height: 100vh;">
        <div class="container" style="max-width: 640px; width: 100%;">
          <!-- Stepper -->
          <div class="flex flex-between align-center mb-xl" style="position: relative;">
            ${renderStep(1, 'Wallet')}
            <div style="flex: 1; height: 2px; background: ${step >= 2 ? 'var(--accent-mint)' : 'rgba(255,255,255,0.08)'}; margin-top: -18px;"></div>
            ${renderStep(2, 'Verify')}
            <div style="flex: 1; height: 2px; background: ${step >= 3 ? 'var(--accent-mint)' : 'rgba(255,255,255,0.08)'}; margin-top: -18px;"></div>
            ${renderStep(3, 'Portal')}
          </div>

          <div class="card card-gold" style="padding: var(--space-xl);">
            ${step === 1 ? renderStep1() : ''}
            ${step === 2 ? renderStep2() : ''}
            ${step === 3 ? renderStep3() : ''}
          </div>
        </div>
      </div>

      ${showFreighterModal ? renderFreighterMobileModal() : ''}
    `;

    attachListeners();
  }

  function renderStep(num, label) {
    const isActive = step >= num;
    const isDone = step > num;
    return `
      <div style="text-align: center; flex: 1;">
        <div style="width: 36px; height: 36px; border-radius: 50%; background: ${isActive ? 'var(--grad-primary)' : 'rgba(255,255,255,0.06)'}; color: #06080b; font-weight: bold; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 4px; box-shadow: ${isActive ? '0 0 12px rgba(52, 211, 153, 0.3)' : 'none'};">
          ${isDone ? '✓' : num}
        </div>
        <div style="font-size: 0.78rem; font-weight: 600; color: ${isActive ? 'var(--accent-mint)' : 'var(--text-muted)'};">${label}</div>
      </div>
    `;
  }

  function renderStep1() {
    return `
      <div class="text-center mb-lg" style="text-align: center;">
        <h2>Connect Wallet</h2>
        <p class="text-muted" style="font-size: 0.9rem;">
          Link your Stellar account to access streaming payroll contracts on Testnet.
        </p>
      </div>

      ${isMobile ? `
        <div class="card-flat mb-md" style="padding: var(--space-md); border-color: var(--glass-border-emerald); background: rgba(16, 185, 129, 0.05);">
          <div class="flex align-center gap-xs mb-xs">
            <strong style="font-size: 0.9rem; color: var(--accent-mint);">Quick Connect</strong>
          </div>
          <p style="font-size: 0.8rem; margin-bottom: var(--space-sm); color: var(--text-secondary);">
            Connect in-browser with <strong>Albedo</strong> or generate an instant testnet account.
          </p>
          <div class="grid-2 gap-xs">
            <button class="btn btn-primary btn-sm btn-connect-wallet" data-id="albedo" ${isLoading ? 'disabled' : ''}>
              ${isLoading && connectingWalletId === 'albedo' ? '<span class="spinner"></span>' : 'Albedo Web'}
            </button>
            <button class="btn btn-gold btn-sm btn-connect-wallet" data-id="instant" ${isLoading ? 'disabled' : ''}>
              ${isLoading && connectingWalletId === 'instant' ? '<span class="spinner"></span>' : 'Instant Demo'}
            </button>
          </div>
        </div>
      ` : ''}

      <div class="tab-group mb-md">
        <button class="tab-btn ${activeTab === 'mobile' ? 'active' : ''}" data-tab="mobile">Mobile & Web</button>
        <button class="tab-btn ${activeTab === 'all' ? 'active' : ''}" data-tab="all">All Wallets</button>
        <button class="tab-btn ${activeTab === 'extension' ? 'active' : ''}" data-tab="extension">Extensions</button>
        <button class="tab-btn ${activeTab === 'quick' ? 'active' : ''}" data-tab="quick">Instant</button>
      </div>

      <div class="flex flex-col gap-sm">
        ${renderWalletCards()}
      </div>

      <div class="mt-md pt-sm" style="border-top: 1px solid var(--border-subtle);">
        ${!showSecretInput ? `
          <button class="btn btn-ghost w-full" id="btn-toggle-secret-input" style="font-size: 0.85rem; width: 100%;">
            Or connect with a Secret Key
          </button>
        ` : `
          <div class="card-flat" style="padding: var(--space-md); text-align: left;">
            <div class="flex flex-between mb-xs">
              <label class="form-label" style="margin: 0; font-size: 0.85rem;">Stellar Secret Key (Testnet)</label>
              <button class="btn btn-ghost btn-sm" id="btn-close-secret-input" style="padding: 2px 6px;">&times;</button>
            </div>
            <p class="text-muted" style="font-size: 0.75rem; margin-bottom: var(--space-sm);">
              56-character key starting with 'S'
            </p>
            <input type="password" class="form-input mono mb-sm" id="input-custom-secret" placeholder="S..." value="${secretKeyInput}" autocomplete="off">
            <button class="btn btn-primary w-full" id="btn-submit-custom-secret" ${isLoading ? 'disabled' : ''}>
              ${isLoading && connectingWalletId === 'secretKey' ? 'Verifying...' : 'Connect'}
            </button>
          </div>
        `}
      </div>

      <div class="mt-md text-center" style="font-size: 0.75rem; color: var(--text-muted); text-align: center;">
        Network: <strong style="color: var(--accent-mint);">Stellar Testnet</strong> &middot; Contract: <span class="mono">${truncateAddress(CONTRACTS.STREAM)}</span>
      </div>
    `;
  }

  function renderWalletCards() {
    let filtered = SUPPORTED_WALLETS;
    if (activeTab === 'mobile') filtered = SUPPORTED_WALLETS.filter(w => w.id === 'albedo' || w.id === 'instant' || w.id === 'freighter');
    else if (activeTab === 'extension') filtered = SUPPORTED_WALLETS.filter(w => w.id === 'freighter' || w.id === 'xbull' || w.id === 'rabet' || w.id === 'hana');
    else if (activeTab === 'quick') filtered = SUPPORTED_WALLETS.filter(w => w.id === 'instant' || w.id === 'secretKey');

    return filtered.map((w) => {
      const isConnecting = isLoading && connectingWalletId === w.id;
      return `
        <div class="card-flat flex flex-between align-center" style="padding: var(--space-md); border-color: rgba(255,255,255,0.06); background: rgba(16, 20, 30, 0.6);">
          <div class="flex align-center gap-md" style="flex: 1; min-width: 0;">
            <div style="font-size: 1.6rem; width: 44px; height: 44px; border-radius: var(--radius-md); background: rgba(255,255,255,0.04); display: flex; align-items: center; justify-content: center;">
              ${w.icon}
            </div>
            <div style="text-align: left; min-width: 0;">
              <div class="flex align-center gap-xs" style="flex-wrap: wrap;">
                <span class="font-bold">${w.name}</span>
                <span class="badge ${w.id === 'albedo' || w.id === 'instant' ? 'badge-active' : 'badge-cliff'}" style="font-size: 0.65rem;">
                  ${w.badge}
                </span>
              </div>
              <p class="text-muted" style="font-size: 0.78rem; margin: 0;">${w.desc}</p>
            </div>
          </div>
          <div class="flex align-center gap-xs">
            <button class="btn ${w.id === 'instant' || w.id === 'albedo' ? 'btn-primary' : 'btn-outline'} btn-sm btn-connect-wallet" data-id="${w.id}" ${isLoading ? 'disabled' : ''}>
              ${isConnecting ? 'Connecting...' : 'Connect'}
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
      <div class="text-center mb-md" style="text-align: center;">
        <h2>Wallet Connected</h2>
        <div class="flex flex-center gap-xs mt-xs">
          <span class="badge badge-active">Testnet</span>
          <span class="badge badge-cliff">${walletType.toUpperCase()}</span>
        </div>
      </div>

      <div class="card-flat mb-md" style="padding: var(--space-md); text-align: left;">
        <div class="flex flex-between align-center mb-xs">
          <span class="text-muted" style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;">
            Public Address
          </span>
          <button class="btn btn-ghost btn-sm" id="btn-copy-address" style="font-size: 0.75rem; padding: 2px 8px;">
            ${copiedText === 'address' ? '✓ Copied' : 'Copy'}
          </button>
        </div>
        <div class="mono font-bold" style="color: var(--accent-mint); font-size: 0.88rem; word-break: break-all; line-height: 1.4;">
          ${walletAddress}
        </div>
      </div>

      ${isInstant && secret ? `
        <div class="card-flat mb-md" style="padding: var(--space-md); text-align: left; border-color: rgba(251, 191, 36, 0.3); background: rgba(251, 191, 36, 0.04);">
          <div class="flex flex-between align-center mb-xs">
            <span style="font-size: 0.75rem; color: var(--accent-gold); font-weight: 600;">
              Secret Key (Demo)
            </span>
            <button class="btn btn-ghost btn-sm" id="btn-copy-secret" style="font-size: 0.75rem; padding: 2px 8px;">
              ${copiedText === 'secret' ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <div class="mono text-muted" style="font-size: 0.75rem; word-break: break-all;">
            ${secret}
          </div>
        </div>
      ` : ''}

      <div class="card-flat mb-lg" style="padding: var(--space-md); text-align: left;">
        <div class="flex flex-between align-center">
          <div>
            <span class="text-muted" style="font-size: 0.8rem; display: block;">Testnet Balance</span>
            <span class="mono font-bold" id="account-bal-display" style="color: var(--accent-gold); font-size: 1.5rem;">
              ${balance.toFixed(2)} XLM
            </span>
          </div>
          <button class="btn btn-ghost btn-sm" id="btn-refresh-balance" title="Refresh">
            Refresh
          </button>
        </div>
      </div>

      <div class="flex flex-col gap-sm">
        <button class="btn btn-outline w-full" id="btn-friendbot" ${isFunding ? 'disabled' : ''}>
          ${isFunding ? 'Requesting XLM...' : 'Fund 10,000 Testnet XLM'}
        </button>

        <button class="btn btn-primary btn-lg w-full" id="btn-go-roles">
          Continue →
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
      <div class="text-center mb-md" style="text-align: center;">
        <h2>Select Portal</h2>
        <p class="text-muted" style="font-size: 0.9rem;">
          Choose how you'll use StreamFlow with <span class="mono" style="color: var(--accent-mint);">${truncateAddress(walletAddress)}</span>.
        </p>
      </div>

      <div class="grid-2 gap-md mb-lg">
        <div class="card-flat role-option ${selectedRole === 'employer' ? 'active' : ''}" data-role="employer" style="padding: var(--space-lg); cursor: pointer; border: 2px solid ${selectedRole === 'employer' ? 'var(--accent-mint)' : 'rgba(255,255,255,0.08)'}; background: ${selectedRole === 'employer' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 20, 30, 0.6)'};">
          <h3 style="font-size: 1.1rem; margin-bottom: 4px;">Employer</h3>
          <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: var(--space-sm);">
            Create payroll streams, manage cliff vesting, and fund treasury vaults.
          </p>
          <span class="badge badge-active">Manage Payroll</span>
        </div>

        <div class="card-flat role-option ${selectedRole === 'employee' ? 'active' : ''}" data-role="employee" style="padding: var(--space-lg); cursor: pointer; border: 2px solid ${selectedRole === 'employee' ? 'var(--accent-gold)' : 'rgba(255,255,255,0.08)'}; background: ${selectedRole === 'employee' ? 'rgba(251, 191, 36, 0.08)' : 'rgba(16, 20, 30, 0.6)'};">
          <h3 style="font-size: 1.1rem; margin-bottom: 4px;">Employee</h3>
          <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: var(--space-sm);">
            View accrual, batch claim earned wages, and off-ramp to fiat.
          </p>
          <span class="badge badge-cliff">Claim Earnings</span>
        </div>
      </div>

      <div class="flex flex-col gap-sm">
        <button class="btn btn-primary btn-lg w-full" id="btn-launch-dashboard" ${!selectedRole ? 'disabled' : ''}>
          Open Dashboard →
        </button>
        <button class="btn btn-ghost btn-sm text-muted" id="btn-back-step2">
          ← Back
        </button>
      </div>
    `;
  }

  function renderFreighterMobileModal() {
    const currentUrl = window.location.href;
    return `
      <div class="modal-backdrop" id="freighter-modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <h3 style="margin: 0;">Freighter Mobile</h3>
            <button class="modal-close" id="btn-close-freighter-modal">&times;</button>
          </div>

          <div class="mb-md">
            <p style="font-size: 0.85rem; color: var(--text-primary); margin-bottom: 6px;">
              Open this URL inside the Freighter app's DApp browser.
            </p>
          </div>

          <div class="flex flex-col gap-sm mb-md">
            <div class="card-flat" style="padding: var(--space-md); border-color: var(--glass-border-emerald); background: rgba(16, 185, 129, 0.06);">
              <span class="badge badge-active mb-xs" style="font-size: 0.68rem;">Freighter Browser</span>
              <div class="flex gap-xs mt-xs">
                <input type="text" readonly class="form-input mono" style="font-size: 0.78rem;" value="${currentUrl}" id="freighter-dapp-url">
                <button class="btn btn-primary btn-sm" id="btn-copy-dapp-url">
                  Copy
                </button>
              </div>
            </div>

            <div class="card-flat" style="padding: var(--space-md); border-color: var(--glass-border-gold); background: rgba(251, 191, 36, 0.06);">
              <span class="badge badge-cliff mb-xs" style="font-size: 0.68rem;">Alternative</span>
              <button class="btn btn-gold btn-sm w-full btn-connect-wallet mt-xs" data-id="albedo">
                Connect via Albedo
              </button>
            </div>
          </div>

          <button class="btn btn-ghost btn-sm w-full" id="btn-dismiss-freighter-modal">
            Close
          </button>
        </div>
      </div>
    `;
  }

  function attachListeners() {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => { activeTab = btn.dataset.tab; render(); });
    });

    document.querySelectorAll('.btn-connect-wallet').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const walletId = btn.dataset.id;
        if (!walletId) return;

        if (walletId === 'secretKey') { showSecretInput = true; render(); return; }

        if (walletId === 'freighter' && isMobile && (typeof window === 'undefined' || !window.freighterApi)) {
          showFreighterModal = true; render(); return;
        }

        isLoading = true; connectingWalletId = walletId; render();

        try {
          walletAddress = await connectWallet(walletId);
          walletType = walletId;
          const bal = await getAccountBalance(walletAddress);
          balance = bal.xlm;
          step = 2; isLoading = false; connectingWalletId = null; showFreighterModal = false;
          showToast(`Connected via ${walletId}`, 'success');
          render();
        } catch (err) {
          isLoading = false; connectingWalletId = null;
          if (err.message && (err.message.includes('FREIGHTER_MOBILE_GUIDANCE') || err.message.includes('Freighter extension not detected'))) {
            showFreighterModal = true; render();
          } else { showToast(err.message || `Failed to connect ${walletId}.`, 'error'); render(); }
        }
      });
    });

    document.getElementById('btn-close-freighter-modal')?.addEventListener('click', () => { showFreighterModal = false; render(); });
    document.getElementById('btn-dismiss-freighter-modal')?.addEventListener('click', () => { showFreighterModal = false; render(); });
    document.getElementById('freighter-modal-overlay')?.addEventListener('click', (e) => { if (e.target.id === 'freighter-modal-overlay') { showFreighterModal = false; render(); } });
    document.getElementById('btn-copy-dapp-url')?.addEventListener('click', () => { const u = document.getElementById('freighter-dapp-url'); if (u) { navigator.clipboard.writeText(u.value); showToast('URL copied', 'success'); } });

    document.getElementById('btn-toggle-secret-input')?.addEventListener('click', () => { showSecretInput = true; render(); });
    document.getElementById('btn-close-secret-input')?.addEventListener('click', () => { showSecretInput = false; render(); });

    document.getElementById('btn-submit-custom-secret')?.addEventListener('click', async () => {
      const input = document.getElementById('input-custom-secret')?.value;
      if (!input) { showToast('Enter a valid Stellar secret key starting with S.', 'error'); return; }
      isLoading = true; connectingWalletId = 'secretKey'; render();
      try {
        walletAddress = await connectWallet('secretKey', { secretKey: input });
        walletType = 'secretKey';
        const bal = await getAccountBalance(walletAddress);
        balance = bal.xlm; step = 2; isLoading = false; connectingWalletId = null;
        showToast('Connected', 'success'); render();
      } catch (err) { isLoading = false; connectingWalletId = null; showToast(err.message || 'Invalid secret key.', 'error'); render(); }
    });

    document.getElementById('btn-copy-address')?.addEventListener('click', () => {
      if (walletAddress) { navigator.clipboard.writeText(walletAddress); copiedText = 'address'; render(); setTimeout(() => { copiedText = ''; render(); }, 2000); }
    });

    document.getElementById('btn-copy-secret')?.addEventListener('click', () => {
      const secret = getActiveSecretKey();
      if (secret) { navigator.clipboard.writeText(secret); copiedText = 'secret'; render(); setTimeout(() => { copiedText = ''; render(); }, 2000); }
    });

    document.getElementById('btn-refresh-balance')?.addEventListener('click', async () => {
      if (!walletAddress) return;
      try { const bal = await getAccountBalance(walletAddress); balance = bal.xlm; const el = document.getElementById('account-bal-display'); if (el) el.textContent = `${balance.toFixed(2)} XLM`; showToast('Balance updated', 'success'); }
      catch { showToast('Could not fetch balance.', 'error'); }
    });

    document.getElementById('btn-friendbot')?.addEventListener('click', async () => {
      if (!walletAddress) return;
      isFunding = true; render();
      try {
        await fundWithFriendbot(walletAddress);
        const bal = await getAccountBalance(walletAddress);
        balance = bal.xlm; isFunding = false;
        showToast('Funded with 10,000 Testnet XLM', 'success'); render();
      } catch (err) { isFunding = false; showToast(`Friendbot: ${err.message}`, 'info'); render(); }
    });

    document.getElementById('btn-go-roles')?.addEventListener('click', () => { step = 3; render(); });
    document.getElementById('btn-change-wallet')?.addEventListener('click', () => { step = 1; render(); });

    document.getElementById('btn-disconnect')?.addEventListener('click', () => {
      disconnectWallet(); walletAddress = ''; step = 1;
      showToast('Wallet disconnected', 'info'); render();
    });

    document.querySelectorAll('.role-option').forEach((el) => {
      el.addEventListener('click', () => {
        selectedRole = el.dataset.role;
        localStorage.setItem('streamflow_role', selectedRole);
        trackEvent('onboarding', 'role_selected', selectedRole);
        render();
      });
    });

    document.getElementById('btn-launch-dashboard')?.addEventListener('click', () => {
      if (!selectedRole) { showToast('Select a portal first.', 'error'); return; }
      localStorage.setItem('streamflow_role', selectedRole);
      navigate(selectedRole === 'employer' ? '/employer' : '/employee');
    });

    document.getElementById('btn-back-step2')?.addEventListener('click', () => { step = 2; render(); });
  }

  render();
}

function showToast(msg, type) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'error' : 'success'}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}
