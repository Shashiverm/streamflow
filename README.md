# StreamFlow — Real-Time Payroll Streaming on Stellar

<p align="center">
  <img src="frontend/public/logo.svg" width="80" alt="StreamFlow Logo">
</p>

<p align="center">
  <strong>Stream payroll every second. Withdraw earnings anytime. Global, instant, fair.</strong>
</p>

<p align="center">
  <a href="#demo">Live Demo</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#smart-contracts">Smart Contracts</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#screenshots">Screenshots</a>
</p>

---

## 📋 Overview

StreamFlow is a real-time payroll streaming platform built on the **Stellar blockchain** using **Soroban smart contracts**. It enables employers to create continuous payment streams for remote employees and contractors, who can then withdraw their earned wages at any moment — no more waiting for payday.

### Problem

- Employees earn continuously but are paid in lump sums (weekly/biweekly/monthly)
- Cross-border payments for remote workers involve delays and high fees
- No way to access earned-but-unpaid wages before the scheduled payday

### Solution

- **Per-second wage streaming** via Soroban smart contracts
- **Instant withdrawals** — employees pull accrued earnings anytime
- **Pro-rata settlement** — fair cancellation with exact payouts
- **Global reach** — Stellar's fast, low-fee cross-border infrastructure
- **Anchor off-ramp** — convert stablecoin earnings to local currency (SEP-24)

---

## 🏗️ Architecture

```
┌──────────────┐     ┌─────────────────────┐     ┌──────────────┐
│   Frontend   │────▶│  Soroban Contracts   │────▶│   Stellar    │
│  (Vite SPA)  │     │                     │     │   Testnet    │
│              │     │  ┌───────────────┐  │     │              │
│  Employer    │     │  │ Stream        │  │     │  Horizon     │
│  Dashboard   │     │  │ Contract      │  │     │  Soroban RPC │
│              │     │  │ • create      │  │     │              │
│  Employee    │     │  │ • withdraw    │  │     └──────────────┘
│  Dashboard   │     │  │ • cancel      │  │
│              │     │  │ • pause/resume│  │     ┌──────────────┐
│  Off-ramp    │     │  │ • top_up      │  │     │   Anchor     │
│  (SEP-24)    │     │  └───────────────┘  │     │  (SEP-24)    │
│              │     │  ┌───────────────┐  │     │  Off-ramp    │
│  Analytics   │     │  │ Treasury      │  │     │  Simulation  │
│  Feedback    │     │  │ Contract      │  │     └──────────────┘
└──────────────┘     │  │ • deposit     │  │
                     │  │ • allocate    │  │
                     │  │ • release     │  │
                     │  └───────────────┘  │
                     └─────────────────────┘
```

---

## 📜 Smart Contracts

### Stream Contract

The core payroll stream. Stores per-stream state and computes accrued balances on demand via checkpoint-based math.

| Function | Description |
|----------|-------------|
| `create_stream` | Create and fund a new payroll stream |
| `withdraw` | Employee withdraws up to accrued balance |
| `cancel_stream` | Pro-rata settlement: pay employee, refund employer |
| `pause_stream` | Pause accrual (employer only) |
| `resume_stream` | Resume accrual after pause |
| `top_up` | Add funds and extend stream duration |
| `get_accrued` | Compute current accrued-but-unwithdrawn balance |
| `get_stream` | Read full stream details |
| `get_employer_streams` | List all streams by employer |
| `get_employee_streams` | List all streams by employee |

**Accrual formula:**
```
accrued = rate_per_second × (min(now, end_time) - start_time - paused_duration) - withdrawn
```

**WASM size:** 13,250 bytes (optimized)

### Treasury Contract

Pooled employer funding for batch stream management.

| Function | Description |
|----------|-------------|
| `create_treasury` | Create a new employer treasury |
| `deposit` | Deposit funds into treasury |
| `withdraw_from_treasury` | Withdraw unallocated funds |
| `allocate_for_stream` | Reserve funds for a stream |
| `release_allocation` | Free allocation when stream ends |
| `get_treasury` | Read treasury details |
| `get_available_balance` | Unallocated balance |
| `get_employer_treasury` | Lookup treasury by employer |

