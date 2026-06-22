const bip39 = require('bip39');
const StellarHDWallet = require('stellar-hd-wallet');
const { StellarSdk, isTestnet, server, networkPassphrase } = require('./stellar-config');

// In-memory cache: publicKey -> { federationAddress, expiresAt }
const _federationCache = new Map();
const FEDERATION_TTL_MS = 10 * 60 * 1000; // 10 minutes

function createWallet() {
  const keypair = StellarSdk.Keypair.random();
  return { publicKey: keypair.publicKey(), secretKey: keypair.secret() };
}

function createWalletFromMnemonic() {
  const mnemonic = bip39.generateMnemonic(256); // 24-word phrase
  const wallet = StellarHDWallet.fromMnemonic(mnemonic);
  const keypair = StellarSdk.Keypair.fromSecret(wallet.getSecret(0));
  return { mnemonic, publicKey: keypair.publicKey(), secretKey: keypair.secret() };
}

function deriveKeypairFromMnemonic(mnemonic) {
  if (!bip39.validateMnemonic(mnemonic)) throw new Error('Invalid mnemonic phrase');
  const wallet = StellarHDWallet.fromMnemonic(mnemonic);
  const keypair = StellarSdk.Keypair.fromSecret(wallet.getSecret(0));
  return { publicKey: keypair.publicKey(), secretKey: keypair.secret() };
}

async function fundTestnetAccount(publicKey) {
  const response = await fetch(`https://friendbot.stellar.org?addr=${publicKey}`);
  return response.json();
}

async function getBalance(publicKey) {
  try {
    const account = await server.loadAccount(publicKey);
    const xlm = account.balances.find((b) => b.asset_type === 'native');
    return xlm ? parseFloat(xlm.balance) : 0;
  } catch {
    return 0;
  }
}

async function getAllBalances(publicKey) {
  try {
    const account = await server.loadAccount(publicKey);
    return account.balances.map((b) => ({
      asset_type: b.asset_type,
      asset_code: b.asset_type === 'native' ? 'XLM' : b.asset_code,
      asset_issuer: b.asset_type === 'native' ? null : b.asset_issuer,
      balance: parseFloat(b.balance),
      limit: b.limit ? parseFloat(b.limit) : null,
    }));
  } catch {
    return [];
  }
}

async function addTrustline({ secret, assetCode, assetIssuer }) {
  const keypair = StellarSdk.Keypair.fromSecret(secret);
  const account = await server.loadAccount(keypair.publicKey());
  const asset = new StellarSdk.Asset(assetCode, assetIssuer);
  const tx = new StellarSdk.TransactionBuilder(account, { fee: StellarSdk.BASE_FEE, networkPassphrase })
    .addOperation(StellarSdk.Operation.changeTrust({ asset }))
    .setTimeout(30)
    .build();
  tx.sign(keypair);
  const result = await server.submitTransaction(tx);
  return result.hash;
}

async function removeTrustline({ secret, assetCode, assetIssuer }) {
  const keypair = StellarSdk.Keypair.fromSecret(secret);
  const account = await server.loadAccount(keypair.publicKey());
  const asset = new StellarSdk.Asset(assetCode, assetIssuer);
  const existing = account.balances.find(
    (b) => b.asset_code === assetCode && b.asset_issuer === assetIssuer
  );
  if (existing && parseFloat(existing.balance) > 0) {
    const e = new Error('Cannot remove trustline with non-zero balance');
    e.code = 'non_zero_balance';
    throw e;
  }
  const tx = new StellarSdk.TransactionBuilder(account, { fee: StellarSdk.BASE_FEE, networkPassphrase })
    .addOperation(StellarSdk.Operation.changeTrust({ asset, limit: '0' }))
    .setTimeout(30)
    .build();
  tx.sign(keypair);
  const result = await server.submitTransaction(tx);
  return result.hash;
}

async function mergeAccount({ sourceSecret, destinationPublicKey }) {
  const sourceKeypair = StellarSdk.Keypair.fromSecret(sourceSecret);
  try {
    await server.loadAccount(destinationPublicKey);
  } catch (e) {
    if (e.response && e.response.status === 404) {
      const err = new Error('Destination account does not exist on the ledger');
      err.code = 'destination_not_found';
      throw err;
    }
    throw e;
  }
  const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());
  const tx = new StellarSdk.TransactionBuilder(sourceAccount, { fee: StellarSdk.BASE_FEE, networkPassphrase })
    .addOperation(StellarSdk.Operation.accountMerge({ destination: destinationPublicKey }))
    .setTimeout(30)
    .build();
  tx.sign(sourceKeypair);
  const result = await server.submitTransaction(tx);
  return result.hash;
}

async function lookupFederationAddress(publicKey) {
  if (!publicKey) return null;
  const cached = _federationCache.get(publicKey);
  if (cached && Date.now() < cached.expiresAt) return cached.federationAddress;
  try {
    const record = await StellarSdk.FederationServer.resolve(publicKey);
    const federationAddress = record.stellar_address || null;
    _federationCache.set(publicKey, { federationAddress, expiresAt: Date.now() + FEDERATION_TTL_MS });
    return federationAddress;
  } catch {
    _federationCache.set(publicKey, { federationAddress: null, expiresAt: Date.now() + FEDERATION_TTL_MS });
    return null;
  }
}

async function resolveFederationAddress(address, db) {
  if (!address || !address.includes('*')) return address;
  const [username, domain] = address.split('*');
  const rawLocal = (process.env.FEDERATION_DOMAIN || process.env.FRONTEND_URL || 'localhost')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .split(':')[0];
  if (domain === rawLocal || domain === 'localhost') {
    const user = db
      .prepare('SELECT stellar_public_key FROM users WHERE federation_name = ?')
      .get(username.toLowerCase());
    if (!user || !user.stellar_public_key)
      throw new Error(`Federation address not found: ${address}`);
    return user.stellar_public_key;
  }
  try {
    const record = await StellarSdk.Federation.Server.resolve(address);
    if (!record.account_id) throw new Error('No account_id in federation response');
    return record.account_id;
  } catch (e) {
    throw new Error(`Could not resolve federation address "${address}": ${e.message}`);
  }
}

module.exports = {
  createWallet,
  createWalletFromMnemonic,
  deriveKeypairFromMnemonic,
  fundTestnetAccount,
  getBalance,
  getAllBalances,
  addTrustline,
  removeTrustline,
  mergeAccount,
  lookupFederationAddress,
  resolveFederationAddress,
};
