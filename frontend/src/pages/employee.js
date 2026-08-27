/**
 * StreamFlow — Employee Dashboard
 * Real-time accrual, batch claims, cliff vesting & key migration
 */

import {
  getEmployeeStreams,
  getAccrued,
  withdrawFromStream,
  batchWithdrawAll,
  transferRecipient,
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
import { renderOfframpSection } from '../anchor.js';
import { navigate } from '../router.js';

const PAGE_SIZE = 25;

export function renderEmployee(app) {
  trackPageView('/employee');

  const address = localStorage.getItem('streamflow_address') || '';
  const walletType = getConnectedWalletType() || localStorage.getItem('streamflow_wallet_type') || 'wallet';
  if (!address) { navigate('/onboarding'); return; }

  let intervals = [];
  let showWithdrawModal = false;
  let showTransferModal = false;
  let showQRModal = false;
  let withdrawStreamId = null;
  let transferStreamId = null;
  let isWithdrawing = false;
  let isTransferring = false;
  let employeeBalance = 0;
  let selectedCurrencyDisplay = 'XLM';
  let currentPage = 0;

  const XLM_TO_USD = 0.12;
  const XLM_TO_EUR = 0.11;

  getAccountBalance(address)
    .then((b) => { employeeBalance = b.xlm; const el = document.getElementById('employee-balance-val'); if (el) el.textContent = `${employeeBalance.toFixed(2)} XLM`; })
    .catch(() => {});

  function render() {
    intervals.forEach(clearInterval);
    intervals = [];

    const streams = getEmployeeStreams(address);

    let totalAccrued = 0;
    let totalWithdrawn = 0;
    let activeStreams = 0;
    let combinedRatePerSecond = 0;

    streams.forEach((s) => {
      const accrued = getAccrued(s.id);
      totalAccrued += accrued;
      totalWithdrawn += s.withdrawn;
      if (s.status === 'Active') { activeStreams++; combinedRatePerSecond += s.ratePerSecond; }
    });

    const projMonthly = combinedRatePerSecond * 86400 * 30;

    let displayAmount = totalAccrued.toFixed(4);
    let currencySymbol = 'XLM';
    if (selectedCurrencyDisplay === 'USD') { displayAmount = `$${(totalAccrued * XLM_TO_USD).toFixed(4)}`; currencySymbol = 'USD'; }
    else if (selectedCurrencyDisplay === 'EUR') { displayAmount = `€${(totalAccrued * XLM_TO_EUR).toFixed(4)}`; currencySymbol = 'EUR'; }

    // Pagination
    const totalPages = Math.max(1, Math.ceil(streams.length / PAGE_SIZE));
    if (currentPage >= totalPages) currentPage = totalPages - 1;
    const pageStreams = streams.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

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
            <li><a href="/employer" data-link>Employer</a></li>
            <li><a href="/employee" data-link class="active">Employee</a></li>
            <li>
              <div class="nav-wallet-chip" title="${address}">
                <span class="dot"></span>
                <span class="chip-text">${truncateAddress(address)}</span>
                <span class="badge badge-active" style="font-size: 0.65rem;">${walletType.toUpperCase()}</span>
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
              <h1>Earnings</h1>
              <p class="text-muted" style="margin-top: 4px; word-break: break-all;">
                Wallet: <span class="mono" style="color: var(--accent-mint);">${address}</span>
              </p>
            </div>

            <div class="flex gap-sm align-center" style="flex-wrap: wrap;">
              <button class="btn btn-outline btn-sm" id="btn-share-qr">
                Share Address
              </button>
              <button class="btn btn-outline btn-sm" id="btn-export-csv">
                Export Pay Stubs
              </button>
              <button class="btn btn-primary btn-sm" id="btn-batch-claim-all" ${totalAccrued <= 0 ? 'disabled' : ''}>
                Claim All (${totalAccrued.toFixed(2)} XLM)
              </button>
            </div>
          </div>

          <!-- Live Balance Hero -->
          <div class="card card-gold mb-xl" style="padding: clamp(16px, 3vw, 32px); text-align: center; position: relative;">
            <div class="flex flex-between align-center mb-md" style="flex-wrap: wrap; gap: var(--space-xs);">
              <span class="text-muted" style="font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600;">
                Unclaimed Accrued Wages
              </span>
              <div class="tab-group" style="margin: 0; padding: 2px;">
                <button class="tab-btn ${selectedCurrencyDisplay === 'XLM' ? 'active' : ''}" data-curr="XLM" style="padding: 4px 10px; font-size: 0.75rem;">XLM</button>
                <button class="tab-btn ${selectedCurrencyDisplay === 'USD' ? 'active' : ''}" data-curr="USD" style="padding: 4px 10px; font-size: 0.75rem;">USD</button>
                <button class="tab-btn ${selectedCurrencyDisplay === 'EUR' ? 'active' : ''}" data-curr="EUR" style="padding: 4px 10px; font-size: 0.75rem;">EUR</button>
              </div>
            </div>

            <div class="mono font-bold streaming" id="hero-live-counter" style="font-size: clamp(2rem, 4.2vw, 3.4rem); margin: var(--space-md) 0; font-variant-numeric: tabular-nums;">
              ${displayAmount}
            </div>

            <p class="text-muted" style="font-size: 0.88rem; margin-bottom: var(--space-lg);">
              Accruing at <span class="mono font-bold" style="color: var(--accent-mint);">${combinedRatePerSecond.toFixed(6)} XLM/sec</span> across ${activeStreams} active stream(s)
            </p>

            <div class="flex flex-center gap-md flex-wrap">
              <button class="btn btn-primary btn-lg" id="btn-hero-claim-all" ${totalAccrued <= 0 ? 'disabled' : ''}>
                Withdraw Accrued Balance
              </button>
              <a href="#anchor-offramp" class="btn btn-outline btn-lg">
                Off-Ramp to Fiat (SEP-24)
              </a>
            </div>
          </div>

          <!-- Stats -->
          <div class="grid-4 gap-md mb-xl">
            <div class="card stat-card">
              <div class="stat-header">
                <span class="stat-label">Active Streams</span>
                <div class="stat-icon">#</div>
              </div>
              <div class="stat-value streaming">${activeStreams}</div>
            </div>

            <div class="card stat-card card-gold">
              <div class="stat-header">
                <span class="stat-label">Total Withdrawn</span>
                <div class="stat-icon gold">$</div>
              </div>
              <div class="stat-value gold-text">${totalWithdrawn.toFixed(2)} XLM</div>
            </div>

            <div class="card stat-card">
              <div class="stat-header">
                <span class="stat-label">Projected Monthly</span>
                <div class="stat-icon">~</div>
              </div>
              <div class="stat-value" style="color: var(--accent-mint);">${projMonthly.toFixed(0)} XLM</div>
            </div>

            <div class="card stat-card card-gold">
              <div class="stat-header">
                <span class="stat-label">Wallet Balance</span>
                <div class="stat-icon gold">W</div>
              </div>
              <div class="stat-value" id="employee-balance-val" style="color: var(--accent-gold);">${employeeBalance.toFixed(2)} XLM</div>
            </div>
          </div>

          <!-- Streams Table -->
          <div class="card mb-xl" style="padding: var(--space-lg);">
            <div class="flex flex-between align-center mb-md">
              <div class="flex align-center gap-xs">
                <h3 style="margin: 0;">Incoming Streams</h3>
                <span class="badge badge-active">${streams.length}</span>
              </div>
            </div>

            <div class="table-container">
              <table class="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Employer</th>
                    <th>Flow Rate</th>
                    <th>Claimed / Total</th>
                    <th>Claimable</th>
                    <th>Cliff</th>
                    <th>Status</th>
                    <th style="text-align: right;">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${pageStreams.length === 0 ? `
                    <tr>
                      <td colspan="8" style="text-align: center; padding: var(--space-2xl) 0;" class="text-muted">
                        No payroll streams found. Share your Stellar address with your employer.
                      </td>
                    </tr>
                  ` : pageStreams.map((s) => {
                    const accrued = getAccrued(s.id);
                    const now = Date.now() / 1000;
                    const isCliffActive = s.cliffTime > 0 && now < s.cliffTime;

                    return `
                      <tr>
                        <td class="mono font-bold" style="color: var(--accent-mint);">#${s.id}</td>
                        <td><span class="mono">${truncateAddress(s.employer)}</span></td>
                        <td class="mono">${s.ratePerSecond} <span class="text-muted" style="font-size: 0.75rem;">/s</span></td>
                        <td class="mono">${s.withdrawn.toFixed(1)} / ${s.totalFunded} XLM</td>
                        <td class="mono font-bold" style="color: var(--accent-mint);" id="stream-live-accrued-${s.id}">
                          ${accrued.toFixed(4)} XLM
                        </td>
                        <td>
                          ${isCliffActive ? `
                            <span class="badge badge-cliff">
                              Locked until ${new Date(s.cliffTime * 1000).toLocaleDateString()}
                            </span>
                          ` : `
                            <span class="text-muted" style="font-size: 0.8rem;">Unlocked</span>
                          `}
                        </td>
                        <td>
                          <span class="badge badge-${s.status.toLowerCase()}">${s.status}</span>
                        </td>
                        <td style="text-align: right;">
                          <div class="flex gap-xs" style="justify-content: flex-end;">
                            <button class="btn btn-primary btn-sm btn-action-withdraw" data-id="${s.id}" ${accrued <= 0 ? 'disabled' : ''}>
                              Claim
                            </button>
                            <button class="btn btn-outline btn-sm btn-action-migrate" data-id="${s.id}" title="Migrate payout address">
                              Migrate
                            </button>
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>

            ${totalPages > 1 ? `
              <div class="pagination">
                <button class="pagination-btn" id="page-prev" ${currentPage === 0 ? 'disabled' : ''}>&laquo; Prev</button>
                <span class="pagination-info">Page ${currentPage + 1} of ${totalPages}</span>
                <button class="pagination-btn" id="page-next" ${currentPage >= totalPages - 1 ? 'disabled' : ''}>Next &raquo;</button>
              </div>
            ` : ''}
          </div>

          <!-- Off-Ramp Section -->
          <div id="anchor-offramp" class="card card-gold mb-xl" style="padding: var(--space-xl);">
            <div class="flex align-center gap-xs mb-sm">
              <h3 style="margin: 0;">Off-Ramp (SEP-24)</h3>
              <span class="badge badge-active">Global</span>
            </div>
            <p class="text-muted" style="font-size: 0.88rem; margin-bottom: var(--space-lg);">
              Convert accrued XLM/USDC to your local bank, mobile wallet, or cash pickup via regulated Stellar Anchors.
            </p>

            <div class="grid-3 gap-md">
              <div class="card-flat" style="padding: var(--space-md); background: rgba(0,0,0,0.3);">
                <div class="flex align-center gap-xs mb-xs">
                  <strong style="color: var(--accent-gold);">MoneyGram</strong>
                </div>
                <p style="font-size: 0.78rem; color: var(--text-secondary); margin-bottom: var(--space-sm);">
                  400,000+ locations in 180+ countries. Zero fees.
                </p>
                <a href="https://www.moneygram.com/stellar" target="_blank" class="btn btn-outline btn-sm" style="width: 100%;">
                  Open MoneyGram
                </a>
              </div>

              <div class="card-flat" style="padding: var(--space-md); background: rgba(0,0,0,0.3);">
                <div class="flex align-center gap-xs mb-xs">
                  <strong style="color: var(--accent-gold);">Bitso (LATAM)</strong>
                </div>
                <p style="font-size: 0.78rem; color: var(--text-secondary); margin-bottom: var(--space-sm);">
                  Instant bank payout in MXN, ARS, BRL, COP via SPEI/PIX.
                </p>
                <a href="https://bitso.com" target="_blank" class="btn btn-outline btn-sm" style="width: 100%;">
                  Open Bitso
                </a>
              </div>

              <div class="card-flat" style="padding: var(--space-md); background: rgba(0,0,0,0.3);">
                <div class="flex align-center gap-xs mb-xs">
                  <strong style="color: var(--accent-gold);">Cowrie (Africa)</strong>
                </div>
                <p style="font-size: 0.78rem; color: var(--text-secondary); margin-bottom: var(--space-sm);">
                  Nigerian Naira (NGN) bank and mobile wallet off-ramping.
                </p>
                <a href="https://cowrie.exchange" target="_blank" class="btn btn-outline btn-sm" style="width: 100%;">
                  Open Cowrie
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      ${showWithdrawModal ? renderWithdrawModal(streams) : ''}
      ${showTransferModal ? renderTransferModal() : ''}
      ${showQRModal ? renderQRModal() : ''}
    `;

    attachListeners();
    startLiveTickers(pageStreams);
  }

  function renderWithdrawModal(streams) {
    const stream = streams.find((s) => s.id === withdrawStreamId);
    const accrued = stream ? getAccrued(stream.id) : 0;

    return `
      <div class="modal-backdrop" id="modal-backdrop-withdraw">
        <div class="modal-content">
          <div class="modal-header">
            <h3 style="margin: 0;">Withdraw from Stream #${withdrawStreamId}</h3>
            <button class="modal-close" id="btn-close-withdraw">&times;</button>
          </div>
          <form id="form-withdraw">
            <div class="card-flat mb-md" style="padding: var(--space-md); background: rgba(0,0,0,0.3);">
              <span class="text-muted" style="font-size: 0.78rem;">Claimable:</span>
              <div class="mono font-bold" style="color: var(--accent-mint); font-size: 1.4rem;">${accrued.toFixed(4)} XLM</div>
            </div>
            <div class="form-group mb-md">
              <label class="form-label">Amount (XLM)</label>
              <input type="number" step="0.0001" max="${accrued}" class="form-input mono" id="input-withdraw-amount" value="${accrued.toFixed(4)}" required>
            </div>
            <button type="submit" class="btn btn-primary btn-lg w-full" style="width: 100%;" ${isWithdrawing ? 'disabled' : ''}>
              ${isWithdrawing ? 'Processing...' : 'Confirm Claim'}
            </button>
          </form>
        </div>
      </div>
    `;
  }

  function renderTransferModal() {
    return `
      <div class="modal-backdrop" id="modal-backdrop-transfer">
        <div class="modal-content">
          <div class="modal-header">
            <h3 style="margin: 0;">Migrate Wallet (Stream #${transferStreamId})</h3>
            <button class="modal-close" id="btn-close-transfer">&times;</button>
          </div>
          <form id="form-transfer">
            <p class="text-muted" style="font-size: 0.82rem; margin-bottom: var(--space-md);">
              Transfer future accrual and claim rights to a different wallet address.
            </p>
            <div class="form-group mb-md">
              <label class="form-label">New Stellar address (G...)</label>
              <input type="text" class="form-input mono" id="input-new-recipient" placeholder="G..." required>
            </div>
            <button type="submit" class="btn btn-gold btn-lg w-full" style="width: 100%;" ${isTransferring ? 'disabled' : ''}>
              ${isTransferring ? 'Migrating...' : 'Authorize Migration'}
            </button>
          </form>
        </div>
      </div>
    `;
  }

  function renderQRModal() {
    return `
      <div class="modal-backdrop" id="modal-backdrop-qr">
        <div class="modal-content text-center" style="text-align: center;">
          <div class="modal-header">
            <h3 style="margin: 0;">Share Stellar Address</h3>
            <button class="modal-close" id="btn-close-qr">&times;</button>
          </div>
          <div style="background: white; padding: var(--space-md); border-radius: var(--radius-md); display: inline-block; margin: var(--space-md) auto;">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${address}" alt="Stellar Address QR" style="display: block;">
          </div>
          <div class="mono font-bold mt-sm mb-md" style="font-size: 0.8rem; word-break: break-all; color: var(--accent-mint);">
            ${address}
          </div>
          <button class="btn btn-primary w-full" id="btn-copy-qr-address">
            Copy Address
          </button>
        </div>
      </div>
    `;
  }

  function startLiveTickers(streams) {
    const interval = setInterval(() => {
      let totalAccrued = 0;
      streams.forEach((s) => {
        const accrued = getAccrued(s.id);
        totalAccrued += accrued;
        const el = document.getElementById(`stream-live-accrued-${s.id}`);
        if (el) el.textContent = `${accrued.toFixed(4)} XLM`;
      });

      const heroEl = document.getElementById('hero-live-counter');
      if (heroEl) {
        if (selectedCurrencyDisplay === 'USD') heroEl.textContent = `$${(totalAccrued * XLM_TO_USD).toFixed(4)}`;
        else if (selectedCurrencyDisplay === 'EUR') heroEl.textContent = `€${(totalAccrued * XLM_TO_EUR).toFixed(4)}`;
        else heroEl.textContent = totalAccrued.toFixed(4);
      }
    }, 500); // 500ms — smooth enough, much less CPU than 150ms
    intervals.push(interval);
  }

  function attachListeners() {
    // Currency toggle
    document.querySelectorAll('.tab-btn[data-curr]').forEach((btn) => {
      btn.addEventListener('click', () => { selectedCurrencyDisplay = btn.dataset.curr; render(); });
    });

    // Pagination
    document.getElementById('page-prev')?.addEventListener('click', () => { if (currentPage > 0) { currentPage--; render(); } });
    document.getElementById('page-next')?.addEventListener('click', () => { currentPage++; render(); });

    // Batch Claim
    const handleClaimAll = async () => {
      const streams = getEmployeeStreams(address);
      const streamIds = streams.map((s) => s.id);
      try {
        const res = await batchWithdrawAll(address, streamIds);
        showToast(`Claimed ${res.totalWithdrawn.toFixed(4)} XLM across ${res.txCount} stream(s)`, 'success');
        const bal = await getAccountBalance(address);
        employeeBalance = bal.xlm;
        render();
      } catch (err) { showToast(err.message, 'error'); }
    };

    document.getElementById('btn-batch-claim-all')?.addEventListener('click', handleClaimAll);
    document.getElementById('btn-hero-claim-all')?.addEventListener('click', handleClaimAll);

    // Single Claim
    document.querySelectorAll('.btn-action-withdraw').forEach((btn) => {
      btn.addEventListener('click', () => { withdrawStreamId = parseInt(btn.dataset.id); showWithdrawModal = true; render(); });
    });

    document.getElementById('btn-close-withdraw')?.addEventListener('click', () => { showWithdrawModal = false; render(); });

    document.getElementById('form-withdraw')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = parseFloat(document.getElementById('input-withdraw-amount')?.value);
      if (isNaN(amount) || amount <= 0) return;
      isWithdrawing = true; render();
      try {
        await withdrawFromStream(withdrawStreamId, amount, address);
        isWithdrawing = false; showWithdrawModal = false;
        showToast(`Withdrawn ${amount} XLM`, 'success');
        const bal = await getAccountBalance(address);
        employeeBalance = bal.xlm;
        render();
      } catch (err) { isWithdrawing = false; showToast(err.message, 'error'); render(); }
    });

    // Key Migration
    document.querySelectorAll('.btn-action-migrate').forEach((btn) => {
      btn.addEventListener('click', () => { transferStreamId = parseInt(btn.dataset.id); showTransferModal = true; render(); });
    });

    document.getElementById('btn-close-transfer')?.addEventListener('click', () => { showTransferModal = false; render(); });

    document.getElementById('form-transfer')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newRecipient = document.getElementById('input-new-recipient')?.value.trim();
      if (!newRecipient || !newRecipient.startsWith('G')) { showToast('Enter a valid Stellar address starting with G.', 'error'); return; }
      isTransferring = true; render();
      try {
        await transferRecipient(transferStreamId, address, newRecipient);
        isTransferring = false; showTransferModal = false;
        showToast(`Stream #${transferStreamId} migrated to ${truncateAddress(newRecipient)}`, 'success');
        render();
      } catch (err) { isTransferring = false; showToast(err.message, 'error'); render(); }
    });

    // QR Modal
    document.getElementById('btn-share-qr')?.addEventListener('click', () => { showQRModal = true; render(); });
    document.getElementById('btn-close-qr')?.addEventListener('click', () => { showQRModal = false; render(); });
    document.getElementById('btn-copy-qr-address')?.addEventListener('click', () => { navigator.clipboard.writeText(address); showToast('Address copied', 'success'); });

    // Export CSV
    document.getElementById('btn-export-csv')?.addEventListener('click', () => {
      try { exportPayrollCSV(address, 'employee'); showToast('CSV downloaded', 'success'); }
      catch (err) { showToast(err.message, 'error'); }
    });

    // Logout
    document.getElementById('nav-btn-disconnect')?.addEventListener('click', () => { disconnectWallet(); navigate('/'); });
  }

  render();
  return () => { intervals.forEach(clearInterval); };
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
