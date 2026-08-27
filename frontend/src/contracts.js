/**
 * StreamFlow — Contract Interaction Layer
 *
 * Scalable storage with chunked localStorage, in-memory LRU cache,
 * indexed lookups, and paginated queries.
 *
 * Stream Contract:   CBFFR6AVRP5W4GETTCYU774MIWXWUO73MYYMAUPFQBB4QGWOCMZXEJAQ
 * Treasury Contract: CBHI5NW6HYK7Z4VOYCUR3KQBDX6ATFYZIAEWGRGOWAZIP2TLT4U5HAQB
 */

import { CONTRACTS, getConnectedAddress } from './stellar.js';
import { trackEvent } from './analytics.js';

// ──────────────────────────────────────────────
// Storage layer: chunked localStorage + LRU cache
// ──────────────────────────────────────────────

const CHUNK_SIZE = 500;
const CACHE_MAX = 300;
const PREFIX = 'sf3_';
const INDEX_KEY = `${PREFIX}idx`;
const META_KEY = `${PREFIX}meta`;
const TXS_KEY = `${PREFIX}txs`;
const TREASURIES_KEY = `${PREFIX}treasuries`;
const EVENTS_KEY = `${PREFIX}events`;

// In-memory caches
let _streamCache = new Map(); // id → stream
let _indexDirty = false;
let _index = null; // { nextId, chunkCount, byEmployer: {addr: [ids]}, byEmployee: {addr: [ids]} }
let _writeTimer = null;

function _safeGet(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function _safeSet(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
    return true;
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      console.warn('[StreamFlow] localStorage quota exceeded. Pruning old events...');
      _pruneOldData();
      try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; }
    }
    return false;
  }
}

function _pruneOldData() {
  // Drop oldest events and txs to reclaim space
  const events = _safeGet(EVENTS_KEY) || [];
  if (events.length > 50) _safeSet(EVENTS_KEY, events.slice(-50));
  const txs = _safeGet(TXS_KEY) || [];
  if (txs.length > 200) _safeSet(TXS_KEY, txs.slice(-200));
}

// ─── Index management ───

function _loadIndex() {
  if (_index) return _index;
  _index = _safeGet(INDEX_KEY) || { nextId: 0, chunkCount: 0, byEmployer: {}, byEmployee: {} };
  return _index;
}

function _saveIndex() {
  _safeSet(INDEX_KEY, _index);
}

function _addToIndex(stream) {
  const idx = _loadIndex();
  const empKey = stream.employer.toLowerCase();
  const eeKey = stream.employee.toLowerCase();
  if (!idx.byEmployer[empKey]) idx.byEmployer[empKey] = [];
  if (!idx.byEmployer[empKey].includes(stream.id)) idx.byEmployer[empKey].push(stream.id);
  if (!idx.byEmployee[eeKey]) idx.byEmployee[eeKey] = [];
  if (!idx.byEmployee[eeKey].includes(stream.id)) idx.byEmployee[eeKey].push(stream.id);
  _indexDirty = true;
}

function _updateEmployeeIndex(streamId, oldEmployee, newEmployee) {
  const idx = _loadIndex();
  const oldKey = oldEmployee.toLowerCase();
  const newKey = newEmployee.toLowerCase();
  if (idx.byEmployee[oldKey]) {
    idx.byEmployee[oldKey] = idx.byEmployee[oldKey].filter(id => id !== streamId);
  }
  if (!idx.byEmployee[newKey]) idx.byEmployee[newKey] = [];
  if (!idx.byEmployee[newKey].includes(streamId)) idx.byEmployee[newKey].push(streamId);
  _indexDirty = true;
}

// ─── Chunk management ───

function _chunkKey(chunkIndex) { return `${PREFIX}c_${chunkIndex}`; }

function _loadChunk(chunkIndex) {
  return _safeGet(_chunkKey(chunkIndex)) || [];
}

function _saveChunk(chunkIndex, data) {
  _safeSet(_chunkKey(chunkIndex), data);
}

// ─── Stream access ───

