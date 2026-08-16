/**
 * StreamFlow — Multi-Wallet Stellar & Soroban SDK Integration
 * Supports Freighter, Albedo (Web/Mobile), xBull, Rabet, Hana,
 * Instant 1-Click Testnet Accounts, and Secret Key import.
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import {
  isConnected as freighterIsConnected,
  requestAccess as freighterRequestAccess,
  getPublicKey as freighterGetPublicKey,
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
let connectedWalletType = null; // 'freighter' | 'albedo' | 'xbull' | 'rabet' | 'hana' | 'instant' | 'secretKey'
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

export function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (typeof window !== 'undefined' && window.innerWidth <= 768);
}

/**
 * Timeout wrapper to prevent hanging promises from wallet extensions.
 */
export function withTimeout(promise, ms, errorMsg = 'Operation timed out') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms)),
  ]);
}

/**
 * Dynamically load Albedo Intent SDK for Universal Mobile & Desktop browser support.
 */
let albedoLoadingPromise = null;
export async function loadAlbedoSDK() {
  if (typeof window !== 'undefined' && window.albedo) {
    return window.albedo;
  }
  if (albedoLoadingPromise) {
    return albedoLoadingPromise;
  }
  albedoLoadingPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      return reject(new Error('Albedo requires a browser environment.'));
    }
    if (window.albedo) {
      return resolve(window.albedo);
    }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@albedo-link/intent@0.12.0/lib/albedo.intent.js';
    script.async = true;
    script.onload = () => {
      if (window.albedo) {
        resolve(window.albedo);
      } else {
        reject(new Error('Albedo script loaded but window.albedo not defined.'));
      }
    };
    script.onerror = () => {
      albedoLoadingPromise = null;
      reject(new Error('Failed to load Albedo SDK from CDN. Please check your internet connection or use Instant Account.'));
    };
    document.head.appendChild(script);
  });
  return albedoLoadingPromise;
}

// ──────────────────────────────────────────────
// Wallet Availability Checkers
// ──────────────────────────────────────────────

export async function isFreighterAvailable() {
  try {
    if (typeof window !== 'undefined' && (window.freighterApi || window.freighter)) {
      return true;
    }
    // In standard mobile browser, Freighter extension is not injected (it runs in Freighter App DApp browser)
    if (isMobileDevice()) {
      return false;
    }
    if (typeof freighterIsConnected === 'function') {
      const connected = await withTimeout(freighterIsConnected(), 800, 'Freighter timeout');
      return !!connected;
    }
    return false;
  } catch {
    return false;
  }
}

export function isAlbedoAvailable() {
  // Albedo works in every browser (mobile and desktop) via secure web intents!
  return typeof window !== 'undefined';
}

export function isXBullAvailable() {
  return typeof window !== 'undefined' && !!(window.xBullSDK || window.xbull);
}

export function isRabetAvailable() {
  return typeof window !== 'undefined' && !!window.rabet;
}

export function isHanaAvailable() {
  return typeof window !== 'undefined' && !!(window.hana || window.hanaWallet);
}

// ──────────────────────────────────────────────
// Supported Wallets Registry
// ──────────────────────────────────────────────

