/**
 * StreamFlow — Landing Page
 */

import { trackPageView } from '../analytics.js';

export function renderLanding(app) {
  trackPageView('/');

  let streamedAmount = 142857.42;
  let animFrame;

  app.innerHTML = `
    <nav class="navbar">
      <div class="container">
        <a href="/" data-link class="navbar-brand">
          <img src="/logo.svg" alt="StreamFlow">
          <span>Stream<span class="gradient-text">Flow</span></span>
        </a>
        <ul class="navbar-nav">
          <li><a href="#features">Features</a></li>
          <li><a href="#how-it-works">How It Works</a></li>
          <li><a href="/onboarding" data-link class="btn btn-primary btn-sm">Launch App</a></li>
        </ul>
      </div>
    </nav>

    <section class="hero">
      <div class="hero-badge">
        <span>⚡</span>
        <span>Built on Stellar • Powered by Soroban</span>
      </div>

      <h1 class="hero-title">
        Payroll That <span class="gradient-text">Streams</span><br>
        in Real-Time
      </h1>

      <p class="hero-subtitle">
        Stop waiting for payday. StreamFlow lets employers stream wages every second, 
        and employees withdraw earnings the moment they're accrued. Global, instant, fair.
      </p>

      <div class="hero-actions">
        <a href="/onboarding" data-link class="btn btn-primary btn-lg">
          🚀 Start Streaming
        </a>
        <a href="#how-it-works" class="btn btn-outline btn-lg">
          Learn How It Works
        </a>
      </div>

      <div class="hero-streaming-counter">
        <div class="streaming-label">Total Value Streamed (Demo)</div>
        <div class="streaming-amount" id="streaming-counter">$0.00</div>
      </div>
    </section>

    <section class="features" id="features">
      <div class="container">
        <div class="section-title">
          <h2>Why <span class="gradient-text">StreamFlow</span>?</h2>
          <p>Built for the future of work — remote, global, continuous.</p>
        </div>

        <div class="grid-3">
          <div class="card feature-card">
            <div class="feature-icon" style="background: rgba(0, 200, 150, 0.1); border-color: rgba(0, 200, 150, 0.2);">
              ⚡
            </div>
            <h3>Instant Access</h3>
            <p>Employees can withdraw earned wages at any time — no more waiting for weekly or monthly pay cycles.</p>
          </div>

          <div class="card feature-card">
            <div class="feature-icon" style="background: rgba(0, 212, 255, 0.1); border-color: rgba(0, 212, 255, 0.2);">
              🌍
            </div>
            <h3>Global Reach</h3>
            <p>Pay contractors anywhere in the world with Stellar's fast, low-fee cross-border payments. Off-ramp to local currency via anchors.</p>
          </div>

          <div class="card feature-card">
            <div class="feature-icon" style="background: rgba(139, 92, 246, 0.1); border-color: rgba(139, 92, 246, 0.2);">
              🔒
            </div>
            <h3>Transparent & Fair</h3>
            <p>Smart contracts guarantee exact pro-rata settlement. Cancel anytime — employees get what they've earned, employers get the rest back.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="how-it-works" id="how-it-works">
      <div class="container">
        <div class="section-title">
          <h2>How It <span class="gradient-text">Works</span></h2>
          <p>Three simple steps to continuous payroll.</p>
        </div>

        <div class="steps">
          <div class="card step">
            <div class="step-number">1</div>
            <h4>Fund a Stream</h4>
            <p>Employer creates a payroll stream with a rate per second and funds it with tokens.</p>
          </div>

          <div class="card step">
            <div class="step-number">2</div>
            <h4>Earnings Accrue</h4>
            <p>Employee's balance grows continuously — every second, more wages are earned and visible.</p>
          </div>

          <div class="card step">
            <div class="step-number">3</div>
            <h4>Withdraw Anytime</h4>
            <p>Employee withdraws any amount up to their accrued balance. Off-ramp to local currency through anchors.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="features">
      <div class="container">
        <div class="section-title">
          <h2>Built for <span class="gradient-text">Everyone</span></h2>
        </div>

        <div class="grid-3">
          <div class="card" style="padding: var(--space-xl); text-align: center;">
            <div style="font-size: 2rem; margin-bottom: var(--space-md);">🏢</div>
            <h4>Remote Companies</h4>
            <p style="font-size: 0.85rem;">Manage payroll for distributed teams with a single treasury. Batch create streams for all employees.</p>
          </div>

          <div class="card" style="padding: var(--space-xl); text-align: center;">
            <div style="font-size: 2rem; margin-bottom: var(--space-md);">💻</div>
            <h4>Freelancers</h4>
            <p style="font-size: 0.85rem;">Get paid as you work. No more invoicing, chasing payments, or waiting 30 days for a wire transfer.</p>
          </div>

          <div class="card" style="padding: var(--space-xl); text-align: center;">
            <div style="font-size: 2rem; margin-bottom: var(--space-md);">🏛️</div>
            <h4>DAOs & Web3 Teams</h4>
            <p style="font-size: 0.85rem;">Already paying in stablecoins? StreamFlow adds continuous streaming with smart contract guarantees.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="container mb-3xl" style="position: relative; z-index: 5;">
      <div class="card" style="padding: var(--space-2xl); background: radial-gradient(ellipse at center, rgba(79, 125, 249, 0.12) 0%, rgba(12, 16, 32, 0.8) 100%); border: 1px solid rgba(79, 125, 249, 0.3); box-shadow: var(--shadow-glow);">
        <div class="text-center mb-xl">
          <div class="badge badge-active mb-sm">Interactive Demo</div>
          <h2 style="font-size: 1.8rem;">Experience <span class="gradient-text">Real-Time Streaming</span></h2>
          <p class="text-muted" style="max-width: 600px; margin: 0 auto;">See how wages accrue every millisecond compared to waiting 30 days for a traditional wire.</p>
        </div>

        <div class="grid-2 gap-xl" style="align-items: center;">
          <div>
            <div class="form-group mb-md">
              <label class="form-label">Monthly Target Salary</label>
              <div class="flex gap-sm">
                <input type="range" class="w-full" id="sim-salary-range" min="1000" max="15000" step="500" value="5000">
                <span class="mono font-bold text-accent" id="sim-salary-label" style="font-size: 1.1rem; min-width: 100px; text-align: right;">$5,000</span>
              </div>
            </div>

            <div class="card-flat" style="padding: var(--space-md); background: rgba(0, 0, 0, 0.3);">
              <div class="flex flex-between mb-sm" style="font-size: 0.85rem;">
                <span class="text-muted">Per-Second Accrual:</span>
                <span class="mono font-bold text-success" id="sim-rate-sec">$0.001929 / sec</span>
              </div>
              <div class="flex flex-between mb-sm" style="font-size: 0.85rem;">
                <span class="text-muted">Hourly Pace (8h day):</span>
                <span class="mono font-semibold" id="sim-rate-hr">$31.25 / hr</span>
              </div>
              <div class="flex flex-between" style="font-size: 0.85rem;">
                <span class="text-muted">Wire Transfer Delay:</span>
                <span class="text-danger font-semibold">0 seconds (Instant on Stellar)</span>
              </div>
            </div>
          </div>

          <div class="text-center" style="background: rgba(6, 8, 15, 0.7); padding: var(--space-xl); border-radius: var(--radius-lg); border: 1px solid var(--border-subtle);">
            <div class="text-muted" style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em;">Your Live Accrued Earnings This Session</div>
            <div class="mono font-bold text-success mt-sm mb-sm" id="sim-live-counter" style="font-size: 2.4rem; font-variant-numeric: tabular-nums;">
              $0.000000
            </div>
            <div class="text-muted" style="font-size: 0.75rem;">
              ⚡ Settling continuously on Soroban smart contract checkpoint math
            </div>
            <a href="/onboarding" data-link class="btn btn-primary btn-sm mt-md">
              Open Testnet Wallet & Stream →
            </a>
          </div>
        </div>
      </div>
    </section>

    <footer style="padding: var(--space-2xl) 0; border-top: 1px solid var(--border-subtle);">
      <div class="container text-center">
        <div class="flex flex-center gap-sm mb-md">
          <img src="/logo.svg" alt="StreamFlow" style="width: 24px; height: 24px;">
          <span class="font-semibold">StreamFlow</span>
        </div>
        <p class="text-muted" style="font-size: 0.85rem;">
          Real-time payroll streaming on Stellar. Built with Soroban smart contracts.
        </p>
        <p class="text-muted mt-md" style="font-size: 0.75rem;">
          © 2026 StreamFlow • Testnet Demo •
          <a href="https://stellar.org" target="_blank" style="color: var(--accent-cyan);">Powered by Stellar</a>
        </p>
      </div>
    </footer>
  `;

  // Animated streaming counter in hero
  const counterEl = document.getElementById('streaming-counter');
  function animateCounter() {
    streamedAmount += Math.random() * 0.5 + 0.1;
    if (counterEl) {
      counterEl.textContent = `$${streamedAmount.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    }
    animFrame = requestAnimationFrame(animateCounter);
  }
  animateCounter();

  // Interactive Live Simulator in Landing Page
  let simSalary = 5000;
  let sessionAccrued = 0;
  const simRange = document.getElementById('sim-salary-range');
  const simLabel = document.getElementById('sim-salary-label');
  const simRateSec = document.getElementById('sim-rate-sec');
  const simRateHr = document.getElementById('sim-rate-hr');
  const simLiveCounter = document.getElementById('sim-live-counter');

  function updateSimCalculations() {
    const ratePerSec = simSalary / (30 * 86400);
    const hourlyRate = simSalary / 160;
    if (simLabel) simLabel.textContent = `$${simSalary.toLocaleString()}`;
    if (simRateSec) simRateSec.textContent = `$${ratePerSec.toFixed(6)} / sec`;
    if (simRateHr) simRateHr.textContent = `$${hourlyRate.toFixed(2)} / hr`;
  }

  simRange?.addEventListener('input', (e) => {
    simSalary = parseFloat(e.target.value) || 5000;
    updateSimCalculations();
  });

  const simInterval = setInterval(() => {
    const ratePerSec = simSalary / (30 * 86400);
    sessionAccrued += (ratePerSec / 10); // 100ms interval
    if (simLiveCounter) {
      simLiveCounter.textContent = `$${sessionAccrued.toFixed(6)}`;
    }
  }, 100);

  // Return cleanup function
  return () => {
    if (animFrame) cancelAnimationFrame(animFrame);
    clearInterval(simInterval);
  };
}