function _getStream(id) {
  if (_streamCache.has(id)) return _streamCache.get(id);

  const idx = _loadIndex();
  // Scan chunks to find the stream
  for (let c = 0; c < idx.chunkCount; c++) {
    const chunk = _loadChunk(c);
    const found = chunk.find(s => s.id === id);
    if (found) {
      _cacheStream(found);
      return found;
    }
  }
  return null;
}

function _cacheStream(stream) {
  if (_streamCache.size >= CACHE_MAX) {
    // Evict oldest entry
    const firstKey = _streamCache.keys().next().value;
    _streamCache.delete(firstKey);
  }
  _streamCache.set(stream.id, stream);
}

function _persistStream(stream) {
  _cacheStream(stream);
  _scheduleSave(stream);
}

function _scheduleSave(stream) {
  // Debounced batch save
  if (_writeTimer) clearTimeout(_writeTimer);
  _writeTimer = setTimeout(() => _flushAll(), 100);
}

function _flushAll() {
  _writeTimer = null;
  const idx = _loadIndex();

  // Rebuild chunks from cache + disk
  const allStreams = _loadAllStreamsRaw();

  // Update from cache
  for (const [id, cached] of _streamCache) {
    const existingIdx = allStreams.findIndex(s => s.id === id);
    if (existingIdx >= 0) {
      allStreams[existingIdx] = cached;
    } else {
      allStreams.push(cached);
    }
  }

  // Sort by id for stable ordering
  allStreams.sort((a, b) => a.id - b.id);

  // Write chunks
  const newChunkCount = Math.ceil(allStreams.length / CHUNK_SIZE) || 1;
  for (let c = 0; c < newChunkCount; c++) {
    const slice = allStreams.slice(c * CHUNK_SIZE, (c + 1) * CHUNK_SIZE);
    _saveChunk(c, slice);
  }

  // Clean up extra chunks
  for (let c = newChunkCount; c < idx.chunkCount; c++) {
    try { localStorage.removeItem(_chunkKey(c)); } catch {}
  }

  idx.chunkCount = newChunkCount;
  if (_indexDirty) {
    _saveIndex();
    _indexDirty = false;
  } else {
    _saveIndex();
  }
}

function _loadAllStreamsRaw() {
  const idx = _loadIndex();
  const all = [];
  for (let c = 0; c < idx.chunkCount; c++) {
    all.push(..._loadChunk(c));
  }
  return all;
}

function _getStreamsByIds(ids) {
  const results = [];
  const missing = [];

  for (const id of ids) {
    if (_streamCache.has(id)) {
      results.push(_streamCache.get(id));
    } else {
      missing.push(id);
    }
  }

  if (missing.length > 0) {
    const missingSet = new Set(missing);
    const idx = _loadIndex();
    for (let c = 0; c < idx.chunkCount; c++) {
      if (missingSet.size === 0) break;
      const chunk = _loadChunk(c);
      for (const s of chunk) {
        if (missingSet.has(s.id)) {
          _cacheStream(s);
          results.push(s);
          missingSet.delete(s.id);
        }
      }
    }
  }

  return results;
}

// ─── Migration: import old format if present ───

function _migrateIfNeeded() {
  const oldKey = 'streamflow_persistent_streams_v3';
  const oldData = _safeGet(oldKey);
  if (oldData && Array.isArray(oldData) && oldData.length > 0) {
    const idx = _loadIndex();
    if (idx.chunkCount === 0) {
      // Migrate old data
      let maxId = 0;
      for (const s of oldData) {
        _cacheStream(s);
        _addToIndex(s);
        if (s.id > maxId) maxId = s.id;
      }
      idx.nextId = maxId + 1;
      _flushAll();

      // Migrate txs
      const oldTxs = _safeGet('streamflow_persistent_txs_v3');
      if (oldTxs) _safeSet(TXS_KEY, oldTxs);

      // Migrate treasuries
      const oldTr = _safeGet('streamflow_persistent_treasuries_v3');
      if (oldTr) _safeSet(TREASURIES_KEY, oldTr);

      // Migrate events
      const oldEvt = _safeGet('streamflow_contract_events_v3');
      if (oldEvt) _safeSet(EVENTS_KEY, oldEvt);

      // Clean up old keys
      try {
        localStorage.removeItem(oldKey);
        localStorage.removeItem('streamflow_persistent_txs_v3');
        localStorage.removeItem('streamflow_persistent_treasuries_v3');
        localStorage.removeItem('streamflow_contract_events_v3');
      } catch {}
    }
  }
}

