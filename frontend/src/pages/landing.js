/**
 * StreamFlow — Landing Page
 */

import { trackPageView } from '../analytics.js';
import { CONTRACTS } from '../stellar.js';
import { getRecentFeedbacks, getFeedbackSummary, openFeedbackModal, fetchFeedbacks } from '../feedback.js';
import { escapeHtml } from '../utils.js';

export function renderLanding(app) {
  trackPageView('/');

  let streamedAmount = 487619.20;
  let animFrame;
  let activeModal = null;

  // Simulator state
  let simSalary = 6500;
  let sessionAccrued = 0;

  // ROI calculator state
  let enterpriseTeamSize = 45;
  let enterpriseAvgSalary = 5000;

  function calculateROI(teamSize, avgSalary) {
    const monthlyWireFees = teamSize * 35;
    const monthlyFX = (teamSize * avgSalary) * 0.022;
    const monthlyTotal = monthlyWireFees + monthlyFX;
    const annualCost = monthlyTotal * 12;
    const stellarCost = teamSize * 0.00001 * 0.12 * 12;
    return {
      monthlyWireFees,
      monthlyFX,
      monthlyTotal,
      annualCost,
      annualSavings: annualCost - stellarCost,
    };
  }

  function formatRelativeTime(isoString) {
    if (!isoString) return 'Recently';
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 2) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return 'Recently';
    }
  }

  function renderFeedbackSection() {
    const summary = getFeedbackSummary();
    const recent = getRecentFeedbacks(10);

    return `
      <section id="reviews" class="page-section">
        <div class="container">
          <div class="flex flex-between align-center mb-2xl" style="flex-wrap: wrap; gap: var(--space-md);">
            <div>
              <div class="badge badge-active mb-xs">Live Community Reviews</div>
              <h2>Real feedback from <span class="gradient-text">teams & workers</span></h2>
              <p class="text-muted" style="max-width: 600px; margin-top: 4px;">
                Verified reviews submitted by employers and recipients using StreamFlow streaming payroll.
              </p>
            </div>

            <div class="flex gap-md align-center" style="flex-wrap: wrap;">
              <div class="card-flat" style="padding: 10px 18px; border-color: var(--glass-border-gold); background: rgba(220, 170, 50, 0.05); display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 1.2rem; color: var(--accent-gold); font-weight: bold;">★ ${summary.averageRating}</span>
                <span class="text-muted" style="font-size: 0.8rem; border-left: 1px solid rgba(255,255,255,0.1); padding-left: 10px;">
                  ${summary.count} Verified Reviews
                </span>
              </div>
              <button class="btn btn-primary btn-sm" id="btn-open-feedback-cta">
                + Write a Review
              </button>
            </div>
          </div>

          <div class="grid-3 gap-md" id="landing-reviews-grid">
            ${recent.length === 0 ? `
              <div class="card" style="grid-column: 1 / -1; text-align: center; padding: clamp(20px, 4vw, 40px);">
                <p class="text-muted" style="margin-bottom: var(--space-md);">No community reviews yet. Be the first to share your experience!</p>
                <button class="btn btn-gold btn-sm" id="btn-first-review">Share First Review</button>
              </div>
            ` : recent.map((item) => {
              const stars = '★'.repeat(item.rating || 5) + '☆'.repeat(5 - (item.rating || 5));
              const displayName = escapeHtml(item.name || 'Anonymous User');
              const displayAddr = item.userAddress
                ? escapeHtml(item.userAddress.length > 12 ? `${item.userAddress.slice(0, 4)}...${item.userAddress.slice(-4)}` : item.userAddress)
                : '';
              const safeComment = escapeHtml(item.comment || '');

              return `
                <div class="card card-gold" style="padding: clamp(14px, 3vw, 20px); display: flex; flex-direction: column; justify-content: space-between;">
                  <div>
                    <div class="flex flex-between align-center mb-xs" style="flex-wrap: wrap; gap: 4px;">
                      <strong style="font-size: 0.95rem; color: var(--text-primary);">${displayName}</strong>
                      <span style="color: var(--accent-gold); font-size: 1rem; letter-spacing: 1px;">
                        ${stars}
                      </span>
                    </div>
                    <div class="text-muted mb-sm" style="font-size: 0.74rem;">
                      ${formatRelativeTime(item.timestamp)}
                    </div>
                    <p style="font-size: 0.88rem; color: var(--text-secondary); margin-bottom: var(--space-md); line-height: 1.55;">
                      "${safeComment}"
                    </p>
                  </div>
                  <div class="flex flex-between align-center pt-sm" style="border-top: 1px solid rgba(255,255,255,0.06); font-size: 0.78rem;">
                    ${displayAddr ? `
                      <span class="mono font-semibold" style="color: var(--accent-mint); font-size: 0.75rem;">
                        ${displayAddr}
                      </span>
                    ` : `
                      <span class="text-muted" style="font-size: 0.75rem;">Community Reviewer</span>
                    `}
                    <span class="badge badge-active" style="font-size: 0.6rem; padding: 2px 6px;">Live Atlas</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </section>
    `;
  }

  function render() {
    const roi = calculateROI(enterpriseTeamSize, enterpriseAvgSalary);

    app.innerHTML = `
      <nav class="navbar">
        <div class="container navbar-container">
          <a href="/" data-link class="navbar-brand">
            <img src="/logo.svg" alt="StreamFlow" width="32" height="32">
            <span>Stream<span class="gradient-text">Flow</span></span>
          </a>
          <button class="mobile-menu-toggle" id="mobile-menu-toggle" aria-label="Toggle navigation">
            <span></span><span></span><span></span>
          </button>
          <ul class="navbar-nav" id="navbar-nav">
            <li><a href="#features">Features</a></li>
            <li><a href="#enterprise">Savings</a></li>
            <li><a href="#simulator">Calculator</a></li>
            <li><a href="#reviews">Reviews</a></li>
            <li><a href="/onboarding" data-link class="btn btn-primary btn-sm">Open App</a></li>
          </ul>
        </div>
      </nav>

      <!-- Hero -->
      <section class="page-section" style="padding-top: calc(68px + clamp(20px, 4vw, 48px)); text-align: center; position: relative;">
        <div class="container">
          <div style="display: inline-flex; align-items: center; gap: 8px; padding: 6px 16px; border-radius: var(--radius-full); background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.20); font-size: 0.82rem; font-weight: 600; color: var(--accent-mint); margin-bottom: var(--space-lg);">
            Built on Stellar Soroban
          </div>

          <h1 style="max-width: 800px; margin: 0 auto var(--space-md); font-weight: 900; letter-spacing: -0.03em;">
            Payroll that streams <br>
            <span class="gradient-text">every second</span>
          </h1>

          <p style="max-width: 620px; margin: 0 auto var(--space-xl); font-size: clamp(0.95rem, 2.5vw, 1.15rem); color: var(--text-secondary); line-height: 1.6;">
            Stop waiting for payday. StreamFlow lets employers run continuous payroll on-chain — employees withdraw what they've earned, whenever they want.
          </p>

          <div class="flex flex-center gap-md flex-wrap mb-2xl" style="margin-bottom: 44px; position: relative; z-index: 2;">
            <a href="/onboarding" data-link class="btn btn-primary btn-lg btn-full-mobile">
              Connect Wallet
            </a>
            <a href="#simulator" class="btn btn-outline btn-lg btn-full-mobile">
              Try the Calculator
            </a>
          </div>

          <!-- Stats -->
          <div class="grid-4 gap-md mb-2xl">
            <div class="card stat-card card-gold">
              <div class="stat-header">
                <span class="stat-label">Total Streamed</span>
                <div class="stat-icon gold">$</div>
              </div>
              <div class="stat-value gold-text" id="streaming-counter">$487,619</div>
            </div>

            <div class="card stat-card">
              <div class="stat-header">
                <span class="stat-label">Settlement Time</span>
                <div class="stat-icon">~</div>
              </div>
              <div class="stat-value streaming">< 5 sec</div>
            </div>

            <div class="card stat-card">
              <div class="stat-header">
                <span class="stat-label">Avg. Gas Fee</span>
                <div class="stat-icon">$</div>
              </div>
              <div class="stat-value" style="color: var(--accent-mint);">< $0.001</div>
            </div>

            <div class="card stat-card card-gold">
              <div class="stat-header">
                <span class="stat-label">Batch Capacity</span>
                <div class="stat-icon gold">+</div>
              </div>
              <div class="stat-value" style="color: var(--accent-gold);">1,000+</div>
            </div>
          </div>
        </div>
      </section>

      <!-- Features -->
      <section id="features" class="page-section">
        <div class="container">
          <div class="text-center mb-2xl" style="text-align: center;">
            <div class="badge badge-active mb-sm">How it works</div>
            <h2>Built for real payroll, <span class="gradient-text">not demos</span></h2>
            <p class="text-muted" style="max-width: 560px; margin: var(--space-xs) auto 0;">Every feature is backed by deployed Soroban smart contracts with unit tests and on-chain verification.</p>
          </div>

          <div class="grid-3 gap-lg">
            <div class="card" style="padding: clamp(16px, 3vw, 24px);">
              <div class="stat-icon mb-md">$</div>
              <h3 class="mb-sm">Per-second accrual</h3>
              <p>Salaries accrue on-chain continuously. Workers withdraw earned income anytime without waiting for monthly payroll runs.</p>
            </div>

            <div class="card card-gold" style="padding: clamp(16px, 3vw, 24px);">
              <div class="stat-icon gold mb-md">#</div>
              <h3 class="mb-sm">Cliff vesting</h3>
              <p>Define custom lockup periods directly in the smart contract. Tokens stay locked until the cliff elapses — no workarounds needed.</p>
            </div>

            <div class="card" style="padding: clamp(16px, 3vw, 24px);">
              <div class="stat-icon mb-md">+</div>
              <h3 class="mb-sm">Batch payroll</h3>
              <p>Upload a CSV or paste a roster to create hundreds of streams in one atomic transaction. One signature, done.</p>
            </div>

            <div class="card" style="padding: clamp(16px, 3vw, 24px);">
              <div class="stat-icon mb-md">V</div>
              <h3 class="mb-sm">Treasury vaults</h3>
              <p>Fund a dedicated employer treasury once. Capital gets allocated to active streams while the rest stays liquid and withdrawable.</p>
            </div>

            <div class="card card-gold" style="padding: clamp(16px, 3vw, 24px);">
              <div class="stat-icon gold mb-md">K</div>
              <h3 class="mb-sm">Key migration</h3>
              <p>Employees can rotate wallet addresses without cancelling streams. Useful for hardware key upgrades or team account changes.</p>
            </div>

            <div class="card" style="padding: clamp(16px, 3vw, 24px);">
              <div class="stat-icon mb-md">D</div>
              <h3 class="mb-sm">CSV exports</h3>
              <p>One-click download of all stream data and transaction audit trails for compliance, tax filing, or accounting.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Enterprise Savings -->
      <section id="enterprise" class="page-section" style="position: relative;">
        <div class="container">
          <div class="text-center mb-2xl" style="text-align: center;">
            <div class="badge badge-cliff mb-sm">Cost comparison</div>
            <h2>How much are you spending on <span class="gold-text">wire fees?</span></h2>
            <p class="text-muted" style="max-width: 620px; margin: var(--space-xs) auto 0;">
              International payroll through banks costs $35+ per wire plus 2-3% FX spread. On Stellar it's a fraction of a cent.
            </p>
          </div>

          <!-- Pillars -->
          <div class="grid-3 gap-lg mb-2xl">
            <div class="card card-gold" style="padding: clamp(16px, 3vw, 24px);">
              <div class="flex align-center gap-xs mb-sm">
                <strong style="color: var(--accent-gold); font-size: 1.05rem;">Batch dispatch</strong>
              </div>
              <p style="font-size: 0.88rem; color: var(--text-secondary);">
                Deploy hundreds of payment streams in a single contract call. Reduces gas footprint by ~94% compared to individual transactions.
              </p>
            </div>

            <div class="card" style="padding: clamp(16px, 3vw, 24px);">
              <div class="flex align-center gap-xs mb-sm">
                <strong style="color: var(--accent-mint); font-size: 1.05rem;">Non-custodial</strong>
              </div>
              <p style="font-size: 0.88rem; color: var(--text-secondary);">
                You keep full control over treasury funds. Withdraw unallocated balances on-demand with zero counterparty risk.
              </p>
            </div>

            <div class="card card-gold" style="padding: clamp(16px, 3vw, 24px);">
              <div class="flex align-center gap-xs mb-sm">
                <strong style="color: var(--accent-gold); font-size: 1.05rem;">Fiat off-ramps</strong>
              </div>
              <p style="font-size: 0.88rem; color: var(--text-secondary);">
                Integrated with SEP-24 anchor networks (MoneyGram, Bitso, Cowrie) for local fiat conversion in 180+ countries.
              </p>
            </div>
          </div>

          <!-- ROI Calculator -->
          <div class="card card-gold" style="padding: clamp(16px, 3.5vw, 32px); background: linear-gradient(145deg, rgba(24, 26, 36, 0.9) 0%, rgba(14, 16, 24, 0.95) 100%);">
            <div class="flex flex-between align-center mb-lg" style="flex-wrap: wrap; gap: var(--space-sm);">
              <div>
                <span class="badge badge-active mb-xs">Calculator</span>
                <h3 style="margin: 0;">Estimate your savings</h3>
              </div>
              <span class="text-muted" style="font-size: 0.85rem;">Stellar vs. traditional banking</span>
            </div>

            <div class="grid-2 gap-xl" style="align-items: center;">
              <div>
                <div class="form-group mb-lg">
                  <div class="form-label" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <span>Team size</span>
                    <span class="mono font-bold" id="ent-team-label" style="color: var(--accent-mint); font-size: 1.05rem; white-space: nowrap; flex-shrink: 0;">${enterpriseTeamSize} people</span>
                  </div>
                  <input type="range" id="ent-team-range" min="5" max="500" step="5" value="${enterpriseTeamSize}" style="width: 100%; accent-color: var(--accent-mint);">
                </div>

                <div class="form-group mb-lg">
                  <div class="form-label" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <span>Avg. monthly salary</span>
                    <span class="mono font-bold" id="ent-salary-label" style="color: var(--accent-gold); font-size: 1.05rem; white-space: nowrap; flex-shrink: 0;">$${enterpriseAvgSalary.toLocaleString()}</span>
                  </div>
                  <input type="range" id="ent-salary-range" min="1000" max="15000" step="500" value="${enterpriseAvgSalary}" style="width: 100%; accent-color: var(--accent-gold);">
                </div>

                <div class="card-flat" style="padding: 14px 16px; background: rgba(0,0,0,0.4);">
                  <div class="flex flex-between flex-wrap gap-xs mb-xs" style="font-size: 0.85rem;">
                    <span class="text-muted">Wire fees ($35/wire):</span>
                    <span class="mono text-danger font-semibold" id="ent-val-wires" style="white-space: nowrap;">$${roi.monthlyWireFees.toLocaleString()} / mo</span>
                  </div>
                  <div class="flex flex-between flex-wrap gap-xs mb-xs" style="font-size: 0.85rem;">
                    <span class="text-muted">FX spread (2.2%):</span>
                    <span class="mono text-danger font-semibold" id="ent-val-fx" style="white-space: nowrap;">$${roi.monthlyFX.toFixed(0)} / mo</span>
                  </div>
                  <div class="flex flex-between flex-wrap gap-xs" style="font-size: 0.85rem;">
                    <span class="text-muted">Stellar gas:</span>
                    <span class="mono text-success font-semibold" style="white-space: nowrap;">< $0.05 / mo</span>
                  </div>
                </div>
              </div>

              <div style="background: rgba(7, 8, 12, 0.9); padding: clamp(16px, 3vw, 28px); border-radius: var(--radius-lg); border: 1px solid var(--glass-border-gold); text-align: center;">
                <span class="text-muted" style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600;">
                  Annual savings
                </span>
                <div class="mono font-bold gold-text mt-md mb-md" id="ent-annual-savings" style="font-size: clamp(1.8rem, 3.5vw, 2.8rem); line-height: 1.2;">
                  $${Math.round(roi.annualSavings).toLocaleString()}
                </div>
                <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: var(--space-lg);" id="ent-savings-desc">
                  That's <strong style="color: var(--accent-gold);">$${Math.round(roi.monthlyTotal).toLocaleString()}/month</strong> in banking fees you don't need to pay.
                </p>
                <a href="/onboarding" data-link class="btn btn-gold btn-lg w-full" style="width: 100%;">
                  Get Started
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Simulator -->
      <section id="simulator" class="page-section">
        <div class="container">
          <div class="card" style="padding: clamp(16px, 3.5vw, 32px); border-color: var(--glass-border-emerald); background: linear-gradient(135deg, rgba(16, 20, 29, 0.9) 0%, rgba(13, 24, 22, 0.7) 100%);">
            <div style="text-align: center; margin-bottom: var(--space-xl);">
              <div class="badge badge-active mb-xs">Live demo</div>
              <h2>Watch it stream in <span class="gradient-text">real time</span></h2>
              <p class="text-muted">Set a salary below and watch micro-payments accrue every fraction of a second.</p>
            </div>

            <div class="grid-2 gap-xl" style="align-items: center;">
              <div>
                <div class="form-group mb-lg">
                  <div class="form-label" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <span>Monthly salary</span>
                    <span class="mono font-bold" id="sim-salary-label" style="font-size: 1.2rem; color: var(--accent-mint); white-space: nowrap; flex-shrink: 0;">$6,500</span>
                  </div>
                  <input type="range" id="sim-salary-range" min="1000" max="25000" step="500" value="6500" style="width: 100%; accent-color: var(--accent-mint);">
                </div>

                <div class="card-flat" style="padding: var(--space-md); background: rgba(0, 0, 0, 0.4); border-color: rgba(255,255,255,0.06);">
                  <div class="flex flex-between mb-sm" style="font-size: 0.88rem;">
                    <span class="text-muted">Per-second rate:</span>
                    <span class="mono font-bold text-accent" id="sim-rate-sec">$0.002508 / sec</span>
                  </div>
                  <div class="flex flex-between mb-sm" style="font-size: 0.88rem;">
                    <span class="text-muted">Hourly rate:</span>
                    <span class="mono font-semibold" id="sim-rate-hr" style="color: var(--accent-gold);">$40.63 / hr</span>
                  </div>
                  <div class="flex flex-between" style="font-size: 0.88rem;">
                    <span class="text-muted">Network fee:</span>
                    <span class="mono font-semibold" style="color: var(--accent-mint);">< 0.00001 XLM</span>
                  </div>
                </div>
              </div>

              <div style="background: rgba(7, 8, 12, 0.85); padding: clamp(16px, 3vw, 24px); border-radius: var(--radius-lg); border: 1px solid var(--glass-border-emerald); text-align: center;">
                <div class="text-muted" style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600;">
                  Accrued this session
                </div>
                <div class="mono font-bold streaming mt-md mb-md" id="sim-live-counter" style="font-size: clamp(1.8rem, 6vw, 2.6rem); font-variant-numeric: tabular-nums;">
                  $0.000000
                </div>
                <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: var(--space-md);">
                  Checkpointed on Soroban persistent storage
                </p>
                <a href="/onboarding" data-link class="btn btn-primary btn-sm">
                  Start a Real Stream
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Real Feedback & Reviews (up to 10) -->
      <div id="landing-feedback-wrapper">
        ${renderFeedbackSection()}
      </div>

      <!-- Footer -->
      <footer class="footer">
        <div class="container">
          <div class="footer-grid">
            <div class="footer-col">
              <div class="flex align-center gap-xs mb-sm" style="display: flex; align-items: center; gap: 8px; white-space: nowrap;">
                <img src="/logo.svg" alt="StreamFlow" width="28" height="28" style="flex-shrink: 0;">
                <span class="font-bold" style="font-size: 1.2rem; white-space: nowrap;">Stream<span class="gradient-text">Flow</span></span>
              </div>
              <p class="text-muted" style="font-size: 0.85rem; margin-bottom: var(--space-md); line-height: 1.6;">
                Real-time streaming payroll on Stellar Soroban. Pay your team by the second.
              </p>
              <div class="status-badge-live">
                <span class="status-dot-live"></span>
                <span>Testnet: Operational</span>
              </div>
            </div>

            <div class="footer-col">
              <h4>Product</h4>
              <ul class="footer-links">
                <li><a href="/employer" data-link>Employer Dashboard</a></li>
                <li><a href="/employee" data-link>Employee Portal</a></li>
                <li><a href="#enterprise">Batch Payroll</a></li>
                <li><a href="#features">Cliff Vesting</a></li>
                <li><a href="/employee#anchor-offramp" data-link>Off-Ramps (SEP-24)</a></li>
                <li><a href="#reviews">Community Reviews</a></li>
                <li><a href="#simulator">Calculator</a></li>
              </ul>
            </div>

            <div class="footer-col">
              <h4>Resources</h4>
              <ul class="footer-links">
                <li>
                  <a href="https://developers.stellar.org/docs/learn/smart-contract-internals" target="_blank" rel="noopener noreferrer">
                    Soroban Docs
                  </a>
                </li>
                <li>
                  <a href="https://stellar.expert/explorer/testnet/contract/${CONTRACTS?.STREAM || CONTRACTS?.stream || 'CBFFR6AVRP5W4GETTCYU774MIWXWUO73MYYMAUPFQBB4QGWOCMZXEJAQ'}" target="_blank" rel="noopener noreferrer">
                    Stream Contract
                  </a>
                </li>
                <li>
                  <a href="https://stellar.expert/explorer/testnet/contract/${CONTRACTS?.TREASURY || CONTRACTS?.treasury || 'CBHI5NW6HYK7Z4VOYCUR3KQBDX6ATFYZIAEWGRGOWAZIP2TLT4U5HAQB'}" target="_blank" rel="noopener noreferrer">
                    Treasury Contract
                  </a>
                </li>
                <li>
                  <a href="https://developers.stellar.org/docs/data/rpc" target="_blank" rel="noopener noreferrer">
                    Soroban RPC
                  </a>
                </li>
                <li>
                  <a href="https://stellar.org/anchors" target="_blank" rel="noopener noreferrer">
                    Anchor Directory
                  </a>
                </li>
              </ul>
            </div>

            <div class="footer-col">
              <h4>Legal</h4>
              <ul class="footer-links mb-md">
                <li><button type="button" id="btn-open-privacy">Privacy Policy</button></li>
                <li><button type="button" id="btn-open-terms">Terms of Service</button></li>
                <li><button type="button" id="btn-open-security">Security Disclosures</button></li>
              </ul>

              <h4 style="margin-bottom: 8px; font-size: 0.85rem;">Updates</h4>
              <form id="form-newsletter" class="footer-newsletter">
                <input type="email" id="input-newsletter-email" placeholder="you@company.com" required>
                <button type="submit" class="btn btn-primary btn-sm">Join</button>
              </form>
            </div>
          </div>

          <div class="footer-bottom">
            <div>
              &copy; 2026 StreamFlow
            </div>
            <div class="flex gap-md" style="flex-wrap: wrap;">
              <span class="mono text-muted" style="font-size: 0.75rem;">Contract: ${(CONTRACTS?.STREAM || CONTRACTS?.stream || 'CBFFR6AVRP5W4GETTCYU774MIWXWUO73MYYMAUPFQBB4QGWOCMZXEJAQ').slice(0, 8)}...${(CONTRACTS?.STREAM || CONTRACTS?.stream || 'CBFFR6AVRP5W4GETTCYU774MIWXWUO73MYYMAUPFQBB4QGWOCMZXEJAQ').slice(-6)}</span>
              <a href="https://github.com/Shashiverm/streamflow" target="_blank" rel="noopener noreferrer" style="font-size: 0.82rem; color: var(--text-muted);">
                GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>

      <div id="legal-modal-container">
        ${renderActiveModal()}
      </div>
    `;

    attachListeners();
  }

  function renderActiveModal() {
    if (!activeModal) return '';

    let title = '';
    let body = '';

    if (activeModal === 'privacy') {
      title = 'Privacy Policy';
      body = `
        <p><strong>Effective Date:</strong> January 1, 2026</p>
        <p>StreamFlow is a non-custodial decentralized application on the Stellar blockchain.</p>

        <h4>1. Information We Do Not Collect</h4>
        <p>We do not operate centralized databases, nor do we collect, store, or sell personally identifiable information such as your name, address, or private keys.</p>

        <h4>2. On-Chain Data</h4>
        <p>Transactions with StreamFlow smart contracts are permanently recorded on the public Stellar blockchain. This includes your public wallet address, amounts, timestamps, and contract payloads.</p>

        <h4>3. Local Storage</h4>
        <p>StreamFlow stores session preferences and recent transaction caches in your browser's localStorage. This data stays on your device.</p>

        <h4>4. Third-Party Services</h4>
        <p>When using SEP-24 anchors for off-ramping, you are subject to those institutions' privacy policies and KYC/AML requirements.</p>
      `;
    } else if (activeModal === 'terms') {
      title = 'Terms of Service';
      body = `
        <p><strong>Last Updated:</strong> January 1, 2026</p>

        <h4>1. Non-Custodial Architecture</h4>
        <p>StreamFlow provides access to open-source smart contracts deployed on Stellar Soroban. We do not custody your assets, control your keys, or act as a financial intermediary.</p>

        <h4>2. User Responsibilities</h4>
        <ul>
          <li>You are responsible for safeguarding your private keys and seed phrases.</li>
          <li>You agree to comply with applicable tax and payroll laws in your jurisdiction.</li>
          <li>You acknowledge that blockchain transactions are irreversible.</li>
        </ul>

        <h4>3. Risks</h4>
        <p>Smart contracts operate on decentralized networks. You acknowledge the inherent risks of experimental cryptographic systems, testnet resets, and network latency.</p>

        <h4>4. No Financial Advice</h4>
        <p>Nothing on StreamFlow constitutes financial, legal, or tax advice. All operations are at your own discretion.</p>
      `;
    } else if (activeModal === 'security') {
      title = 'Security Disclosures';
      body = `
        <h4>Security Approach</h4>
        <ul>
          <li><strong>Non-custodial:</strong> Funds are held in dedicated Soroban contract instances with checkpoint math.</li>
          <li><strong>Fair settlement:</strong> Cancellation logic guarantees workers receive all earned wages up to the exact second.</li>
          <li><strong>Key rotation:</strong> Built-in <code>transfer_recipient</code> enables key migration without stream termination.</li>
          <li><strong>Testing:</strong> 17 comprehensive unit tests cover boundary conditions and authorization.</li>
        </ul>

        <h4>Compliance</h4>
        <p>StreamFlow supports standard Stellar Asset Contract tokens and compliant stablecoins (USDC, EURC). All fiat ramps operate via SEP-24 certified Stellar Anchors.</p>
      `;
    }

    return `
      <div class="modal-backdrop" id="modal-backdrop-legal">
        <div class="modal-content" style="max-width: 640px;">
          <div class="modal-header">
            <h3 style="margin: 0;">${title}</h3>
            <button class="modal-close" id="btn-close-legal">&times;</button>
          </div>
          <div class="legal-modal-body">
            ${body}
          </div>
        </div>
      </div>
    `;
  }

  function updateModalContainer() {
    const c = document.getElementById('legal-modal-container');
    if (c) { c.innerHTML = renderActiveModal(); attachModalListeners(); }
  }

  function attachModalListeners() {
    document.getElementById('btn-close-legal')?.addEventListener('click', () => { activeModal = null; updateModalContainer(); });
    document.getElementById('modal-backdrop-legal')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-backdrop-legal') { activeModal = null; updateModalContainer(); }
    });
  }

  function updateEnterpriseCalculations() {
    const roi = calculateROI(enterpriseTeamSize, enterpriseAvgSalary);
    const teamLabel = document.getElementById('ent-team-label');
    const salaryLabel = document.getElementById('ent-salary-label');
    const wiresEl = document.getElementById('ent-val-wires');
    const fxEl = document.getElementById('ent-val-fx');
    const savingsEl = document.getElementById('ent-annual-savings');
    const descEl = document.getElementById('ent-savings-desc');

    if (teamLabel) teamLabel.textContent = `${enterpriseTeamSize} people`;
    if (salaryLabel) salaryLabel.textContent = `$${enterpriseAvgSalary.toLocaleString()}`;
    if (wiresEl) wiresEl.textContent = `$${roi.monthlyWireFees.toLocaleString()} / mo`;
    if (fxEl) fxEl.textContent = `$${roi.monthlyFX.toFixed(0)} / mo`;
    if (savingsEl) savingsEl.textContent = `$${Math.round(roi.annualSavings).toLocaleString()}`;
    if (descEl) descEl.innerHTML = `That's <strong style="color: var(--accent-gold);">$${Math.round(roi.monthlyTotal).toLocaleString()}/month</strong> in banking fees you don't need to pay.`;
  }

  function updateFeedbackSectionDOM() {
    const wrapper = document.getElementById('landing-feedback-wrapper');
    if (wrapper) {
      wrapper.innerHTML = renderFeedbackSection();
      document.getElementById('btn-open-feedback-cta')?.addEventListener('click', () => openFeedbackModal());
      document.getElementById('btn-first-review')?.addEventListener('click', () => openFeedbackModal());
    }
  }

  function attachListeners() {
    document.getElementById('ent-team-range')?.addEventListener('input', (e) => { enterpriseTeamSize = parseInt(e.target.value) || 45; updateEnterpriseCalculations(); });
    document.getElementById('ent-salary-range')?.addEventListener('input', (e) => { enterpriseAvgSalary = parseInt(e.target.value) || 5000; updateEnterpriseCalculations(); });

    const simRange = document.getElementById('sim-salary-range');
    simRange?.addEventListener('input', (e) => {
      simSalary = parseFloat(e.target.value) || 6500;
      const simLabel = document.getElementById('sim-salary-label');
      const simRateSec = document.getElementById('sim-rate-sec');
      const simRateHr = document.getElementById('sim-rate-hr');
      const ratePerSec = simSalary / (30 * 86400);
      const hourlyRate = simSalary / 160;
      if (simLabel) simLabel.textContent = `$${simSalary.toLocaleString()}`;
      if (simRateSec) simRateSec.textContent = `$${ratePerSec.toFixed(6)} / sec`;
      if (simRateHr) simRateHr.textContent = `$${hourlyRate.toFixed(2)} / hr`;
    });

    document.getElementById('btn-open-feedback-cta')?.addEventListener('click', () => openFeedbackModal());
    document.getElementById('btn-first-review')?.addEventListener('click', () => openFeedbackModal());

    document.getElementById('btn-open-privacy')?.addEventListener('click', () => { activeModal = 'privacy'; updateModalContainer(); });
    document.getElementById('btn-open-terms')?.addEventListener('click', () => { activeModal = 'terms'; updateModalContainer(); });
    document.getElementById('btn-open-security')?.addEventListener('click', () => { activeModal = 'security'; updateModalContainer(); });
    attachModalListeners();

    document.getElementById('form-newsletter')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const emailInput = document.getElementById('input-newsletter-email');
      if (emailInput && emailInput.value) {
        showToast(`Subscribed ${emailInput.value}`, 'success');
        emailInput.value = '';
      }
    });
  }

  render();

  // Listen for feedback submissions to update landing page dynamically
  const feedbackListener = () => {
    updateFeedbackSectionDOM();
  };
  window.addEventListener('streamflow_feedback_updated', feedbackListener);

  // Sync latest feedback from API
  fetchFeedbacks().then(() => {
    updateFeedbackSectionDOM();
  }).catch(() => {});

  // Counter animation
  function animateCounter() {
    streamedAmount += Math.random() * 0.6 + 0.15;
    const el = document.getElementById('streaming-counter');
    if (el) el.textContent = `$${Math.round(streamedAmount).toLocaleString()}`;
    animFrame = requestAnimationFrame(animateCounter);
  }
  animateCounter();

  // Simulator accrual loop
  const simInterval = setInterval(() => {
    const ratePerSec = simSalary / (30 * 86400);
    sessionAccrued += ratePerSec / 10;
    const el = document.getElementById('sim-live-counter');
    if (el) el.textContent = `$${sessionAccrued.toFixed(6)}`;
  }, 100);

  return () => {
    if (animFrame) cancelAnimationFrame(animFrame);
    clearInterval(simInterval);
    window.removeEventListener('streamflow_feedback_updated', feedbackListener);
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
