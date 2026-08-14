/**
 * StreamFlow — Contract Interaction Layer
 * Provides a simulated contract interaction layer for demo purposes.
 * In production, this would use stellar-sdk to invoke Soroban contracts.
 */

import { trackEvent } from './analytics.js';

// In-memory stream store (simulates on-chain state for demo)
const streams = new Map();
const treasuries = new Map();
const transactions = [];
let nextStreamId = 0;
let nextTreasuryId = 0;

// ──────────────────────────────────────────────
// Stream Operations
// ──────────────────────────────────────────────

export function createStream(employer, employee, tokenSymbol, ratePerSecond, durationSeconds) {
  const now = Date.now() / 1000;
  const totalFunded = ratePerSecond * durationSeconds;

  const stream = {
    id: nextStreamId++,
    employer,
    employee,
    token: tokenSymbol,
    ratePerSecond,
    startTime: now,
    endTime: now + durationSeconds,
    totalFunded,
    withdrawn: 0,
    lastCheckpoint: now,
    status: 'Active',
    pausedDuration: 0,
    pauseStart: 0,
    createdAt: new Date().toISOString(),
  };

  streams.set(stream.id, stream);

  transactions.push({
    type: 'create_stream',
    streamId: stream.id,
    employer,
    employee,
    amount: totalFunded,
    timestamp: new Date().toISOString(),
    txHash: generateTxHash(),
  });

  trackEvent('contract', 'create_stream', `${employer}->${employee}`, totalFunded);
  return stream;
}

export function getAccrued(streamId) {
  const stream = streams.get(streamId);
  if (!stream) return 0;

  if (stream.status === 'Cancelled' || stream.status === 'Completed') {
    return 0;
  }

  const now = Date.now() / 1000;
  const effectiveEnd = Math.min(now, stream.endTime);

  if (effectiveEnd <= stream.startTime) return 0;

  const elapsed = effectiveEnd - stream.startTime;

  let totalPaused = stream.pausedDuration;
  if (stream.status === 'Paused' && stream.pauseStart > 0) {
    totalPaused += (now - stream.pauseStart);
  }

  const activeSeconds = Math.max(0, elapsed - totalPaused);
  const totalAccrued = stream.ratePerSecond * activeSeconds;
  const unwithdrawn = totalAccrued - stream.withdrawn;
  const remaining = stream.totalFunded - stream.withdrawn;

  return Math.max(0, Math.min(unwithdrawn, remaining));
}

export function withdrawFromStream(streamId, amount, employee) {
  const stream = streams.get(streamId);
  if (!stream) throw new Error('Stream not found');
  if (stream.employee !== employee) throw new Error('Unauthorized');

  const accrued = getAccrued(streamId);
  if (amount > accrued) throw new Error('Exceeds accrued balance');
  if (amount <= 0) throw new Error('Invalid amount');

  stream.withdrawn += amount;

  const now = Date.now() / 1000;
  if (now >= stream.endTime && stream.withdrawn >= stream.totalFunded) {
    stream.status = 'Completed';
  }

  const tx = {
    type: 'withdraw',
    streamId,
    employee,
    amount,
    timestamp: new Date().toISOString(),
    txHash: generateTxHash(),
  };
  transactions.push(tx);

  trackEvent('contract', 'withdraw', employee, amount);
  return tx;
}

export function cancelStream(streamId, employer) {
  const stream = streams.get(streamId);
  if (!stream) throw new Error('Stream not found');
  if (stream.employer !== employer) throw new Error('Unauthorized');
  if (stream.status === 'Cancelled' || stream.status === 'Completed') {
    throw new Error('Stream is not active');
  }

  const accrued = getAccrued(streamId);
  const employeeRefund = accrued;
  const employerRefund = stream.totalFunded - stream.withdrawn - employeeRefund;

  stream.status = 'Cancelled';
  stream.withdrawn += employeeRefund;

  transactions.push({
    type: 'cancel_stream',
    streamId,
    employer,
    employeePayout: employeeRefund,
    employerRefund,
    timestamp: new Date().toISOString(),
    txHash: generateTxHash(),
  });

  trackEvent('contract', 'cancel_stream', employer, employerRefund);
  return { employeePayout: employeeRefund, employerRefund };
}

