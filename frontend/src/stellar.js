/**
 * StreamFlow — Stellar SDK & Extension Wallet Integration
 * Connects to Freighter, xBull, Albedo, and handles real Stellar Testnet transactions.
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import {
  isConnected as freighterIsConnected,
  requestAccess as freighterRequestAccess,
  getAddress as freighterGetAddress,
  signTransaction as freighterSignTx,
  getNetworkDetails as freighterGetNetworkDetails,
} from '@stellar/freighter-api';
import { trackEvent, trackError } from './analytics.js';

export const NETWORK = 'TESTNET';
export const HORIZON_URL = 'https://horizon-testnet.stellar.org';
export const SOROBAN_URL = 'https://soroban-testnet.stellar.org';
export const FRIENDBOT_URL = 'https://friendbot.stellar.org';
export const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;

// Real deployed Soroban contract addresses on Stellar Testnet
export const CONTRACTS = {
  STREAM: 'CC2IDVRGMXE7QF62STVGFSQM6HGMSJTIVIKYS3F4ZN5AP57HNZZYRY4A',
  TREASURY: 'CBSHIY4RLI3UQARQH4I46OEVZ3M7HFJOYB6DF2MDY4EUBXXYPNG55VD7',
};

let connectedAddress = null;
let connectedWalletType = null; // 'freighter' | 'secretKey'
let activeSecretKey = null;
let horizonServerInstance = null;
let sorobanServerInstance = null;

export function getHorizonServer() {
  if (!horizonServerInstance) {
    horizonServerInstance = new StellarSdk.Horizon.Server(HORIZON_URL);
  }
  return horizonServerInstance;
}

export function getSorobanServer() {
  if (!sorobanServerInstance) {
    sorobanServerInstance = new StellarSdk.SorobanRpc.Server(SOROBAN_URL);
  }
  return sorobanServerInstance;
}

/**
 * Check if Freighter extension is installed and available.
 */
export async function isFreighterAvailable() {
  try {
    if (typeof window !== 'undefined' && window.freighterApi) {
      return true;
    }
    const connected = await freighterIsConnected();
    return !!connected;
  } catch {
    return false;
  }
}

/**
 * Connect to Freighter Desktop Extension.
 */
export async function connectFreighter() {
  try {
    // 1. Request access from the extension
    let accessGranted = false;
    try {
      if (typeof window !== 'undefined' && window.freighterApi && window.freighterApi.setAllowed) {
        await window.freighterApi.setAllowed();
        accessGranted = true;
      }
    } catch {
      // Fall through to freighterRequestAccess
    }

    if (!accessGranted) {
      const accessObj = await freighterRequestAccess();
      if (accessObj && accessObj.error) {
        throw new Error(`Freighter access error: ${accessObj.error}`);
      }
    }

    // 2. Fetch the connected public address
    let address = null;
    if (typeof window !== 'undefined' && window.freighterApi && window.freighterApi.getAddress) {
      const addrObj = await window.freighterApi.getAddress();
      address = addrObj?.address || addrObj;
    }

    if (!address) {
      const addrObj = await freighterGetAddress();
      if (addrObj && addrObj.error) {
        throw new Error(addrObj.error);
      }
      address = addrObj?.address || addrObj;
    }

    if (!address || typeof address !== 'string' || !address.startsWith('G')) {
      throw new Error('Could not retrieve a valid Stellar public key from Freighter. Please unlock your wallet.');
    }

    connectedAddress = address;
    connectedWalletType = 'freighter';
    activeSecretKey = null;

    localStorage.setItem('streamflow_address', connectedAddress);
    localStorage.setItem('streamflow_wallet_type', 'freighter');
    window.__streamflow_wallet = connectedAddress;

    trackEvent('wallet', 'connected_freighter', connectedAddress);
    return connectedAddress;
  } catch (err) {
    trackError(err, 'freighter-connect');
    throw new Error(err.message || 'Failed to connect Freighter wallet.');
  }
}

/**
 * Connect with a real Stellar Testnet Secret Key (e.g. for testing without extensions).
 */
export async function connectSecretKey(secretKey) {
  try {
    secretKey = secretKey.trim();
    if (!secretKey.startsWith('S') || secretKey.length !== 56) {
      throw new Error('Invalid Stellar Secret Key format. It should start with "S" and be 56 characters long.');
    }

    const keypair = StellarSdk.Keypair.fromSecret(secretKey);
    const pubKey = keypair.publicKey();

    connectedAddress = pubKey;
    connectedWalletType = 'secretKey';
    activeSecretKey = secretKey;

    localStorage.setItem('streamflow_address', connectedAddress);
    localStorage.setItem('streamflow_wallet_type', 'secretKey');
    localStorage.setItem('streamflow_secret_key', secretKey);
    window.__streamflow_wallet = connectedAddress;

    trackEvent('wallet', 'connected_secret_key', connectedAddress);
    return connectedAddress;
  } catch (err) {
    trackError(err, 'secret-key-connect');
    throw new Error(err.message || 'Invalid Secret Key.');
  }
}

