/**
 * StreamFlow — SEP-24 Anchor Off-Ramp Simulation
 * Simulates a realistic anchor withdrawal flow for testnet demo.
 */

import { trackEvent } from './analytics.js';

const OFFRAMP_KEY = 'streamflow_offramp_txns';

function getOfframpStore() {
  try {
    return JSON.parse(localStorage.getItem(OFFRAMP_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveOfframpStore(data) {
  localStorage.setItem(OFFRAMP_KEY, JSON.stringify(data));
}

const SUPPORTED_CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$', rate: 1.00 },
  { code: 'EUR', name: 'Euro', symbol: '€', rate: 0.92 },
  { code: 'GBP', name: 'British Pound', symbol: '£', rate: 0.79 },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', rate: 83.12 },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', rate: 1580.50 },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', rate: 4.97 },
];

const ANCHOR_INFO = {
  name: 'StreamFlow Anchor (Testnet)',
  domain: 'anchor.streamflow.demo',
  sep24Url: 'https://anchor.streamflow.demo/sep24',
  supported: SUPPORTED_CURRENCIES,
};

export function getAnchorInfo() {
  return ANCHOR_INFO;
}

export function getSupportedCurrencies() {
  return SUPPORTED_CURRENCIES;
}

/**
 * Simulate initiating a SEP-24 withdrawal.
 */
export async function initiateOfframp(amount, currencyCode, userAddress) {
  const currency = SUPPORTED_CURRENCIES.find(c => c.code === currencyCode);
  if (!currency) throw new Error('Unsupported currency');
  if (amount <= 0) throw new Error('Invalid amount');

  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 1500));

  const localAmount = (amount * currency.rate).toFixed(2);
  const fee = (amount * 0.005).toFixed(4); // 0.5% fee

  const tx = {
    id: `offramp_${Date.now()}`,
    status: 'completed',
    stellarAmount: amount,
    localAmount: parseFloat(localAmount),
    currency: currencyCode,
    currencySymbol: currency.symbol,
    fee: parseFloat(fee),
    userAddress,
    timestamp: new Date().toISOString(),
    anchorTxId: `SEP24-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
  };

  const store = getOfframpStore();
  store.push(tx);
  saveOfframpStore(store);

  trackEvent('offramp', 'completed', currencyCode, amount);
  return tx;
}

export function getOfframpHistory(userAddress) {
  return getOfframpStore()
    .filter(tx => !userAddress || tx.userAddress === userAddress)
    .reverse();
}

/**
 * Render the off-ramp UI section.
 */
export function renderOfframpSection(container, userAddress, availableBalance) {
  let selectedCurrency = 'USD';
  let offrampAmount = '';
  let isProcessing = false;

  function render() {
    const currency = SUPPORTED_CURRENCIES.find(c => c.code === selectedCurrency);
    const numAmount = parseFloat(offrampAmount) || 0;
    const localValue = (numAmount * currency.rate).toFixed(2);
    const history = getOfframpHistory(userAddress);

    container.innerHTML = `
      <div class="card offramp-card">
        <h3 style="margin-bottom: var(--space-md);">🌐 Off-Ramp to Local Currency</h3>
        <p class="text-muted mb-lg" style="font-size: 0.9rem;">
          Convert your streamed earnings to local currency via anchor (SEP-24 simulation)
        </p>

        <div class="offramp-steps mb-lg">
          <div class="offramp-step active">
            <div class="step-icon">💰</div>
            <div style="font-size: 0.8rem;">Withdraw</div>
          </div>
          <div class="offramp-step active">
            <div class="step-icon">🔄</div>
            <div style="font-size: 0.8rem;">Convert</div>
          </div>
          <div class="offramp-step active">
            <div class="step-icon">🏦</div>
            <div style="font-size: 0.8rem;">Receive</div>
          </div>
        </div>

        <div class="grid-2 gap-md mb-lg">
          <div class="form-group">
            <label class="form-label">Amount (XLM)</label>
            <input type="number" class="form-input mono" id="offramp-amount"
              placeholder="0.00" value="${offrampAmount}" step="0.01" min="0"
              max="${availableBalance}">
          </div>
          <div class="form-group">
            <label class="form-label">Target Currency</label>
            <select class="form-select" id="offramp-currency">
              ${SUPPORTED_CURRENCIES.map(c => `
                <option value="${c.code}" ${c.code === selectedCurrency ? 'selected' : ''}>
                  ${c.symbol} ${c.code} — ${c.name}
                </option>
              `).join('')}
            </select>
          </div>
        </div>

        ${numAmount > 0 ? `
          <div class="card-flat mb-lg" style="padding: var(--space-md);">
            <div class="flex flex-between mb-sm">
              <span class="text-muted" style="font-size: 0.85rem;">You send</span>
              <span class="mono font-semibold">${numAmount.toFixed(2)} XLM</span>
            </div>
            <div class="flex flex-between mb-sm">
              <span class="text-muted" style="font-size: 0.85rem;">Fee (0.5%)</span>
              <span class="mono" style="font-size: 0.85rem; color: var(--accent-amber);">
                -${(numAmount * 0.005).toFixed(4)} XLM
              </span>
            </div>
            <div style="border-top: 1px solid var(--border-subtle); padding-top: var(--space-sm); margin-top: var(--space-sm);">
              <div class="flex flex-between">
                <span class="font-semibold">You receive</span>
                <span class="mono font-bold text-success" style="font-size: 1.1rem;">
                  ${currency.symbol}${localValue}
                </span>
              </div>
            </div>
          </div>
        ` : ''}

        <button class="btn btn-success w-full ${isProcessing ? '' : ''}" id="offramp-submit"
          ${isProcessing || numAmount <= 0 ? 'disabled' : ''}>
          ${isProcessing ? '<span class="spinner"></span> Processing...' : `Convert to ${selectedCurrency}`}
        </button>

        ${history.length > 0 ? `
          <div class="mt-xl">
            <h4 style="font-size: 0.9rem; margin-bottom: var(--space-md);">Off-Ramp History</h4>
            <div class="tx-list">
              ${history.slice(0, 5).map(tx => `
                <div class="tx-item">
                  <div>
                    <div class="tx-hash">${tx.anchorTxId}</div>
                    <div class="tx-time">${new Date(tx.timestamp).toLocaleString()}</div>
                  </div>
                  <div style="text-align: right;">
                    <div class="tx-amount">${tx.currencySymbol}${tx.localAmount}</div>
                    <div class="text-muted" style="font-size: 0.75rem;">${tx.stellarAmount} XLM</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    // Event listeners
    const amountInput = container.querySelector('#offramp-amount');
    const currencySelect = container.querySelector('#offramp-currency');
    const submitBtn = container.querySelector('#offramp-submit');

    amountInput?.addEventListener('input', (e) => {
      offrampAmount = e.target.value;
      render();
    });

    currencySelect?.addEventListener('change', (e) => {
      selectedCurrency = e.target.value;
      render();
    });

    submitBtn?.addEventListener('click', async () => {
      if (isProcessing || numAmount <= 0) return;
      isProcessing = true;
      render();

      try {
        await initiateOfframp(numAmount, selectedCurrency, userAddress);
        offrampAmount = '';
        isProcessing = false;
        render();
        showToast(`Successfully converted to ${selectedCurrency}!`, 'success');
      } catch (err) {
        isProcessing = false;
        render();
        showToast(err.message, 'error');
      }
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
  setTimeout(() => toast.remove(), 3000);
}
