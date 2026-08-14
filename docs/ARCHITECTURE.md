# StreamFlow — Technical Architecture

## System Design

StreamFlow is a real-time payroll streaming platform with three main layers:

### 1. Smart Contract Layer (Soroban)

Two contracts handle all on-chain logic:

#### Stream Contract
- **State model**: Each stream stores employer, employee, rate, timestamps, withdrawn amount, and pause state
- **Accrual computation**: Pure math from state — `rate × (elapsed - paused_duration) - withdrawn`
- **No cron jobs**: Balance is computed on-demand at query time, not via scheduled updates
- **Checkpoint pattern**: Tracks `last_checkpoint` and `paused_duration` to correctly handle:
  - Partial withdrawals mid-stream
  - Multiple pause/resume cycles
  - Pro-rata cancellation at any point

#### Treasury Contract
- **Pooled funding**: Employer deposits once, allocates across multiple streams
- **Allocation tracking**: `balance` vs `allocated` ensures no over-commitment
- **Cross-contract reference**: Stores stream contract address for future direct invocation

### 2. Frontend Application Layer

Single-page application built with vanilla JavaScript and Vite:

- **Router**: Hash-free client-side routing with cleanup callbacks for timers
- **Contract simulation**: In-memory store mirrors exact Soroban contract logic for seamless demo
- **Live updates**: `setInterval` updates accrued balances every second in the UI
- **Wallet integration**: Freighter API for real Stellar wallet connection + demo mode fallback

### 3. Integration Layer

- **Stellar SDK**: Transaction building, submission, and account management
- **Friendbot**: Automatic testnet funding for new accounts
- **SEP-24 simulation**: Realistic anchor off-ramp flow with multi-currency conversion
- **Analytics**: LocalStorage-based event tracking, performance metrics, and error logging

## Data Flow

```
1. Employer → Treasury Contract → deposit funds
2. Employer → Stream Contract → create_stream (locks tokens)
3. Employee → Stream Contract → get_accrued (pure computation)
4. Employee → Stream Contract → withdraw (transfers tokens)
5. Employee → Anchor (SEP-24) → convert to local currency
6. Employer → Stream Contract → cancel_stream (pro-rata settlement)
```

## Security Considerations

- All contract functions require `require_auth` from the appropriate party
- Overflow protection via `checked_*` arithmetic and Rust's overflow-checks in release
- Accrual math clamped to prevent withdrawal > funded amount
- Pause/cancel state transitions are one-directional (can't un-cancel)

## Scalability

- Stream data stored in persistent storage with 100k ledger TTL extensions
- Employer/employee stream lists use append-only vectors (O(1) add, O(n) query)
- Treasury allocation is independent of stream count (O(1) balance check)