_migrateIfNeeded();

// ──────────────────────────────────────────────
// Transaction & Event storage (simple arrays)
// ──────────────────────────────────────────────

function _loadTxs() { return _safeGet(TXS_KEY) || []; }
function _saveTxs(txs) {
  if (txs.length > 1000) txs = txs.slice(-1000);
  _safeSet(TXS_KEY, txs);
}

function _loadTreasuries() { return _safeGet(TREASURIES_KEY) || []; }
function _saveTreasuries(t) { _safeSet(TREASURIES_KEY, t); }

function _loadEvents() { return _safeGet(EVENTS_KEY) || []; }
function _saveEvents(e) {
  if (e.length > 200) e = e.slice(-200);
  _safeSet(EVENTS_KEY, e);
}

function _logEvent(topic, data) {
  const events = _loadEvents();
  events.push({
    topic, data,
    timestamp: new Date().toISOString(),
    id: 'evt_' + Math.random().toString(36).substr(2, 9),
  });
  _saveEvents(events);
}

function _genTxHash() {
  const chars = '0123456789abcdef';
  let hash = '';
  for (let i = 0; i < 64; i++) hash += chars[Math.floor(Math.random() * chars.length)];
  return hash;
}

// ──────────────────────────────────────────────
// Stream Operations
// ──────────────────────────────────────────────

export async function createStream(employer, employee, tokenSymbol, ratePerSecond, durationSeconds, cliffSeconds = 0) {
  if (!employer) throw new Error('Employer address required.');
  if (!employee || !employee.startsWith('G')) throw new Error('Valid Stellar address starting with G required.');
  if (ratePerSecond <= 0) throw new Error('Rate must be positive.');
  if (durationSeconds <= 0) throw new Error('Duration must be positive.');
  if (cliffSeconds < 0 || cliffSeconds > durationSeconds) throw new Error('Cliff period cannot exceed stream duration.');

  const now = Math.floor(Date.now() / 1000);
  const totalFunded = ratePerSecond * durationSeconds;
  const idx = _loadIndex();
  const id = idx.nextId++;
  const cliffTime = cliffSeconds > 0 ? now + cliffSeconds : 0;

  const stream = {
    id, contractAddress: CONTRACTS.STREAM,
    employer, employee,
    token: tokenSymbol || 'XLM',
    ratePerSecond, startTime: now, endTime: now + durationSeconds,
    cliffTime, cliffDuration: cliffSeconds, totalFunded,
    withdrawn: 0, lastCheckpoint: now, status: 'Active',
    pausedDuration: 0, pauseStart: 0,
    createdAt: new Date().toISOString(),
  };

  _addToIndex(stream);
  _persistStream(stream);
  _flushAll(); // immediate for creates

  const txHash = _genTxHash();
  const txs = _loadTxs();
  txs.push({ type: 'create_stream', streamId: id, contract: CONTRACTS.STREAM, employer, employee, amount: totalFunded, cliffSeconds, timestamp: new Date().toISOString(), txHash });
  _saveTxs(txs);
  _logEvent('StreamCreated', { streamId: id, employer, employee, ratePerSecond, totalFunded, cliffTime });
  trackEvent('contract', 'create_stream', `${employer}->${employee}`, totalFunded);
  return stream;
}

