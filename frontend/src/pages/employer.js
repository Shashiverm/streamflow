/**
 * StreamFlow — Employer Dashboard
 * Enterprise Streaming Payroll, Batch Disbursement, Cliff Vesting & Treasury Management
 */

import {
  createStream,
  batchCreateStreams,
  getEmployerStreams,
  getAccrued,
  cancelStream,
  batchCancelStreams,
  pauseStream,
  batchPauseStreams,
  resumeStream,
  batchResumeStreams,
  topUpStream,
  getEmployerTreasury,
  createTreasury,
  depositToTreasury,
  withdrawFromTreasury,
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
import { navigate } from '../router.js';

export function renderEmployer(app) {
  trackPageView('/employer');

  const address = localStorage.getItem('streamflow_address') || '';
  const walletType = getConnectedWalletType() || localStorage.getItem('streamflow_wallet_type') || 'wallet';
  if (!address) {
    navigate('/onboarding');
    return;
  }

  let showCreateModal = false;
  let showBatchModal = false;
  let showTopUpModal = false;
  let showCalculatorModal = false;
  let showDepositModal = false;
  let showWithdrawTreasuryModal = false;
  let topUpStreamId = null;
  let intervals = [];
  let employerBalance = 0;
  let isSubmitting = false;
  let currentFilter = 'All';
  let searchQuery = '';
  let selectedStreamIds = new Set();

  // Calculator state
  let calcSalary = 6000;
  let calcMode = 'monthly';

  getAccountBalance(address)
    .then((b) => {
      employerBalance = b.xlm;
      const balEl = document.getElementById('employer-balance-val');
      if (balEl) balEl.textContent = `${employerBalance.toFixed(2)} XLM`;
    })
    .catch(() => {});

  function render() {
    intervals.forEach(clearInterval);
    intervals = [];

    const allStreams = getEmployerStreams(address);
    const treasury = getEmployerTreasury(address);

    let totalPaid = 0;
    let totalFunded = 0;
    let activeCount = 0;

    allStreams.forEach((s) => {
      totalFunded += s.totalFunded;
      totalPaid += s.withdrawn;
      if (s.status === 'Active' || s.status === 'Paused') activeCount++;
    });

    const filteredStreams = allStreams.filter((s) => {
      const matchesFilter = currentFilter === 'All' || s.status === currentFilter;
      const matchesSearch =
        searchQuery === '' ||
        s.employee.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.id.toString().includes(searchQuery);
      return matchesFilter && matchesSearch;
    });

    app.innerHTML = `
      <nav class="navbar">
        <div class="container navbar-container">
          <a href="/" data-link class="navbar-brand">
            <img src="/logo.svg" alt="StreamFlow" width="30" height="30">
            <span>Stream<span class="gradient-text">Flow</span></span>
          </a>
          <button class="mobile-menu-toggle" id="mobile-menu-toggle" aria-label="Toggle navigation">
            <span></span><span></span><span></span>
          </button>
          <ul class="navbar-nav" id="navbar-nav">
            <li><a href="/employer" data-link class="active">Employer</a></li>
            <li><a href="/employee" data-link>Employee</a></li>
            <li>
              <div class="nav-wallet-chip" title="${address}">
                <span class="dot"></span>
                <span class="chip-text">${truncateAddress(address)}</span>
                <span class="badge badge-active" style="font-size: 0.65rem;">${walletType.toUpperCase()}</span>
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

      <div class="page">
        <div class="container">
          <!-- Header Bar -->
          <div class="flex flex-between mb-xl" style="flex-wrap: wrap; gap: var(--space-md);">
            <div>
              <div class="flex gap-sm align-center" style="flex-wrap: wrap;">
                <h1>Enterprise Payroll & Streams</h1>
                <span class="badge badge-active">Soroban v22</span>
                <span class="badge badge-cliff">Batch Streaming</span>
              </div>
              <p class="text-muted" style="margin-top: 4px; word-break: break-all;">
                Employer Account: <span class="mono" style="color: var(--accent-mint);">${address}</span>
              </p>
            </div>

            <div class="flex gap-sm align-center" style="flex-wrap: wrap;">
              <button class="btn btn-outline btn-sm" id="btn-open-calculator">
                🧮 Rate Calculator
              </button>
              <button class="btn btn-outline btn-sm" id="btn-export-csv">
                📥 Export CSV
              </button>
              <button class="btn btn-gold btn-sm" id="btn-open-batch">
                📦 Batch Payroll (CSV)
              </button>
              <button class="btn btn-primary btn-sm" id="btn-create-stream">
                ＋ Create Stream
              </button>
            </div>
          </div>

          <!-- Stats Grid -->
          <div class="grid-4 gap-md mb-xl">
            <div class="card stat-card">
              <div class="stat-header">
                <span class="stat-label">Active Streams</span>
                <div class="stat-icon">⚡</div>
              </div>
              <div class="stat-value streaming">${activeCount}</div>
            </div>

            <div class="card stat-card card-gold">
              <div class="stat-header">
                <span class="stat-label">Total Allocated</span>
                <div class="stat-icon gold">💰</div>
              </div>
              <div class="stat-value gold-text">${totalFunded.toLocaleString()} XLM</div>
            </div>

            <div class="card stat-card">
              <div class="stat-header">
                <span class="stat-label">Disbursed Wages</span>
                <div class="stat-icon">💸</div>
              </div>
              <div class="stat-value" style="color: var(--accent-mint);">${totalPaid.toFixed(2)} XLM</div>
            </div>

            <div class="card stat-card card-gold">
              <div class="stat-header">
                <span class="stat-label">Wallet Balance</span>
                <div class="stat-icon gold">🪙</div>
              </div>
              <div class="stat-value" id="employer-balance-val" style="color: var(--accent-gold);">${employerBalance.toFixed(2)} XLM</div>
            </div>
          </div>

          <!-- Treasury Section -->
          <div class="card card-gold mb-xl" style="padding: var(--space-lg);">
            <div class="flex flex-between align-center mb-md" style="flex-wrap: wrap; gap: var(--space-sm);">
              <div>
                <div class="flex align-center gap-xs">
                  <span style="font-size: 1.2rem;">🏛️</span>
                  <h3 style="margin: 0;">Pooled Treasury Vault</h3>
                  <span class="badge badge-active">Multi-Stream Vault</span>
                </div>
                <p class="text-muted" style="font-size: 0.85rem; margin-top: 2px;">
                  Deposit liquidity once to back multiple contractor streams and batch distributions.
                </p>
              </div>

              <div class="flex gap-xs">
                ${treasury ? `
                  <button class="btn btn-outline btn-sm" id="btn-withdraw-treasury">
                    Withdraw
                  </button>
                  <button class="btn btn-gold btn-sm" id="btn-deposit-treasury">
                    ＋ Deposit Funds
                  </button>
                ` : `
                  <button class="btn btn-gold btn-sm" id="btn-init-treasury">
                    ⚡ Initialize Treasury
                  </button>
                `}
              </div>
            </div>

            ${treasury ? `
              <div class="grid-3 gap-md">
                <div class="card-flat" style="padding: var(--space-md); background: rgba(0, 0, 0, 0.3);">
                  <span class="text-muted" style="font-size: 0.78rem; text-transform: uppercase;">Total Vault Balance</span>
                  <div class="mono font-bold mt-xs" style="font-size: 1.3rem; color: var(--accent-gold);">${treasury.balance.toLocaleString()} XLM</div>
                </div>

                <div class="card-flat" style="padding: var(--space-md); background: rgba(0, 0, 0, 0.3);">
                  <span class="text-muted" style="font-size: 0.78rem; text-transform: uppercase;">Stream Allocations</span>
                  <div class="mono font-bold mt-xs" style="font-size: 1.3rem; color: var(--accent-mint);">${treasury.allocated.toLocaleString()} XLM</div>
                </div>

                <div class="card-flat" style="padding: var(--space-md); background: rgba(0, 0, 0, 0.3);">
                  <span class="text-muted" style="font-size: 0.78rem; text-transform: uppercase;">Unallocated Liquid Balance</span>
                  <div class="mono font-bold mt-xs" style="font-size: 1.3rem; color: #ffffff;">${(treasury.balance - treasury.allocated).toLocaleString()} XLM</div>
                </div>
              </div>
            ` : `
              <div class="text-center" style="padding: var(--space-md); background: rgba(0,0,0,0.2); border-radius: var(--radius-md);">
                <p class="text-muted" style="font-size: 0.85rem; margin: 0;">
                  No treasury vault initialized yet for this employer account. Click Initialize to enable pooled stream backing.
                </p>
              </div>
            `}
          </div>

          <!-- Streams Management Header & Search -->
          <div class="flex flex-between align-center mb-md" style="flex-wrap: wrap; gap: var(--space-sm);">
            <div class="flex gap-xs align-center flex-wrap">
              <span class="font-bold" style="font-size: 1.1rem;">Payroll Streams</span>
              <span class="badge badge-active">${allStreams.length} Total</span>
            </div>

            <div class="flex gap-sm align-center flex-wrap">
              <input type="text" class="form-input" id="stream-search" placeholder="Search by address or ID..." value="${searchQuery}" style="width: 240px; min-height: 38px; padding: 6px 12px; font-size: 0.85rem;">

              <div class="tab-group" style="margin: 0;">
                <button class="tab-btn ${currentFilter === 'All' ? 'active' : ''}" data-filter="All">All</button>
                <button class="tab-btn ${currentFilter === 'Active' ? 'active' : ''}" data-filter="Active">Active</button>
                <button class="tab-btn ${currentFilter === 'Paused' ? 'active' : ''}" data-filter="Paused">Paused</button>
                <button class="tab-btn ${currentFilter === 'Completed' ? 'active' : ''}" data-filter="Completed">Done</button>
              </div>
            </div>
          </div>

          <!-- Batch Action Toolbar (When Streams Selected) -->
          ${selectedStreamIds.size > 0 ? `
            <div class="batch-toolbar">
              <div class="flex align-center gap-sm">
                <span class="badge badge-cliff">${selectedStreamIds.size} Selected</span>
                <span style="font-size: 0.85rem; color: var(--text-secondary);">Perform batch operations:</span>
              </div>
              <div class="flex gap-xs">
                <button class="btn btn-outline btn-sm" id="btn-batch-pause">⏸ Pause Selected</button>
                <button class="btn btn-outline btn-sm" id="btn-batch-resume">▶ Resume Selected</button>
                <button class="btn btn-danger btn-sm" id="btn-batch-cancel">✕ Cancel Selected</button>
              </div>
            </div>
          ` : ''}

          <!-- Streams Table -->
          <div class="table-container mb-2xl">
            <table class="table">
              <thead>
                <tr>
                  <th style="width: 40px;">
                    <input type="checkbox" id="select-all-streams" ${selectedStreamIds.size === filteredStreams.length && filteredStreams.length > 0 ? 'checked' : ''}>
                  </th>
                  <th>ID</th>
                  <th>Recipient</th>
                  <th>Rate</th>
                  <th>Progress</th>
                  <th>Live Claimable</th>
                  <th>Cliff Schedule</th>
                  <th>Status</th>
                  <th style="text-align: right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${filteredStreams.length === 0 ? `
                  <tr>
                    <td colspan="9" style="text-align: center; padding: var(--space-2xl) 0;" class="text-muted">
                      No payroll streams found matching criteria.
                    </td>
                  </tr>
                ` : filteredStreams.map((s) => {
                  const accrued = getAccrued(s.id);
                  const progressPct = Math.min(100, Math.max(0, ((s.withdrawn + accrued) / s.totalFunded) * 100));
                  const isChecked = selectedStreamIds.has(s.id);

                  return `
                    <tr>
                      <td>
                        <input type="checkbox" class="stream-row-cb" data-id="${s.id}" ${isChecked ? 'checked' : ''}>
                      </td>
                      <td class="mono font-bold" style="color: var(--accent-mint);">#${s.id}</td>
                      <td>
                        <span class="mono" title="${s.employee}">${truncateAddress(s.employee)}</span>
                      </td>
                      <td class="mono">${s.ratePerSecond} <span class="text-muted" style="font-size: 0.75rem;">/s</span></td>
                      <td style="min-width: 140px;">
                        <div class="flex flex-between" style="font-size: 0.75rem; margin-bottom: 2px;">
                          <span>${progressPct.toFixed(1)}%</span>
                          <span class="text-muted">${(s.withdrawn + accrued).toFixed(1)} / ${s.totalFunded}</span>
                        </div>
                        <div class="progress-bar">
                          <div class="progress-fill ${s.status === 'Active' ? 'animated' : ''}" style="width: ${progressPct}%;"></div>
                        </div>
                      </td>
                      <td class="mono font-bold" style="color: var(--accent-mint);" id="live-accrued-${s.id}">
                        ${accrued.toFixed(4)} XLM
                      </td>
                      <td>
                        ${s.cliffTime > 0 ? `
                          <span class="badge badge-cliff" title="Cliff Date: ${new Date(s.cliffTime * 1000).toLocaleString()}">
                            ⏳ ${Math.round((s.cliffDuration || 0) / 86400)}d Cliff
                          </span>
                        ` : `
                          <span class="text-muted" style="font-size: 0.8rem;">Linear</span>
                        `}
                      </td>
                      <td>
                        <span class="badge badge-${s.status.toLowerCase()}">${s.status}</span>
                      </td>
                      <td style="text-align: right;">
                        <div class="flex gap-xs" style="justify-content: flex-end;">
                          ${s.status === 'Active' ? `
                            <button class="btn btn-outline btn-sm btn-action-pause" data-id="${s.id}" title="Pause Stream">⏸</button>
                            <button class="btn btn-outline btn-sm btn-action-topup" data-id="${s.id}" title="Top Up Stream">＋</button>
                            <button class="btn btn-danger btn-sm btn-action-cancel" data-id="${s.id}" title="Cancel & Settle Stream">✕</button>
                          ` : ''}
                          ${s.status === 'Paused' ? `
                            <button class="btn btn-primary btn-sm btn-action-resume" data-id="${s.id}" title="Resume Stream">▶</button>
                            <button class="btn btn-danger btn-sm btn-action-cancel" data-id="${s.id}" title="Cancel Stream">✕</button>
                          ` : ''}
                          ${s.status === 'Completed' || s.status === 'Cancelled' ? `
                            <span class="text-muted" style="font-size: 0.8rem;">Settled</span>
                          ` : ''}
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Single Stream Modal -->
      ${showCreateModal ? renderCreateStreamModal() : ''}

      <!-- Batch Stream Modal (CSV) -->
      ${showBatchModal ? renderBatchStreamModal() : ''}

      <!-- Top Up Modal -->
      ${showTopUpModal ? renderTopUpModal() : ''}

      <!-- Rate Calculator Modal -->
      ${showCalculatorModal ? renderCalculatorModal() : ''}

      <!-- Deposit Treasury Modal -->
      ${showDepositModal ? renderDepositModal() : ''}

      <!-- Withdraw Treasury Modal -->
      ${showWithdrawTreasuryModal ? renderWithdrawTreasuryModal() : ''}
    `;

    attachListeners();
    startLiveTickers(filteredStreams);
  }

  function renderCreateStreamModal() {
    return `
      <div class="modal-backdrop" id="modal-backdrop-create">
        <div class="modal-content">
          <div class="modal-header">
            <h3 style="margin: 0;">Create Real-Time Stream</h3>
            <button class="modal-close" id="btn-close-modal">✕</button>
          </div>

          <form id="form-create-stream">
            <div class="form-group">
              <label class="form-label">Recipient Stellar Address (Starts with G)</label>
              <input type="text" class="form-input mono" id="input-employee" placeholder="G..." required>
            </div>

            <div class="grid-2 gap-md">
              <div class="form-group">
                <label class="form-label">Flow Rate (Tokens / Sec)</label>
                <input type="number" step="0.000001" class="form-input mono" id="input-rate" placeholder="0.001" required>
              </div>

              <div class="form-group">
                <label class="form-label">Duration (Days)</label>
                <input type="number" class="form-input" id="input-duration-days" placeholder="30" value="30" required>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">
                <span>Vesting Cliff Period (Days, Optional)</span>
                <span class="text-muted" style="font-size: 0.75rem;">0 for instant streaming</span>
              </label>
              <input type="number" class="form-input" id="input-cliff-days" placeholder="0" value="0">
              <div class="form-hint">Tokens will not unlock until the cliff duration has elapsed.</div>
            </div>

            <div class="card-flat mb-md" style="padding: var(--space-md); background: rgba(0,0,0,0.3);">
              <div class="flex flex-between" style="font-size: 0.85rem;">
                <span class="text-muted">Total Funding Required:</span>
                <span class="mono font-bold" id="create-total-preview" style="color: var(--accent-mint);">0.00 XLM</span>
              </div>
            </div>

            <button type="submit" class="btn btn-primary btn-lg w-full" style="width: 100%;" ${isSubmitting ? 'disabled' : ''}>
              ${isSubmitting ? 'Funding & Checkpointing...' : '🚀 Fund & Launch Stream'}
            </button>
          </form>
        </div>
      </div>
    `;
  }

  function renderBatchStreamModal() {
    return `
      <div class="modal-backdrop" id="modal-backdrop-batch">
        <div class="modal-content" style="max-width: 680px;">
          <div class="modal-header">
            <div>
              <h3 style="margin: 0;">Enterprise Batch Payroll (CSV)</h3>
              <p class="text-muted" style="font-size: 0.8rem; margin: 0;">Disburse streaming contracts to multiple employees in one atomic call.</p>
            </div>
            <button class="modal-close" id="btn-close-batch">✕</button>
          </div>

          <div class="dropzone mb-md" id="csv-dropzone">
            <div style="font-size: 2.2rem; margin-bottom: var(--space-xs);">📄</div>
            <strong style="display: block; margin-bottom: 4px;">Click or Drag & Drop Payroll CSV</strong>
            <span class="text-muted" style="font-size: 0.8rem;">Columns: Address, RatePerSec, DurationDays, CliffDays</span>
            <input type="file" id="csv-file-input" accept=".csv" style="display: none;">
          </div>

          <div class="form-group mb-md">
            <label class="form-label">Or Paste CSV / Roster Rows</label>
            <textarea class="form-input mono" id="batch-text-input" rows="5" style="font-size: 0.8rem;" placeholder="GBZX..., 0.002, 30, 0&#10;GAY5..., 0.005, 60, 15"></textarea>
          </div>

          <div id="batch-preview-container" class="card-flat mb-md" style="padding: var(--space-md); background: rgba(0,0,0,0.3); display: none;">
            <div class="flex flex-between" style="font-size: 0.85rem;">
              <span>Parsed Streams: <strong id="batch-count-display">0</strong></span>
              <span>Total Batch Funding: <strong class="mono" id="batch-total-display" style="color: var(--accent-gold);">0 XLM</strong></span>
            </div>
          </div>

          <button class="btn btn-gold btn-lg w-full" id="btn-submit-batch" style="width: 100%;" ${isSubmitting ? 'disabled' : ''}>
            ${isSubmitting ? 'Creating Batch Streams...' : '🚀 Execute Batch Creation'}
          </button>
        </div>
      </div>
    `;
  }

  function renderTopUpModal() {
    return `
      <div class="modal-backdrop" id="modal-backdrop-topup">
        <div class="modal-content">
          <div class="modal-header">
            <h3 style="margin: 0;">Top Up Stream #${topUpStreamId}</h3>
            <button class="modal-close" id="btn-close-topup">✕</button>
          </div>

          <form id="form-topup">
            <div class="form-group mb-md">
              <label class="form-label">Additional Amount (XLM)</label>
              <input type="number" step="0.1" class="form-input mono" id="input-topup-amount" placeholder="500" required>
              <div class="form-hint">Extends stream duration proportionally at the existing flow rate.</div>
            </div>

            <button type="submit" class="btn btn-primary btn-lg w-full" style="width: 100%;" ${isSubmitting ? 'disabled' : ''}>
              ${isSubmitting ? 'Processing Top Up...' : 'Confirm Top Up'}
            </button>
          </form>
        </div>
      </div>
    `;
  }

  function renderCalculatorModal() {
    const proj = calculateProjections(calcSalary, calcMode);

    return `
      <div class="modal-backdrop" id="modal-backdrop-calc">
        <div class="modal-content">
          <div class="modal-header">
            <h3 style="margin: 0;">Salary & Stream Velocity Calculator</h3>
            <button class="modal-close" id="btn-close-calc">✕</button>
          </div>

          <div class="form-group mb-md">
            <label class="form-label">Base Salary (USD / XLM)</label>
            <input type="number" class="form-input mono" id="calc-input-salary" value="${calcSalary}">
          </div>

          <div class="card-flat mb-md" style="padding: var(--space-md); background: rgba(0,0,0,0.3);">
            <div class="flex flex-between mb-xs" style="font-size: 0.85rem;">
              <span class="text-muted">Per-Second Flow Rate:</span>
              <span class="mono font-bold text-accent">${proj.ratePerSecondContinuous.toFixed(7)} / s</span>
            </div>
            <div class="flex flex-between mb-xs" style="font-size: 0.85rem;">
              <span class="text-muted">Daily Stream Velocity:</span>
              <span class="mono font-semibold" style="color: var(--accent-gold);">${proj.dailyContinuous.toFixed(2)} / day</span>
            </div>
            <div class="flex flex-between" style="font-size: 0.85rem;">
              <span class="text-muted">Estimated Traditional Wire Fee:</span>
              <span class="text-danger font-semibold">$35.00 vs &lt; $0.00001 (Stellar)</span>
            </div>
          </div>

          <button class="btn btn-primary w-full" id="btn-apply-calc-rate" style="width: 100%;">
            Use This Rate in New Stream →
          </button>
        </div>
      </div>
    `;
  }

  function renderDepositModal() {
    return `
      <div class="modal-backdrop" id="modal-backdrop-deposit">
        <div class="modal-content">
          <div class="modal-header">
            <h3 style="margin: 0;">Deposit to Treasury Vault</h3>
            <button class="modal-close" id="btn-close-deposit">✕</button>
          </div>

          <form id="form-deposit">
            <div class="form-group mb-md">
              <label class="form-label">Deposit Amount (XLM)</label>
              <input type="number" step="1" class="form-input mono" id="input-deposit-amount" placeholder="2500" required>
            </div>

            <button type="submit" class="btn btn-gold btn-lg w-full" style="width: 100%;" ${isSubmitting ? 'disabled' : ''}>
              ${isSubmitting ? 'Depositing Liquidity...' : 'Confirm Deposit'}
            </button>
          </form>
        </div>
      </div>
    `;
  }

  function renderWithdrawTreasuryModal() {
    const treasury = getEmployerTreasury(address);
    const available = treasury ? treasury.balance - treasury.allocated : 0;

    return `
      <div class="modal-backdrop" id="modal-backdrop-withdraw-tr">
        <div class="modal-content">
          <div class="modal-header">
            <h3 style="margin: 0;">Withdraw from Treasury Vault</h3>
            <button class="modal-close" id="btn-close-withdraw-tr">✕</button>
          </div>

          <form id="form-withdraw-treasury">
            <div class="card-flat mb-md" style="padding: var(--space-md); background: rgba(0,0,0,0.3);">
              <span class="text-muted" style="font-size: 0.78rem;">Available Unallocated Liquidity:</span>
              <div class="mono font-bold" style="color: var(--accent-mint); font-size: 1.2rem;">${available.toLocaleString()} XLM</div>
            </div>

            <div class="form-group mb-md">
              <label class="form-label">Withdrawal Amount (XLM)</label>
              <input type="number" step="1" max="${available}" class="form-input mono" id="input-withdraw-tr-amount" placeholder="${available}" required>
            </div>

            <button type="submit" class="btn btn-primary btn-lg w-full" style="width: 100%;" ${isSubmitting ? 'disabled' : ''}>
              ${isSubmitting ? 'Withdrawing...' : 'Confirm Withdrawal'}
            </button>
          </form>
        </div>
      </div>
    `;
  }

  function startLiveTickers(streams) {
    const interval = setInterval(() => {
      streams.forEach((s) => {
        if (s.status === 'Active') {
          const el = document.getElementById(`live-accrued-${s.id}`);
          if (el) {
            const accrued = getAccrued(s.id);
            el.textContent = `${accrued.toFixed(4)} XLM`;
          }
        }
      });
    }, 200);
    intervals.push(interval);
  }

  function attachListeners() {
    // Search input
    document.getElementById('stream-search')?.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      render();
    });

    // Filter tabs
    document.querySelectorAll('.tab-btn[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentFilter = btn.dataset.filter;
        render();
      });
    });

    // Select All
    document.getElementById('select-all-streams')?.addEventListener('change', (e) => {
      const allStreams = getEmployerStreams(address);
      if (e.target.checked) {
        allStreams.forEach((s) => selectedStreamIds.add(s.id));
      } else {
        selectedStreamIds.clear();
      }
      render();
    });

    // Row selection checkboxes
    document.querySelectorAll('.stream-row-cb').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const id = parseInt(cb.dataset.id);
        if (e.target.checked) {
          selectedStreamIds.add(id);
        } else {
          selectedStreamIds.delete(id);
        }
        render();
      });
    });

    // Batch Actions
    document.getElementById('btn-batch-pause')?.addEventListener('click', async () => {
      if (selectedStreamIds.size === 0) return;
      try {
        await batchPauseStreams(address, Array.from(selectedStreamIds));
        selectedStreamIds.clear();
        showToast('Selected streams paused!', 'success');
        render();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    document.getElementById('btn-batch-resume')?.addEventListener('click', async () => {
      if (selectedStreamIds.size === 0) return;
      try {
        await batchResumeStreams(address, Array.from(selectedStreamIds));
        selectedStreamIds.clear();
        showToast('Selected streams resumed!', 'success');
        render();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    document.getElementById('btn-batch-cancel')?.addEventListener('click', async () => {
      if (selectedStreamIds.size === 0) return;
      if (!confirm(`Are you sure you want to cancel ${selectedStreamIds.size} streams? Pro-rata settlement will be performed.`)) return;
      try {
        await batchCancelStreams(address, Array.from(selectedStreamIds));
        selectedStreamIds.clear();
        showToast('Selected streams cancelled & settled!', 'success');
        render();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    // Create Stream modal triggers
    document.getElementById('btn-create-stream')?.addEventListener('click', () => {
      showCreateModal = true;
      render();
    });
    document.getElementById('btn-close-modal')?.addEventListener('click', () => {
      showCreateModal = false;
      render();
    });

    // Batch Stream modal triggers
    document.getElementById('btn-open-batch')?.addEventListener('click', () => {
      showBatchModal = true;
      render();
    });
    document.getElementById('btn-close-batch')?.addEventListener('click', () => {
      showBatchModal = false;
      render();
    });

    // Rate Calculator modal triggers
    document.getElementById('btn-open-calculator')?.addEventListener('click', () => {
      showCalculatorModal = true;
      render();
    });
    document.getElementById('btn-close-calc')?.addEventListener('click', () => {
      showCalculatorModal = false;
      render();
    });

    // Export CSV
    document.getElementById('btn-export-csv')?.addEventListener('click', () => {
      try {
        exportPayrollCSV(address, 'employer');
        showToast('Audit CSV downloaded!', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    // Single Stream Form Submit
    document.getElementById('form-create-stream')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const employee = document.getElementById('input-employee')?.value.trim();
      const rate = parseFloat(document.getElementById('input-rate')?.value);
      const durationDays = parseFloat(document.getElementById('input-duration-days')?.value);
      const cliffDays = parseFloat(document.getElementById('input-cliff-days')?.value) || 0;

      if (!employee || isNaN(rate) || isNaN(durationDays)) {
        showToast('Please fill all required fields.', 'error');
        return;
      }

      isSubmitting = true;
      render();

      try {
        const durationSeconds = durationDays * 86400;
        const cliffSeconds = cliffDays * 86400;
        await createStream(address, employee, 'XLM', rate, durationSeconds, cliffSeconds);
        isSubmitting = false;
        showCreateModal = false;
        showToast('Payroll stream successfully created on Soroban!', 'success');
        render();
      } catch (err) {
        isSubmitting = false;
        showToast(err.message, 'error');
        render();
      }
    });

    // Batch CSV File / Text Processing
    const dropzone = document.getElementById('csv-dropzone');
    const fileInput = document.getElementById('csv-file-input');
    const batchTextInput = document.getElementById('batch-text-input');

    dropzone?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          if (batchTextInput) {
            batchTextInput.value = evt.target.result;
            parseAndPreviewBatch(evt.target.result);
          }
        };
        reader.readAsText(file);
      }
    });

    batchTextInput?.addEventListener('input', (e) => {
      parseAndPreviewBatch(e.target.value);
    });

    function parseAndPreviewBatch(rawText) {
      const lines = rawText.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.toLowerCase().startsWith('address'));
      let totalFunded = 0;
      let validCount = 0;

      lines.forEach((line) => {
        const parts = line.split(',').map((p) => p.trim());
        if (parts.length >= 3) {
          const rate = parseFloat(parts[1]);
          const days = parseFloat(parts[2]);
          if (!isNaN(rate) && !isNaN(days)) {
            totalFunded += rate * days * 86400;
            validCount++;
          }
        }
      });

      const previewBox = document.getElementById('batch-preview-container');
      const countEl = document.getElementById('batch-count-display');
      const totalEl = document.getElementById('batch-total-display');

      if (previewBox && validCount > 0) {
        previewBox.style.display = 'block';
        if (countEl) countEl.textContent = validCount;
        if (totalEl) totalEl.textContent = `${totalFunded.toLocaleString()} XLM`;
      }
    }

    // Submit Batch Creation
    document.getElementById('btn-submit-batch')?.addEventListener('click', async () => {
      const rawText = batchTextInput?.value || '';
      const lines = rawText.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.toLowerCase().startsWith('address'));

      if (lines.length === 0) {
        showToast('Please provide valid batch payroll rows.', 'error');
        return;
      }

      const streamsData = [];
      for (const line of lines) {
        const parts = line.split(',').map((p) => p.trim());
        if (parts.length < 3) continue;
        const employee = parts[0];
        const rate = parseFloat(parts[1]);
        const days = parseFloat(parts[2]);
        const cliffDays = parts[3] ? parseFloat(parts[3]) : 0;

        streamsData.push({
          employee,
          tokenSymbol: 'XLM',
          ratePerSecond: rate,
          durationSeconds: days * 86400,
          cliffSeconds: cliffDays * 86400,
        });
      }

      isSubmitting = true;
      render();

      try {
        await batchCreateStreams(address, streamsData);
        isSubmitting = false;
        showBatchModal = false;
        showToast(`Successfully created ${streamsData.length} batch streams!`, 'success');
        render();
      } catch (err) {
        isSubmitting = false;
        showToast(err.message, 'error');
        render();
      }
    });

    // Top Up triggers
    document.querySelectorAll('.btn-action-topup').forEach((btn) => {
      btn.addEventListener('click', () => {
        topUpStreamId = parseInt(btn.dataset.id);
        showTopUpModal = true;
        render();
      });
    });

    document.getElementById('btn-close-topup')?.addEventListener('click', () => {
      showTopUpModal = false;
      render();
    });

    document.getElementById('form-topup')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = parseFloat(document.getElementById('input-topup-amount')?.value);
      if (isNaN(amount) || amount <= 0) return;

      isSubmitting = true;
      render();
      try {
        await topUpStream(topUpStreamId, amount, address);
        isSubmitting = false;
        showTopUpModal = false;
        showToast('Stream topped up successfully!', 'success');
        render();
      } catch (err) {
        isSubmitting = false;
        showToast(err.message, 'error');
        render();
      }
    });

    // Pause Stream
    document.querySelectorAll('.btn-action-pause').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const sId = parseInt(btn.dataset.id);
        try {
          await pauseStream(sId, address);
          showToast(`Stream #${sId} paused`, 'info');
          render();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    // Resume Stream
    document.querySelectorAll('.btn-action-resume').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const sId = parseInt(btn.dataset.id);
        try {
          await resumeStream(sId, address);
          showToast(`Stream #${sId} resumed`, 'success');
          render();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    // Cancel Stream
    document.querySelectorAll('.btn-action-cancel').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const sId = parseInt(btn.dataset.id);
        if (!confirm(`Cancel Stream #${sId}? Employee will receive unwithdrawn accrued tokens; remaining balance will be refunded to you.`)) return;
        try {
          const res = await cancelStream(sId, address);
          showToast(`Stream cancelled. Refunded: ${res.employerRefund.toFixed(2)} XLM`, 'success');
          render();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    // Treasury Init
    document.getElementById('btn-init-treasury')?.addEventListener('click', async () => {
      try {
        await createTreasury(address, 'XLM');
        showToast('Treasury Vault initialized!', 'success');
        render();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    // Treasury Deposit
    document.getElementById('btn-deposit-treasury')?.addEventListener('click', () => {
      showDepositModal = true;
      render();
    });
    document.getElementById('btn-close-deposit')?.addEventListener('click', () => {
      showDepositModal = false;
      render();
    });

    document.getElementById('form-deposit')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = parseFloat(document.getElementById('input-deposit-amount')?.value);
      if (isNaN(amount) || amount <= 0) return;

      const treasury = getEmployerTreasury(address);
      if (!treasury) return;

      isSubmitting = true;
      render();
      try {
        await depositToTreasury(treasury.id, amount, address);
        isSubmitting = false;
        showDepositModal = false;
        showToast(`Deposited ${amount} XLM into Treasury Vault!`, 'success');
        render();
      } catch (err) {
        isSubmitting = false;
        showToast(err.message, 'error');
        render();
      }
    });

    // Treasury Withdraw
    document.getElementById('btn-withdraw-treasury')?.addEventListener('click', () => {
      showWithdrawTreasuryModal = true;
      render();
    });
    document.getElementById('btn-close-withdraw-tr')?.addEventListener('click', () => {
      showWithdrawTreasuryModal = false;
      render();
    });

    document.getElementById('form-withdraw-treasury')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = parseFloat(document.getElementById('input-withdraw-tr-amount')?.value);
      const treasury = getEmployerTreasury(address);
      if (!treasury || isNaN(amount) || amount <= 0) return;

      isSubmitting = true;
      render();
      try {
        await withdrawFromTreasury(treasury.id, amount, address);
        isSubmitting = false;
        showWithdrawTreasuryModal = false;
        showToast(`Withdrew ${amount} XLM from Treasury Vault!`, 'success');
        render();
      } catch (err) {
        isSubmitting = false;
        showToast(err.message, 'error');
        render();
      }
    });

    // Logout
    document.getElementById('nav-btn-disconnect')?.addEventListener('click', () => {
      disconnectWallet();
      navigate('/');
    });
  }

  render();

  return () => {
    intervals.forEach(clearInterval);
  };
}

function showToast(msg, type) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'error' : 'success'}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}
