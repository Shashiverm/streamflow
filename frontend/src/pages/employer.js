/**
 * StreamFlow — Employer Dashboard
 * Streaming Payroll, Batch Disbursement, Cliff Vesting & Treasury Management
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

const PAGE_SIZE = 25;

export function renderEmployer(app) {
  trackPageView('/employer');

  const address = localStorage.getItem('streamflow_address') || '';
  const walletType = getConnectedWalletType() || localStorage.getItem('streamflow_wallet_type') || 'wallet';
  if (!address) { navigate('/onboarding'); return; }

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
  let currentPage = 0;
  let _searchTimer = null;

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
      const q = searchQuery.toLowerCase();
      const matchesSearch = q === '' || s.employee.toLowerCase().includes(q) || s.id.toString().includes(q);
      return matchesFilter && matchesSearch;
    });

    // Pagination
    const totalPages = Math.max(1, Math.ceil(filteredStreams.length / PAGE_SIZE));
    if (currentPage >= totalPages) currentPage = totalPages - 1;
    const pageStreams = filteredStreams.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

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
              </div>
            </li>
            <li>
              <button class="btn btn-ghost btn-sm text-danger" id="nav-btn-disconnect">
                Logout
              </button>
            </li>
          </ul>
        </div>
      </nav>

      <div class="page">
        <div class="container">
          <!-- Header -->
          <div class="flex flex-between mb-xl" style="flex-wrap: wrap; gap: var(--space-md);">
            <div>
              <h1>Payroll Streams</h1>
              <p class="text-muted" style="margin-top: 4px; word-break: break-all;">
                <span class="mono" style="color: var(--accent-mint);">${truncateAddress(address)}</span>
              </p>
            </div>

            <div class="flex gap-sm align-center" style="flex-wrap: wrap;">
              <button class="btn btn-outline btn-sm" id="btn-open-calculator">
                Rate Calculator
              </button>
              <button class="btn btn-outline btn-sm" id="btn-export-csv">
                Export CSV
              </button>
              <button class="btn btn-gold btn-sm" id="btn-open-batch">
                Batch Payroll
              </button>
              <button class="btn btn-primary btn-sm" id="btn-create-stream">
                + New Stream
              </button>
            </div>
          </div>

          <!-- Stats -->
          <div class="grid-4 gap-md mb-xl">
            <div class="card stat-card">
              <div class="stat-header">
                <span class="stat-label">Active Streams</span>
                <div class="stat-icon">#</div>
              </div>
              <div class="stat-value streaming">${activeCount}</div>
            </div>

            <div class="card stat-card card-gold">
              <div class="stat-header">
                <span class="stat-label">Total Allocated</span>
                <div class="stat-icon gold">$</div>
              </div>
              <div class="stat-value gold-text">${totalFunded.toLocaleString()} XLM</div>
            </div>

            <div class="card stat-card">
              <div class="stat-header">
                <span class="stat-label">Disbursed</span>
                <div class="stat-icon">$</div>
              </div>
              <div class="stat-value" style="color: var(--accent-mint);">${totalPaid.toFixed(2)} XLM</div>
            </div>

            <div class="card stat-card card-gold">
              <div class="stat-header">
                <span class="stat-label">Wallet Balance</span>
                <div class="stat-icon gold">W</div>
              </div>
              <div class="stat-value" id="employer-balance-val" style="color: var(--accent-gold);">${employerBalance.toFixed(2)} XLM</div>
            </div>
          </div>

          <!-- Treasury -->
          <div class="card card-gold mb-xl" style="padding: var(--space-lg);">
            <div class="flex flex-between align-center mb-md" style="flex-wrap: wrap; gap: var(--space-sm);">
              <div>
                <h3 style="margin: 0;">Treasury Vault</h3>
                <p class="text-muted" style="font-size: 0.85rem; margin-top: 2px;">
                  Deposit once, allocate across multiple streams.
                </p>
              </div>

              <div class="flex gap-xs">
                ${treasury ? `
                  <button class="btn btn-outline btn-sm" id="btn-withdraw-treasury">Withdraw</button>
                  <button class="btn btn-gold btn-sm" id="btn-deposit-treasury">+ Deposit</button>
                ` : `
                  <button class="btn btn-gold btn-sm" id="btn-init-treasury">Initialize Treasury</button>
                `}
              </div>
            </div>

            ${treasury ? `
              <div class="grid-3 gap-md">
                <div class="card-flat" style="padding: var(--space-md); background: rgba(0, 0, 0, 0.3);">
                  <span class="text-muted" style="font-size: 0.78rem; text-transform: uppercase;">Total Balance</span>
                  <div class="mono font-bold mt-xs" style="font-size: 1.3rem; color: var(--accent-gold);">${treasury.balance.toLocaleString()} XLM</div>
                </div>
                <div class="card-flat" style="padding: var(--space-md); background: rgba(0, 0, 0, 0.3);">
                  <span class="text-muted" style="font-size: 0.78rem; text-transform: uppercase;">Allocated</span>
                  <div class="mono font-bold mt-xs" style="font-size: 1.3rem; color: var(--accent-mint);">${treasury.allocated.toLocaleString()} XLM</div>
                </div>
                <div class="card-flat" style="padding: var(--space-md); background: rgba(0, 0, 0, 0.3);">
                  <span class="text-muted" style="font-size: 0.78rem; text-transform: uppercase;">Available</span>
                  <div class="mono font-bold mt-xs" style="font-size: 1.3rem; color: #ffffff;">${(treasury.balance - treasury.allocated).toLocaleString()} XLM</div>
                </div>
              </div>
            ` : `
              <div class="text-center" style="padding: var(--space-md); background: rgba(0,0,0,0.2); border-radius: var(--radius-md);">
                <p class="text-muted" style="font-size: 0.85rem; margin: 0;">
                  No treasury initialized. Click Initialize to enable pooled stream backing.
                </p>
              </div>
            `}
          </div>

          <!-- Streams Management -->
          <div class="flex flex-between align-center mb-md" style="flex-wrap: wrap; gap: var(--space-sm);">
            <div class="flex gap-xs align-center flex-wrap">
              <span class="font-bold" style="font-size: 1.1rem;">Streams</span>
              <span class="badge badge-active">${allStreams.length} total</span>
            </div>

            <div class="flex gap-sm align-center flex-wrap">
              <input type="text" class="form-input" id="stream-search" placeholder="Search address or ID..." value="${searchQuery}" style="width: 220px; min-height: 38px; padding: 6px 12px; font-size: 0.85rem;">

              <div class="tab-group" style="margin: 0;">
                <button class="tab-btn ${currentFilter === 'All' ? 'active' : ''}" data-filter="All">All</button>
                <button class="tab-btn ${currentFilter === 'Active' ? 'active' : ''}" data-filter="Active">Active</button>
                <button class="tab-btn ${currentFilter === 'Paused' ? 'active' : ''}" data-filter="Paused">Paused</button>
                <button class="tab-btn ${currentFilter === 'Completed' ? 'active' : ''}" data-filter="Completed">Done</button>
              </div>
            </div>
          </div>

          <!-- Batch Toolbar -->
          ${selectedStreamIds.size > 0 ? `
            <div class="batch-toolbar">
              <div class="flex align-center gap-sm">
                <span class="badge badge-cliff">${selectedStreamIds.size} selected</span>
              </div>
              <div class="flex gap-xs">
                <button class="btn btn-outline btn-sm" id="btn-batch-pause">Pause</button>
                <button class="btn btn-outline btn-sm" id="btn-batch-resume">Resume</button>
                <button class="btn btn-danger btn-sm" id="btn-batch-cancel">Cancel</button>
              </div>
            </div>
          ` : ''}

          <!-- Table -->
          <div class="table-container mb-md">
            <table class="table">
              <thead>
                <tr>
                  <th style="width: 40px;">
                    <input type="checkbox" id="select-all-streams" ${selectedStreamIds.size === pageStreams.length && pageStreams.length > 0 ? 'checked' : ''}>
                  </th>
                  <th>ID</th>
                  <th>Recipient</th>
                  <th>Rate</th>
                  <th>Progress</th>
                  <th>Claimable</th>
                  <th>Cliff</th>
                  <th>Status</th>
                  <th style="text-align: right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${pageStreams.length === 0 ? `
                  <tr>
                    <td colspan="9" style="text-align: center; padding: var(--space-2xl) 0;" class="text-muted">
                      No streams found.
                    </td>
                  </tr>
                ` : pageStreams.map((s) => {
                  const accrued = getAccrued(s.id);
                  const progressPct = Math.min(100, Math.max(0, ((s.withdrawn + accrued) / s.totalFunded) * 100));
                  const isChecked = selectedStreamIds.has(s.id);

                  return `
                    <tr>
                      <td><input type="checkbox" class="stream-row-cb" data-id="${s.id}" ${isChecked ? 'checked' : ''}></td>
                      <td class="mono font-bold" style="color: var(--accent-mint);">#${s.id}</td>
                      <td><span class="mono" title="${s.employee}">${truncateAddress(s.employee)}</span></td>
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
                          <span class="badge badge-cliff" title="Cliff: ${new Date(s.cliffTime * 1000).toLocaleString()}">
                            ${Math.round((s.cliffDuration || 0) / 86400)}d cliff
                          </span>
                        ` : `
                          <span class="text-muted" style="font-size: 0.8rem;">Linear</span>
                        `}
                      </td>
                      <td><span class="badge badge-${s.status.toLowerCase()}">${s.status}</span></td>
                      <td style="text-align: right;">
                        <div class="flex gap-xs" style="justify-content: flex-end;">
                          ${s.status === 'Active' ? `
                            <button class="btn btn-outline btn-sm btn-action-pause" data-id="${s.id}" title="Pause">||</button>
                            <button class="btn btn-outline btn-sm btn-action-topup" data-id="${s.id}" title="Top Up">+</button>
                            <button class="btn btn-danger btn-sm btn-action-cancel" data-id="${s.id}" title="Cancel">&times;</button>
                          ` : ''}
                          ${s.status === 'Paused' ? `
                            <button class="btn btn-primary btn-sm btn-action-resume" data-id="${s.id}" title="Resume">&gt;</button>
                            <button class="btn btn-danger btn-sm btn-action-cancel" data-id="${s.id}" title="Cancel">&times;</button>
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

          <!-- Pagination -->
          ${totalPages > 1 ? `
            <div class="pagination">
              <button class="pagination-btn" id="page-prev" ${currentPage === 0 ? 'disabled' : ''}>&laquo; Prev</button>
              <span class="pagination-info">Page ${currentPage + 1} of ${totalPages} (${filteredStreams.length} streams)</span>
              <button class="pagination-btn" id="page-next" ${currentPage >= totalPages - 1 ? 'disabled' : ''}>Next &raquo;</button>
            </div>
          ` : ''}
        </div>
      </div>

      ${showCreateModal ? renderCreateStreamModal() : ''}
      ${showBatchModal ? renderBatchStreamModal() : ''}
      ${showTopUpModal ? renderTopUpModal() : ''}
      ${showCalculatorModal ? renderCalculatorModal() : ''}
      ${showDepositModal ? renderDepositModal() : ''}
      ${showWithdrawTreasuryModal ? renderWithdrawTreasuryModal() : ''}
    `;

    attachListeners();
    startLiveTickers(pageStreams);
  }

  function renderCreateStreamModal() {
    return `
      <div class="modal-backdrop" id="modal-backdrop-create">
        <div class="modal-content">
          <div class="modal-header">
            <h3 style="margin: 0;">Create Stream</h3>
            <button class="modal-close" id="btn-close-modal">&times;</button>
          </div>
          <form id="form-create-stream">
            <div class="form-group">
              <label class="form-label">Recipient address</label>
              <input type="text" class="form-input mono" id="input-employee" placeholder="G..." required>
            </div>
            <div class="grid-2 gap-md">
              <div class="form-group">
                <label class="form-label">Rate (tokens/sec)</label>
                <input type="number" step="0.000001" class="form-input mono" id="input-rate" placeholder="0.001" required>
              </div>
              <div class="form-group">
                <label class="form-label">Duration (days)</label>
                <input type="number" class="form-input" id="input-duration-days" placeholder="30" value="30" required>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">
                <span>Cliff period (days)</span>
                <span class="text-muted" style="font-size: 0.75rem;">0 = instant streaming</span>
              </label>
              <input type="number" class="form-input" id="input-cliff-days" placeholder="0" value="0">
              <div class="form-hint">Tokens won't unlock until the cliff elapses.</div>
            </div>
            <div class="card-flat mb-md" style="padding: var(--space-md); background: rgba(0,0,0,0.3);">
              <div class="flex flex-between" style="font-size: 0.85rem;">
                <span class="text-muted">Total funding required:</span>
                <span class="mono font-bold" id="create-total-preview" style="color: var(--accent-mint);">0.00 XLM</span>
              </div>
            </div>
            <button type="submit" class="btn btn-primary btn-lg w-full" style="width: 100%;" ${isSubmitting ? 'disabled' : ''}>
              ${isSubmitting ? 'Creating...' : 'Fund & Create Stream'}
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
              <h3 style="margin: 0;">Batch Payroll</h3>
              <p class="text-muted" style="font-size: 0.8rem; margin: 0;">Create multiple streams from a CSV file.</p>
            </div>
            <button class="modal-close" id="btn-close-batch">&times;</button>
          </div>
          <div class="dropzone mb-md" id="csv-dropzone">
            <strong style="display: block; margin-bottom: 4px;">Click or drop a CSV file</strong>
            <span class="text-muted" style="font-size: 0.8rem;">Columns: Address, RatePerSec, DurationDays, CliffDays</span>
            <input type="file" id="csv-file-input" accept=".csv" style="display: none;">
          </div>
          <div class="form-group mb-md">
            <label class="form-label">Or paste rows</label>
            <textarea class="form-input mono" id="batch-text-input" rows="5" style="font-size: 0.8rem;" placeholder="GBZX..., 0.002, 30, 0&#10;GAY5..., 0.005, 60, 15"></textarea>
          </div>
          <div id="batch-preview-container" class="card-flat mb-md" style="padding: var(--space-md); background: rgba(0,0,0,0.3); display: none;">
            <div class="flex flex-between" style="font-size: 0.85rem;">
              <span>Parsed: <strong id="batch-count-display">0</strong> streams</span>
              <span>Total: <strong class="mono" id="batch-total-display" style="color: var(--accent-gold);">0 XLM</strong></span>
            </div>
          </div>
          <button class="btn btn-gold btn-lg w-full" id="btn-submit-batch" style="width: 100%;" ${isSubmitting ? 'disabled' : ''}>
            ${isSubmitting ? 'Creating...' : 'Execute Batch'}
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
            <button class="modal-close" id="btn-close-topup">&times;</button>
          </div>
          <form id="form-topup">
            <div class="form-group mb-md">
              <label class="form-label">Additional amount (XLM)</label>
              <input type="number" step="0.1" class="form-input mono" id="input-topup-amount" placeholder="500" required>
              <div class="form-hint">Extends duration at the existing flow rate.</div>
            </div>
            <button type="submit" class="btn btn-primary btn-lg w-full" style="width: 100%;" ${isSubmitting ? 'disabled' : ''}>
              ${isSubmitting ? 'Processing...' : 'Confirm Top Up'}
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
            <h3 style="margin: 0;">Rate Calculator</h3>
            <button class="modal-close" id="btn-close-calc">&times;</button>
          </div>
          <div class="form-group mb-md">
            <label class="form-label">Base salary (USD / XLM)</label>
            <input type="number" class="form-input mono" id="calc-input-salary" value="${calcSalary}">
          </div>
          <div class="card-flat mb-md" style="padding: var(--space-md); background: rgba(0,0,0,0.3);">
            <div class="flex flex-between mb-xs" style="font-size: 0.85rem;">
              <span class="text-muted">Per-second rate:</span>
              <span class="mono font-bold text-accent">${proj.ratePerSecondContinuous.toFixed(7)} / s</span>
            </div>
            <div class="flex flex-between mb-xs" style="font-size: 0.85rem;">
              <span class="text-muted">Daily velocity:</span>
              <span class="mono font-semibold" style="color: var(--accent-gold);">${proj.dailyContinuous.toFixed(2)} / day</span>
            </div>
            <div class="flex flex-between" style="font-size: 0.85rem;">
              <span class="text-muted">Wire fee comparison:</span>
              <span class="text-danger font-semibold">$35 vs < $0.001</span>
            </div>
          </div>
          <button class="btn btn-primary w-full" id="btn-apply-calc-rate" style="width: 100%;">
            Use This Rate
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
            <h3 style="margin: 0;">Deposit to Treasury</h3>
            <button class="modal-close" id="btn-close-deposit">&times;</button>
          </div>
          <form id="form-deposit">
            <div class="form-group mb-md">
              <label class="form-label">Amount (XLM)</label>
              <input type="number" step="1" class="form-input mono" id="input-deposit-amount" placeholder="2500" required>
            </div>
            <button type="submit" class="btn btn-gold btn-lg w-full" style="width: 100%;" ${isSubmitting ? 'disabled' : ''}>
              ${isSubmitting ? 'Depositing...' : 'Confirm Deposit'}
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
            <h3 style="margin: 0;">Withdraw from Treasury</h3>
            <button class="modal-close" id="btn-close-withdraw-tr">&times;</button>
          </div>
          <form id="form-withdraw-treasury">
            <div class="card-flat mb-md" style="padding: var(--space-md); background: rgba(0,0,0,0.3);">
              <span class="text-muted" style="font-size: 0.78rem;">Available:</span>
              <div class="mono font-bold" style="color: var(--accent-mint); font-size: 1.2rem;">${available.toLocaleString()} XLM</div>
            </div>
            <div class="form-group mb-md">
              <label class="form-label">Amount (XLM)</label>
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
          if (el) el.textContent = `${getAccrued(s.id).toFixed(4)} XLM`;
        }
      });
    }, 500); // 500ms is enough for human perception
    intervals.push(interval);
  }

  function attachListeners() {
    // Debounced search
    document.getElementById('stream-search')?.addEventListener('input', (e) => {
      if (_searchTimer) clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => {
        searchQuery = e.target.value;
        currentPage = 0;
        render();
      }, 250);
    });

    // Filter tabs
    document.querySelectorAll('.tab-btn[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => { currentFilter = btn.dataset.filter; currentPage = 0; render(); });
    });

    // Pagination
    document.getElementById('page-prev')?.addEventListener('click', () => { if (currentPage > 0) { currentPage--; render(); } });
    document.getElementById('page-next')?.addEventListener('click', () => { currentPage++; render(); });

    // Select All
    document.getElementById('select-all-streams')?.addEventListener('change', (e) => {
      const allStreams = getEmployerStreams(address);
      if (e.target.checked) { allStreams.forEach((s) => selectedStreamIds.add(s.id)); } else { selectedStreamIds.clear(); }
      render();
    });

    document.querySelectorAll('.stream-row-cb').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const id = parseInt(cb.dataset.id);
        if (e.target.checked) { selectedStreamIds.add(id); } else { selectedStreamIds.delete(id); }
        render();
      });
    });

    // Batch Actions
    document.getElementById('btn-batch-pause')?.addEventListener('click', async () => {
      if (selectedStreamIds.size === 0) return;
      try { await batchPauseStreams(address, Array.from(selectedStreamIds)); selectedStreamIds.clear(); showToast('Streams paused', 'success'); render(); }
      catch (err) { showToast(err.message, 'error'); }
    });

    document.getElementById('btn-batch-resume')?.addEventListener('click', async () => {
      if (selectedStreamIds.size === 0) return;
      try { await batchResumeStreams(address, Array.from(selectedStreamIds)); selectedStreamIds.clear(); showToast('Streams resumed', 'success'); render(); }
      catch (err) { showToast(err.message, 'error'); }
    });

    document.getElementById('btn-batch-cancel')?.addEventListener('click', async () => {
      if (selectedStreamIds.size === 0) return;
      if (!confirm(`Cancel ${selectedStreamIds.size} stream(s)? Pro-rata settlement will be performed.`)) return;
      try { await batchCancelStreams(address, Array.from(selectedStreamIds)); selectedStreamIds.clear(); showToast('Streams cancelled & settled', 'success'); render(); }
      catch (err) { showToast(err.message, 'error'); }
    });

    // Modals
    document.getElementById('btn-create-stream')?.addEventListener('click', () => { showCreateModal = true; render(); });
    document.getElementById('btn-close-modal')?.addEventListener('click', () => { showCreateModal = false; render(); });
    document.getElementById('btn-open-batch')?.addEventListener('click', () => { showBatchModal = true; render(); });
    document.getElementById('btn-close-batch')?.addEventListener('click', () => { showBatchModal = false; render(); });
    document.getElementById('btn-open-calculator')?.addEventListener('click', () => { showCalculatorModal = true; render(); });
    document.getElementById('btn-close-calc')?.addEventListener('click', () => { showCalculatorModal = false; render(); });

    // Export CSV
    document.getElementById('btn-export-csv')?.addEventListener('click', () => {
      try { exportPayrollCSV(address, 'employer'); showToast('CSV downloaded', 'success'); }
      catch (err) { showToast(err.message, 'error'); }
    });

    // Create Stream
    document.getElementById('form-create-stream')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const employee = document.getElementById('input-employee')?.value.trim();
      const rate = parseFloat(document.getElementById('input-rate')?.value);
      const durationDays = parseFloat(document.getElementById('input-duration-days')?.value);
      const cliffDays = parseFloat(document.getElementById('input-cliff-days')?.value) || 0;
      if (!employee || isNaN(rate) || isNaN(durationDays)) { showToast('Fill all required fields.', 'error'); return; }
      isSubmitting = true; render();
      try {
        await createStream(address, employee, 'XLM', rate, durationDays * 86400, cliffDays * 86400);
        isSubmitting = false; showCreateModal = false; showToast('Stream created', 'success'); render();
      } catch (err) { isSubmitting = false; showToast(err.message, 'error'); render(); }
    });

    // Batch CSV
    const dropzone = document.getElementById('csv-dropzone');
    const fileInput = document.getElementById('csv-file-input');
    const batchTextInput = document.getElementById('batch-text-input');
    dropzone?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => { if (batchTextInput) { batchTextInput.value = evt.target.result; parseAndPreviewBatch(evt.target.result); } };
        reader.readAsText(file);
      }
    });
    batchTextInput?.addEventListener('input', (e) => parseAndPreviewBatch(e.target.value));

    function parseAndPreviewBatch(raw) {
      const lines = raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#') && !l.toLowerCase().startsWith('address'));
      let total = 0, count = 0;
      lines.forEach((line) => {
        const p = line.split(',').map(s => s.trim());
        if (p.length >= 3) { const r = parseFloat(p[1]), d = parseFloat(p[2]); if (!isNaN(r) && !isNaN(d)) { total += r * d * 86400; count++; } }
      });
      const box = document.getElementById('batch-preview-container');
      if (box && count > 0) {
        box.style.display = 'block';
        const cEl = document.getElementById('batch-count-display');
        const tEl = document.getElementById('batch-total-display');
        if (cEl) cEl.textContent = count;
        if (tEl) tEl.textContent = `${total.toLocaleString()} XLM`;
      }
    }

    document.getElementById('btn-submit-batch')?.addEventListener('click', async () => {
      const raw = batchTextInput?.value || '';
      const lines = raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#') && !l.toLowerCase().startsWith('address'));
      if (lines.length === 0) { showToast('Provide valid batch rows.', 'error'); return; }
      const data = [];
      for (const line of lines) {
        const p = line.split(',').map(s => s.trim());
        if (p.length < 3) continue;
        data.push({ employee: p[0], tokenSymbol: 'XLM', ratePerSecond: parseFloat(p[1]), durationSeconds: parseFloat(p[2]) * 86400, cliffSeconds: (p[3] ? parseFloat(p[3]) : 0) * 86400 });
      }
      isSubmitting = true; render();
      try {
        await batchCreateStreams(address, data);
        isSubmitting = false; showBatchModal = false; showToast(`Created ${data.length} streams`, 'success'); render();
      } catch (err) { isSubmitting = false; showToast(err.message, 'error'); render(); }
    });

    // Top Up
    document.querySelectorAll('.btn-action-topup').forEach((btn) => {
      btn.addEventListener('click', () => { topUpStreamId = parseInt(btn.dataset.id); showTopUpModal = true; render(); });
    });
    document.getElementById('btn-close-topup')?.addEventListener('click', () => { showTopUpModal = false; render(); });
    document.getElementById('form-topup')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = parseFloat(document.getElementById('input-topup-amount')?.value);
      if (isNaN(amount) || amount <= 0) return;
      isSubmitting = true; render();
      try { await topUpStream(topUpStreamId, amount, address); isSubmitting = false; showTopUpModal = false; showToast('Top up successful', 'success'); render(); }
      catch (err) { isSubmitting = false; showToast(err.message, 'error'); render(); }
    });

    // Pause/Resume/Cancel individual
    document.querySelectorAll('.btn-action-pause').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try { await pauseStream(parseInt(btn.dataset.id), address); showToast('Stream paused', 'success'); render(); }
        catch (err) { showToast(err.message, 'error'); }
      });
    });
    document.querySelectorAll('.btn-action-resume').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try { await resumeStream(parseInt(btn.dataset.id), address); showToast('Stream resumed', 'success'); render(); }
        catch (err) { showToast(err.message, 'error'); }
      });
    });
    document.querySelectorAll('.btn-action-cancel').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const sId = parseInt(btn.dataset.id);
        if (!confirm(`Cancel stream #${sId}? Earned wages go to employee, remainder refunded to you.`)) return;
        try { const res = await cancelStream(sId, address); showToast(`Cancelled. Refunded: ${res.employerRefund.toFixed(2)} XLM`, 'success'); render(); }
        catch (err) { showToast(err.message, 'error'); }
      });
    });

    // Treasury
    document.getElementById('btn-init-treasury')?.addEventListener('click', async () => {
      try { await createTreasury(address, 'XLM'); showToast('Treasury initialized', 'success'); render(); }
      catch (err) { showToast(err.message, 'error'); }
    });
    document.getElementById('btn-deposit-treasury')?.addEventListener('click', () => { showDepositModal = true; render(); });
    document.getElementById('btn-close-deposit')?.addEventListener('click', () => { showDepositModal = false; render(); });
    document.getElementById('form-deposit')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = parseFloat(document.getElementById('input-deposit-amount')?.value);
      if (isNaN(amount) || amount <= 0) return;
      const treasury = getEmployerTreasury(address);
      if (!treasury) return;
      isSubmitting = true; render();
      try { await depositToTreasury(treasury.id, amount, address); isSubmitting = false; showDepositModal = false; showToast(`Deposited ${amount} XLM`, 'success'); render(); }
      catch (err) { isSubmitting = false; showToast(err.message, 'error'); render(); }
    });
    document.getElementById('btn-withdraw-treasury')?.addEventListener('click', () => { showWithdrawTreasuryModal = true; render(); });
    document.getElementById('btn-close-withdraw-tr')?.addEventListener('click', () => { showWithdrawTreasuryModal = false; render(); });
    document.getElementById('form-withdraw-treasury')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = parseFloat(document.getElementById('input-withdraw-tr-amount')?.value);
      const treasury = getEmployerTreasury(address);
      if (!treasury || isNaN(amount) || amount <= 0) return;
      isSubmitting = true; render();
      try { await withdrawFromTreasury(treasury.id, amount, address); isSubmitting = false; showWithdrawTreasuryModal = false; showToast(`Withdrew ${amount} XLM`, 'success'); render(); }
      catch (err) { isSubmitting = false; showToast(err.message, 'error'); render(); }
    });

    // Logout
    document.getElementById('nav-btn-disconnect')?.addEventListener('click', () => { disconnectWallet(); navigate('/'); });
  }

  render();
  return () => { intervals.forEach(clearInterval); if (_searchTimer) clearTimeout(_searchTimer); };
}

function showToast(msg, type) {
  let container = document.getElementById('toast-container');
  if (!container) { container = document.createElement('div'); container.id = 'toast-container'; container.className = 'toast-container'; document.body.appendChild(container); }
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'error' : 'success'}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}