/**
 * Restore connection from localStorage on page load.
 */
export function restoreWalletSession() {
  const savedAddress = localStorage.getItem('streamflow_address');
  const savedType = localStorage.getItem('streamflow_wallet_type');
  const savedSecret = localStorage.getItem('streamflow_secret_key');

  if (savedAddress) {
    connectedAddress = savedAddress;
    connectedWalletType = savedType || 'freighter';
    window.__streamflow_wallet = savedAddress;
    if (savedType === 'secretKey' && savedSecret) {
      activeSecretKey = savedSecret;
    }
    return connectedAddress;
  }
  return null;
}

/**
 * Disconnect current wallet.
 */
export function disconnectWallet() {
  connectedAddress = null;
  connectedWalletType = null;
  activeSecretKey = null;
  localStorage.removeItem('streamflow_address');
  localStorage.removeItem('streamflow_wallet_type');
  localStorage.removeItem('streamflow_secret_key');
  localStorage.removeItem('streamflow_role');
  window.__streamflow_wallet = null;
  trackEvent('wallet', 'disconnected');
}

export function getConnectedAddress() {
  if (!connectedAddress) {
    restoreWalletSession();
  }
  return connectedAddress;
}

export function getConnectedWalletType() {
  return connectedWalletType;
}

/**
 * Fund an account using Stellar Testnet Friendbot.
 */
export async function fundWithFriendbot(address) {
  try {
    const response = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(address)}`);
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const text = JSON.stringify(data) || '';
      if (text.includes('createAccountAlreadyExist') || text.includes('op_already_exists')) {
        return { success: true, alreadyFunded: true };
      }
      throw new Error(`Friendbot error: ${text}`);
    }
    trackEvent('wallet', 'funded', address);
    return { success: true, alreadyFunded: false };
  } catch (err) {
    if (err.message && (err.message.includes('createAccountAlreadyExist') || err.message.includes('op_already_exists'))) {
      return { success: true, alreadyFunded: true };
    }
    trackError(err, 'friendbot');
    throw err;
  }
}

/**
 * Get account balances from Horizon.
 */
export async function getAccountBalance(address) {
  try {
    const horizonServer = getHorizonServer();
    const account = await horizonServer.loadAccount(address);
    const xlmBalance = account.balances.find((b) => b.asset_type === 'native');
    return {
      xlm: xlmBalance ? parseFloat(xlmBalance.balance) : 0,
      balances: account.balances,
      sequence: account.sequence,
    };
  } catch (err) {
    if (err.response?.status === 404 || err.name === 'NotFoundError') {
      return { xlm: 0, balances: [], notFound: true };
    }
    throw err;
  }
}

/**
 * Sign a transaction XDR with the currently connected wallet (Freighter or Secret Key).
 */
export async function signTransactionXDR(txXDR) {
  if (connectedWalletType === 'secretKey' && activeSecretKey) {
    const tx = StellarSdk.TransactionBuilder.fromXDR(txXDR, NETWORK_PASSPHRASE);
    const keypair = StellarSdk.Keypair.fromSecret(activeSecretKey);
    tx.sign(keypair);
    return tx.toXDR();
  }

  // Use Freighter Extension
  try {
    if (typeof window !== 'undefined' && window.freighterApi && window.freighterApi.signTransaction) {
      const result = await window.freighterApi.signTransaction(txXDR, {
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      return typeof result === 'string' ? result : (result?.signedTxXdr || result?.signedTxXDR || txXDR);
    }

    const result = await freighterSignTx(txXDR, {
      networkPassphrase: NETWORK_PASSPHRASE,
    });
    return typeof result === 'string' ? result : (result?.signedTxXdr || result?.signedTxXDR || txXDR);
  } catch (err) {
    trackError(err, 'wallet-sign-tx');
    throw new Error(`Wallet signing rejected: ${err.message}`);
  }
}

/**
 * Submit signed transaction XDR to Stellar Horizon.
 */
export async function submitTransaction(txXDR) {
  const horizonServer = getHorizonServer();
  const tx = StellarSdk.TransactionBuilder.fromXDR(txXDR, NETWORK_PASSPHRASE);
  const result = await horizonServer.submitTransaction(tx);
  return result;
}

/**
 * Truncate an address for clean UI display.
 */
export function truncateAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format rate per second for display.
 */
export function formatRate(ratePerSecond) {
  const perHour = ratePerSecond * 3600;
  const perDay = ratePerSecond * 86400;
  if (perDay >= 1) return `${perDay.toFixed(2)}/day`;
  if (perHour >= 1) return `${perHour.toFixed(2)}/hour`;
  return `${ratePerSecond.toFixed(6)}/sec`;
}

export { StellarSdk };
