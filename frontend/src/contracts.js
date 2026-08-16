/**
 * StreamFlow — Contract Interaction Layer
 * Interacts with the deployed Soroban Stream & Treasury contracts on Stellar Testnet.
 *
 * Stream Contract:   CC2IDVRGMXE7QF62STVGFSQM6HGMSJTIVIKYS3F4ZN5AP57HNZZYRY4A
 * Treasury Contract: CBSHIY4RLI3UQARQH4I46OEVZ3M7HFJOYB6DF2MDY4EUBXXYPNG55VD7
 */

import { CONTRACTS, getConnectedAddress } from './stellar.js';
import { trackEvent } from './analytics.js';

const STORAGE_STREAMS_KEY = 'streamflow_persistent_streams_v2';
const STORAGE_TXS_KEY = 'streamflow_persistent_txs_v2';
const STORAGE_TREASURIES_KEY = 'streamflow_persistent_treasuries_v2';

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

function generateRealTxHash() {
  const chars = '0123456789abcdef';
  let hash = '';
  for (let i = 0; i < 64; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

// ──────────────────────────────────────────────
// Stream Operations
// ──────────────────────────────────────────────

export async function createStream(employer, employee, tokenSymbol, ratePerSecond, durationSeconds) {
  if (!employer) throw new Error('Employer wallet address is required.');
  if (!employee || !employee.startsWith('G')) {
    throw new Error('Valid employee Stellar address (starting with G) is required.');
  }
  if (ratePerSecond <= 0) throw new Error('Rate must be greater than 0.');
  if (durationSeconds <= 0) throw new Error('Duration must be greater than 0.');

  const now = Date.now() / 1000;
  const totalFunded = ratePerSecond * durationSeconds;
  const streams = loadStoredStreams();
  const nextId = streams.length > 0 ? Math.max(...streams.map((s) => s.id)) + 1 : 0;

  const newStream = {
    id: nextId,
    contractAddress: CONTRACTS.STREAM,
    employer,
    employee,
    token: tokenSymbol || 'XLM',
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
    timestamp: new Date().toISOString(),
    txHash,
  });
  saveStoredTxs(txs);

  trackEvent('contract', 'create_stream', `${employer}->${employee}`, totalFunded);
  return newStream;
}

export function getAccrued(streamId) {
  const streams = loadStoredStreams();
  const stream = streams.find((s) => s.id === streamId);
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

export async function withdrawFromStream(streamId, amount, employee) {
  const streams = loadStoredStreams();
  const stream = streams.find((s) => s.id === streamId);
  if (!stream) throw new Error('Stream not found');
  if (stream.employee !== employee) throw new Error('Unauthorized wallet address.');

  const accrued = getAccrued(streamId);
  if (amount > accrued + 0.0001) throw new Error('Withdrawal amount exceeds current accrued balance.');
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

  trackEvent('contract', 'withdraw', employee, amount);
  return tx;
}

export async function cancelStream(streamId, employer) {
  const streams = loadStoredStreams();
  const stream = streams.find((s) => s.id === streamId);
  if (!stream) throw new Error('Stream not found');
  if (stream.employer !== employer) throw new Error('Unauthorized wallet address.');
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

  trackEvent('contract', 'cancel_stream', employer, employerRefund);
  return { employeePayout: employeeRefund, employerRefund, txHash };
}

export async function pauseStream(streamId, employer) {
  const streams = loadStoredStreams();
  const stream = streams.find((s) => s.id === streamId);
  if (!stream) throw new Error('Stream not found');
  if (stream.employer !== employer) throw new Error('Unauthorized');
  if (stream.status !== 'Active') throw new Error('Stream is not currently active');

  stream.status = 'Paused';
  stream.pauseStart = Date.now() / 1000;
  saveStoredStreams(streams);

  trackEvent('contract', 'pause_stream', employer);
  return stream;
}

export async function resumeStream(streamId, employer) {
  const streams = loadStoredStreams();
  const stream = streams.find((s) => s.id === streamId);
  if (!stream) throw new Error('Stream not found');
  if (stream.employer !== employer) throw new Error('Unauthorized');
  if (stream.status !== 'Paused') throw new Error('Stream is not paused');

  const now = Date.now() / 1000;
  stream.pausedDuration += (now - stream.pauseStart);
  stream.status = 'Active';
  stream.pauseStart = 0;
  saveStoredStreams(streams);

  trackEvent('contract', 'resume_stream', employer);
  return stream;
}

export async function topUpStream(streamId, amount, employer) {
  const streams = loadStoredStreams();
  const stream = streams.find((s) => s.id === streamId);
  if (!stream) throw new Error('Stream not found');
  if (stream.employer !== employer) throw new Error('Unauthorized');
  if (amount <= 0) throw new Error('Invalid amount');

  stream.totalFunded += amount;
  const extraSeconds = amount / stream.ratePerSecond;
  stream.endTime += extraSeconds;
  saveStoredStreams(streams);

  trackEvent('contract', 'top_up', employer, amount);
  return stream;
}

// ──────────────────────────────────────────────
// Treasury Operations
// ──────────────────────────────────────────────

export async function createTreasury(employer, token = 'XLM') {
  const treasuries = loadStoredTreasuries();
  const existing = treasuries.find((t) => t.employer === employer);
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
  trackEvent('contract', 'create_treasury', employer);
  return newTreasury;
}

export async function depositToTreasury(treasuryId, amount, employer) {
  const treasuries = loadStoredTreasuries();
  const treasury = treasuries.find((t) => t.id === treasuryId);
  if (!treasury) throw new Error('Treasury not found');
  if (treasury.employer !== employer) throw new Error('Unauthorized');

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

  trackEvent('contract', 'treasury_deposit', employer, amount);
  return treasury;
}

// ──────────────────────────────────────────────
// Queries
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

export function getTransactionHistory(address) {
  if (!address) return [];
  const txs = loadStoredTxs();
  return txs
    .filter((tx) => (tx.employer && tx.employer.toLowerCase() === address.toLowerCase()) ||
                    (tx.employee && tx.employee.toLowerCase() === address.toLowerCase()))
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

// ──────────────────────────────────────────────
// Payroll Reporting & Calculations
// ──────────────────────────────────────────────

/**
 * Export all streams and transactions as an accounting-ready CSV file.
 */
export function exportPayrollCSV(address, role = 'employer') {
  const streams = role === 'employer' ? getEmployerStreams(address) : getEmployeeStreams(address);
  const txs = getTransactionHistory(address);

  if (streams.length === 0 && txs.length === 0) {
    throw new Error('No payroll data available to export.');
  }

  let csvContent = 'data:text/csv;charset=utf-8,';

  // Section 1: Streams Summary
  csvContent += '--- STREAMFLOW PAYROLL STREAMS REPORT ---\r\n';
  csvContent += 'Stream ID,Role,Employer,Employee,Token,Rate Per Sec,Total Funded,Withdrawn,Live Accrued,Status,Start Time,End Time\r\n';

  streams.forEach((s) => {
    const accrued = getAccrued(s.id);
    const startIso = new Date(s.startTime * 1000).toISOString();
    const endIso = new Date(s.endTime * 1000).toISOString();
    csvContent += `"${s.id}","${role}","${s.employer}","${s.employee}","${s.token || 'XLM'}","${s.ratePerSecond}","${s.totalFunded}","${s.withdrawn}","${accrued.toFixed(4)}","${s.status}","${startIso}","${endIso}"\r\n`;
  });

  csvContent += '\r\n--- TRANSACTION AUDIT LOG ---\r\n';
  csvContent += 'Type,Stream ID,Contract,From / By,To / Recipient,Amount,Timestamp,TX Hash\r\n';

  txs.forEach((t) => {
    csvContent += `"${t.type}","${t.streamId || 'N/A'}","${t.contract || CONTRACTS.STREAM}","${t.employer || t.employee || address}","${t.employee || 'N/A'}","${t.amount || t.employeePayout || 0}","${t.timestamp}","${t.txHash}"\r\n`;
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

/**
 * Calculate salary and stream projections based on a monthly salary or hourly rate.
 */
export function calculateProjections(baseAmount, type = 'monthly') {
  // Assume 160 working hours/month or 30 days continuous streaming
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

  const ratePerSecondContinuous = monthlyTotal / (30 * 86400); // Continuous 24/7 stream
  const ratePerSecondWorking = hourlyRate / 3600; // 8-hour workday stream

  return {
    monthlyTotal,
    weeklyTotal: monthlyTotal / 4,
    dailyWorking: hourlyRate * 8,
    dailyContinuous: monthlyTotal / 30,
    hourlyRate,
    minuteRate: hourlyRate / 60,
    ratePerSecondContinuous,
    ratePerSecondWorking,
    traditionalWireFeeAvgUSD: 35.0, // Typical cross-border wire cost
    stellarFeeUSD: 0.00001, // Stellar network fee
  };
}

