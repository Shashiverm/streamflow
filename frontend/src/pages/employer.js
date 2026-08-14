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
} from '../contracts.js';
import { truncateAddress, CONTRACTS, getAccountBalance } from '../stellar.js';
import { trackPageView, trackEvent } from '../analytics.js';
import { navigate } from '../router.js';

export function renderEmployer(app) {
  trackPageView('/employer');

  const address = localStorage.getItem('streamflow_address') || '';
  if (!address) {
    navigate('/onboarding');
    return;
  }

  let showCreateModal = false;
  let showTopUpModal = false;
  let topUpStreamId = null;
  let intervals = [];
  let employerBalance = 0;
  let isSubmitting = false;

  getAccountBalance(address)
    .then((b) => {
      employerBalance = b.xlm;
      const balEl = document.getElementById('employer-balance-val');
      if (balEl) balEl.textContent = `${employerBalance.toFixed(2)} XLM`;
    })
    .catch(() => {});

  function render() {
    const streams = getEmployerStreams(address);
    const treasury = getEmployerTreasury(address);

    let totalPaid = 0;
    let totalFunded = 0;
    let activeCount = 0;

    streams.forEach((s) => {
      totalFunded += s.totalFunded;
      totalPaid += s.withdrawn;
      if (s.status === 'Active' || s.status === 'Paused') activeCount++;
    });

    app.innerHTML = `
      <nav class="navbar">
        <div class="container">
          <a href="/" data-link class="navbar-brand">
            <img src="/logo.svg" alt="StreamFlow">
            <span>Stream<span class="gradient-text">Flow</span></span>
          </a>
          <ul class="navbar-nav">
            <li><a href="/employer" data-link class="active">Employer</a></li>
            <li><a href="/employee" data-link>Employee Portal</a></li>
            <li>
              <div class="nav-wallet" title="${address}">
                <span class="dot"></span>
                <span>${truncateAddress(address)}</span>
              </div>
            </li>
            <li>
              <button class="btn btn-ghost btn-sm" id="nav-btn-disconnect" title="Disconnect wallet">
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
              <h1>Employer Dashboard</h1>
              <p class="text-muted">
                Connected: <span class="mono text-accent">${address}</span>
              </p>
            </div>
            <div class="flex gap-sm">
              <button class="btn btn-primary" id="btn-create-stream">
                ＋ Create Stream
              </button>
            </div>
          </div>

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
              <div class="stat-value" id="employer-balance-val" style="color: var(--accent-violet);">
                ${employerBalance ? employerBalance.toFixed(2) + ' XLM' : '—'}
              </div>
              <div class="stat-label">Wallet Balance</div>
            </div>
          </div>

          ${!treasury ? `
            <div class="card mb-lg" style="text-align: center; padding: var(--space-xl);">
              <h3 style="margin-bottom: var(--space-sm);">🏢 Pooled Payroll Treasury</h3>
              <p class="text-muted mb-md" style="font-size: 0.9rem;">
                Pool funds once to open multiple employee streams on the Soroban Treasury Contract.
              </p>
              <button class="btn btn-outline" id="btn-create-treasury">
                Deploy Employer Treasury
              </button>
            </div>
          ` : `
            <div class="card mb-lg">
              <div class="flex flex-between mb-md">
                <div>
                  <h3 style="font-size: 1.1rem;">💰 Employer Treasury</h3>
                  <div class="text-muted" style="font-size: 0.75rem;">
                    Contract: <span class="mono">${truncateAddress(CONTRACTS.TREASURY)}</span>
                  </div>
                </div>
                <button class="btn btn-outline btn-sm" id="btn-deposit-treasury">
                  ＋ Deposit Funds
                </button>
              </div>
              <div class="grid-3 gap-md">
                <div>
                  <div class="text-muted" style="font-size: 0.8rem;">Total Balance</div>
                  <div class="mono font-semibold">${treasury.balance.toFixed(2)} XLM</div>
                </div>
                <div>
                  <div class="text-muted" style="font-size: 0.8rem;">Allocated</div>
                  <div class="mono font-semibold">${treasury.allocated.toFixed(2)} XLM</div>
                </div>
                <div>
                  <div class="text-muted" style="font-size: 0.8rem;">Available for Streams</div>
                  <div class="mono font-semibold text-success">${Math.max(0, treasury.balance - treasury.allocated).toFixed(2)} XLM</div>
                </div>
              </div>
            </div>
          `}

          <div class="card">
            <div class="flex flex-between mb-md">
              <h3 style="font-size: 1.1rem;">📡 Payroll Streams</h3>
              <span class="text-muted" style="font-size: 0.8rem;">
                Contract: <span class="mono">${truncateAddress(CONTRACTS.STREAM)}</span>
              </span>
            </div>

            ${streams.length === 0 ? `
              <div class="empty-state">
                <div class="empty-icon">📡</div>
                <p>No streams created yet with this wallet.</p>
                <button class="btn btn-primary btn-sm mt-md" id="btn-empty-create">
                  Create First Stream
                </button>
              </div>
            ` : `
              <div class="table-wrapper">
                <table class="stream-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Recipient Employee</th>
                      <th>Rate</th>
                      <th>Live Accrued</th>
                      <th>Withdrawn</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="streams-tbody">
                    ${streams.map((s) => renderStreamRow(s)).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>
        </div>
      </div>

      ${showCreateModal ? renderCreateModal() : ''}
      ${showTopUpModal ? renderTopUpModal() : ''}
    `;

    attachListeners();
    startAccrualUpdates();
  }

  function renderStreamRow(s) {
    const accrued = getAccrued(s.id);
    const statusClass = {
      Active: 'badge-active',
      Paused: 'badge-paused',
      Cancelled: 'badge-cancelled',
      Completed: 'badge-completed',
    }[s.status] || '';

    return `
      <tr>
        <td class="mono">#${s.id}</td>
        <td class="address" title="${s.employee}">${truncateAddress(s.employee)}</td>
        <td class="mono">${s.ratePerSecond.toFixed(4)}/s</td>
        <td class="mono text-success" data-accrued="${s.id}">${accrued.toFixed(4)}</td>
        <td class="mono">${s.withdrawn.toFixed(4)}</td>
        <td><span class="badge ${statusClass}">${s.status}</span></td>
        <td>
          <div class="flex gap-sm">
            ${s.status === 'Active' ? `
              <button class="btn btn-ghost btn-sm" data-action="pause" data-id="${s.id}" title="Pause accrual">⏸ Pause</button>
              <button class="btn btn-ghost btn-sm" data-action="topup" data-id="${s.id}" title="Top up funds">💰 Top-up</button>
              <button class="btn btn-ghost btn-sm text-danger" data-action="cancel" data-id="${s.id}" title="Cancel stream">✕ Cancel</button>
            ` : ''}
            ${s.status === 'Paused' ? `
              <button class="btn btn-ghost btn-sm" data-action="resume" data-id="${s.id}" title="Resume stream">▶ Resume</button>
              <button class="btn btn-ghost btn-sm text-danger" data-action="cancel" data-id="${s.id}" title="Cancel stream">✕ Cancel</button>
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
                placeholder="G..." autocomplete="off">
            </div>
            <div class="grid-2 gap-md">
              <div class="form-group">
                <label class="form-label">Rate (XLM/second)</label>
                <input type="number" class="form-input mono" id="input-rate"
                  placeholder="0.05" step="0.001" min="0.0001" value="0.05">
              </div>
              <div class="form-group">
                <label class="form-label">Duration</label>
                <select class="form-select" id="input-duration">
                  <option value="3600">1 Hour</option>
                  <option value="86400" selected>1 Day (24 Hours)</option>
                  <option value="604800">1 Week (7 Days)</option>
                  <option value="2592000">30 Days (1 Month)</option>
                </select>
              </div>
            </div>

            <div class="card-flat" style="padding: var(--space-md);" id="stream-preview">
              <div class="text-muted" style="font-size: 0.85rem;">Calculating...</div>
            </div>

            <button class="btn btn-primary w-full" id="btn-submit-stream" ${isSubmitting ? 'disabled' : ''}>
              ${isSubmitting ? '<span class="spinner"></span> Processing...' : 'Authorize & Create Stream'}
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
      localStorage.removeItem('streamflow_address');
      localStorage.removeItem('streamflow_role');
      navigate('/onboarding');
    });

    document.getElementById('btn-create-stream')?.addEventListener('click', () => {
      showCreateModal = true;
      render();
    });

    document.getElementById('btn-empty-create')?.addEventListener('click', () => {
      showCreateModal = true;
      render();
    });

    document.getElementById('modal-close')?.addEventListener('click', () => {
      showCreateModal = false;
      showTopUpModal = false;
      render();
    });

    document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay') {
        showCreateModal = false;
        showTopUpModal = false;
        render();
      }
    });

    // Preview
    const rateInput = document.getElementById('input-rate');
    const durationInput = document.getElementById('input-duration');
    const previewEl = document.getElementById('stream-preview');

    function updatePreview() {
      if (!rateInput || !durationInput || !previewEl) return;
      const rate = parseFloat(rateInput.value) || 0;
      const duration = parseInt(durationInput.value) || 0;
      const total = rate * duration;
      const durationLabel = durationInput.options[durationInput.selectedIndex]?.text || '';

      previewEl.innerHTML = `
        <div class="flex flex-between mb-sm">
          <span class="text-muted" style="font-size: 0.85rem;">Streaming Rate</span>
          <span class="mono">${rate.toFixed(4)} XLM/sec</span>
        </div>
        <div class="flex flex-between mb-sm">
          <span class="text-muted" style="font-size: 0.85rem;">Stream Duration</span>
          <span class="mono">${durationLabel}</span>
        </div>
        <div class="flex flex-between" style="border-top: 1px solid var(--border-subtle); padding-top: var(--space-sm);">
          <span class="font-semibold">Total Escrow Amount</span>
          <span class="mono font-bold text-accent">${total.toFixed(2)} XLM</span>
        </div>
      `;
    }
    rateInput?.addEventListener('input', updatePreview);
    durationInput?.addEventListener('change', updatePreview);
    updatePreview();

    // Submit Stream
    document.getElementById('btn-submit-stream')?.addEventListener('click', async () => {
      const employee = document.getElementById('input-employee')?.value?.trim();
      const rate = parseFloat(document.getElementById('input-rate')?.value);
      const duration = parseInt(document.getElementById('input-duration')?.value);

      if (!employee || !employee.startsWith('G')) {
        showToast('Please enter a valid recipient Stellar public key (starting with G).', 'error');
        return;
      }
      if (!rate || rate <= 0) {
        showToast('Please enter a valid rate greater than 0.', 'error');
        return;
      }

      isSubmitting = true;
      render();

      try {
        await createStream(address, employee, 'XLM', rate, duration);
        showCreateModal = false;
        isSubmitting = false;
        showToast('Payroll stream successfully created on Soroban!', 'success');
        trackEvent('employer', 'create_stream', employee);
        render();
      } catch (err) {
        isSubmitting = false;
        showToast(err.message || 'Failed to create stream.', 'error');
        render();
      }
    });

    // Top up
    document.getElementById('btn-submit-topup')?.addEventListener('click', async () => {
      const amount = parseFloat(document.getElementById('input-topup-amount')?.value);
      if (!amount || amount <= 0) {
        showToast('Invalid amount', 'error');
        return;
      }
      isSubmitting = true;
      render();
      try {
        await topUpStream(topUpStreamId, amount, address);
        showTopUpModal = false;
        isSubmitting = false;
        showToast('Stream topped up successfully!', 'success');
        render();
      } catch (err) {
        isSubmitting = false;
        showToast(err.message, 'error');
        render();
      }
    });

    // Stream action buttons
    document.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        const id = parseInt(btn.dataset.id);

        try {
          if (action === 'pause') {
            await pauseStream(id, address);
            showToast('Stream paused', 'info');
          } else if (action === 'resume') {
            await resumeStream(id, address);
            showToast('Stream resumed', 'success');
          } else if (action === 'cancel') {
            if (confirm('Cancel this stream? Accrued funds will be settled to the employee immediately.')) {
              const res = await cancelStream(id, address);
              showToast(`Stream cancelled. Paid to employee: ${res.employeePayout.toFixed(2)} XLM, Refunded: ${res.employerRefund.toFixed(2)} XLM`, 'info');
            } else {
              return;
            }
          } else if (action === 'topup') {
            topUpStreamId = id;
            showTopUpModal = true;
          }
          render();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    // Treasury
    document.getElementById('btn-create-treasury')?.addEventListener('click', async () => {
      try {
        await createTreasury(address, 'XLM');
        showToast('Employer Treasury created on Soroban!', 'success');
        render();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    document.getElementById('btn-deposit-treasury')?.addEventListener('click', async () => {
      const amountStr = prompt('Enter deposit amount in XLM:');
      if (amountStr && parseFloat(amountStr) > 0) {
        const treasury = getEmployerTreasury(address);
        if (treasury) {
          try {
            await depositToTreasury(treasury.id, parseFloat(amountStr), address);
            showToast(`Deposited ${amountStr} XLM to Treasury!`, 'success');
            render();
          } catch (err) {
            showToast(err.message, 'error');
          }
        }
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