export const SUPPORTED_WALLETS = [
  {
    id: 'freighter',
    name: 'Freighter Wallet',
    platform: 'Desktop Extension & Mobile',
    badge: 'Popular',
    icon: '🦊',
    desc: 'Official Stellar Development Foundation wallet extension & app',
    installUrl: 'https://www.freighter.app/',
    isAvailable: isFreighterAvailable,
  },
  {
    id: 'albedo',
    name: 'Albedo (Web & Mobile)',
    platform: 'Universal — No install needed',
    badge: 'Recommended for Mobile',
    icon: '🌐',
    desc: 'Works in any browser on iOS, Android, macOS & Windows via secure popup',
    installUrl: 'https://albedo.link/',
    isAvailable: () => true,
  },
  {
    id: 'xbull',
    name: 'xBull Wallet',
    platform: 'Extension & Mobile',
    badge: 'Multi-platform',
    icon: '🐂',
    desc: 'Feature-rich Stellar wallet for desktop browsers and mobile devices',
    installUrl: 'https://xbull.app/',
    isAvailable: async () => isXBullAvailable(),
  },
  {
    id: 'rabet',
    name: 'Rabet Wallet',
    platform: 'Browser Extension',
    badge: 'Extension',
    icon: '🐰',
    desc: 'Lightweight browser extension for Stellar ecosystem',
    installUrl: 'https://rabet.io/',
    isAvailable: async () => isRabetAvailable(),
  },
  {
    id: 'hana',
    name: 'Hana Wallet',
    platform: 'Multi-chain Extension',
    badge: 'Extension',
    icon: '🌸',
    desc: 'Non-custodial multi-chain wallet with Soroban & Stellar support',
    installUrl: 'https://hanawallet.io/',
    isAvailable: async () => isHanaAvailable(),
  },
  {
    id: 'instant',
    name: 'Instant Testnet Account',
    platform: '1-Click Universal Demo',
    badge: 'Instant 10,000 XLM',
    icon: '⚡',
    desc: 'Auto-generate and fund a new Stellar Testnet account with 1 click',
    installUrl: null,
    isAvailable: () => true,
  },
  {
    id: 'secretKey',
    name: 'Stellar Secret Key',
    platform: 'Direct Keypair Import',
    badge: 'Developer',
    icon: '🔑',
    desc: 'Connect using an existing Stellar Testnet Secret Key (starts with S)',
    installUrl: null,
    isAvailable: () => true,
  },
];

// ──────────────────────────────────────────────
// Connection Implementations
// ──────────────────────────────────────────────

/**
 * Connect to Freighter Desktop Extension or Mobile.
 */
