/**
 * StreamFlow — Employee Dashboard
 * Real-time continuous streaming payroll with instant withdrawals, SEP-24 off-ramp, and income projections.
 */

import {
  getEmployeeStreams,
  getAccrued,
  withdrawFromStream,
  getTransactionHistory,
  exportPayrollCSV,
  calculateProjections,
} from '../contracts.js';
import {
  truncateAddress,
  CONTRACTS,
  getAccountBalance,
  disconnectWallet,
  getConnectedWalletType,
} from '../stellar.js';
import { trackPageView, trackEvent } from '../analytics.js';
import { renderOfframpSection, getSupportedCurrencies } from '../anchor.js';
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
  let showQRModal = false;
  let withdrawStreamId = null;
  let isWithdrawing = false;
  let employeeBalance = 0;
  let selectedCurrencyDisplay = 'XLM'; // 'XLM' | 'USD' | 'EUR'

  // Approximate FX conversion rates for display
  const XLM_TO_USD = 0.12;
  const XLM_TO_EUR = 0.11;

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
    let combinedRatePerSecond = 0;

    streams.forEach((s) => {
      const accrued = getAccrued(s.id);
      totalAccrued += accrued;
      totalWithdrawn += s.withdrawn;
      if (s.status === 'Active') {
        activeStreams++;
        combinedRatePerSecond += s.ratePerSecond;
      }
    });

    // Projections based on active streaming rate
    const projHourly = combinedRatePerSecond * 3600;
    const projDaily8h = projHourly * 8;
    const projWeekly = combinedRatePerSecond * 86400 * 7;
    const projMonthly = combinedRatePerSecond * 86400 * 30;

    // Converted display values
    let displayAmount = totalAccrued.toFixed(4);
    let currencySymbol = 'XLM';
    if (selectedCurrencyDisplay === 'USD') {
      displayAmount = `$${(totalAccrued * XLM_TO_USD).toFixed(4)}`;
      currencySymbol = 'USD';
    } else if (selectedCurrencyDisplay === 'EUR') {
      displayAmount = `€${(totalAccrued * XLM_TO_EUR).toFixed(4)}`;
      currencySymbol = 'EUR';
    }

    app.innerHTML = `
      <nav class="navbar">
        <div class="container navbar-container">
          <a href="/" data-link class="navbar-brand">
            <img src="/logo.svg" alt="StreamFlow" width="28" height="28">
            <span>Stream<span class="gradient-text">Flow</span></span>
          </a>
          <button class="mobile-menu-toggle" id="mobile-menu-toggle" aria-label="Toggle navigation">
            <span></span><span></span><span></span>
          </button>
          <ul class="navbar-nav" id="navbar-nav">
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
              <div class="flex gap-sm align-center" style="flex-wrap: wrap;">
                <h1>Employee Portal</h1>
                <span class="badge badge-active">Live Accrual</span>
              </div>
              <p class="text-muted" style="margin-top: 4px; word-break: break-all;">
                Wallet: <span class="mono text-accent">${address}</span>
              </p>
            </div>
            <div class="flex gap-sm dashboard-actions" style="flex-wrap: wrap;">
              <button class="btn btn-outline btn-sm" id="btn-share-qr" title="Show QR Code for employer to fund you">
                📱 Share Address
              </button>
              <button class="btn btn-outline btn-sm" id="btn-export-csv" title="Download CSV report of all wages received">
                📥 Export Pay Stubs
              </button>
            </div>
          </div>

          <!-- Live Streaming Balance Hero -->
          <div class="card live-balance mb-xl" style="position: relative; overflow: hidden;">
            <div class="flex flex-between" style="position: relative; z-index: 2;">
              <div class="label">Available Accrued Wages (Per-Second)</div>
              <!-- Currency Toggle -->
              <div class="flex gap-xs" style="background: rgba(0, 0, 0, 0.4); padding: 2px 6px; border-radius: var(--radius-full); border: 1px solid var(--border-subtle);">
                <button class="btn btn-xs ${selectedCurrencyDisplay === 'XLM' ? 'btn-primary' : 'btn-ghost'}" data-curr="XLM" style="padding: 2px 8px; font-size: 0.75rem;">XLM</button>
                <button class="btn btn-xs ${selectedCurrencyDisplay === 'USD' ? 'btn-primary' : 'btn-ghost'}" data-curr="USD" style="padding: 2px 8px; font-size: 0.75rem;">USD ($)</button>
                <button class="btn btn-xs ${selectedCurrencyDisplay === 'EUR' ? 'btn-primary' : 'btn-ghost'}" data-curr="EUR" style="padding: 2px 8px; font-size: 0.75rem;">EUR (€)</button>
              </div>
            </div>

            <div style="position: relative; z-index: 2; margin: var(--space-sm) 0;">
              <span class="amount font-mono font-bold" id="live-total-accrued" style="letter-spacing: -0.02em;">${displayAmount}</span>
              <span class="currency">${currencySymbol}</span>
            </div>

            <div class="rate" style="position: relative; z-index: 2;">
              ${activeStreams > 0
                ? `<span class="badge badge-active">🟢 Streaming +${combinedRatePerSecond.toFixed(4)} XLM/sec</span> • Withdrawable on Soroban anytime`
                : '<span class="badge badge-paused">No Active Incoming Streams</span>'}
            </div>
          </div>

          <!-- Stats Grid -->
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
              <div class="stat-label">Active Incoming Streams</div>
            </div>
            <div class="card stat-card">
              <div class="stat-value" id="employee-balance-val" style="color: var(--accent-violet);">
                ${employeeBalance ? employeeBalance.toFixed(2) + ' XLM' : '—'}
              </div>
              <div class="stat-label">Testnet Wallet Balance</div>
            </div>
          </div>

          <!-- Earnings Projection Breakdown Card -->
          ${activeStreams > 0 ? `
            <div class="card mb-xl" style="background: radial-gradient(ellipse at bottom, rgba(0, 200, 150, 0.06) 0%, rgba(12, 16, 32, 0.7) 100%);">
              <div class="flex flex-between mb-md">
                <h3 style="font-size: 1.1rem;">📈 Real-Time Earnings Projections</h3>
                <span class="text-muted" style="font-size: 0.8rem;">Rate: <strong class="mono text-success">+${(combinedRatePerSecond * 3600).toFixed(2)} XLM/hr</strong></span>
              </div>
              <div class="grid-4 gap-md text-center">
                <div class="card-flat" style="padding: var(--space-md);">
                  <div class="text-muted" style="font-size: 0.75rem;">Next 1 Hour</div>
                  <div class="mono font-bold text-accent" style="font-size: 1.25rem;">+${projHourly.toFixed(2)} XLM</div>
                  <div class="text-muted" style="font-size: 0.7rem;">~$${(projHourly * XLM_TO_USD).toFixed(2)}</div>
                </div>
                <div class="card-flat" style="padding: var(--space-md);">
                  <div class="text-muted" style="font-size: 0.75rem;">8-Hour Workday</div>
                  <div class="mono font-bold text-success" style="font-size: 1.25rem;">+${projDaily8h.toFixed(2)} XLM</div>
                  <div class="text-muted" style="font-size: 0.7rem;">~$${(projDaily8h * XLM_TO_USD).toFixed(2)}</div>
                </div>
                <div class="card-flat" style="padding: var(--space-md);">
                  <div class="text-muted" style="font-size: 0.75rem;">7 Days (Weekly)</div>
                  <div class="mono font-bold" style="font-size: 1.25rem;">+${projWeekly.toFixed(2)} XLM</div>
                  <div class="text-muted" style="font-size: 0.7rem;">~$${(projWeekly * XLM_TO_USD).toFixed(2)}</div>
                </div>
                <div class="card-flat" style="padding: var(--space-md);">
                  <div class="text-muted" style="font-size: 0.75rem;">30 Days (Monthly)</div>
                  <div class="mono font-bold text-emerald" style="font-size: 1.25rem;">+${projMonthly.toFixed(2)} XLM</div>
                  <div class="text-muted" style="font-size: 0.7rem;">~$${(projMonthly * XLM_TO_USD).toFixed(2)}</div>
                </div>
              </div>
            </div>
          ` : ''}

          <!-- Active Streams -->
          <div class="card mb-xl">
            <div class="flex flex-between mb-md">
              <h3 style="font-size: 1.1rem;">📡 Incoming Payroll Streams</h3>
              <span class="text-muted" style="font-size: 0.8rem;">
                Contract: <a href="https://stellar.expert/explorer/testnet/contract/${CONTRACTS.STREAM}" target="_blank" class="mono text-accent">${truncateAddress(CONTRACTS.STREAM)} ↗</a>
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
            <div class="flex flex-between mb-md">
              <h3 style="font-size: 1.1rem;">📋 Verified Activity & Receipts</h3>
              <span class="text-muted" style="font-size: 0.8rem;">Audited on Stellar Testnet</span>
            </div>
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
      ${showQRModal ? renderQRModal() : ''}
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
      <div class="card-flat" style="padding: var(--space-lg); border: 1px solid rgba(79, 125, 249, 0.15);">
        <div class="flex flex-between mb-md" style="flex-wrap: wrap; gap: var(--space-sm);">
          <div>
            <div class="flex gap-sm" style="align-items: center;">
              <span class="font-semibold" style="font-size: 1.05rem;">Stream #${s.id}</span>
              <span class="badge ${statusClass}">${s.status}</span>
              <span class="badge badge-outline">${s.token || 'XLM'}</span>
            </div>
            <div class="text-muted" style="font-size: 0.8rem; margin-top: 4px;">
              Employer: <a href="https://stellar.expert/explorer/testnet/account/${s.employer}" target="_blank" class="mono text-accent">${truncateAddress(s.employer)} ↗</a>
            </div>
          </div>
          ${s.status === 'Active' || s.status === 'Paused' ? `
            <button class="btn btn-success btn-sm" data-withdraw="${s.id}">
              💰 Instant Withdraw
            </button>
          ` : ''}
        </div>

        <div class="grid-4 gap-md mb-md">
          <div>
            <div class="text-muted" style="font-size: 0.75rem;">Streaming Rate</div>
            <div class="mono font-semibold">${s.ratePerSecond.toFixed(4)} ${s.token || 'XLM'}/s</div>
          </div>
          <div>
            <div class="text-muted" style="font-size: 0.75rem;">Live Accrued</div>
            <div class="mono font-semibold text-success" data-stream-accrued="${s.id}">
              ${accrued.toFixed(4)} ${s.token || 'XLM'}
            </div>
          </div>
          <div>
            <div class="text-muted" style="font-size: 0.75rem;">Total Withdrawn</div>
            <div class="mono font-semibold">${s.withdrawn.toFixed(4)} ${s.token || 'XLM'}</div>
          </div>
          <div>
            <div class="text-muted" style="font-size: 0.75rem;">Remaining in Escrow</div>
            <div class="mono font-semibold">${remaining.toFixed(4)} ${s.token || 'XLM'}</div>
          </div>
        </div>

        <div class="analytics-bar">
          <div class="fill" style="width: ${Math.min(progress, 100)}%;"></div>
        </div>
        <div class="flex flex-between text-muted mt-sm" style="font-size: 0.75rem;">
          <span>${progress.toFixed(1)}% stream settled</span>
          <span>End: ${new Date(s.endTime * 1000).toLocaleDateString()}</span>
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

          <div class="card-flat mb-md" style="padding: var(--space-md); text-align: center; background: rgba(0, 200, 150, 0.05); border: 1px solid rgba(0, 200, 150, 0.2);">
            <div class="text-muted" style="font-size: 0.8rem;">Current Accrued Balance</div>
            <div class="mono font-bold text-success" style="font-size: 1.8rem;">${maxAccrued.toFixed(4)} XLM</div>
            <div class="text-muted" style="font-size: 0.75rem;">Instant pro-rata settlement to your Stellar testnet wallet</div>
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

  function renderQRModal() {
    return `
      <div class="modal-overlay" id="modal-overlay">
        <div class="modal" style="max-width: 480px; text-align: center;">
          <div class="modal-header">
            <h3>📱 Share Receiving Address</h3>
            <button class="modal-close" id="modal-close">&times;</button>
          </div>

          <div class="flex flex-col gap-md" style="align-items: center;">
            <div style="background: white; padding: 16px; border-radius: 12px; display: inline-block;">
              <!-- Simulated QR Code SVG -->
              <svg width="180" height="180" viewBox="0 0 100 100">
                <rect width="100" height="100" fill="white"/>
                <rect x="10" y="10" width="25" height="25" fill="#0c1020"/>
                <rect x="15" y="15" width="15" height="15" fill="white"/>
                <rect x="18" y="18" width="9" height="9" fill="#0c1020"/>
                
                <rect x="65" y="10" width="25" height="25" fill="#0c1020"/>
                <rect x="70" y="15" width="15" height="15" fill="white"/>
                <rect x="73" y="18" width="9" height="9" fill="#0c1020"/>

                <rect x="10" y="65" width="25" height="25" fill="#0c1020"/>
                <rect x="15" y="70" width="15" height="15" fill="white"/>
                <rect x="18" y="73" width="9" height="9" fill="#0c1020"/>

                <!-- Pixel grid simulation -->
                <rect x="42" y="15" width="6" height="6" fill="#0c1020"/>
                <rect x="52" y="25" width="6" height="6" fill="#0c1020"/>
                <rect x="42" y="45" width="16" height="16" fill="#4f7df9"/>
                <rect x="65" y="45" width="6" height="6" fill="#0c1020"/>
                <rect x="75" y="55" width="6" height="6" fill="#0c1020"/>
                <rect x="45" y="75" width="6" height="6" fill="#0c1020"/>
                <rect x="55" y="85" width="6" height="6" fill="#0c1020"/>
                <rect x="70" y="75" width="12" height="12" fill="#0c1020"/>
              </svg>
            </div>

            <div class="card-flat w-full" style="padding: var(--space-md);">
              <div class="text-muted" style="font-size: 0.75rem; margin-bottom: 4px;">Your Stellar Testnet Public Key</div>
              <div class="mono text-accent" style="word-break: break-all; font-size: 0.8rem;">
                ${address}
              </div>
            </div>

            <button class="btn btn-primary w-full" id="btn-copy-address-modal">
              📋 Copy Public Key to Clipboard
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function attachListeners() {
    // Mobile menu toggle
    const menuToggle = document.getElementById('mobile-menu-toggle');
    const navbarNav = document.getElementById('navbar-nav');
    menuToggle?.addEventListener('click', () => {
      navbarNav?.classList.toggle('open');
      menuToggle.classList.toggle('active');
    });

    // Logout
    document.getElementById('nav-btn-disconnect')?.addEventListener('click', () => {
      disconnectWallet();
      navigate('/onboarding');
    });

    // Share QR trigger
    document.getElementById('btn-share-qr')?.addEventListener('click', () => {
      showQRModal = true;
      render();
    });

    // Copy in modal
    document.getElementById('btn-copy-address-modal')?.addEventListener('click', () => {
      navigator.clipboard.writeText(address);
      showToast('Address copied to clipboard!', 'success');
    });

    // Currency toggle in hero
    document.querySelectorAll('[data-curr]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedCurrencyDisplay = btn.dataset.curr;
        render();
      });
    });

    // CSV Export
    document.getElementById('btn-export-csv')?.addEventListener('click', () => {
      try {
        exportPayrollCSV(address, 'employee');
        showToast('Pay stubs CSV report downloaded!', 'success');
      } catch (err) {
        showToast(err.message || 'Export failed', 'error');
      }
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
      showQRModal = false;
      render();
    });

    document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay') {
        showWithdrawModal = false;
        showQRModal = false;
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
      if (totalEl) {
        if (selectedCurrencyDisplay === 'USD') {
          totalEl.textContent = `$${(total * XLM_TO_USD).toFixed(4)}`;
        } else if (selectedCurrencyDisplay === 'EUR') {
          totalEl.textContent = `€${(total * XLM_TO_EUR).toFixed(4)}`;
        } else {
          totalEl.textContent = total.toFixed(4);
        }
      }

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
