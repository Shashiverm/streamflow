/**
 * StreamFlow — Landing Page
 * Next-Gen Real-Time Streaming Payroll, Enterprise Scaling & Vesting on Stellar Soroban
 */

import { trackPageView } from '../analytics.js';
import { CONTRACTS } from '../stellar.js';

export function renderLanding(app) {
  trackPageView('/');

  let streamedAmount = 487619.20;
  let animFrame;
  let activeModal = null; // 'privacy' | 'terms' | 'security' | null

  // Interactive Live Simulator state
  let simSalary = 6500;
  let sessionAccrued = 0;

  // Interactive Enterprise ROI Calculator state
  let enterpriseTeamSize = 45;
  let enterpriseAvgSalary = 5000;

  function calculateROI(teamSize, avgSalary) {
    const monthlyTraditionalWireFees = teamSize * 35; // $35 per international wire
    const monthlyTraditionalFX = (teamSize * avgSalary) * 0.022; // 2.2% bank FX spread & intermediary fees
    const monthlyTraditionalTotal = monthlyTraditionalWireFees + monthlyTraditionalFX;
    const annualTraditionalCost = monthlyTraditionalTotal * 12;

    const monthlyStellarGas = teamSize * 0.00001 * 0.12; // < $0.0001
    const annualStellarCost = monthlyStellarGas * 12;
    const annualSavings = annualTraditionalCost - annualStellarCost;

    return {
      monthlyTraditionalWireFees,
      monthlyTraditionalFX,
      monthlyTraditionalTotal,
      annualTraditionalCost,
      annualSavings,
    };
  }

  function render() {
    const roi = calculateROI(enterpriseTeamSize, enterpriseAvgSalary);

    app.innerHTML = `
      <!-- ─── Navbar ─── -->
      <nav class="navbar">
        <div class="container navbar-container">
          <a href="/" data-link class="navbar-brand">
            <img src="/logo.svg" alt="StreamFlow Logo" width="32" height="32">
            <span>Stream<span class="gradient-text">Flow</span></span>
          </a>
          <button class="mobile-menu-toggle" id="mobile-menu-toggle" aria-label="Toggle navigation">
            <span></span><span></span><span></span>
          </button>
          <ul class="navbar-nav" id="navbar-nav">
            <li><a href="#features">Features</a></li>
            <li><a href="#enterprise">Enterprise Scaling</a></li>
            <li><a href="#simulator">Live Simulator</a></li>
            <!--<li><a href="https://developers.stellar.org/docs/learn/smart-contract-internals" target="_blank" rel="noopener noreferrer">Docs ↗</a></li> -->
            <li><a href="/onboarding" data-link class="btn btn-primary btn-sm">Launch Protocol</a></li>
          </ul>
        </div>
      </nav>

      <!-- ─── Hero Section ─── -->
      <section class="page" style="padding-top: calc(68px + var(--space-2xl)); text-align: center; position: relative;">
        <div class="container">
          <div style="display: inline-flex; align-items: center; gap: 8px; padding: 6px 16px; border-radius: var(--radius-full); background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); font-size: 0.85rem; font-weight: 600; color: var(--accent-mint); margin-bottom: var(--space-lg); box-shadow: 0 0 20px rgba(0, 245, 160, 0.15);">
            <span>✦</span>
            <span>Stellar Soroban Next-Gen Payroll & Cliff Vesting</span>
            <span>✦</span>
          </div>

          <h1 style="max-width: 900px; margin: 0 auto var(--space-md); font-weight: 900; letter-spacing: -0.03em;">
            Continuous Payroll That <br>
            <span class="gradient-text">Streams Every Second</span>
          </h1>

          <p style="max-width: 680px; margin: 0 auto var(--space-xl); font-size: 1.15rem; color: var(--text-secondary);">
            Eliminate archaic monthly paydays. StreamFlow enables global enterprises to disburse multi-token salaries in real-time, while employees claim accrued earnings instantaneously on Stellar.
          </p>

          <div class="flex flex-center gap-md flex-wrap mb-2xl" style="margin-bottom: 44px; position: relative; z-index: 2;">
            <a href="/onboarding" data-link class="btn btn-primary btn-lg">
              ⚡ Enter App & Connect Wallet
            </a>
            <a href="#simulator" class="btn btn-outline btn-lg">
              Interactive Calculator ↓
            </a>
          </div>

          <!-- Hero Stats Banner -->
          <div class="grid-4 gap-md mb-3xl">
            <div class="card stat-card card-gold">
              <div class="stat-header">
                <span class="stat-label">Total Value Streamed</span>
                <div class="stat-icon gold">💰</div>
              </div>
              <div class="stat-value gold-text" id="streaming-counter">$487,619.20</div>
            </div>

            <div class="card stat-card">
              <div class="stat-header">
                <span class="stat-label">Settlement Latency</span>
                <div class="stat-icon">⚡</div>
              </div>
              <div class="stat-value streaming">0.000s</div>
            </div>

            <div class="card stat-card">
              <div class="stat-header">
                <span class="stat-label">Average Gas Fee</span>
                <div class="stat-icon">🪙</div>
              </div>
              <div class="stat-value" style="color: var(--accent-mint);">&lt; $0.00001</div>
            </div>

            <div class="card stat-card card-gold">
              <div class="stat-header">
                <span class="stat-label">Enterprise Scaling</span>
                <div class="stat-icon gold">🚀</div>
              </div>
              <div class="stat-value" style="color: var(--accent-gold);">Batch 1k+</div>
            </div>
          </div>
        </div>
      </section>

      <!-- ─── Core Architecture & Features ─── -->
      <section class="page" id="features" style="padding: var(--space-2xl) 0;">
        <div class="container">
          <div class="text-center mb-2xl" style="text-align: center;">
            <div class="badge badge-active mb-sm">Architecture</div>
            <h2>Why Elite Web3 Teams Choose <span class="gradient-text">StreamFlow</span></h2>
            <p class="text-muted" style="max-width: 600px; margin: var(--space-xs) auto 0;">Engineered from first principles for high throughput, sub-cent fees, and mathematical fairness.</p>
          </div>

          <div class="grid-3 gap-lg">
            <div class="card" style="padding: var(--space-xl);">
              <div class="stat-icon mb-md">⏱️</div>
              <h3 class="mb-sm">Real-Time Accrual</h3>
              <p>Salaries accumulate on-chain every millisecond. Workers withdraw earned income whenever needed without waiting for monthly wire transfers.</p>
            </div>

            <div class="card card-gold" style="padding: var(--space-xl);">
              <div class="stat-icon gold mb-md">🔒</div>
              <h3 class="mb-sm">Cliff & Vesting Schedules</h3>
              <p>Native smart contract vesting schedules. Define custom lockups and cliff intervals for token grants, executive compensation, and retention.</p>
            </div>

            <div class="card" style="padding: var(--space-xl);">
              <div class="stat-icon mb-md">📦</div>
              <h3 class="mb-sm">Enterprise Batch Payroll</h3>
              <p>Upload CSV spreadsheets or disbursement rosters to stream to hundreds of contractors and employees in one atomic transaction.</p>
            </div>

            <div class="card" style="padding: var(--space-xl);">
              <div class="stat-icon mb-md">🏛️</div>
              <h3 class="mb-sm">Pooled Treasury Vaults</h3>
              <p>Fund dedicated employer treasuries once. Auto-allocate capital to active streams while keeping unallocated liquidity safe and withdrawable.</p>
            </div>

            <div class="card card-gold" style="padding: var(--space-xl);">
              <div class="stat-icon gold mb-md">🔑</div>
              <h3 class="mb-sm">Wallet Key Migration</h3>
              <p>Seamless recipient address migration. Employees can rotate hardware keys or smart accounts without cancelling ongoing streaming grants.</p>
            </div>

            <div class="card" style="padding: var(--space-xl);">
              <div class="stat-icon mb-md">📊</div>
              <h3 class="mb-sm">Audit-Ready Reporting</h3>
              <p>One-click CSV exports of all streaming ledger logs and transactions for effortless compliance, tax reporting, and corporate accounting.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- ─── Enterprise Scaling Section ─── -->
      <section class="page" id="enterprise" style="padding: var(--space-2xl) 0; position: relative;">
        <div class="container">
          <div class="text-center mb-2xl" style="text-align: center;">
            <div class="badge badge-cliff mb-sm">Enterprise Scaling</div>
            <h2>Built for Global Rosters & <span class="gold-text">Massive Throughput</span></h2>
            <p class="text-muted" style="max-width: 680px; margin: var(--space-xs) auto 0;">
              Scale payroll from 5 to 5,000+ contractors worldwide without increasing operational headcount or banking overhead.
            </p>
          </div>

          <!-- Enterprise Pillars -->
          <div class="grid-3 gap-lg mb-2xl">
            <div class="card card-gold" style="padding: var(--space-lg);">
              <div class="flex align-center gap-xs mb-sm">
                <span style="font-size: 1.3rem;">⚡</span>
                <strong style="color: var(--accent-gold); font-size: 1.05rem;">Atomic Batch Dispatch</strong>
              </div>
              <p style="font-size: 0.88rem; color: var(--text-secondary);">
                Deploy hundreds of payment streams in a single Soroban smart contract call. Reduce gas footprint by 94% and eliminate multi-transaction delays.
              </p>
            </div>

            <div class="card" style="padding: var(--space-lg);">
              <div class="flex align-center gap-xs mb-sm">
                <span style="font-size: 1.3rem;">🏦</span>
                <strong style="color: var(--accent-mint); font-size: 1.05rem;">Non-Custodial Reserves</strong>
              </div>
              <p style="font-size: 0.88rem; color: var(--text-secondary);">
                Maintain full programmatic sovereignty over corporate treasury funds. Withdraw unallocated payroll balances on-demand with zero counterparty risk.
              </p>
            </div>

            <div class="card card-gold" style="padding: var(--space-lg);">
              <div class="flex align-center gap-xs mb-sm">
                <span style="font-size: 1.3rem;">🌍</span>
                <strong style="color: var(--accent-gold); font-size: 1.05rem;">Global Regulated On/Off Ramps</strong>
              </div>
              <p style="font-size: 0.88rem; color: var(--text-secondary);">
                Integrated with SEP-24 / SEP-6 anchor networks (MoneyGram, Bitso, Cowrie) enabling instant off-ramping into local fiat in 180+ countries.
              </p>
            </div>
          </div>

          <!-- Interactive Enterprise Savings & ROI Calculator -->
          <div class="card card-gold" style="padding: clamp(16px, 3vw, 32px); background: linear-gradient(145deg, rgba(26, 28, 38, 0.9) 0%, rgba(15, 18, 26, 0.95) 100%);">
            <div class="flex flex-between align-center mb-lg" style="flex-wrap: wrap; gap: var(--space-sm);">
              <div>
                <span class="badge badge-active mb-xs">ROI Calculator</span>
                <h3 style="margin: 0;">Enterprise Wire & Banking Cost Savings</h3>
              </div>
              <span class="text-muted" style="font-size: 0.85rem;">Stellar Soroban vs Traditional International Banking</span>
            </div>

            <div class="grid-2 gap-xl" style="align-items: center;">
              <div>
                <div class="form-group mb-lg">
                  <div class="form-label">
                    <span>Global Team Size (Employees / Contractors)</span>
                    <span class="mono font-bold" id="ent-team-label" style="color: var(--accent-mint); font-size: 1.05rem; white-space: nowrap;">${enterpriseTeamSize} Members</span>
                  </div>
                  <input type="range" id="ent-team-range" min="5" max="500" step="5" value="${enterpriseTeamSize}" style="width: 100%; accent-color: var(--accent-mint);">
                </div>

                <div class="form-group mb-lg">
                  <div class="form-label">
                    <span>Average Monthly Salary per Member (USD / XLM)</span>
                    <span class="mono font-bold" id="ent-salary-label" style="color: var(--accent-gold); font-size: 1.05rem; white-space: nowrap;">$${enterpriseAvgSalary.toLocaleString()}</span>
                  </div>
                  <input type="range" id="ent-salary-range" min="1000" max="15000" step="500" value="${enterpriseAvgSalary}" style="width: 100%; accent-color: var(--accent-gold);">
                </div>

                <div class="card-flat" style="padding: 14px 16px; background: rgba(0,0,0,0.4);">
                  <div class="flex flex-between flex-wrap gap-xs mb-xs" style="font-size: 0.85rem;">
                    <span class="text-muted">Legacy Wire Fees ($35/wire):</span>
                    <span class="mono text-danger font-semibold" id="ent-val-wires" style="white-space: nowrap;">$${roi.monthlyTraditionalWireFees.toLocaleString()} / mo</span>
                  </div>
                  <div class="flex flex-between flex-wrap gap-xs mb-xs" style="font-size: 0.85rem;">
                    <span class="text-muted">Bank FX Spread & Intermediaries (2.2%):</span>
                    <span class="mono text-danger font-semibold" id="ent-val-fx" style="white-space: nowrap;">$${roi.monthlyTraditionalFX.toFixed(0)} / mo</span>
                  </div>
                  <div class="flex flex-between flex-wrap gap-xs" style="font-size: 0.85rem;">
                    <span class="text-muted">StreamFlow Stellar Gas Fee:</span>
                    <span class="mono text-success font-semibold" style="white-space: nowrap;">&lt; $0.05 / mo</span>
                  </div>
                </div>
              </div>

              <div style="background: rgba(7, 8, 12, 0.9); padding: clamp(16px, 3vw, 28px); border-radius: var(--radius-lg); border: 1px solid var(--glass-border-gold); text-align: center;">
                <span class="text-muted" style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600;">
                  Estimated Annual Cost Savings
                </span>
                <div class="mono font-bold gold-text mt-md mb-md" id="ent-annual-savings" style="font-size: clamp(1.8rem, 3.5vw, 2.8rem); line-height: 1.2;">
                  $${Math.round(roi.annualSavings).toLocaleString()}
                </div>
                <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: var(--space-lg);" id="ent-savings-desc">
                  Switching to Stellar Soroban streaming payroll saves your company over <strong style="color: var(--accent-gold);">$${Math.round(roi.monthlyTraditionalTotal).toLocaleString()}/month</strong> in unnecessary banking tolls.
                </p>
                <a href="/onboarding" data-link class="btn btn-gold btn-lg w-full" style="width: 100%;">
                  🚀 Scale Enterprise Payroll Now
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ─── Interactive Calculator Section ─── -->
      <section class="page" id="simulator" style="padding: var(--space-2xl) 0;">
        <div class="container">
          <div class="card" style="padding: var(--space-2xl); border-color: var(--glass-border-emerald); background: linear-gradient(135deg, rgba(16, 20, 29, 0.9) 0%, rgba(13, 24, 22, 0.7) 100%);">
            <div style="text-align: center; margin-bottom: var(--space-xl);">
              <div class="badge badge-active mb-xs">Live Simulator</div>
              <h2>Experience <span class="gradient-text">Sub-Second Streaming</span></h2>
              <p class="text-muted">Adjust target salary below to watch micro-accrual occur in real-time.</p>
            </div>

            <div class="grid-2 gap-xl" style="align-items: center;">
              <div>
                <div class="form-group mb-lg">
                  <div class="form-label">
                    <span>Monthly Salary (USD / USDC / XLM)</span>
                    <span class="mono font-bold" id="sim-salary-label" style="font-size: 1.2rem; color: var(--accent-mint);">$6,500</span>
                  </div>
                  <input type="range" id="sim-salary-range" min="1000" max="25000" step="500" value="6500" style="width: 100%; accent-color: var(--accent-mint);">
                </div>

                <div class="card-flat" style="padding: var(--space-md); background: rgba(0, 0, 0, 0.4); border-color: rgba(255,255,255,0.06);">
                  <div class="flex flex-between mb-sm" style="font-size: 0.88rem;">
                    <span class="text-muted">Continuous Per-Second Rate:</span>
                    <span class="mono font-bold text-accent" id="sim-rate-sec">$0.002508 / sec</span>
                  </div>
                  <div class="flex flex-between mb-sm" style="font-size: 0.88rem;">
                    <span class="text-muted">Working Hourly Velocity:</span>
                    <span class="mono font-semibold" id="sim-rate-hr" style="color: var(--accent-gold);">$40.63 / hr</span>
                  </div>
                  <div class="flex flex-between" style="font-size: 0.88rem;">
                    <span class="text-muted">Stellar Network Fee:</span>
                    <span class="mono font-semibold" style="color: var(--accent-mint);">&lt; 0.00001 XLM</span>
                  </div>
                </div>
              </div>

              <div style="background: rgba(7, 8, 12, 0.85); padding: var(--space-xl); border-radius: var(--radius-lg); border: 1px solid var(--glass-border-emerald); text-align: center;">
                <div class="text-muted" style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600;">
                  Live Accrued Balance In This Browser Session
                </div>
                <div class="mono font-bold streaming mt-md mb-md" id="sim-live-counter" style="font-size: 2.6rem; font-variant-numeric: tabular-nums;">
                  $0.000000
                </div>
                <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: var(--space-md);">
                  ⚡ Checkpointed on Soroban persistent ledger storage
                </p>
                <a href="/onboarding" data-link class="btn btn-primary btn-sm">
                  Start Live Stream →
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ─── Interactive Footer ─── -->
      <footer class="footer">
        <div class="container">
          <div class="footer-grid">
            <!-- Brand Column -->
            <div class="footer-col">
              <div class="flex align-center gap-xs mb-sm" style="display: flex; align-items: center; gap: 8px; white-space: nowrap;">
                <img src="/logo.svg" alt="StreamFlow Logo" width="28" height="28" style="flex-shrink: 0;">
                <span class="font-bold" style="font-size: 1.2rem; white-space: nowrap;">Stream<span class="gradient-text">Flow</span></span>
              </div>
              <p class="text-muted" style="font-size: 0.85rem; margin-bottom: var(--space-md); line-height: 1.6;">
                Enterprise real-time streaming payroll and vesting protocol built natively on Stellar Soroban smart contracts.
              </p>
              <div class="status-badge-live">
                <span class="status-dot-live"></span>
                <span>Stellar Testnet: Operational (3.2s finality)</span>
              </div>
            </div>

            <!-- Product Links -->
            <div class="footer-col">
              <h4>Product</h4>
              <ul class="footer-links">
                <li><a href="/employer" data-link>Employer Dashboard</a></li>
                <li><a href="/employee" data-link>Employee Portal</a></li>
                <li><a href="#enterprise">Enterprise Batch CSV</a></li>
                <li><a href="#features">Cliff Vesting</a></li>
                <li><a href="/employee#anchor-offramp" data-link>SEP-24 Anchor Off-Ramps</a></li>
                <li><a href="#simulator">Live Flow Simulator</a></li>
              </ul>
            </div>

            <!-- Developer & Documentation Links -->
            <div class="footer-col">
              <h4>Developers & Docs</h4>
              <ul class="footer-links">
                <li>
                  <a href="https://developers.stellar.org/docs/learn/smart-contract-internals" target="_blank" rel="noopener noreferrer">
                    Stellar Soroban Docs ↗
                  </a>
                </li>
                <li>
                  <a href="https://stellar.expert/explorer/testnet/contract/${CONTRACTS?.STREAM || CONTRACTS?.stream || 'CBFFR6AVRP5W4GETTCYU774MIWXWUO73MYYMAUPFQBB4QGWOCMZXEJAQ'}" target="_blank" rel="noopener noreferrer">
                    Stream Contract Explorer ↗
                  </a>
                </li>
                <li>
                  <a href="https://stellar.expert/explorer/testnet/contract/${CONTRACTS?.TREASURY || CONTRACTS?.treasury || 'CBHI5NW6HYK7Z4VOYCUR3KQBDX6ATFYZIAEWGRGOWAZIP2TLT4U5HAQB'}" target="_blank" rel="noopener noreferrer">
                    Treasury Contract Explorer ↗
                  </a>
                </li>
                <li>
                  <a href="https://developers.stellar.org/docs/data/rpc" target="_blank" rel="noopener noreferrer">
                    Soroban RPC Specs ↗
                  </a>
                </li>
                <li>
                  <a href="https://stellar.org/anchors" target="_blank" rel="noopener noreferrer">
                    Stellar Anchor Directory ↗
                  </a>
                </li>
              </ul>
            </div>

            <!-- Legal, Governance & Newsletter -->
            <div class="footer-col">
              <h4>Legal & Updates</h4>
              <ul class="footer-links mb-md">
                <li><button type="button" id="btn-open-privacy">Privacy Policy</button></li>
                <li><button type="button" id="btn-open-terms">Terms of Service</button></li>
                <li><button type="button" id="btn-open-security">Security & Risk Disclaimers</button></li>
              </ul>

              <h4 style="margin-bottom: 8px; font-size: 0.85rem;">Protocol Updates</h4>
              <form id="form-newsletter" class="footer-newsletter">
                <input type="email" id="input-newsletter-email" placeholder="dev@company.com" required>
                <button type="submit" class="btn btn-primary btn-sm">Join</button>
              </form>
            </div>
          </div>

          <div class="footer-bottom">
            <div>
              © 2026 StreamFlow Protocol • Non-Custodial Smart Contract Infrastructure on Stellar Soroban
            </div>
            <div class="flex gap-md" style="flex-wrap: wrap;">
              <span class="mono text-muted" style="font-size: 0.75rem;">Contract: ${(CONTRACTS?.STREAM || CONTRACTS?.stream || 'CBFFR6AVRP5W4GETTCYU774MIWXWUO73MYYMAUPFQBB4QGWOCMZXEJAQ').slice(0, 8)}...${(CONTRACTS?.STREAM || CONTRACTS?.stream || 'CBFFR6AVRP5W4GETTCYU774MIWXWUO73MYYMAUPFQBB4QGWOCMZXEJAQ').slice(-6)}</span>
              <a href="https://github.com/Shashiverm/streamflow" target="_blank" rel="noopener noreferrer" style="font-size: 0.82rem; color: var(--text-muted);">
                GitHub Repository ↗
              </a>
            </div>
          </div>
        </div>
      </footer>

      <!-- ─── Legal & Policy Modals Container ─── -->
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
        <p>StreamFlow ("Protocol", "we", "our") is a non-custodial decentralized application deployed on the Stellar blockchain network.</p>

        <h4>1. Information We Do Not Collect</h4>
        <p>We do not operate centralized user databases, nor do we collect, store, or sell personally identifiable information (PII) such as your legal name, physical address, passport numbers, or private cryptographic keys.</p>

        <h4>2. On-Chain Ledger Data</h4>
        <p>When you interact with StreamFlow smart contracts (creating streams, withdrawing funds, or initializing treasuries), your transactions are permanently recorded on the public Stellar blockchain. This includes your public wallet address, transaction amounts, timestamps, and contract interaction payloads.</p>

        <h4>3. Client-Side Local Storage</h4>
        <p>To improve user experience, StreamFlow stores temporary connection preferences, recent transaction caches, and session parameters in your browser's local storage (localStorage). This data remains strictly on your local device.</p>

        <h4>4. Third-Party Services</h4>
        <p>When off-ramping funds via regulated SEP-24 / SEP-6 Stellar Anchors (e.g. MoneyGram, Bitso, Cowrie), you are subject to the respective privacy policies and KYC/AML procedures of those independent third-party institutions.</p>
      `;
    } else if (activeModal === 'terms') {
      title = 'Terms of Service';
      body = `
        <p><strong>Last Updated:</strong> January 1, 2026</p>
        
        <h4>1. Protocol Nature & Non-Custodial Architecture</h4>
        <p>StreamFlow provides access to immutable open-source smart contracts deployed on the Stellar Soroban network. StreamFlow does not take custody of your crypto assets, control your private keys, or act as an intermediary financial broker.</p>

        <h4>2. User Responsibilities</h4>
        <ul>
          <li>You are solely responsible for safeguarding your private keys and seed phrases.</li>
          <li>You agree to comply with all applicable local taxation and payroll withholding laws in your jurisdiction.</li>
          <li>You acknowledge that blockchain transactions are irreversible once validated by Stellar validators.</li>
        </ul>

        <h4>3. Smart Contract & Network Risks</h4>
        <p>Smart contracts operate on decentralized computer networks. While our contracts have been built following best security practices, you acknowledge the inherent risks associated with experimental cryptographic systems, testnet resets, and distributed network latency.</p>

        <h4>4. No Financial Advice</h4>
        <p>Nothing on the StreamFlow interface constitutes financial, legal, investment, or tax advice. All streaming operations are performed at your own discretion.</p>
      `;
    } else if (activeModal === 'security') {
      title = 'Security & Risk Disclaimers';
      body = `
        <h4>Security Architecture</h4>
        <ul>
          <li><strong>Zero Custody:</strong> Contract liquidity is held in dedicated Soroban contract instances with cryptographic checkpoint math.</li>
          <li><strong>Pro-Rata Settlement Fairness:</strong> Contract cancellation logic mathematically guarantees that workers receive all earned wages up to the exact second of cancellation.</li>
          <li><strong>Recipient Key Rotation:</strong> Built-in <code>transfer_recipient</code> function enables hardware key migration without stream termination.</li>
          <li><strong>Formal Unit Testing:</strong> 17 comprehensive unit tests verify boundary conditions, panic scenarios, and multi-vault authorization.</li>
        </ul>

        <h4>Regulatory Compliance</h4>
        <p>StreamFlow is designed to support standard Stellar Asset Contract (SAC) tokens and compliant regulated stablecoins (e.g., Circle USDC, EURC). All fiat on/off ramps operate via SEP-24 certified Stellar Anchor financial institutions.</p>
      `;
    }

    return `
      <div class="modal-backdrop" id="modal-backdrop-legal">
        <div class="modal-content" style="max-width: 640px;">
          <div class="modal-header">
            <h3 style="margin: 0;">${title}</h3>
            <button class="modal-close" id="btn-close-legal">✕</button>
          </div>
          <div class="legal-modal-body">
            ${body}
          </div>
        </div>
      </div>
    `;
  }

  function updateModalContainer() {
    const modalContainer = document.getElementById('legal-modal-container');
    if (modalContainer) {
      modalContainer.innerHTML = renderActiveModal();
      attachModalListeners();
    }
  }

  function attachModalListeners() {
    document.getElementById('btn-close-legal')?.addEventListener('click', () => {
      activeModal = null;
      updateModalContainer();
    });

    document.getElementById('modal-backdrop-legal')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-backdrop-legal') {
        activeModal = null;
        updateModalContainer();
      }
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

    if (teamLabel) teamLabel.textContent = `${enterpriseTeamSize} Members`;
    if (salaryLabel) salaryLabel.textContent = `$${enterpriseAvgSalary.toLocaleString()}`;
    if (wiresEl) wiresEl.textContent = `$${roi.monthlyTraditionalWireFees.toLocaleString()} / mo`;
    if (fxEl) fxEl.textContent = `$${roi.monthlyTraditionalFX.toFixed(0)} / mo`;
    if (savingsEl) savingsEl.textContent = `$${Math.round(roi.annualSavings).toLocaleString()}`;
    if (descEl) {
      descEl.innerHTML = `Switching to Stellar Soroban streaming payroll saves your company over <strong style="color: var(--accent-gold);">$${Math.round(roi.monthlyTraditionalTotal).toLocaleString()}/month</strong> in unnecessary banking tolls.`;
    }
  }

  function attachListeners() {
    // Enterprise Calculator listeners
    const entTeamRange = document.getElementById('ent-team-range');
    const entSalaryRange = document.getElementById('ent-salary-range');

    entTeamRange?.addEventListener('input', (e) => {
      enterpriseTeamSize = parseInt(e.target.value) || 45;
      updateEnterpriseCalculations();
    });

    entSalaryRange?.addEventListener('input', (e) => {
      enterpriseAvgSalary = parseInt(e.target.value) || 5000;
      updateEnterpriseCalculations();
    });

    // Live Simulator Range
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

    // Legal Modals triggers
    document.getElementById('btn-open-privacy')?.addEventListener('click', () => {
      activeModal = 'privacy';
      updateModalContainer();
    });

    document.getElementById('btn-open-terms')?.addEventListener('click', () => {
      activeModal = 'terms';
      updateModalContainer();
    });

    document.getElementById('btn-open-security')?.addEventListener('click', () => {
      activeModal = 'security';
      updateModalContainer();
    });

    attachModalListeners();

    // Newsletter Form
    document.getElementById('form-newsletter')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const emailInput = document.getElementById('input-newsletter-email');
      if (emailInput && emailInput.value) {
        showToast(`Subscribed ${emailInput.value} for StreamFlow protocol updates!`, 'success');
        emailInput.value = '';
      }
    });
  }

  render();

  // Streaming counter animation loop
  function animateCounter() {
    streamedAmount += Math.random() * 0.8 + 0.2;
    const counterEl = document.getElementById('streaming-counter');
    if (counterEl) {
      counterEl.textContent = `$${streamedAmount.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    }
    animFrame = requestAnimationFrame(animateCounter);
  }
  animateCounter();

  // Micro-accrual simulator loop
  const simInterval = setInterval(() => {
    const ratePerSec = simSalary / (30 * 86400);
    sessionAccrued += ratePerSec / 10;
    const simLiveCounter = document.getElementById('sim-live-counter');
    if (simLiveCounter) {
      simLiveCounter.textContent = `$${sessionAccrued.toFixed(6)}`;
    }
  }, 100);

  return () => {
    if (animFrame) cancelAnimationFrame(animFrame);
    clearInterval(simInterval);
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