export async function batchCreateStreams(employer, streamsData) {
  if (!employer) throw new Error('Employer address required.');
  if (!Array.isArray(streamsData) || streamsData.length === 0) throw new Error('At least one stream definition required.');

  const created = [];
  const now = Math.floor(Date.now() / 1000);
  const idx = _loadIndex();
  let batchTotal = 0;

  for (const item of streamsData) {
    const { employee, tokenSymbol = 'XLM', ratePerSecond, durationSeconds, cliffSeconds = 0 } = item;
    if (!employee || !employee.startsWith('G')) throw new Error(`Invalid address: ${employee}`);
    if (ratePerSecond <= 0 || durationSeconds <= 0) throw new Error(`Invalid params for ${employee}`);

    const totalFunded = ratePerSecond * durationSeconds;
    batchTotal += totalFunded;
    const id = idx.nextId++;
    const cliffTime = cliffSeconds > 0 ? now + cliffSeconds : 0;

    const stream = {
      id, contractAddress: CONTRACTS.STREAM,
      employer, employee, token: tokenSymbol,
      ratePerSecond, startTime: now, endTime: now + durationSeconds,
      cliffTime, cliffDuration: cliffSeconds, totalFunded,
      withdrawn: 0, lastCheckpoint: now, status: 'Active',
      pausedDuration: 0, pauseStart: 0,
      createdAt: new Date().toISOString(),
    };

    _addToIndex(stream);
    _persistStream(stream);
    created.push(stream);
  }

  _flushAll();

  const txHash = _genTxHash();
  const txs = _loadTxs();
  txs.push({ type: 'batch_create_streams', streamCount: created.length, contract: CONTRACTS.STREAM, employer, totalAmount: batchTotal, timestamp: new Date().toISOString(), txHash });
  _saveTxs(txs);
  _logEvent('BatchStreamsCreated', { employer, count: created.length, totalFunded: batchTotal, streamIds: created.map(s => s.id) });
  trackEvent('contract', 'batch_create_streams', employer, batchTotal);
  return created;
}

export function getAccrued(streamId) {
  const stream = _getStream(streamId);
  if (!stream) return 0;
  if (stream.status === 'Cancelled' || stream.status === 'Completed') return 0;

  const now = Date.now() / 1000;
  if (stream.cliffTime > 0 && now < stream.cliffTime) return 0;

  const effectiveEnd = Math.min(now, stream.endTime);
  if (effectiveEnd <= stream.startTime) return 0;

  const elapsed = effectiveEnd - stream.startTime;
  let totalPaused = stream.pausedDuration || 0;
  if (stream.status === 'Paused' && stream.pauseStart > 0) totalPaused += (now - stream.pauseStart);

  const activeSeconds = Math.max(0, elapsed - totalPaused);
  const totalAccrued = stream.ratePerSecond * activeSeconds;
  const unwithdrawn = totalAccrued - stream.withdrawn;
  const remaining = stream.totalFunded - stream.withdrawn;
  return Math.max(0, Math.min(unwithdrawn, remaining));
}

export async function withdrawFromStream(streamId, amount, employee) {
  const stream = _getStream(streamId);
  if (!stream) throw new Error('Stream not found');
  if (stream.employee.toLowerCase() !== employee.toLowerCase()) throw new Error('Unauthorized.');

  const accrued = getAccrued(streamId);
  if (amount > accrued + 0.0001) throw new Error('Amount exceeds accrued balance.');
  if (amount <= 0) throw new Error('Invalid amount.');

  stream.withdrawn += amount;
  const now = Date.now() / 1000;
  if (now >= stream.endTime && stream.withdrawn >= stream.totalFunded) stream.status = 'Completed';
  _persistStream(stream);

  const txHash = _genTxHash();
  const txs = _loadTxs();
  txs.push({ type: 'withdraw', streamId, contract: CONTRACTS.STREAM, employee, amount, timestamp: new Date().toISOString(), txHash });
  _saveTxs(txs);
  _logEvent('StreamWithdrawn', { streamId, employee, amount, totalWithdrawn: stream.withdrawn });
  trackEvent('contract', 'withdraw', employee, amount);
  return { type: 'withdraw', streamId, employee, amount, txHash, timestamp: new Date().toISOString() };
}

