/**
 * StreamFlow — Employer Dashboard
 */

import {
  createStream, getEmployerStreams, getAccrued, cancelStream,
  pauseStream, resumeStream, topUpStream, getEmployerTreasury,
  createTreasury, depositToTreasury,
} from '../contracts.js';
import { truncateAddress } from '../stellar.js';
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

  function render() {
    const streams = getEmployerStreams(address);
    const treasury = getEmployerTreasury(address);

    let totalPaid = 0;
    let totalFunded = 0;
    let activeCount = 0;

    streams.forEach(s => {
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
            <li><a href="/employee" data-link>Employee</a></li>
            <li>
              <div class="nav-wallet">
                <span class="dot"></span>
                ${truncateAddress(address)}
              </div>
            </li>
          </ul>
        </div>
      </nav>

      <div class="dashboard">
        <div class="container">
          <div class="dashboard-header flex flex-between">
            <div>
              <h1>Employer Dashboard</h1>
              <p class="text-muted">Manage your payroll streams and treasury.</p>
            </div>
            <button class="btn btn-primary" id="btn-create-stream">
              ＋ New Stream
            </button>
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
              <div class="stat-value" style="color: var(--accent-violet);">
                ${treasury ? treasury.balance.toFixed(2) : '—'}
              </div>
              <div class="stat-label">Treasury Balance</div>
            </div>
          </div>

          ${!treasury ? `
            <div class="card mb-lg" style="text-align: center; padding: var(--space-xl);">
              <h3 style="margin-bottom: var(--space-sm);">Create a Treasury</h3>
              <p class="text-muted mb-md" style="font-size: 0.9rem;">
                Pool funds in a treasury to manage multiple employee streams.
              </p>
              <button class="btn btn-outline" id="btn-create-treasury">
                Create Treasury
              </button>
            </div>
          ` : `
            <div class="card mb-lg">
              <div class="flex flex-between mb-md">
                <h3 style="font-size: 1.1rem;">💰 Treasury</h3>
                <div class="flex gap-sm">
                  <button class="btn btn-outline btn-sm" id="btn-deposit-treasury">
                    Deposit Funds
                  </button>
                </div>
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
                  <div class="text-muted" style="font-size: 0.8rem;">Available</div>
                  <div class="mono font-semibold text-success">${(treasury.balance - treasury.allocated).toFixed(2)} XLM</div>
                </div>
              </div>
            </div>
          `}

          <div class="card">
            <h3 style="font-size: 1.1rem; margin-bottom: var(--space-md);">Active Streams</h3>
            ${streams.length === 0 ? `
              <div class="empty-state">
                <div class="empty-icon">📡</div>
                <p>No streams yet. Create your first payroll stream to get started.</p>
              </div>
            ` : `
              <div class="table-wrapper">
                <table class="stream-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Employee</th>
                      <th>Rate</th>
                      <th>Accrued</th>
                      <th>Withdrawn</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="streams-tbody">
                    ${streams.map(s => renderStreamRow(s)).join('')}
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
    const progress = s.totalFunded > 0 ? ((s.withdrawn + accrued) / s.totalFunded * 100) : 0;

    const statusClass = {
      'Active': 'badge-active',
      'Paused': 'badge-paused',
      'Cancelled': 'badge-cancelled',
      'Completed': 'badge-completed',
    }[s.status] || '';

    return `
      <tr>
        <td class="mono">#${s.id}</td>
        <td class="address">${truncateAddress(s.employee)}</td>
        <td class="mono">${s.ratePerSecond.toFixed(4)}/s</td>
        <td class="mono text-success" data-accrued="${s.id}">${accrued.toFixed(4)}</td>
        <td class="mono">${s.withdrawn.toFixed(4)}</td>
        <td><span class="badge ${statusClass}">${s.status}</span></td>
        <td>
          <div class="flex gap-sm">
            ${s.status === 'Active' ? `
              <button class="btn btn-ghost btn-sm" data-action="pause" data-id="${s.id}" title="Pause">⏸</button>
              <button class="btn btn-ghost btn-sm" data-action="topup" data-id="${s.id}" title="Top Up">💰</button>
              <button class="btn btn-ghost btn-sm text-danger" data-action="cancel" data-id="${s.id}" title="Cancel">✕</button>
            ` : ''}
            ${s.status === 'Paused' ? `
              <button class="btn btn-ghost btn-sm" data-action="resume" data-id="${s.id}" title="Resume">▶</button>
              <button class="btn btn-ghost btn-sm text-danger" data-action="cancel" data-id="${s.id}" title="Cancel">✕</button>
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
              <label class="form-label">Employee Address</label>
              <input type="text" class="form-input mono" id="input-employee"
                placeholder="G..." value="">
            </div>
            <div class="grid-2 gap-md">
              <div class="form-group">
                <label class="form-label">Rate (XLM/second)</label>
                <input type="number" class="form-input mono" id="input-rate"
                  placeholder="0.05" step="0.001" min="0.001" value="0.05">
              </div>
              <div class="form-group">
                <label class="form-label">Duration</label>
                <select class="form-select" id="input-duration">
                  <option value="3600">1 Hour</option>
                  <option value="86400" selected>1 Day</option>
                  <option value="604800">1 Week</option>
                  <option value="2592000">30 Days</option>
                </select>
              </div>
            </div>

            <div class="card-flat" style="padding: var(--space-md);" id="stream-preview">
              <div class="text-muted" style="font-size: 0.85rem;">Preview will appear here</div>
            </div>

            <button class="btn btn-primary w-full" id="btn-submit-stream">
              Create Stream
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
            <button class="btn btn-primary w-full" id="btn-submit-topup">
              Top Up Stream
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function attachListeners() {
    document.getElementById('btn-create-stream')?.addEventListener('click', () => {
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

    // Preview stream cost
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
          <span class="text-muted" style="font-size: 0.85rem;">Rate</span>
          <span class="mono">${rate.toFixed(4)} XLM/s</span>
        </div>
        <div class="flex flex-between mb-sm">
          <span class="text-muted" style="font-size: 0.85rem;">Duration</span>
          <span class="mono">${durationLabel}</span>
        </div>
        <div class="flex flex-between" style="border-top: 1px solid var(--border-subtle); padding-top: var(--space-sm);">
          <span class="font-semibold">Total Cost</span>
          <span class="mono font-bold text-accent">${total.toFixed(2)} XLM</span>
        </div>
      `;
    }
    rateInput?.addEventListener('input', updatePreview);
    durationInput?.addEventListener('change', updatePreview);
    updatePreview();

    // Submit stream
    document.getElementById('btn-submit-stream')?.addEventListener('click', () => {
      const employee = document.getElementById('input-employee')?.value?.trim();
      const rate = parseFloat(document.getElementById('input-rate')?.value);
      const duration = parseInt(document.getElementById('input-duration')?.value);

      if (!employee) {
        showToast('Please enter an employee address', 'error');
        return;
      }
      if (!rate || rate <= 0) {
        showToast('Please enter a valid rate', 'error');
        return;
      }

      try {
        createStream(address, employee, 'XLM', rate, duration);
        showCreateModal = false;
        showToast('Stream created successfully!', 'success');
        trackEvent('employer', 'create_stream', employee);
        render();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    // Submit top up
    document.getElementById('btn-submit-topup')?.addEventListener('click', () => {
      const amount = parseFloat(document.getElementById('input-topup-amount')?.value);
      if (!amount || amount <= 0) {
        showToast('Invalid amount', 'error');
        return;
      }
      try {
        topUpStream(topUpStreamId, amount, address);
        showTopUpModal = false;
        showToast('Stream topped up!', 'success');
        render();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    // Stream actions
    document.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const id = parseInt(btn.dataset.id);

        try {
          switch (action) {
            case 'pause':
              pauseStream(id, address);
              showToast('Stream paused', 'info');
              break;
            case 'resume':
              resumeStream(id, address);
              showToast('Stream resumed', 'success');
              break;
            case 'cancel':
              if (confirm('Cancel this stream? Accrued amount will be paid to employee.')) {
                const result = cancelStream(id, address);
                showToast(`Stream cancelled. Employee: ${result.employeePayout.toFixed(2)}, Refund: ${result.employerRefund.toFixed(2)}`, 'info');
              } else {
                return;
              }
              break;
            case 'topup':
              topUpStreamId = id;
              showTopUpModal = true;
              break;
          }
          render();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    // Treasury
    document.getElementById('btn-create-treasury')?.addEventListener('click', () => {
      createTreasury(address, 'XLM');
      showToast('Treasury created!', 'success');
      render();
    });

    document.getElementById('btn-deposit-treasury')?.addEventListener('click', () => {
      const amount = prompt('Deposit amount (XLM):');
      if (amount && parseFloat(amount) > 0) {
        const treasury = getEmployerTreasury(address);
        if (treasury) {
          depositToTreasury(treasury.id, parseFloat(amount), address);
          showToast(`Deposited ${amount} XLM to treasury`, 'success');
          render();
        }
      }
    });
  }

  function startAccrualUpdates() {
    // Clear previous intervals
    intervals.forEach(clearInterval);
    intervals = [];

    // Update accrued values every second
    const interval = setInterval(() => {
      document.querySelectorAll('[data-accrued]').forEach(el => {
        const id = parseInt(el.dataset.accrued);
        const accrued = getAccrued(id);
        el.textContent = accrued.toFixed(4);
      });
    }, 1000);

    intervals.push(interval);
  }

  render();

  // Return cleanup function
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