export async function connectFreighter() {
  try {
    let address = null;

    // 1. Check window.freighterApi if injected (Desktop extension or Freighter In-App Mobile Browser)
    if (typeof window !== 'undefined' && window.freighterApi) {
      try {
        if (typeof window.freighterApi.setAllowed === 'function') {
          await withTimeout(window.freighterApi.setAllowed(), 1500, 'setAllowed timeout');
        }
      } catch (e) {
        console.warn('Freighter setAllowed notice:', e);
      }

      try {
        if (typeof window.freighterApi.getPublicKey === 'function') {
          const res = await withTimeout(window.freighterApi.getPublicKey(), 3000, 'Freighter getPublicKey timed out');
          address = typeof res === 'string' ? res : res?.publicKey || res?.address;
        } else if (typeof window.freighterApi.requestAccess === 'function') {
          const res = await withTimeout(window.freighterApi.requestAccess(), 3000, 'Freighter requestAccess timed out');
          address = typeof res === 'string' ? res : res?.address || res?.publicKey;
        } else if (typeof window.freighterApi.getAddress === 'function') {
          const res = await withTimeout(window.freighterApi.getAddress(), 3000, 'Freighter getAddress timed out');
          address = typeof res === 'string' ? res : res?.address || res?.publicKey;
        }
      } catch (e) {
        console.warn('Injected window.freighterApi error:', e);
      }
    }

    // 2. If in regular mobile browser (Chrome/Safari) and window.freighterApi is not present:
    // Mobile apps cannot inject content scripts into external mobile Chrome/Safari.
    if (!address && isMobileDevice()) {
      throw new Error(
        'FREIGHTER_MOBILE_GUIDANCE:Freighter App detected. To connect Freighter on mobile, open this page inside Freighter App\'s DApp Browser, or tap Albedo / Instant Demo to connect immediately in this browser.'
      );
    }

    // 3. Fallback to @stellar/freighter-api package functions with strict timeout (Desktop)
    if (!address) {
      try {
        if (typeof freighterRequestAccess === 'function') {
          const res = await withTimeout(freighterRequestAccess(), 2500, 'Freighter extension not responding');
          if (res && res.error) throw new Error(res.error);
          address = typeof res === 'string' ? res : res?.address || res?.publicKey;
        }
      } catch (e) {
        console.warn('freighterRequestAccess fallback notice:', e);
      }
    }

    if (!address) {
      try {
        if (typeof freighterGetPublicKey === 'function') {
          const res = await withTimeout(freighterGetPublicKey(), 2500, 'Freighter extension not responding');
          if (res && res.error) throw new Error(res.error);
          address = typeof res === 'string' ? res : res?.address || res?.publicKey;
        }
      } catch (e) {
        console.warn('freighterGetPublicKey fallback notice:', e);
      }
    }

    if (!address || typeof address !== 'string' || !address.startsWith('G') || address.length !== 56) {
      if (isMobileDevice()) {
        throw new Error(
          'FREIGHTER_MOBILE_GUIDANCE:Freighter App detected. To connect Freighter on mobile, open this page inside Freighter App\'s DApp Browser, or tap Albedo / Instant Demo to connect immediately in this browser.'
        );
      }
      throw new Error(
        'Could not retrieve a valid Stellar public key from Freighter. Please ensure the Freighter extension is unlocked and permission is granted.'
      );
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
    throw err;
  }
}

/**
 * Connect to Albedo Web/Mobile Wallet.
 * Opens secure Albedo authentication popup/intent.
 */
export async function connectAlbedo() {
  try {
    const albedo = await withTimeout(
      loadAlbedoSDK(),
      7000,
      'Failed to load Albedo SDK. Please check your internet connection or use Instant Demo Account.'
    );
    const result = await withTimeout(
      albedo.publicKey({ require_existing: false }),
      60000,
      'Albedo authentication timed out or was closed.'
    );

    if (!result || !result.pubkey) {
      throw new Error('Albedo authentication was cancelled or returned no public key.');
    }

    const address = result.pubkey;
    if (!address.startsWith('G') || address.length !== 56) {
      throw new Error('Invalid public key returned from Albedo.');
    }

    connectedAddress = address;
    connectedWalletType = 'albedo';
    activeSecretKey = null;

    localStorage.setItem('streamflow_address', connectedAddress);
    localStorage.setItem('streamflow_wallet_type', 'albedo');
    window.__streamflow_wallet = connectedAddress;

    trackEvent('wallet', 'connected_albedo', connectedAddress);
    return connectedAddress;
  } catch (err) {
    trackError(err, 'albedo-connect');
    if (err.message && (err.message.includes('popup') || err.message.includes('closed'))) {
      throw new Error('Albedo popup was closed or blocked. Please allow popups or use Instant Demo Account.');
    }
    throw new Error(err.message || 'Failed to connect Albedo wallet.');
  }
}

/**
 * Connect to xBull Wallet.
 */
export async function connectXBull() {
  try {
    if (typeof window === 'undefined' || (!window.xBullSDK && !window.xbull)) {
      if (isMobileDevice()) {
        throw new Error('xBull extension is not detected in mobile browser. Please use Albedo or Instant Demo Account.');
      }
      throw new Error('xBull Wallet extension is not detected. Please install xBull or use Albedo/Instant Account.');
    }

    const xbull = window.xBullSDK || window.xbull;
    let address = null;

    if (typeof xbull.getPublicKey === 'function') {
      address = await withTimeout(xbull.getPublicKey(), 5000, 'xBull timed out');
    } else if (typeof xbull.connect === 'function') {
      const res = await withTimeout(xbull.connect(), 5000, 'xBull timed out');
      address = typeof res === 'string' ? res : res?.publicKey;
    }

    if (!address || typeof address !== 'string' || !address.startsWith('G')) {
      throw new Error('Could not retrieve public key from xBull. Please unlock xBull.');
    }

    connectedAddress = address;
    connectedWalletType = 'xbull';
    activeSecretKey = null;

    localStorage.setItem('streamflow_address', connectedAddress);
    localStorage.setItem('streamflow_wallet_type', 'xbull');
    window.__streamflow_wallet = connectedAddress;

    trackEvent('wallet', 'connected_xbull', connectedAddress);
    return connectedAddress;
  } catch (err) {
    trackError(err, 'xbull-connect');
    throw new Error(err.message || 'Failed to connect xBull wallet.');
  }
}

/**
 * Connect to Rabet Wallet.
 */
export async function connectRabet() {
  try {
    if (typeof window === 'undefined' || !window.rabet) {
      throw new Error('Rabet Wallet extension is not detected. Please install Rabet from rabet.io or use Albedo.');
    }

    const res = await window.rabet.connect();
    const address = res?.publicKey || res?.address;

    if (!address || typeof address !== 'string' || !address.startsWith('G')) {
      throw new Error('Could not retrieve public key from Rabet. Please grant access in Rabet.');
    }

    connectedAddress = address;
    connectedWalletType = 'rabet';
    activeSecretKey = null;

    localStorage.setItem('streamflow_address', connectedAddress);
    localStorage.setItem('streamflow_wallet_type', 'rabet');
    window.__streamflow_wallet = connectedAddress;

    trackEvent('wallet', 'connected_rabet', connectedAddress);
    return connectedAddress;
  } catch (err) {
    trackError(err, 'rabet-connect');
    throw new Error(err.message || 'Failed to connect Rabet wallet.');
  }
}

/**
 * Connect to Hana Wallet.
 */
export async function connectHana() {
  try {
    const hana = typeof window !== 'undefined' ? (window.hana || window.hanaWallet) : null;
    if (!hana) {
      throw new Error('Hana Wallet is not detected. Please install Hana Wallet or use Albedo.');
    }

    let address = null;
    if (typeof hana.getPublicKey === 'function') {
      address = await hana.getPublicKey();
    } else if (typeof hana.connect === 'function') {
      const res = await hana.connect();
      address = typeof res === 'string' ? res : res?.publicKey;
    }

    if (!address || !address.startsWith('G')) {
      throw new Error('Could not retrieve public key from Hana.');
    }

    connectedAddress = address;
    connectedWalletType = 'hana';
    activeSecretKey = null;

    localStorage.setItem('streamflow_address', connectedAddress);
    localStorage.setItem('streamflow_wallet_type', 'hana');
    window.__streamflow_wallet = connectedAddress;

    trackEvent('wallet', 'connected_hana', connectedAddress);
    return connectedAddress;
  } catch (err) {
    trackError(err, 'hana-connect');
    throw new Error(err.message || 'Failed to connect Hana wallet.');
  }
}

/**
 * 1-Click Instant Testnet Account Creator.
 * Generates a real Stellar keypair and automatically funds it with 10,000 XLM via Friendbot.
 */
export async function createInstantTestnetAccount() {
  try {
    const keypair = StellarSdk.Keypair.random();
    const pubKey = keypair.publicKey();
    const secretKey = keypair.secret();

    connectedAddress = pubKey;
    connectedWalletType = 'instant';
    activeSecretKey = secretKey;

    localStorage.setItem('streamflow_address', connectedAddress);
    localStorage.setItem('streamflow_wallet_type', 'instant');
    localStorage.setItem('streamflow_secret_key', secretKey);
    window.__streamflow_wallet = connectedAddress;

    // Auto-fund immediately with Friendbot
    try {
      await fundWithFriendbot(pubKey);
    } catch (e) {
      console.warn('Auto-funding instant keypair friendbot notice:', e);
    }

    trackEvent('wallet', 'created_instant_account', pubKey);
    return { address: pubKey, secretKey };
  } catch (err) {
    trackError(err, 'instant-account-create');
    throw new Error(err.message || 'Failed to create instant testnet account.');
  }
}

/**
 * Connect with a real Stellar Testnet Secret Key.
 */
export async function connectSecretKey(secretKey) {
  try {
    secretKey = (secretKey || '').trim();
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
 * Unified wallet connection dispatcher.
 */
export async function connectWallet(walletId, options = {}) {
  switch (walletId) {
    case 'freighter':
      return await connectFreighter();
    case 'albedo':
      return await connectAlbedo();
    case 'xbull':
      return await connectXBull();
    case 'rabet':
      return await connectRabet();
    case 'hana':
      return await connectHana();
    case 'instant':
      return await createInstantTestnetAccount();
    case 'secretKey':
      return await connectSecretKey(options.secretKey);
    default:
      throw new Error(`Unsupported wallet type: ${walletId}`);
  }
}

/**
 * Restore connection from localStorage on page load.
 */
export function restoreWalletSession() {
  const savedAddress = localStorage.getItem('streamflow_address');
  const savedType = localStorage.getItem('streamflow_wallet_type');
  const savedSecret = localStorage.getItem('streamflow_secret_key');

  if (savedAddress && savedAddress.startsWith('G')) {
    connectedAddress = savedAddress;
    connectedWalletType = savedType || 'freighter';
    window.__streamflow_wallet = savedAddress;
    if ((savedType === 'secretKey' || savedType === 'instant') && savedSecret) {
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

export function getActiveSecretKey() {
  return activeSecretKey;
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
 * Sign a transaction XDR with the currently connected wallet.
 * Supports Freighter, Albedo (Web/Mobile), xBull, Rabet, Hana, Instant Account & Secret Key.
 */
export async function signTransactionXDR(txXDR) {
  const walletType = connectedWalletType || localStorage.getItem('streamflow_wallet_type');

  // 1. Direct Secret Key / Instant Account signing
  if ((walletType === 'secretKey' || walletType === 'instant') && activeSecretKey) {
    const tx = StellarSdk.TransactionBuilder.fromXDR(txXDR, NETWORK_PASSPHRASE);
    const keypair = StellarSdk.Keypair.fromSecret(activeSecretKey);
    tx.sign(keypair);
    return tx.toXDR();
  }

  // 2. Albedo Web Intent signing (Desktop & Mobile)
  if (walletType === 'albedo') {
    try {
      const albedo = await loadAlbedoSDK();
      const res = await albedo.tx({
        xdr: txXDR,
        network: NETWORK.toLowerCase(),
        network_passphrase: NETWORK_PASSPHRASE,
      });
      return res.signed_envelope_xdr || res.xdr || txXDR;
    } catch (err) {
      trackError(err, 'albedo-sign-tx');
      throw new Error(`Albedo transaction signing rejected: ${err.message}`);
    }
  }

  // 3. xBull Wallet signing
  if (walletType === 'xbull') {
    try {
      const xbull = window.xBullSDK || window.xbull;
      if (xbull && typeof xbull.signXDR === 'function') {
        const signedXDR = await xbull.signXDR(txXDR, { network: NETWORK });
        return signedXDR;
      }
      if (xbull && typeof xbull.signTransaction === 'function') {
        const signedXDR = await xbull.signTransaction(txXDR);
        return signedXDR;
      }
    } catch (err) {
      trackError(err, 'xbull-sign-tx');
      throw new Error(`xBull transaction signing rejected: ${err.message}`);
    }
  }

  // 4. Rabet Wallet signing
  if (walletType === 'rabet') {
    try {
      if (window.rabet && typeof window.rabet.sign === 'function') {
        const res = await window.rabet.sign(txXDR, 'testnet');
        return res?.xdr || res;
      }
    } catch (err) {
      trackError(err, 'rabet-sign-tx');
      throw new Error(`Rabet transaction signing rejected: ${err.message}`);
    }
  }

  // 5. Hana Wallet signing
  if (walletType === 'hana') {
    try {
      const hana = window.hana || window.hanaWallet;
      if (hana && typeof hana.signTransaction === 'function') {
        const res = await hana.signTransaction(txXDR);
        return res?.signedTxXdr || res;
      }
    } catch (err) {
      trackError(err, 'hana-sign-tx');
      throw new Error(`Hana transaction signing rejected: ${err.message}`);
    }
  }

  // 6. Freighter Wallet signing (Extension & Mobile)
  try {
    if (typeof window !== 'undefined' && window.freighterApi && typeof window.freighterApi.signTransaction === 'function') {
      const result = await window.freighterApi.signTransaction(txXDR, {
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      return typeof result === 'string' ? result : (result?.signedTxXdr || result?.signedTxXDR || txXDR);
    }

    if (typeof freighterSignTx === 'function') {
      const result = await freighterSignTx(txXDR, {
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      return typeof result === 'string' ? result : (result?.signedTxXdr || result?.signedTxXDR || txXDR);
    }
  } catch (err) {
    trackError(err, 'freighter-sign-tx');
    throw new Error(`Freighter signing rejected: ${err.message}`);
  }

  return txXDR;
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