export function pauseStream(streamId, employer) {
  const stream = streams.get(streamId);
  if (!stream) throw new Error('Stream not found');
  if (stream.employer !== employer) throw new Error('Unauthorized');
  if (stream.status !== 'Active') throw new Error('Stream is not active');

  stream.status = 'Paused';
  stream.pauseStart = Date.now() / 1000;

  trackEvent('contract', 'pause_stream', employer);
  return stream;
}

export function resumeStream(streamId, employer) {
  const stream = streams.get(streamId);
  if (!stream) throw new Error('Stream not found');
  if (stream.employer !== employer) throw new Error('Unauthorized');
  if (stream.status !== 'Paused') throw new Error('Stream is not paused');

  const now = Date.now() / 1000;
  stream.pausedDuration += (now - stream.pauseStart);
  stream.status = 'Active';
  stream.pauseStart = 0;

  trackEvent('contract', 'resume_stream', employer);
  return stream;
}

export function topUpStream(streamId, amount, employer) {
  const stream = streams.get(streamId);
  if (!stream) throw new Error('Stream not found');
  if (stream.employer !== employer) throw new Error('Unauthorized');
  if (amount <= 0) throw new Error('Invalid amount');

  stream.totalFunded += amount;
  const extraSeconds = amount / stream.ratePerSecond;
  stream.endTime += extraSeconds;

  trackEvent('contract', 'top_up', employer, amount);
  return stream;
}

// ──────────────────────────────────────────────
// Treasury Operations
// ──────────────────────────────────────────────

export function createTreasury(employer, token) {
  const treasury = {
    id: nextTreasuryId++,
    employer,
    token,
    balance: 0,
    allocated: 0,
    streamIds: [],
  };
  treasuries.set(treasury.id, treasury);
  trackEvent('contract', 'create_treasury', employer);
  return treasury;
}

export function depositToTreasury(treasuryId, amount, employer) {
  const treasury = treasuries.get(treasuryId);
  if (!treasury) throw new Error('Treasury not found');
  if (treasury.employer !== employer) throw new Error('Unauthorized');

  treasury.balance += amount;

  transactions.push({
    type: 'treasury_deposit',
    treasuryId,
    employer,
    amount,
    timestamp: new Date().toISOString(),
    txHash: generateTxHash(),
  });

  trackEvent('contract', 'treasury_deposit', employer, amount);
  return treasury;
}

// ──────────────────────────────────────────────
// Queries
// ──────────────────────────────────────────────

export function getStream(streamId) {
  return streams.get(streamId) || null;
}

export function getEmployerStreams(employer) {
  return Array.from(streams.values()).filter(s => s.employer === employer);
}

export function getEmployeeStreams(employee) {
  return Array.from(streams.values()).filter(s => s.employee === employee);
}

export function getTransactionHistory(address) {
  return transactions.filter(
    tx => tx.employer === address || tx.employee === address
  ).reverse();
}

export function getAllStreams() {
  return Array.from(streams.values());
}

export function getTreasury(treasuryId) {
  return treasuries.get(treasuryId) || null;
}

export function getEmployerTreasury(employer) {
  return Array.from(treasuries.values()).find(t => t.employer === employer) || null;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function generateTxHash() {
  const chars = '0123456789abcdef';
  let hash = '';
  for (let i = 0; i < 64; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

/**
 * Seed demo data for testing.
 */
export function seedDemoData(employerAddr, employeeAddr) {
  // Create a treasury
  const treasury = createTreasury(employerAddr, 'XLM');
  depositToTreasury(treasury.id, 500000, employerAddr);

  // Create some streams
  createStream(employerAddr, employeeAddr, 'XLM', 0.05, 86400);  // 0.05 XLM/sec for 1 day
  createStream(employerAddr, employeeAddr, 'XLM', 0.02, 604800); // 0.02 XLM/sec for 1 week

  // Create a third stream from a different "employer"
  const otherEmployer = 'GDEMO' + '0'.repeat(48) + 'EMPL';
  createStream(otherEmployer, employeeAddr, 'USDC', 0.1, 2592000); // 0.1 USDC/sec for 30 days
}