**WASM size:** 8,253 bytes (optimized)

### Contract Deployment

Deployed to **Stellar Testnet**.

```
Stream Contract:   [deployed via scripts/deploy.sh]
Treasury Contract: [deployed via scripts/deploy.sh]
```

---

## 🚀 Getting Started

### Prerequisites

- **Rust** 1.84+ with `wasm32v1-none` target
- **Stellar CLI** v27+
- **Node.js** 18+

### Smart Contracts

```bash
# Build contracts
cd contracts
stellar contract build

# Run tests
cargo test --workspace

# Deploy to testnet
cd ../scripts
bash deploy.sh
```

### Frontend

```bash
# Install dependencies
cd frontend
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

### Generate Wallet Interactions (10+ proof)

```bash
cd scripts
node generate-interactions.js
```

---

## 📸 Screenshots

### Landing Page
Premium dark-mode landing with animated streaming counter, feature cards, and how-it-works section.

### Employer Dashboard
- Real-time accrued balances updating every second
- Create, pause, resume, cancel, and top-up streams
- Treasury management with deposit/withdraw

### Employee Dashboard
- Large live balance counter showing earnings accumulating per second
- Stream cards with progress bars
- Withdrawal with percentage buttons (25%, 50%, 75%, Max)
- Transaction history with Stellar Expert links

### Off-Ramp (SEP-24 Simulation)
- Multi-currency conversion (USD, EUR, GBP, INR, NGN, BRL)
- Real-time conversion preview with fees
- Transaction history

### Mobile Responsive
Fully responsive at 375px, 768px, and 1024px breakpoints.

---

## 📊 Analytics & Monitoring

StreamFlow includes built-in analytics tracking:
- **Event tracking** — stream creations, withdrawals, page views
- **Performance metrics** — page load time, interaction latency
- **Error tracking** — unhandled errors and promise rejections
- **User feedback** — in-app star rating + comment collection

All analytics data is stored in localStorage and viewable in the browser console.

---

## 🗳️ User Feedback

Feedback is collected via an in-app widget (bottom-right corner):
- ⭐ Star rating (1-5)
- 💬 Written comments
- Stored in localStorage with timestamps

---

## 🛠️ Technical Stack

| Layer | Technology |
|-------|------------|
| Smart Contracts | Rust + soroban-sdk 27.0.5 |
| Blockchain | Stellar Testnet (Soroban) |
| Frontend | Vite + Vanilla JS |
| Styling | Custom CSS with glassmorphism |
| Wallet | Freighter API |
| Off-ramp | SEP-24 simulation |
| Typography | Inter + JetBrains Mono |
| Analytics | Custom localStorage-based |

---

## 📁 Project Structure

```
stellar_lvl_4/
├── contracts/
│   ├── Cargo.toml          # Workspace root
│   ├── stream/             # Stream Contract (core payroll)
│   └── treasury/           # Treasury Contract (batch management)
├── frontend/
│   ├── index.html          # SPA entry point
│   ├── vite.config.js      # Vite configuration
│   ├── public/logo.svg     # StreamFlow logo
│   └── src/
│       ├── main.js         # App entry
│       ├── router.js       # Client-side routing
│       ├── stellar.js      # Stellar SDK integration
│       ├── contracts.js    # Contract interaction layer
│       ├── anchor.js       # SEP-24 off-ramp simulation
│       ├── analytics.js    # Event/performance tracking
│       ├── feedback.js     # User feedback collection
│       └── pages/
│           ├── landing.js  # Marketing landing page
│           ├── employer.js # Employer dashboard
│           ├── employee.js # Employee dashboard
│           └── onboarding.js # Wallet connect flow
├── scripts/
│   ├── deploy.sh           # Contract deployment
│   └── generate-interactions.js  # Wallet interaction proof
├── docs/
│   └── ARCHITECTURE.md     # Technical architecture
└── README.md
```

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  Built with ❤️ on <a href="https://stellar.org">Stellar</a>
</p>