export async function batchWithdrawAll(employee, streamIds) {
  if (!employee) throw new Error('Employee address required.');
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

export async function transferRecipient(streamId, currentEmployee, newEmployee) {
  if (!newEmployee || !newEmployee.startsWith('G')) throw new Error('Valid Stellar address starting with G required.');

  const stream = _getStream(streamId);
  if (!stream) throw new Error('Stream not found');
  if (stream.employee.toLowerCase() !== currentEmployee.toLowerCase()) throw new Error('Only current recipient can migrate.');

  const oldEmployee = stream.employee;
  stream.employee = newEmployee;
  _updateEmployeeIndex(streamId, oldEmployee, newEmployee);
  _persistStream(stream);

  const txHash = _genTxHash();
  const txs = _loadTxs();
  txs.push({ type: 'transfer_recipient', streamId, contract: CONTRACTS.STREAM, oldEmployee, newEmployee, timestamp: new Date().toISOString(), txHash });
  _saveTxs(txs);
  _logEvent('RecipientTransferred', { streamId, oldEmployee, newEmployee });
  trackEvent('contract', 'transfer_recipient', `${oldEmployee}->${newEmployee}`);
  return stream;
}

export async function cancelStream(streamId, employer) {
  const stream = _getStream(streamId);
  if (!stream) throw new Error('Stream not found');
  if (stream.employer.toLowerCase() !== employer.toLowerCase()) throw new Error('Unauthorized.');
  if (stream.status === 'Cancelled' || stream.status === 'Completed') throw new Error('Stream already settled.');

  const accrued = getAccrued(streamId);
  const employeeRefund = accrued;
  const employerRefund = Math.max(0, stream.totalFunded - stream.withdrawn - employeeRefund);

  stream.status = 'Cancelled';
  stream.withdrawn += employeeRefund;
  _persistStream(stream);

  const txHash = _genTxHash();
  const txs = _loadTxs();
  txs.push({ type: 'cancel_stream', streamId, contract: CONTRACTS.STREAM, employer, employeePayout: employeeRefund, employerRefund, timestamp: new Date().toISOString(), txHash });
  _saveTxs(txs);
  _logEvent('StreamCancelled', { streamId, employer, employeePayout: employeeRefund, employerRefund });
  trackEvent('contract', 'cancel_stream', employer, employerRefund);
  return { employeePayout: employeeRefund, employerRefund, txHash };
}

export async function batchCancelStreams(employer, streamIds) {
  let totalEmployeePayout = 0, totalEmployerRefund = 0;
  for (const sId of streamIds) {
    const res = await cancelStream(sId, employer);
    totalEmployeePayout += res.employeePayout;
    totalEmployerRefund += res.employerRefund;
  }
  return { totalEmployeePayout, totalEmployerRefund };
}

export async function pauseStream(streamId, employer) {
  const stream = _getStream(streamId);
  if (!stream) throw new Error('Stream not found');
  if (stream.employer.toLowerCase() !== employer.toLowerCase()) throw new Error('Unauthorized');
  if (stream.status !== 'Active') throw new Error('Stream is not active');

  stream.status = 'Paused';
  stream.pauseStart = Date.now() / 1000;
  _persistStream(stream);
  _logEvent('StreamPaused', { streamId, employer });
  trackEvent('contract', 'pause_stream', employer);
  return stream;
}

export async function batchPauseStreams(employer, streamIds) {
  for (const sId of streamIds) await pauseStream(sId, employer);
}

export async function resumeStream(streamId, employer) {
  const stream = _getStream(streamId);
  if (!stream) throw new Error('Stream not found');
  if (stream.employer.toLowerCase() !== employer.toLowerCase()) throw new Error('Unauthorized');
  if (stream.status !== 'Paused') throw new Error('Stream is not paused');

  const now = Date.now() / 1000;
  stream.pausedDuration = (stream.pausedDuration || 0) + (now - stream.pauseStart);
  stream.status = 'Active';
  stream.pauseStart = 0;
  _persistStream(stream);
  _logEvent('StreamResumed', { streamId, employer });
  trackEvent('contract', 'resume_stream', employer);
  return stream;
}

export async function batchResumeStreams(employer, streamIds) {
  for (const sId of streamIds) await resumeStream(sId, employer);
}

export async function topUpStream(streamId, amount, employer) {
  const stream = _getStream(streamId);
  if (!stream) throw new Error('Stream not found');
  if (stream.employer.toLowerCase() !== employer.toLowerCase()) throw new Error('Unauthorized');
  if (amount <= 0) throw new Error('Invalid amount');

  stream.totalFunded += amount;
  stream.endTime += amount / stream.ratePerSecond;
  _persistStream(stream);
  _logEvent('StreamToppedUp', { streamId, amount, newTotalFunded: stream.totalFunded, newEndTime: stream.endTime });
  trackEvent('contract', 'top_up', employer, amount);
  return stream;
}

// ──────────────────────────────────────────────
// Treasury Operations
// ──────────────────────────────────────────────

export async function createTreasury(employer, token = 'XLM') {
  const treasuries = _loadTreasuries();
  const existing = treasuries.find(t => t.employer.toLowerCase() === employer.toLowerCase());
  if (existing) return existing;

  const nextId = treasuries.length > 0 ? Math.max(...treasuries.map(t => t.id)) + 1 : 0;
  const newTreasury = {
    id: nextId, contractAddress: CONTRACTS.TREASURY,
    employer, token, balance: 0, allocated: 0, streamIds: [],
    createdAt: new Date().toISOString(),
  };
  treasuries.push(newTreasury);
  _saveTreasuries(treasuries);
  _logEvent('TreasuryCreated', { treasuryId: newTreasury.id, employer, token });
  trackEvent('contract', 'create_treasury', employer);
  return newTreasury;
}

export async function depositToTreasury(treasuryId, amount, employer) {
  const treasuries = _loadTreasuries();
  const treasury = treasuries.find(t => t.id === treasuryId);
  if (!treasury) throw new Error('Treasury not found');
  if (treasury.employer.toLowerCase() !== employer.toLowerCase()) throw new Error('Unauthorized');

  treasury.balance += amount;
  _saveTreasuries(treasuries);

  const txHash = _genTxHash();
  const txs = _loadTxs();
  txs.push({ type: 'treasury_deposit', treasuryId, contract: CONTRACTS.TREASURY, employer, amount, timestamp: new Date().toISOString(), txHash });
  _saveTxs(txs);
  _logEvent('TreasuryDeposited', { treasuryId, amount, balance: treasury.balance });
  trackEvent('contract', 'treasury_deposit', employer, amount);
  return treasury;
}

export async function withdrawFromTreasury(treasuryId, amount, employer) {
  const treasuries = _loadTreasuries();
  const treasury = treasuries.find(t => t.id === treasuryId);
  if (!treasury) throw new Error('Treasury not found');
  if (treasury.employer.toLowerCase() !== employer.toLowerCase()) throw new Error('Unauthorized');

  const available = treasury.balance - treasury.allocated;
  if (amount > available) throw new Error('Insufficient unallocated balance.');

  treasury.balance -= amount;
  _saveTreasuries(treasuries);

  const txHash = _genTxHash();
  const txs = _loadTxs();
  txs.push({ type: 'treasury_withdraw', treasuryId, contract: CONTRACTS.TREASURY, employer, amount, timestamp: new Date().toISOString(), txHash });
  _saveTxs(txs);
  _logEvent('TreasuryWithdrawn', { treasuryId, amount, balance: treasury.balance });
  trackEvent('contract', 'treasury_withdraw', employer, amount);
  return treasury;
}

// ──────────────────────────────────────────────
// Queries (paginated + indexed)
// ──────────────────────────────────────────────

export function getStream(streamId) {
  return _getStream(streamId);
}

export function getEmployerStreams(employer, page = 0, pageSize = 0) {
  if (!employer) return [];
  const idx = _loadIndex();
  const ids = idx.byEmployer[employer.toLowerCase()] || [];
  if (ids.length === 0) return [];
  if (pageSize <= 0) return _getStreamsByIds(ids);
  const start = page * pageSize;
  const slice = ids.slice(start, start + pageSize);
  return _getStreamsByIds(slice);
}

export function getEmployerStreamCount(employer) {
  if (!employer) return 0;
  const idx = _loadIndex();
  return (idx.byEmployer[employer.toLowerCase()] || []).length;
}

export function getEmployeeStreams(employee, page = 0, pageSize = 0) {
  if (!employee) return [];
  const idx = _loadIndex();
  const ids = idx.byEmployee[employee.toLowerCase()] || [];
  if (ids.length === 0) return [];
  if (pageSize <= 0) return _getStreamsByIds(ids);
  const start = page * pageSize;
  const slice = ids.slice(start, start + pageSize);
  return _getStreamsByIds(slice);
}

export function getEmployeeStreamCount(employee) {
  if (!employee) return 0;
  const idx = _loadIndex();
  return (idx.byEmployee[employee.toLowerCase()] || []).length;
}

export function getContractEvents() {
  return _loadEvents();
}

export function getTransactionHistory(address) {
  if (!address) return [];
  const txs = _loadTxs();
  const addr = address.toLowerCase();
  return txs
    .filter(tx =>
      (tx.employer && tx.employer.toLowerCase() === addr) ||
      (tx.employee && tx.employee.toLowerCase() === addr) ||
      (tx.oldEmployee && tx.oldEmployee.toLowerCase() === addr) ||
      (tx.newEmployee && tx.newEmployee.toLowerCase() === addr)
    )
    .reverse();
}

export function getAllStreams() {
  return _loadAllStreamsRaw();
}

export function getTreasury(treasuryId) {
  const treasuries = _loadTreasuries();
  return treasuries.find(t => t.id === treasuryId) || null;
}

export function getEmployerTreasury(employer) {
  if (!employer) return null;
  const treasuries = _loadTreasuries();
  return treasuries.find(t => t.employer.toLowerCase() === employer.toLowerCase()) || null;
}

export function exportPayrollCSV(address, role = 'employer') {
  const streams = role === 'employer' ? getEmployerStreams(address) : getEmployeeStreams(address);
  const txs = getTransactionHistory(address);

  if (streams.length === 0 && txs.length === 0) throw new Error('No payroll data to export.');

  let csv = 'data:text/csv;charset=utf-8,';
  csv += 'Stream ID,Role,Employer,Employee,Token,Rate/Sec,Total Funded,Withdrawn,Accrued,Cliff Date,Status,Start,End\r\n';

  for (const s of streams) {
    const accrued = getAccrued(s.id);
    const start = new Date(s.startTime * 1000).toISOString();
    const end = new Date(s.endTime * 1000).toISOString();
    const cliff = s.cliffTime > 0 ? new Date(s.cliffTime * 1000).toISOString() : 'None';
    csv += `"${s.id}","${role}","${s.employer}","${s.employee}","${s.token || 'XLM'}","${s.ratePerSecond}","${s.totalFunded}","${s.withdrawn}","${accrued.toFixed(4)}","${cliff}","${s.status}","${start}","${end}"\r\n`;
  }

  csv += '\r\nType,Stream ID,Contract,From,To,Amount,Timestamp,TX Hash\r\n';
  for (const t of txs) {
    csv += `"${t.type}","${t.streamId || 'N/A'}","${t.contract || CONTRACTS.STREAM}","${t.employer || t.employee || address}","${t.employee || t.newEmployee || 'N/A'}","${t.amount || t.employeePayout || 0}","${t.timestamp}","${t.txHash}"\r\n`;
  }

  const link = document.createElement('a');
  link.setAttribute('href', encodeURI(csv));
  link.setAttribute('download', `streamflow_${role}_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  trackEvent('report', 'export_csv', role, streams.length);
}

export function calculateProjections(baseAmount, type = 'monthly') {
  let monthlyTotal = 0, hourlyRate = 0;

  if (type === 'monthly') { monthlyTotal = baseAmount; hourlyRate = baseAmount / 160; }
  else if (type === 'hourly') { hourlyRate = baseAmount; monthlyTotal = baseAmount * 160; }
  else if (type === 'perSecond') { monthlyTotal = baseAmount * 86400 * 30; hourlyRate = baseAmount * 3600; }

  const ratePerSecondContinuous = monthlyTotal / (30 * 86400);
  const ratePerSecondWorking = hourlyRate / 3600;

  return {
    monthlyTotal, weeklyTotal: monthlyTotal / 4,
    dailyWorking: hourlyRate * 8, dailyContinuous: monthlyTotal / 30,
    hourlyRate, minuteRate: hourlyRate / 60,
    ratePerSecondContinuous, ratePerSecondWorking,
    traditionalWireFeeAvgUSD: 35.0, stellarFeeUSD: 0.00001,
  };
}
