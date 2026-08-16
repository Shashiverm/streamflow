/**
 * StreamFlow — Employer Dashboard
 * Manage live Soroban payroll streams and pooled treasury.
 */

import {
  createStream,
  getEmployerStreams,
  getAccrued,
  cancelStream,
  pauseStream,
  resumeStream,
  topUpStream,
  getEmployerTreasury,
  createTreasury,
  depositToTreasury,
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
  let showTopUpModal = false;
  let showCalculatorModal = false;
  let showDepositModal = false;
  let topUpStreamId = null;
  let intervals = [];
  let employerBalance = 0;
  let isSubmitting = false;
  let currentFilter = 'All';
  let searchQuery = '';

  // Calculator state
  let calcSalary = 5000; // Monthly USD/XLM
  let calcMode = 'monthly'; // 'monthly' | 'hourly'

  getAccountBalance(address)
    .then((b) => {
      employerBalance = b.xlm;
      const balEl = document.getElementById('employer-balance-val');
      if (balEl) balEl.textContent = `${employerBalance.toFixed(2)} XLM`;
    })
    .catch(() => {});

  function render() {
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

    // Filter and search
    const filteredStreams = allStreams.filter((s) => {
      const matchesFilter = currentFilter === 'All' || s.status === currentFilter;
      const matchesSearch =
        searchQuery === '' ||
        s.employee.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.id.toString().includes(searchQuery);
      return matchesFilter && matchesSearch;
    });

    // Estimated traditional wire fee savings
    const estimatedWireSavings = (allStreams.length * 35.0).toFixed(0);

    app.innerHTML = `
      <nav class="navbar">
        <div class="container">
          <a href="/" data-link class="navbar-brand">
            <img src="/logo.svg" alt="StreamFlow" width="28" height="28">
            <span>Stream<span class="gradient-text">Flow</span></span>
          </a>
          <ul class="navbar-nav">
            <li><a href="/employer" data-link class="active">Employer</a></li>
            <li><a href="/employee" data-link>Employee</a></li>
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
              <div class="flex gap-sm" style="align-items: center;">
                <h1>Employer Dashboard</h1>
                <span class="badge badge-active">Testnet Protocol 22</span>
              </div>
              <p class="text-muted" style="margin-top: 4px;">
                Connected Wallet: <span class="mono text-accent">${address}</span>
              </p>
            </div>
            <div class="flex gap-sm" style="flex-wrap: wrap;">
              <button class="btn btn-outline btn-sm" id="btn-open-calculator" title="Interactive Salary to Stream Rate Calculator">
                🧮 Rate Calculator
              </button>
              <button class="btn btn-outline btn-sm" id="btn-export-csv" title="Download CSV report of all streams and payouts">
                📥 Export CSV
              </button>
              <button class="btn btn-primary" id="btn-create-stream">
                ＋ Create Stream
              </button>
            </div>
          </div>

          <!-- Stats Grid -->
          <div class="stats-grid">
            <div class="card stat-card">
              <div class="stat-value gradient-text">${activeCount}</div>
              <div class="stat-label">Active Streams</div>
            </div>
            <div class="card stat-card">
              <div class="stat-value" style="color: var(--accent-emerald);">
                ${totalFunded.toFixed(2)}
              </div>
              <div class="stat-label">Total Funded (XLM)</div>
            </div>
            <div class="card stat-card">
              <div class="stat-value" style="color: var(--accent-cyan);">
                ${totalPaid.toFixed(2)}
              </div>
              <div class="stat-label">Total Paid Out</div>
            </div>
            <div class="card stat-card">
              <div class="stat-value" style="color: #10b981;">
                $${estimatedWireSavings}
              </div>
              <div class="stat-label">Wire Fees Saved</div>
            </div>
          </div>

          <!-- Pooled Treasury Section -->
          ${!treasury ? `
            <div class="card mb-lg" style="text-align: center; padding: var(--space-xl); background: radial-gradient(ellipse at center, rgba(79, 125, 249, 0.08) 0%, rgba(12, 16, 32, 0.7) 100%);">
              <h3 style="margin-bottom: var(--space-sm);">🏢 Pooled Payroll Treasury</h3>
              <p class="text-muted mb-md" style="font-size: 0.9rem; max-width: 600px; margin: 0 auto var(--space-md);">
                Pool funds once to open and batch-fund multiple employee streams on the Soroban Treasury Contract without individual transaction approvals.
              </p>
              <button class="btn btn-outline" id="btn-create-treasury">
                Deploy Employer Treasury
              </button>
            </div>
          ` : `
            <div class="card mb-lg" style="border: 1px solid rgba(79, 125, 249, 0.25);">
              <div class="flex flex-between mb-md" style="flex-wrap: wrap; gap: var(--space-sm);">
                <div>
                  <div class="flex gap-sm" style="align-items: center;">
                    <h3 style="font-size: 1.1rem;">💰 Pooled Employer Treasury</h3>
                    <span class="badge badge-active">Active</span>
                  </div>
                  <div class="text-muted" style="font-size: 0.75rem; margin-top: 2px;">
                    Contract: <a href="https://stellar.expert/explorer/testnet/contract/${CONTRACTS.TREASURY}" target="_blank" class="mono text-accent">${truncateAddress(CONTRACTS.TREASURY)} ↗</a>
                  </div>
                </div>
                <button class="btn btn-outline btn-sm" id="btn-deposit-treasury">
                  ＋ Deposit Funds
                </button>
              </div>
              <div class="grid-3 gap-md">
                <div class="card-flat" style="padding: var(--space-md);">
                  <div class="text-muted" style="font-size: 0.8rem;">Total Treasury Balance</div>
                  <div class="mono font-semibold" style="font-size: 1.25rem;">${treasury.balance.toFixed(2)} XLM</div>
                </div>
                <div class="card-flat" style="padding: var(--space-md);">
                  <div class="text-muted" style="font-size: 0.8rem;">Allocated to Streams</div>
                  <div class="mono font-semibold text-accent" style="font-size: 1.25rem;">${treasury.allocated.toFixed(2)} XLM</div>
                </div>
                <div class="card-flat" style="padding: var(--space-md);">
                  <div class="text-muted" style="font-size: 0.8rem;">Available for New Streams</div>
                  <div class="mono font-semibold text-success" style="font-size: 1.25rem;">${Math.max(0, treasury.balance - treasury.allocated).toFixed(2)} XLM</div>
                </div>
              </div>
            </div>
          `}

          <!-- Payroll Streams Table Card -->
          <div class="card">
            <div class="flex flex-between mb-md" style="flex-wrap: wrap; gap: var(--space-md); align-items: center;">
              <div>
                <h3 style="font-size: 1.15rem;">📡 Payroll Streams</h3>
                <span class="text-muted" style="font-size: 0.8rem;">
                  Soroban Contract: <a href="https://stellar.expert/explorer/testnet/contract/${CONTRACTS.STREAM}" target="_blank" class="mono text-accent">${truncateAddress(CONTRACTS.STREAM)} ↗</a>
                </span>
              </div>

              <!-- Filter & Search Bar -->
              <div class="flex gap-sm" style="flex-wrap: wrap; align-items: center;">
                <input type="text" id="stream-search" class="form-input" style="padding: 6px 12px; font-size: 0.85rem; width: 200px;"
                  placeholder="Search address / ID..." value="${searchQuery}">
                
                <div class="filter-group flex gap-xs">
                  ${['All', 'Active', 'Paused', 'Completed', 'Cancelled'].map(
                    (filter) => `
                    <button class="btn btn-sm ${currentFilter === filter ? 'btn-primary' : 'btn-ghost'}" data-filter="${filter}" style="padding: 4px 10px; font-size: 0.8rem;">
                      ${filter}
                    </button>
                  `
                  ).join('')}
                </div>
              </div>
            </div>

            ${filteredStreams.length === 0 ? `
              <div class="empty-state">
                <div class="empty-icon">📡</div>
                <p>${allStreams.length === 0 ? 'No streams created yet with this wallet.' : 'No streams match the selected filter.'}</p>
                ${allStreams.length === 0 ? `
                  <button class="btn btn-primary btn-sm mt-md" id="btn-empty-create">
                    Create First Stream
                  </button>
                ` : ''}
              </div>
            ` : `
              <div class="table-wrapper">
                <table class="stream-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Recipient Employee</th>
                      <th>Token</th>
                      <th>Rate</th>
                      <th>Live Accrued</th>
                      <th>Withdrawn</th>
                      <th>Progress</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="streams-tbody">
                    ${filteredStreams.map((s) => renderStreamRow(s)).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>
        </div>
      </div>

      ${showCreateModal ? renderCreateModal() : ''}
      ${showTopUpModal ? renderTopUpModal() : ''}
      ${showCalculatorModal ? renderCalculatorModal() : ''}
      ${showDepositModal ? renderDepositModal(treasury) : ''}
    `;

    attachListeners();
    startAccrualUpdates();
  }

  function renderStreamRow(s) {
    const accrued = getAccrued(s.id);
    const progress = s.totalFunded > 0 ? ((s.withdrawn + accrued) / s.totalFunded) * 100 : 0;
    const statusClass = {
      Active: 'badge-active',
      Paused: 'badge-paused',
      Cancelled: 'badge-cancelled',
      Completed: 'badge-completed',
    }[s.status] || '';

    return `
      <tr>
        <td class="mono font-semibold">#${s.id}</td>
        <td class="address" title="${s.employee}">
          <a href="https://stellar.expert/explorer/testnet/account/${s.employee}" target="_blank" class="mono text-accent">
            ${truncateAddress(s.employee)} ↗
          </a>
        </td>
        <td><span class="badge badge-outline">${s.token || 'XLM'}</span></td>
        <td class="mono">${s.ratePerSecond.toFixed(4)}/s</td>
        <td class="mono text-success font-semibold" data-accrued="${s.id}">${accrued.toFixed(4)}</td>
        <td class="mono">${s.withdrawn.toFixed(4)}</td>
        <td style="min-width: 110px;">
          <div class="analytics-bar" style="height: 6px; margin-bottom: 4px;">
            <div class="fill" style="width: ${Math.min(progress, 100)}%;"></div>
          </div>
          <span class="text-muted" style="font-size: 0.7rem;">${progress.toFixed(1)}%</span>
        </td>
        <td><span class="badge ${statusClass}">${s.status}</span></td>
        <td>
          <div class="flex gap-xs">
            ${s.status === 'Active' ? `
              <button class="btn btn-ghost btn-sm" data-action="pause" data-id="${s.id}" title="Pause accrual">⏸ Pause</button>
              <button class="btn btn-ghost btn-sm" data-action="topup" data-id="${s.id}" title="Top up funds">💰 Top-up</button>
              <button class="btn btn-ghost btn-sm text-danger" data-action="cancel" data-id="${s.id}" title="Cancel stream">✕ Cancel</button>
            ` : ''}
            ${s.status === 'Paused' ? `
              <button class="btn btn-ghost btn-sm" data-action="resume" data-id="${s.id}" title="Resume stream">▶ Resume</button>
              <button class="btn btn-ghost btn-sm text-danger" data-action="cancel" data-id="${s.id}" title="Cancel stream">✕ Cancel</button>
            ` : ''}
            ${s.status === 'Cancelled' || s.status === 'Completed' ? `
              <span class="text-muted" style="font-size: 0.75rem;">Settled</span>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }

  function renderCreateModal() {
    return `
      <div class="modal-overlay" id="modal-overlay">
        <div class="modal">
          <div class="modal-header">
            <h3>Create Payroll Stream</h3>
            <button class="modal-close" id="modal-close">&times;</button>
          </div>

          <div class="flex flex-col gap-md">
            <div class="form-group">
              <label class="form-label">Recipient Employee Public Key (G...)</label>
              <input type="text" class="form-input mono" id="input-employee"
                placeholder="GD6FP5BPNPVNPB6TTFFG6XLWII4KBCXWZ2MATS7SPWPU6VS5J7DUXPUU" autocomplete="off">
            </div>
            
            <div class="grid-3 gap-md">
              <div class="form-group">
                <label class="form-label">Payout Token</label>
                <select class="form-select" id="input-token">
                  <option value="XLM" selected>Native XLM</option>
                  <option value="USDC">USDC (Stellar USD)</option>
                  <option value="EURC">EURC (Stellar EUR)</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Rate (/second)</label>
                <input type="number" class="form-input mono" id="input-rate"
                  placeholder="0.05" step="0.001" min="0.0001" value="0.05">
              </div>
              <div class="form-group">
                <label class="form-label">Duration</label>
                <select class="form-select" id="input-duration">
                  <option value="3600">1 Hour</option>
                  <option value="86400" selected>1 Day (24h)</option>
                  <option value="604800">1 Week (7d)</option>
                  <option value="2592000">30 Days (1m)</option>
                </select>
              </div>
            </div>

            <div class="card-flat" style="padding: var(--space-md);" id="stream-preview">
              <div class="flex flex-between" style="font-size: 0.85rem;">
                <span class="text-muted">Total Escrow Deposit:</span>
                <span class="mono font-bold text-success" id="preview-total">4,320.00 XLM</span>
              </div>
              <div class="flex flex-between mt-xs" style="font-size: 0.75rem;">
                <span class="text-muted">Equivalent Monthly Pace:</span>
                <span class="mono text-accent" id="preview-monthly">~129,600.00 XLM / mo</span>
              </div>
            </div>

            <button class="btn btn-primary w-full" id="btn-submit-stream" ${isSubmitting ? 'disabled' : ''}>
              ${isSubmitting ? '<span class="spinner"></span> Confirming on Soroban...' : 'Authorize & Create Stream'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderCalculatorModal() {
    const proj = calculateProjections(calcSalary, calcMode);
    return `
      <div class="modal-overlay" id="modal-overlay">
        <div class="modal" style="max-width: 600px;">
          <div class="modal-header">
            <h3>🧮 Interactive Payroll & Stream Rate Calculator</h3>
            <button class="modal-close" id="modal-close">&times;</button>
          </div>

          <div class="flex flex-col gap-md">
            <div class="grid-2 gap-md">
              <div class="form-group">
                <label class="form-label">Calculation Mode</label>
                <select class="form-select" id="calc-mode-select">
                  <option value="monthly" ${calcMode === 'monthly' ? 'selected' : ''}>Monthly Salary Base</option>
                  <option value="hourly" ${calcMode === 'hourly' ? 'selected' : ''}>Hourly Rate Base</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">${calcMode === 'monthly' ? 'Monthly Amount ($ / XLM)' : 'Hourly Rate ($ / XLM)'}</label>
                <input type="number" class="form-input mono" id="calc-amount-input" value="${calcSalary}" min="1" step="50">
              </div>
            </div>

            <div class="card-flat" style="padding: var(--space-lg); background: rgba(79, 125, 249, 0.05); border: 1px solid rgba(79, 125, 249, 0.2);">
              <div class="grid-3 gap-md text-center">
                <div>
                  <div class="text-muted" style="font-size: 0.75rem;">Per Second (24/7)</div>
                  <div class="mono font-bold text-success" style="font-size: 1.2rem;">${proj.ratePerSecondContinuous.toFixed(6)}</div>
                  <div class="text-muted" style="font-size: 0.65rem;">Continuous Stream</div>
                </div>
                <div>
                  <div class="text-muted" style="font-size: 0.75rem;">Per Minute</div>
                  <div class="mono font-bold text-accent" style="font-size: 1.2rem;">${proj.minuteRate.toFixed(4)}</div>
                  <div class="text-muted" style="font-size: 0.65rem;">Working Rate</div>
                </div>
                <div>
                  <div class="text-muted" style="font-size: 0.75rem;">Per Workday (8h)</div>
                  <div class="mono font-bold" style="font-size: 1.2rem;">$${proj.dailyWorking.toFixed(2)}</div>
                  <div class="text-muted" style="font-size: 0.65rem;">Daily Earnings</div>
                </div>
              </div>
            </div>

            <div class="flex flex-between text-muted" style="font-size: 0.8rem;">
              <span>Traditional Wire Overhead: <strong class="text-danger">$35.00/mo</strong></span>
              <span>Stellar Stream Overhead: <strong class="text-success">&lt;$0.0001/mo</strong></span>
            </div>

            <button class="btn btn-primary w-full" id="btn-apply-rate-to-create">
              Use ${proj.ratePerSecondContinuous.toFixed(6)} /s in Create Stream
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderDepositModal(treasury) {
    return `
      <div class="modal-overlay" id="modal-overlay">
        <div class="modal">
          <div class="modal-header">
            <h3>Deposit into Pooled Treasury</h3>
            <button class="modal-close" id="modal-close">&times;</button>
          </div>

          <div class="flex flex-col gap-md">
            <p class="text-muted" style="font-size: 0.85rem;">
              Treasury Contract: <span class="mono text-accent">${truncateAddress(CONTRACTS.TREASURY)}</span>
            </p>
            <div class="form-group">
              <label class="form-label">Deposit Amount (XLM)</label>
              <input type="number" class="form-input mono" id="input-deposit-amount"
                placeholder="500" step="10" min="1" value="500">
            </div>
            <button class="btn btn-primary w-full" id="btn-submit-deposit" ${isSubmitting ? 'disabled' : ''}>
              ${isSubmitting ? '<span class="spinner"></span> Processing Deposit...' : 'Confirm Treasury Deposit'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderTopUpModal() {
    return `
      <div class="modal-overlay" id="modal-overlay">
        <div class="modal">
          <div class="modal-header">
            <h3>Top Up Stream #${topUpStreamId}</h3>
            <button class="modal-close" id="modal-close">&times;</button>
          </div>

          <div class="flex flex-col gap-md">
            <div class="form-group">
              <label class="form-label">Additional Amount (XLM)</label>
              <input type="number" class="form-input mono" id="input-topup-amount"
                placeholder="100" step="1" min="1" value="100">
            </div>
            <button class="btn btn-primary w-full" id="btn-submit-topup" ${isSubmitting ? 'disabled' : ''}>
              ${isSubmitting ? '<span class="spinner"></span> Processing...' : 'Confirm Top Up'}
            </button>
          </div>
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

    // CSV Export
    document.getElementById('btn-export-csv')?.addEventListener('click', () => {
      try {
        exportPayrollCSV(address, 'employer');
        showToast('Payroll CSV audit report exported successfully!', 'success');
      } catch (err) {
        showToast(err.message || 'Export failed', 'error');
      }
    });

    // Rate Calculator trigger
    document.getElementById('btn-open-calculator')?.addEventListener('click', () => {
      showCalculatorModal = true;
      render();
    });

    // Calculator modal handlers
    document.getElementById('calc-mode-select')?.addEventListener('change', (e) => {
      calcMode = e.target.value;
      render();
    });
    document.getElementById('calc-amount-input')?.addEventListener('input', (e) => {
      calcSalary = parseFloat(e.target.value) || 0;
      render();
    });
    document.getElementById('btn-apply-rate-to-create')?.addEventListener('click', () => {
      const proj = calculateProjections(calcSalary, calcMode);
      showCalculatorModal = false;
      showCreateModal = true;
      render();
      setTimeout(() => {
        const rateInput = document.getElementById('input-rate');
        if (rateInput) {
          rateInput.value = proj.ratePerSecondContinuous.toFixed(6);
          updatePreview();
        }
      }, 50);
    });

    // Filter clicks
    document.querySelectorAll('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentFilter = btn.dataset.filter;
        render();
      });
    });

    // Search input
    document.getElementById('stream-search')?.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      render();
    });

    // Open modals
    document.getElementById('btn-create-stream')?.addEventListener('click', () => {
      showCreateModal = true;
      render();
    });

    document.getElementById('btn-empty-create')?.addEventListener('click', () => {
      showCreateModal = true;
      render();
    });

    document.getElementById('btn-deposit-treasury')?.addEventListener('click', () => {
      showDepositModal = true;
      render();
    });

    document.getElementById('btn-create-treasury')?.addEventListener('click', async () => {
      try {
        await createTreasury(address, 'XLM');
        showToast('Employer Treasury deployed on Soroban!', 'success');
        render();
      } catch (err) {
        showToast(err.message || 'Treasury deployment failed', 'error');
      }
    });

    // Deposit submission
    document.getElementById('btn-submit-deposit')?.addEventListener('click', async () => {
      const amount = parseFloat(document.getElementById('input-deposit-amount')?.value);
      if (!amount || amount <= 0) {
        showToast('Enter a valid deposit amount', 'error');
        return;
      }
      isSubmitting = true;
      render();

      try {
        const treasury = getEmployerTreasury(address);
        await depositToTreasury(treasury.id, amount, address);
        isSubmitting = false;
        showDepositModal = false;
        showToast(`Successfully deposited ${amount} XLM into Treasury!`, 'success');
        render();
      } catch (err) {
        isSubmitting = false;
        showToast(err.message || 'Deposit failed', 'error');
        render();
      }
    });

    // Close modals
    document.getElementById('modal-close')?.addEventListener('click', () => {
      showCreateModal = false;
      showTopUpModal = false;
      showCalculatorModal = false;
      showDepositModal = false;
      render();
    });

    document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay') {
        showCreateModal = false;
        showTopUpModal = false;
        showCalculatorModal = false;
        showDepositModal = false;
        render();
      }
    });

    // Create Stream live preview updates
    const updatePreview = () => {
      const rate = parseFloat(document.getElementById('input-rate')?.value) || 0;
      const duration = parseInt(document.getElementById('input-duration')?.value) || 0;
      const token = document.getElementById('input-token')?.value || 'XLM';
      const total = rate * duration;
      const monthly = rate * 86400 * 30;

      const totalEl = document.getElementById('preview-total');
      const monthlyEl = document.getElementById('preview-monthly');
      if (totalEl) totalEl.textContent = `${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${token}`;
      if (monthlyEl) monthlyEl.textContent = `~${monthly.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${token} / mo`;
    };

    document.getElementById('input-rate')?.addEventListener('input', updatePreview);
    document.getElementById('input-duration')?.addEventListener('change', updatePreview);
    document.getElementById('input-token')?.addEventListener('change', updatePreview);

    // Submit Stream
    document.getElementById('btn-submit-stream')?.addEventListener('click', async () => {
      const employee = document.getElementById('input-employee')?.value.trim();
      const token = document.getElementById('input-token')?.value || 'XLM';
      const rate = parseFloat(document.getElementById('input-rate')?.value);
      const duration = parseInt(document.getElementById('input-duration')?.value);

      if (!employee || !employee.startsWith('G') || employee.length < 50) {
        showToast('Please enter a valid Stellar public key (starting with G...)', 'error');
        return;
      }
      if (!rate || rate <= 0) {
        showToast('Please enter a valid rate greater than 0', 'error');
        return;
      }

      isSubmitting = true;
      render();

      try {
        await createStream(address, employee, token, rate, duration);
        isSubmitting = false;
        showCreateModal = false;
        showToast(`Payroll stream #${Date.now().toString().slice(-4)} created on Soroban!`, 'success');
        render();
      } catch (err) {
        isSubmitting = false;
        showToast(err.message || 'Stream creation failed', 'error');
        render();
      }
    });

    // Stream action buttons (Pause, Resume, Top-up, Cancel)
    document.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        const id = parseInt(btn.dataset.id);

        if (action === 'pause') {
          try {
            await pauseStream(id, address);
            showToast(`Stream #${id} paused on Soroban`, 'success');
            render();
          } catch (err) {
            showToast(err.message, 'error');
          }
        } else if (action === 'resume') {
          try {
            await resumeStream(id, address);
            showToast(`Stream #${id} resumed on Soroban`, 'success');
            render();
          } catch (err) {
            showToast(err.message, 'error');
          }
        } else if (action === 'topup') {
          topUpStreamId = id;
          showTopUpModal = true;
          render();
        } else if (action === 'cancel') {
          if (confirm(`Are you sure you want to cancel Stream #${id}? Accrued wages will be paid to employee, remaining funds will be refunded to you.`)) {
            try {
              const res = await cancelStream(id, address);
              showToast(`Stream #${id} cancelled. Refunded ${res.employerRefund.toFixed(2)} XLM to employer.`, 'success');
              render();
            } catch (err) {
              showToast(err.message, 'error');
            }
          }
        }
      });
    });

    // Submit Top-Up
    document.getElementById('btn-submit-topup')?.addEventListener('click', async () => {
      const amount = parseFloat(document.getElementById('input-topup-amount')?.value);
      if (!amount || amount <= 0) {
        showToast('Please enter a valid amount', 'error');
        return;
      }

      isSubmitting = true;
      render();

      try {
        await topUpStream(topUpStreamId, amount, address);
        isSubmitting = false;
        showTopUpModal = false;
        showToast(`Stream #${topUpStreamId} topped up by ${amount} XLM!`, 'success');
        render();
      } catch (err) {
        isSubmitting = false;
        showToast(err.message || 'Top-up failed', 'error');
        render();
      }
    });
  }

  function startAccrualUpdates() {
    intervals.forEach(clearInterval);
    intervals = [];

    const interval = setInterval(() => {
      document.querySelectorAll('[data-accrued]').forEach((el) => {
        const id = parseInt(el.dataset.accrued);
        const accrued = getAccrued(id);
        el.textContent = accrued.toFixed(4);
      });
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
