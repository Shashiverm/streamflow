/**
 * StreamFlow — Stellar SDK Integration
 * Wallet connection, transaction building, and Friendbot funding.
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { trackEvent, trackError } from './analytics.js';

const NETWORK = 'TESTNET';
const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const SOROBAN_URL = 'https://soroban-testnet.stellar.org';
const FRIENDBOT_URL = 'https://friendbot.stellar.org';
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;

let connectedAddress = null;
let server = null;
let sorobanServer = null;

export function getHorizonServer() {
  if (!server) {
    server = new StellarSdk.Horizon.Server(HORIZON_URL);
  }
  return server;
}

export function getSorobanServer() {
  if (!sorobanServer) {
    sorobanServer = new StellarSdk.SorobanRpc.Server(SOROBAN_URL);
  }
  return sorobanServer;
}

export function getNetworkPassphrase() {
  return NETWORK_PASSPHRASE;
}

/**
 * Check if Freighter wallet is installed.
 */
export function isFreighterInstalled() {
  return typeof window !== 'undefined' && window.freighterApi;
}

/**
 * Connect to Freighter wallet.
 */
export async function connectWallet() {
  if (!isFreighterInstalled()) {
    throw new Error('Freighter wallet is not installed. Please install it from freighter.app');
  }

  try {
    const addressObj = await window.freighterApi.getAddress();
    if (addressObj && addressObj.address) {
      connectedAddress = addressObj.address;
      window.__streamflow_wallet = connectedAddress;
      trackEvent('wallet', 'connected', connectedAddress);
      return connectedAddress;
    }

    // Try requesting access
    await window.freighterApi.setAllowed();
    const addr = await window.freighterApi.getAddress();
    connectedAddress = addr.address;
    window.__streamflow_wallet = connectedAddress;
    trackEvent('wallet', 'connected', connectedAddress);
    return connectedAddress;
  } catch (err) {
    trackError(err, 'wallet-connect');
    throw new Error('Failed to connect wallet: ' + err.message);
  }
}

/**
 * Get the currently connected wallet address.
 */
export function getConnectedAddress() {
  return connectedAddress;
}

/**
 * Set connected address (for demo/testing mode).
 */
export function setDemoAddress(addr) {
  connectedAddress = addr;
  window.__streamflow_wallet = addr;
}

/**
 * Generate a random Stellar keypair for demo purposes.
 */
export function generateKeypair() {
  const pair = StellarSdk.Keypair.random();
  return {
    publicKey: pair.publicKey(),
    secretKey: pair.secret(),
  };
}

/**
 * Fund an account using Friendbot (testnet only).
 */
export async function fundWithFriendbot(address) {
  try {
    const response = await fetch(`${FRIENDBOT_URL}?addr=${address}`);
    if (!response.ok) {
      const text = await response.text();
      // Already funded is OK
      if (text.includes('createAccountAlreadyExist')) {
        return { success: true, alreadyFunded: true };
      }
      throw new Error(`Friendbot error: ${text}`);
    }
    trackEvent('wallet', 'funded', address);
    return { success: true, alreadyFunded: false };
  } catch (err) {
    if (err.message?.includes('createAccountAlreadyExist')) {
      return { success: true, alreadyFunded: true };
    }
    trackError(err, 'friendbot');
    throw err;
  }
}

/**
 * Get account balance.
 */
export async function getAccountBalance(address) {
  try {
    const horizonServer = getHorizonServer();
    const account = await horizonServer.loadAccount(address);
    const xlmBalance = account.balances.find(b => b.asset_type === 'native');
    return {
      xlm: xlmBalance ? parseFloat(xlmBalance.balance) : 0,
      balances: account.balances,
    };
  } catch (err) {
    if (err.response?.status === 404) {
      return { xlm: 0, balances: [] };
    }
    throw err;
  }
}

/**
 * Sign a transaction using Freighter or a secret key.
 */
export async function signTransaction(txXDR, secretKey = null) {
  if (secretKey) {
    const tx = StellarSdk.TransactionBuilder.fromXDR(txXDR, NETWORK_PASSPHRASE);
    const keypair = StellarSdk.Keypair.fromSecret(secretKey);
    tx.sign(keypair);
    return tx.toXDR();
  }

  if (isFreighterInstalled()) {
    const result = await window.freighterApi.signTransaction(txXDR, {
      networkPassphrase: NETWORK_PASSPHRASE,
    });
    return result.signedTxXdr;
  }

  throw new Error('No signing method available');
}

/**
 * Submit a transaction to the network.
 */
export async function submitTransaction(txXDR) {
  const horizonServer = getHorizonServer();
  const tx = StellarSdk.TransactionBuilder.fromXDR(txXDR, NETWORK_PASSPHRASE);
  const result = await horizonServer.submitTransaction(tx);
  return result;
}

/**
 * Truncate an address for display.
 */
export function truncateAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format token amount (assuming 7 decimal precision for Stellar).
 */
export function formatAmount(stroops, decimals = 7) {
  if (typeof stroops === 'string') stroops = parseInt(stroops);
  return (stroops / Math.pow(10, decimals)).toFixed(2);
}

/**
 * Format a rate per second into a human-readable form.
 */
export function formatRate(ratePerSecond) {
  const perHour = ratePerSecond * 3600;
  const perDay = ratePerSecond * 86400;
  if (perDay >= 1) return `${perDay.toFixed(2)}/day`;
  if (perHour >= 1) return `${perHour.toFixed(2)}/hour`;
  return `${ratePerSecond.toFixed(6)}/sec`;
}

export { StellarSdk };
