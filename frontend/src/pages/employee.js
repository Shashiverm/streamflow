/**
 * StreamFlow — Employee Dashboard
 * Real-time continuous streaming payroll with instant withdrawals and SEP-24 off-ramp.
 */

import {
  getEmployeeStreams,
  getAccrued,
  withdrawFromStream,
  getTransactionHistory,
} from '../contracts.js';
import {
  truncateAddress,
  CONTRACTS,
  getAccountBalance,
  disconnectWallet,
  getConnectedWalletType,
} from '../stellar.js';
import { trackPageView, trackEvent } from '../analytics.js';
import { renderOfframpSection } from '../anchor.js';
import { navigate } from '../router.js';

export function renderEmployee(app) {
  trackPageView('/employee');

  const address = localStorage.getItem('streamflow_address') || '';
  const walletType = getConnectedWalletType() || localStorage.getItem('streamflow_wallet_type') || 'wallet';
  if (!address) {
    navigate('/onboarding');
    return;
  }

  let intervals = [];
  let showWithdrawModal = false;
  let withdrawStreamId = null;
  let isWithdrawing = false;
  let employeeBalance = 0;

  getAccountBalance(address)
    .then((b) => {
      employeeBalance = b.xlm;
      const balEl = document.getElementById('employee-balance-val');
      if (balEl) balEl.textContent = `${employeeBalance.toFixed(2)} XLM`;
    })
    .catch(() => {});

  function render() {
    const streams = getEmployeeStreams(address);
    const txHistory = getTransactionHistory(address);

    let totalAccrued = 0;
    let totalWithdrawn = 0;
    let activeStreams = 0;

    streams.forEach((s) => {
      const accrued = getAccrued(s.id);
      totalAccrued += accrued;
      totalWithdrawn += s.withdrawn;
      if (s.status === 'Active') activeStreams++;
    });

    app.innerHTML = `
      <nav class="navbar">
        <div class="container">
          <a href="/" data-link class="navbar-brand">
            <img src="/logo.svg" alt="StreamFlow" width="28" height="28">
            <span>Stream<span class="gradient-text">Flow</span></span>
          </a>
          <ul class="navbar-nav">
            <li><a href="/employer" data-link>Employer</a></li>
            <li><a href="/employee" data-link class="active">Employee</a></li>
            <li>
              <div class="nav-wallet-chip" title="${address}">
                <span class="dot"></span>
                <span class="chip-text">${truncateAddress(address)}</span>
                <span class="chip-badge">${walletType.toUpperCase()}</span>
              </div>
            </li>
            <li>
              <button class="btn btn-ghost btn-sm text-danger" id="nav-btn-disconnect" title="Disconnect wallet">
                Logout
              </button>
            </li>
          </ul>
        </div>
      </nav>

      <div class="dashboard">
        <div class="container">
          <div class="dashboard-header flex flex-between" style="flex-wrap: wrap; gap: var(--space-md);">
            <div>
              <h1>Employee Portal</h1>
              <p class="text-muted">
                Wallet: <span class="mono text-accent">${address}</span>
              </p>
            </div>
            <div class="flex gap-sm">
              <a href="/employer" data-link class="btn btn-outline btn-sm">
                Switch to Employer View
              </a>
            </div>
          </div>

          <!-- Live Streaming Balance Hero -->
          <div class="card live-balance mb-xl">
            <div class="label">Available Accrued Balance</div>
            <div>
              <span class="amount" id="live-total-accrued">${totalAccrued.toFixed(4)}</span>
              <span class="currency">XLM</span>
            </div>
            <div class="rate">
              ${activeStreams > 0
                ? `<span class="badge badge-active">${activeStreams} Active Stream${activeStreams > 1 ? 's' : ''}</span> • Earning every second on Soroban`
                : '<span class="badge badge-paused">No Active Incoming Streams</span>'}
            </div>
          </div>

          <div class="stats-grid">
            <div class="card stat-card">
              <div class="stat-value streaming" id="stat-accrued">${totalAccrued.toFixed(2)}</div>
              <div class="stat-label">Accrued (Unwithdrawn)</div>
            </div>
            <div class="card stat-card">
              <div class="stat-value" style="color: var(--accent-cyan);">
                ${totalWithdrawn.toFixed(2)}
              </div>
              <div class="stat-label">Total Withdrawn</div>
            </div>
            <div class="card stat-card">
              <div class="stat-value gradient-text">${activeStreams}</div>
              <div class="stat-label">Active Streams</div>
            </div>
            <div class="card stat-card">
              <div class="stat-value" id="employee-balance-val" style="color: var(--accent-violet);">
                ${employeeBalance ? employeeBalance.toFixed(2) + ' XLM' : '—'}
              </div>
              <div class="stat-label">Wallet Balance</div>
            </div>
          </div>

          <!-- Active Streams -->
          <div class="card mb-xl">
            <div class="flex flex-between mb-md">
              <h3 style="font-size: 1.1rem;">📡 Incoming Payroll Streams</h3>
              <span class="text-muted" style="font-size: 0.8rem;">
                Contract: <span class="mono">${truncateAddress(CONTRACTS.STREAM)}</span>
              </span>
            </div>

            ${streams.length === 0 ? `
              <div class="empty-state">
                <div class="empty-icon">📭</div>
                <p>No streams assigned to your address yet.</p>
                <p class="text-muted" style="font-size: 0.85rem; margin-top: var(--space-xs);">
                  Share your public key with your employer:
                </p>
                <div class="wallet-status mt-sm" style="display: inline-flex; cursor: pointer;" id="copy-address-btn" title="Click to copy">
                  📋 ${address}
                </div>
              </div>
            ` : `
              <div class="flex flex-col gap-md">
                ${streams.map((s) => renderStreamCard(s)).join('')}
              </div>
            `}
          </div>

          <!-- Off-Ramp Section (SEP-24) -->
          <div class="mb-xl" id="offramp-section"></div>

          <!-- Transaction History -->
          <div class="card">
            <h3 style="font-size: 1.1rem; margin-bottom: var(--space-md);">📋 Verified Activity & Receipts</h3>
            ${txHistory.length === 0 ? `
              <div class="empty-state" style="padding: var(--space-lg);">
                <p class="text-muted">No transactions recorded yet.</p>
              </div>
            ` : `
              <div class="tx-list">
                ${txHistory.slice(0, 10).map((tx) => `
                  <div class="tx-item">
                    <div>
                      <div style="font-size: 0.85rem; font-weight: 500;">
                        ${tx.type === 'withdraw' ? '💰 Payroll Withdrawal' :
                          tx.type === 'create_stream' ? '📡 Stream Created' :
                          tx.type === 'cancel_stream' ? '⛔ Stream Cancelled' :
                          tx.type}
                      </div>
                      <div class="tx-hash">
                        <a href="https://stellar.expert/explorer/testnet/tx/${tx.txHash}" target="_blank" style="color: var(--accent-cyan);">
                          Tx: ${tx.txHash.slice(0, 14)}... ↗
                        </a>
                      </div>
                      <div class="tx-time">${new Date(tx.timestamp).toLocaleString()}</div>
                    </div>
                    <div style="text-align: right;">
                      ${tx.amount ? `<div class="tx-amount">+${Number(tx.amount).toFixed(4)} XLM</div>` : ''}
                      ${tx.streamId !== undefined ? `<div class="text-muted" style="font-size: 0.75rem;">Stream #${tx.streamId}</div>` : ''}
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>
      </div>

      ${showWithdrawModal ? renderWithdrawModal() : ''}
    `;

    // Render off-ramp section
    const offrampEl = document.getElementById('offramp-section');
    if (offrampEl) {
      renderOfframpSection(offrampEl, address, totalAccrued);
    }

    attachListeners();
    startLiveUpdates();
  }

  function renderStreamCard(s) {
    const accrued = getAccrued(s.id);
    const progress = s.totalFunded > 0 ? ((s.withdrawn + accrued) / s.totalFunded) * 100 : 0;
    const remaining = Math.max(0, s.totalFunded - s.withdrawn);

    const statusClass = {
      Active: 'badge-active',
      Paused: 'badge-paused',
      Cancelled: 'badge-cancelled',
      Completed: 'badge-completed',
    }[s.status] || '';

    return `
      <div class="card-flat" style="padding: var(--space-lg);">
        <div class="flex flex-between mb-md" style="flex-wrap: wrap; gap: var(--space-sm);">
          <div>
            <div class="flex gap-sm" style="align-items: center;">
              <span class="font-semibold" style="font-size: 1.05rem;">Stream #${s.id}</span>
              <span class="badge ${statusClass}">${s.status}</span>
            </div>
            <div class="text-muted" style="font-size: 0.8rem; margin-top: 4px;">
              Employer: <span class="mono">${truncateAddress(s.employer)}</span> • Token: <strong>${s.token}</strong>
            </div>
          </div>
          ${s.status === 'Active' || s.status === 'Paused' ? `
            <button class="btn btn-success btn-sm" data-withdraw="${s.id}">
              💰 Withdraw Accrued
            </button>
          ` : ''}
        </div>

        <div class="grid-4 gap-md mb-md">
          <div>
            <div class="text-muted" style="font-size: 0.75rem;">Streaming Rate</div>
            <div class="mono font-semibold">${s.ratePerSecond.toFixed(4)} XLM/s</div>
          </div>
          <div>
            <div class="text-muted" style="font-size: 0.75rem;">Live Accrued</div>
            <div class="mono font-semibold text-success" data-stream-accrued="${s.id}">
              ${accrued.toFixed(4)} XLM
            </div>
          </div>
          <div>
            <div class="text-muted" style="font-size: 0.75rem;">Total Withdrawn</div>
            <div class="mono font-semibold">${s.withdrawn.toFixed(4)} XLM</div>
          </div>
          <div>
            <div class="text-muted" style="font-size: 0.75rem;">Remaining Escrow</div>
            <div class="mono font-semibold">${remaining.toFixed(4)} XLM</div>
          </div>
        </div>

        <div class="analytics-bar">
          <div class="fill" style="width: ${Math.min(progress, 100)}%;"></div>
        </div>
        <div class="text-muted mt-sm" style="font-size: 0.75rem;">
          ${progress.toFixed(1)}% stream completed
        </div>
      </div>
    `;
  }

  function renderWithdrawModal() {
    const stream = getEmployeeStreams(address).find((s) => s.id === withdrawStreamId);
    if (!stream) return '';
    const maxAccrued = getAccrued(stream.id);

    return `
      <div class="modal-overlay" id="modal-overlay">
        <div class="modal">
          <div class="modal-header">
            <h3>Withdraw from Stream #${withdrawStreamId}</h3>
            <button class="modal-close" id="modal-close">&times;</button>
          </div>

          <div class="card-flat mb-md" style="padding: var(--space-md); text-align: center;">
            <div class="text-muted" style="font-size: 0.8rem;">Current Accrued Balance</div>
            <div class="mono font-bold text-success" style="font-size: 1.6rem;">${maxAccrued.toFixed(4)} XLM</div>
          </div>

          <div class="form-group mb-md">
            <label class="form-label">Withdrawal Amount (XLM)</label>
            <input type="number" class="form-input mono" id="withdraw-amount"
              placeholder="0.00" step="0.0001" min="0.0001" max="${maxAccrued}"
              value="${maxAccrued.toFixed(4)}">
          </div>

          <div class="flex gap-sm mb-md">
            <button class="btn btn-outline btn-sm" data-pct="25">25%</button>
            <button class="btn btn-outline btn-sm" data-pct="50">50%</button>
            <button class="btn btn-outline btn-sm" data-pct="75">75%</button>
            <button class="btn btn-outline btn-sm" data-pct="100">Max (100%)</button>
          </div>

          <button class="btn btn-success w-full" id="btn-submit-withdraw" ${isWithdrawing ? 'disabled' : ''}>
            ${isWithdrawing ? '<span class="spinner"></span> Confirming on Soroban...' : 'Confirm Withdrawal to Wallet'}
          </button>
        </div>
      </div>
    `;
  }

  function attachListeners() {
    // Logout
    document.getElementById('nav-btn-disconnect')?.addEventListener('click', () => {
      disconnectWallet();
      navigate('/onboarding');
    });

    // Copy address button
    document.getElementById('copy-address-btn')?.addEventListener('click', () => {
      navigator.clipboard.writeText(address);
      showToast('Address copied to clipboard!', 'success');
    });

    // Withdraw triggers
    document.querySelectorAll('[data-withdraw]').forEach((btn) => {
      btn.addEventListener('click', () => {
        withdrawStreamId = parseInt(btn.dataset.withdraw);
        showWithdrawModal = true;
        render();
      });
    });

    // Modal controls
    document.getElementById('modal-close')?.addEventListener('click', () => {
      showWithdrawModal = false;
      render();
    });

    document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay') {
        showWithdrawModal = false;
        render();
      }
    });

    // Percentage buttons
    document.querySelectorAll('[data-pct]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pct = parseInt(btn.dataset.pct);
        const maxAccrued = getAccrued(withdrawStreamId);
        const amount = (maxAccrued * pct) / 100;
        const input = document.getElementById('withdraw-amount');
        if (input) input.value = amount.toFixed(4);
      });
    });

    // Submit withdrawal
    document.getElementById('btn-submit-withdraw')?.addEventListener('click', async () => {
      const amount = parseFloat(document.getElementById('withdraw-amount')?.value);
      if (!amount || amount <= 0) {
        showToast('Please enter a valid amount greater than 0', 'error');
        return;
      }

      isWithdrawing = true;
      render();

      try {
        await withdrawFromStream(withdrawStreamId, amount, address);
        showWithdrawModal = false;
        isWithdrawing = false;
        showToast(`Successfully withdrew ${amount.toFixed(4)} XLM to your wallet!`, 'success');
        trackEvent('employee', 'withdraw', address, amount);
        render();
      } catch (err) {
        isWithdrawing = false;
        showToast(err.message || 'Withdrawal failed', 'error');
        render();
      }
    });
  }

  function startLiveUpdates() {
    intervals.forEach(clearInterval);
    intervals = [];

    const interval = setInterval(() => {
      // Update individual stream cards
      document.querySelectorAll('[data-stream-accrued]').forEach((el) => {
        const id = parseInt(el.dataset.streamAccrued);
        const accrued = getAccrued(id);
        el.textContent = `${accrued.toFixed(4)} XLM`;
      });

      // Update total accrued in hero
      const streams = getEmployeeStreams(address);
      let total = 0;
      streams.forEach((s) => {
        total += getAccrued(s.id);
      });

      const totalEl = document.getElementById('live-total-accrued');
      if (totalEl) totalEl.textContent = total.toFixed(4);

      const statEl = document.getElementById('stat-accrued');
      if (statEl) statEl.textContent = total.toFixed(2);
    }, 1000);

    intervals.push(interval);
  }

  render();

  return () => {
    intervals.forEach(clearInterval);
  };
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
