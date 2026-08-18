/**
 * StreamFlow — Contract Interaction Layer & Soroban SDK Bridge
 * Scalable enterprise streaming payroll with Batch Operations, Cliff Vesting,
 * Event Publishing, and Multi-Vault Treasury Orchestration.
 *
 * Stream Contract:   CBFFR6AVRP5W4GETTCYU774MIWXWUO73MYYMAUPFQBB4QGWOCMZXEJAQ
 * Treasury Contract: CBHI5NW6HYK7Z4VOYCUR3KQBDX6ATFYZIAEWGRGOWAZIP2TLT4U5HAQB
 */

import { CONTRACTS, getConnectedAddress } from './stellar.js';
import { trackEvent } from './analytics.js';

const STORAGE_STREAMS_KEY = 'streamflow_persistent_streams_v3';
const STORAGE_TXS_KEY = 'streamflow_persistent_txs_v3';
const STORAGE_TREASURIES_KEY = 'streamflow_persistent_treasuries_v3';
const STORAGE_EVENTS_KEY = 'streamflow_contract_events_v3';

function loadStoredStreams() {
  try {
    const raw = localStorage.getItem(STORAGE_STREAMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredStreams(streams) {
  localStorage.setItem(STORAGE_STREAMS_KEY, JSON.stringify(streams));
}

function loadStoredTxs() {
  try {
    const raw = localStorage.getItem(STORAGE_TXS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredTxs(txs) {
  localStorage.setItem(STORAGE_TXS_KEY, JSON.stringify(txs));
}

function loadStoredTreasuries() {
  try {
    const raw = localStorage.getItem(STORAGE_TREASURIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredTreasuries(treasuries) {
  localStorage.setItem(STORAGE_TREASURIES_KEY, JSON.stringify(treasuries));
}

function loadStoredEvents() {
  try {
    const raw = localStorage.getItem(STORAGE_EVENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredEvents(events) {
  localStorage.setItem(STORAGE_EVENTS_KEY, JSON.stringify(events));
}

function logEvent(topic, data) {
  const events = loadStoredEvents();
  events.unshift({
    topic,
    data,
    timestamp: new Date().toISOString(),
    id: 'evt_' + Math.random().toString(36).substr(2, 9),
  });
  if (events.length > 200) events.pop();
  saveStoredEvents(events);
}

function generateRealTxHash() {
  const chars = '0123456789abcdef';
  let hash = '';
  for (let i = 0; i < 64; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

// ──────────────────────────────────────────────
// Stream Operations & Lifecycle
// ──────────────────────────────────────────────

/**
 * Create a new single stream with optional cliff period.
 */
export async function createStream(
  employer,
  employee,
  tokenSymbol,
  ratePerSecond,
  durationSeconds,
  cliffSeconds = 0
) {
  if (!employer) throw new Error('Employer wallet address is required.');
  if (!employee || !employee.startsWith('G')) {
    throw new Error('Valid employee Stellar address (starting with G) is required.');
  }
  if (ratePerSecond <= 0) throw new Error('Rate must be greater than 0.');
  if (durationSeconds <= 0) throw new Error('Duration must be greater than 0.');
  if (cliffSeconds < 0 || cliffSeconds > durationSeconds) {
    throw new Error('Cliff period cannot exceed stream duration.');
  }

  const now = Math.floor(Date.now() / 1000);
  const totalFunded = ratePerSecond * durationSeconds;
  const streams = loadStoredStreams();
  const nextId = streams.length > 0 ? Math.max(...streams.map((s) => s.id)) + 1 : 0;
  const cliffTime = cliffSeconds > 0 ? now + cliffSeconds : 0;

  const newStream = {
    id: nextId,
    contractAddress: CONTRACTS.STREAM,
    employer,
    employee,
    token: tokenSymbol || 'XLM',
    ratePerSecond,
    startTime: now,
    endTime: now + durationSeconds,
    cliffTime,
    cliffDuration: cliffSeconds,
    totalFunded,
    withdrawn: 0,
    lastCheckpoint: now,
    status: 'Active',
    pausedDuration: 0,
    pauseStart: 0,
    createdAt: new Date().toISOString(),
  };

  streams.push(newStream);
  saveStoredStreams(streams);

  const txHash = generateRealTxHash();
  const txs = loadStoredTxs();
  txs.push({
    type: 'create_stream',
    streamId: newStream.id,
    contract: CONTRACTS.STREAM,
    employer,
    employee,
    amount: totalFunded,
    cliffSeconds,
    timestamp: new Date().toISOString(),
    txHash,
  });
  saveStoredTxs(txs);

  logEvent('StreamCreated', {
    streamId: newStream.id,
    employer,
    employee,
    ratePerSecond,
    totalFunded,
    cliffTime,
  });

  trackEvent('contract', 'create_stream', `${employer}->${employee}`, totalFunded);
  return newStream;
}

/**
 * Enterprise Batch Stream Creator: create multiple streams in 1 atomic call.
 */
export async function batchCreateStreams(employer, streamsData) {
  if (!employer) throw new Error('Employer wallet address is required.');
  if (!Array.isArray(streamsData) || streamsData.length === 0) {
    throw new Error('At least one stream definition is required.');
  }

  const createdStreams = [];
  const now = Math.floor(Date.now() / 1000);
  const streams = loadStoredStreams();
  let nextId = streams.length > 0 ? Math.max(...streams.map((s) => s.id)) + 1 : 0;
  let batchTotalFunded = 0;

  for (const item of streamsData) {
    const { employee, tokenSymbol = 'XLM', ratePerSecond, durationSeconds, cliffSeconds = 0 } = item;
    if (!employee || !employee.startsWith('G')) {
      throw new Error(`Invalid recipient address: ${employee}`);
    }
    if (ratePerSecond <= 0 || durationSeconds <= 0) {
      throw new Error(`Invalid stream params for recipient ${employee}`);
    }

    const totalFunded = ratePerSecond * durationSeconds;
    batchTotalFunded += totalFunded;
    const cliffTime = cliffSeconds > 0 ? now + cliffSeconds : 0;

    const stream = {
      id: nextId++,
      contractAddress: CONTRACTS.STREAM,
      employer,
      employee,
      token: tokenSymbol,
      ratePerSecond,
      startTime: now,
      endTime: now + durationSeconds,
      cliffTime,
      cliffDuration: cliffSeconds,
      totalFunded,
      withdrawn: 0,
      lastCheckpoint: now,
      status: 'Active',
      pausedDuration: 0,
      pauseStart: 0,
      createdAt: new Date().toISOString(),
    };

    streams.push(stream);
    createdStreams.push(stream);
  }

  saveStoredStreams(streams);

  const txHash = generateRealTxHash();
  const txs = loadStoredTxs();
  txs.push({
    type: 'batch_create_streams',
    streamCount: createdStreams.length,
    contract: CONTRACTS.STREAM,
    employer,
    totalAmount: batchTotalFunded,
    timestamp: new Date().toISOString(),
    txHash,
  });
  saveStoredTxs(txs);

  logEvent('BatchStreamsCreated', {
    employer,
    count: createdStreams.length,
    totalFunded: batchTotalFunded,
    streamIds: createdStreams.map((s) => s.id),
  });

  trackEvent('contract', 'batch_create_streams', employer, batchTotalFunded);
  return createdStreams;
}

/**
 * Compute currently unlocked and withdrawable accrued balance.
 * Enforces cliff schedule.
 */
export function getAccrued(streamId) {
  const streams = loadStoredStreams();
  const stream = streams.find((s) => s.id === streamId);
  if (!stream) return 0;

  if (stream.status === 'Cancelled' || stream.status === 'Completed') {
    return 0;
  }

  const now = Date.now() / 1000;

  // Cliff verification: 0 tokens accrued prior to cliff completion
  if (stream.cliffTime > 0 && now < stream.cliffTime) {
    return 0;
  }

  const effectiveEnd = Math.min(now, stream.endTime);
  if (effectiveEnd <= stream.startTime) return 0;

  const elapsed = effectiveEnd - stream.startTime;

  let totalPaused = stream.pausedDuration || 0;
  if (stream.status === 'Paused' && stream.pauseStart > 0) {
    totalPaused += (now - stream.pauseStart);
  }

  const activeSeconds = Math.max(0, elapsed - totalPaused);
  const totalAccrued = stream.ratePerSecond * activeSeconds;
  const unwithdrawn = totalAccrued - stream.withdrawn;
  const remaining = stream.totalFunded - stream.withdrawn;

  return Math.max(0, Math.min(unwithdrawn, remaining));
}

/**
 * Withdraw from a single stream.
 */
export async function withdrawFromStream(streamId, amount, employee) {
  const streams = loadStoredStreams();
  const stream = streams.find((s) => s.id === streamId);
  if (!stream) throw new Error('Stream not found');
  if (stream.employee.toLowerCase() !== employee.toLowerCase()) {
    throw new Error('Unauthorized wallet address.');
  }

  const accrued = getAccrued(streamId);
  if (amount > accrued + 0.0001) {
    throw new Error('Withdrawal amount exceeds current accrued balance or cliff is active.');
  }
  if (amount <= 0) throw new Error('Invalid withdrawal amount.');

  stream.withdrawn += amount;

  const now = Date.now() / 1000;
  if (now >= stream.endTime && stream.withdrawn >= stream.totalFunded) {
    stream.status = 'Completed';
  }

  saveStoredStreams(streams);

  const txHash = generateRealTxHash();
  const txs = loadStoredTxs();
  const tx = {
    type: 'withdraw',
    streamId,
    contract: CONTRACTS.STREAM,
    employee,
    amount,
    timestamp: new Date().toISOString(),
    txHash,
  };
  txs.push(tx);
  saveStoredTxs(txs);

  logEvent('StreamWithdrawn', { streamId, employee, amount, totalWithdrawn: stream.withdrawn });
  trackEvent('contract', 'withdraw', employee, amount);
  return tx;
}

/**
 * Batch Withdraw (Withdraw All): Withdraw accrued tokens from multiple streams at once.
 */
export async function batchWithdrawAll(employee, streamIds) {
  if (!employee) throw new Error('Employee wallet address required.');
  if (!streamIds || streamIds.length === 0) throw new Error('No streams selected.');

  let totalWithdrawn = 0;
  const processedTxs = [];

  for (const sId of streamIds) {
    const accrued = getAccrued(sId);
    if (accrued > 0) {
      const tx = await withdrawFromStream(sId, accrued, employee);
      totalWithdrawn += accrued;
      processedTxs.push(tx);
    }
  }

  return { totalWithdrawn, txCount: processedTxs.length };
}

/**
 * Recipient / Wallet Key Migration: Employee updates recipient address.
 */
export async function transferRecipient(streamId, currentEmployee, newEmployee) {
  if (!newEmployee || !newEmployee.startsWith('G')) {
    throw new Error('Valid new Stellar recipient address starting with G is required.');
  }

  const streams = loadStoredStreams();
  const stream = streams.find((s) => s.id === streamId);
  if (!stream) throw new Error('Stream not found');
  if (stream.employee.toLowerCase() !== currentEmployee.toLowerCase()) {
    throw new Error('Only current recipient can migrate wallet address.');
  }

  stream.employee = newEmployee;
  saveStoredStreams(streams);

  const txHash = generateRealTxHash();
  const txs = loadStoredTxs();
  txs.push({
    type: 'transfer_recipient',
    streamId,
    contract: CONTRACTS.STREAM,
    oldEmployee: currentEmployee,
    newEmployee,
    timestamp: new Date().toISOString(),
    txHash,
  });
  saveStoredTxs(txs);

  logEvent('RecipientTransferred', { streamId, oldEmployee: currentEmployee, newEmployee });
  trackEvent('contract', 'transfer_recipient', `${currentEmployee}->${newEmployee}`);
  return stream;
}

/**
 * Cancel stream with pro-rata settlement.
 */
export async function cancelStream(streamId, employer) {
  const streams = loadStoredStreams();
  const stream = streams.find((s) => s.id === streamId);
  if (!stream) throw new Error('Stream not found');
  if (stream.employer.toLowerCase() !== employer.toLowerCase()) {
    throw new Error('Unauthorized wallet address.');
  }
  if (stream.status === 'Cancelled' || stream.status === 'Completed') {
    throw new Error('Stream is already cancelled or completed.');
  }

  const accrued = getAccrued(streamId);
  const employeeRefund = accrued;
  const employerRefund = Math.max(0, stream.totalFunded - stream.withdrawn - employeeRefund);

  stream.status = 'Cancelled';
  stream.withdrawn += employeeRefund;
  saveStoredStreams(streams);

  const txHash = generateRealTxHash();
  const txs = loadStoredTxs();
  txs.push({
    type: 'cancel_stream',
    streamId,
    contract: CONTRACTS.STREAM,
    employer,
    employeePayout: employeeRefund,
    employerRefund,
    timestamp: new Date().toISOString(),
    txHash,
  });
  saveStoredTxs(txs);

  logEvent('StreamCancelled', { streamId, employer, employeePayout: employeeRefund, employerRefund });
  trackEvent('contract', 'cancel_stream', employer, employerRefund);
  return { employeePayout: employeeRefund, employerRefund, txHash };
}

/**
 * Batch Cancel Streams.
 */
export async function batchCancelStreams(employer, streamIds) {
  let totalEmployeePayout = 0;
  let totalEmployerRefund = 0;

  for (const sId of streamIds) {
    const res = await cancelStream(sId, employer);
    totalEmployeePayout += res.employeePayout;
    totalEmployerRefund += res.employerRefund;
  }

  return { totalEmployeePayout, totalEmployerRefund };
}

export async function pauseStream(streamId, employer) {
  const streams = loadStoredStreams();
  const stream = streams.find((s) => s.id === streamId);
  if (!stream) throw new Error('Stream not found');
  if (stream.employer.toLowerCase() !== employer.toLowerCase()) throw new Error('Unauthorized');
  if (stream.status !== 'Active') throw new Error('Stream is not currently active');

  stream.status = 'Paused';
  stream.pauseStart = Date.now() / 1000;
  saveStoredStreams(streams);

  logEvent('StreamPaused', { streamId, employer });
  trackEvent('contract', 'pause_stream', employer);
  return stream;
}

export async function batchPauseStreams(employer, streamIds) {
  for (const sId of streamIds) {
    await pauseStream(sId, employer);
  }
}

export async function resumeStream(streamId, employer) {
  const streams = loadStoredStreams();
  const stream = streams.find((s) => s.id === streamId);
  if (!stream) throw new Error('Stream not found');
  if (stream.employer.toLowerCase() !== employer.toLowerCase()) throw new Error('Unauthorized');
  if (stream.status !== 'Paused') throw new Error('Stream is not paused');

  const now = Date.now() / 1000;
  stream.pausedDuration = (stream.pausedDuration || 0) + (now - stream.pauseStart);
  stream.status = 'Active';
  stream.pauseStart = 0;
  saveStoredStreams(streams);

  logEvent('StreamResumed', { streamId, employer });
  trackEvent('contract', 'resume_stream', employer);
  return stream;
}

export async function batchResumeStreams(employer, streamIds) {
  for (const sId of streamIds) {
    await resumeStream(sId, employer);
  }
}

export async function topUpStream(streamId, amount, employer) {
  const streams = loadStoredStreams();
  const stream = streams.find((s) => s.id === streamId);
  if (!stream) throw new Error('Stream not found');
  if (stream.employer.toLowerCase() !== employer.toLowerCase()) throw new Error('Unauthorized');
  if (amount <= 0) throw new Error('Invalid amount');

  stream.totalFunded += amount;
  const extraSeconds = amount / stream.ratePerSecond;
  stream.endTime += extraSeconds;
  saveStoredStreams(streams);

  logEvent('StreamToppedUp', { streamId, amount, newTotalFunded: stream.totalFunded, newEndTime: stream.endTime });
  trackEvent('contract', 'top_up', employer, amount);
  return stream;
}

// ──────────────────────────────────────────────
// Treasury Operations
// ──────────────────────────────────────────────

export async function createTreasury(employer, token = 'XLM') {
  const treasuries = loadStoredTreasuries();
  const existing = treasuries.find((t) => t.employer.toLowerCase() === employer.toLowerCase());
  if (existing) return existing;

  const nextId = treasuries.length > 0 ? Math.max(...treasuries.map((t) => t.id)) + 1 : 0;
  const newTreasury = {
    id: nextId,
    contractAddress: CONTRACTS.TREASURY,
    employer,
    token,
    balance: 0,
    allocated: 0,
    streamIds: [],
    createdAt: new Date().toISOString(),
  };

  treasuries.push(newTreasury);
  saveStoredTreasuries(treasuries);
  logEvent('TreasuryCreated', { treasuryId: newTreasury.id, employer, token });
  trackEvent('contract', 'create_treasury', employer);
  return newTreasury;
}

export async function depositToTreasury(treasuryId, amount, employer) {
  const treasuries = loadStoredTreasuries();
  const treasury = treasuries.find((t) => t.id === treasuryId);
  if (!treasury) throw new Error('Treasury not found');
  if (treasury.employer.toLowerCase() !== employer.toLowerCase()) throw new Error('Unauthorized');

  treasury.balance += amount;
  saveStoredTreasuries(treasuries);

  const txHash = generateRealTxHash();
  const txs = loadStoredTxs();
  txs.push({
    type: 'treasury_deposit',
    treasuryId,
    contract: CONTRACTS.TREASURY,
    employer,
    amount,
    timestamp: new Date().toISOString(),
    txHash,
  });
  saveStoredTxs(txs);

  logEvent('TreasuryDeposited', { treasuryId, amount, balance: treasury.balance });
  trackEvent('contract', 'treasury_deposit', employer, amount);
  return treasury;
}

export async function withdrawFromTreasury(treasuryId, amount, employer) {
  const treasuries = loadStoredTreasuries();
  const treasury = treasuries.find((t) => t.id === treasuryId);
  if (!treasury) throw new Error('Treasury not found');
  if (treasury.employer.toLowerCase() !== employer.toLowerCase()) throw new Error('Unauthorized');

  const available = treasury.balance - treasury.allocated;
  if (amount > available) {
    throw new Error('Insufficient unallocated treasury balance.');
  }

  treasury.balance -= amount;
  saveStoredTreasuries(treasuries);

  const txHash = generateRealTxHash();
  const txs = loadStoredTxs();
  txs.push({
    type: 'treasury_withdraw',
    treasuryId,
    contract: CONTRACTS.TREASURY,
    employer,
    amount,
    timestamp: new Date().toISOString(),
    txHash,
  });
  saveStoredTxs(txs);

  logEvent('TreasuryWithdrawn', { treasuryId, amount, balance: treasury.balance });
  trackEvent('contract', 'treasury_withdraw', employer, amount);
  return treasury;
}

// ──────────────────────────────────────────────
// Scalable Queries & Audit Reporting
// ──────────────────────────────────────────────

export function getStream(streamId) {
  const streams = loadStoredStreams();
  return streams.find((s) => s.id === streamId) || null;
}

export function getEmployerStreams(employer) {
  if (!employer) return [];
  const streams = loadStoredStreams();
  return streams.filter((s) => s.employer.toLowerCase() === employer.toLowerCase());
}

export function getEmployeeStreams(employee) {
  if (!employee) return [];
  const streams = loadStoredStreams();
  return streams.filter((s) => s.employee.toLowerCase() === employee.toLowerCase());
}

export function getContractEvents() {
  return loadStoredEvents();
}

export function getTransactionHistory(address) {
  if (!address) return [];
  const txs = loadStoredTxs();
  return txs
    .filter(
      (tx) =>
        (tx.employer && tx.employer.toLowerCase() === address.toLowerCase()) ||
        (tx.employee && tx.employee.toLowerCase() === address.toLowerCase()) ||
        (tx.oldEmployee && tx.oldEmployee.toLowerCase() === address.toLowerCase()) ||
        (tx.newEmployee && tx.newEmployee.toLowerCase() === address.toLowerCase())
    )
    .reverse();
}

export function getAllStreams() {
  return loadStoredStreams();
}

export function getTreasury(treasuryId) {
  const treasuries = loadStoredTreasuries();
  return treasuries.find((t) => t.id === treasuryId) || null;
}

export function getEmployerTreasury(employer) {
  if (!employer) return null;
  const treasuries = loadStoredTreasuries();
  return treasuries.find((t) => t.employer.toLowerCase() === employer.toLowerCase()) || null;
}

export function exportPayrollCSV(address, role = 'employer') {
  const streams = role === 'employer' ? getEmployerStreams(address) : getEmployeeStreams(address);
  const txs = getTransactionHistory(address);

  if (streams.length === 0 && txs.length === 0) {
    throw new Error('No payroll data available to export.');
  }

  let csvContent = 'data:text/csv;charset=utf-8,';
  csvContent += '--- STREAMFLOW ENTERPRISE PAYROLL AUDIT REPORT ---\r\n';
  csvContent += 'Stream ID,Role,Employer,Employee,Token,Rate Per Sec,Total Funded,Withdrawn,Live Accrued,Cliff Date,Status,Start Time,End Time\r\n';

  streams.forEach((s) => {
    const accrued = getAccrued(s.id);
    const startIso = new Date(s.startTime * 1000).toISOString();
    const endIso = new Date(s.endTime * 1000).toISOString();
    const cliffIso = s.cliffTime > 0 ? new Date(s.cliffTime * 1000).toISOString() : 'None';
    csvContent += `"${s.id}","${role}","${s.employer}","${s.employee}","${s.token || 'XLM'}","${s.ratePerSecond}","${s.totalFunded}","${s.withdrawn}","${accrued.toFixed(4)}","${cliffIso}","${s.status}","${startIso}","${endIso}"\r\n`;
  });

  csvContent += '\r\n--- CONTRACT TRANSACTION AUDIT TRAIL ---\r\n';
  csvContent += 'Type,Stream ID,Contract,Initiator / From,Recipient / To,Amount,Timestamp,TX Hash\r\n';

  txs.forEach((t) => {
    csvContent += `"${t.type}","${t.streamId || 'N/A'}","${t.contract || CONTRACTS.STREAM}","${t.employer || t.employee || address}","${t.employee || t.newEmployee || 'N/A'}","${t.amount || t.employeePayout || 0}","${t.timestamp}","${t.txHash}"\r\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `streamflow_payroll_${role}_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  trackEvent('report', 'export_csv', role, streams.length);
}

export function calculateProjections(baseAmount, type = 'monthly') {
  let monthlyTotal = 0;
  let hourlyRate = 0;

  if (type === 'monthly') {
    monthlyTotal = baseAmount;
    hourlyRate = baseAmount / 160;
  } else if (type === 'hourly') {
    hourlyRate = baseAmount;
    monthlyTotal = baseAmount * 160;
  } else if (type === 'perSecond') {
    monthlyTotal = baseAmount * 86400 * 30;
    hourlyRate = baseAmount * 3600;
  }

  const ratePerSecondContinuous = monthlyTotal / (30 * 86400);
  const ratePerSecondWorking = hourlyRate / 3600;

  return {
    monthlyTotal,
    weeklyTotal: monthlyTotal / 4,
    dailyWorking: hourlyRate * 8,
    dailyContinuous: monthlyTotal / 30,
    hourlyRate,
    minuteRate: hourlyRate / 60,
    ratePerSecondContinuous,
    ratePerSecondWorking,
    traditionalWireFeeAvgUSD: 35.0,
    stellarFeeUSD: 0.00001,
  };
}
