const crypto = require('crypto');
const db = require('../db/schema');
const { StellarSdk, isTestnet, server, sorobanServer, networkPassphrase } = require('./stellar-config');

function normalizeWasmHash(h) {
  if (h == null || typeof h !== 'string') return null;
  const x = h.trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{64}$/.test(x)) return null;
  return x;
}

function hashArgs(args) {
  try {
    const json = JSON.stringify(args);
    return crypto.createHash('sha256').update(json).digest('hex').slice(0, 32);
  } catch {
    return null;
  }
}

async function logEscrowInvocation({ contractId, method, args, txHash, success, error, userId }) {
  try {
    const argsHash = hashArgs(args);
    await db.query(
      `INSERT INTO contract_invocations
         (contract_id, method, args, result, tx_hash, success, error, invoked_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        contractId,
        method,
        args != null ? JSON.stringify(args) : null,
        argsHash,
        txHash || null,
        success ? 1 : 0,
        error || null,
        userId || null,
      ]
    );
  } catch {
    // Non-fatal — logging must never break the escrow flow.
  }
}

async function getContractState(contractId, prefix = null) {
  const contractAddress = new StellarSdk.Address(contractId);
  const ledgerKey = StellarSdk.xdr.LedgerKey.contractData(
    new StellarSdk.xdr.LedgerKeyContractData({
      contract: contractAddress.toScAddress(),
      key: StellarSdk.xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: StellarSdk.xdr.ContractDataDurability.persistent(),
    })
  );

  let response;
  try {
    response = await sorobanServer.getLedgerEntries(ledgerKey);
  } catch (e) {
    if (e.message?.includes('not found') || e.code === 404) {
      const notFound = new Error('Contract not found');
      notFound.code = 404;
      throw notFound;
    }
    throw e;
  }

  return (response.entries || [])
    .map((entry) => {
      const data = entry.val?.contractData?.();
      const key = data ? StellarSdk.scValToNative(data.key()) : String(entry.key);
      const val = data ? StellarSdk.scValToNative(data.val()) : null;
      const durability = data?.durability()?.name || 'Persistent';
      const lastModifiedLedgerSeq = entry.lastModifiedLedgerSeq ?? null;
      return { key: String(key), val, durability, lastModifiedLedgerSeq };
    })
    .filter((e) => !prefix || String(e.key).startsWith(prefix));
}

async function getContractWasmHash(contractId) {
  const contractAddress = new StellarSdk.Address(contractId);
  const ledgerKey = StellarSdk.xdr.LedgerKey.contractData(
    new StellarSdk.xdr.LedgerKeyContractData({
      contract: contractAddress.toScAddress(),
      key: StellarSdk.xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: StellarSdk.xdr.ContractDataDurability.persistent(),
    })
  );

  let response;
  try {
    response = await sorobanServer.getLedgerEntries(ledgerKey);
  } catch (e) {
    if (e.message?.includes('not found') || e.code === 404) {
      const notFound = new Error('Contract not found');
      notFound.code = 404;
      throw notFound;
    }
    throw e;
  }

  const list = response.entries || [];
  if (!list.length) {
    const notFound = new Error('Contract instance not found on ledger');
    notFound.code = 404;
    throw notFound;
  }

  const data = list[0].val?.contractData?.();
  if (!data) {
    const err = new Error('Unexpected ledger entry shape');
    err.code = 'parse_error';
    throw err;
  }

  const scVal = data.val();
  let instance;
  try {
    instance = scVal.contractInstance();
  } catch {
    const err = new Error('Contract data is not a contract instance');
    err.code = 'parse_error';
    throw err;
  }

  const exec = instance.executable();
  const sw = exec.switch();
  const wasmArm = StellarSdk.xdr.ContractExecutableType.contractExecutableWasm();
  const isWasm = sw === wasmArm || sw?.name === wasmArm?.name || String(sw).includes('Wasm');
  if (!isWasm) {
    const err = new Error('Contract executable is not WASM');
    err.code = 'not_wasm_contract';
    throw err;
  }

  const raw =
    typeof exec.wasmHash === 'function'
      ? exec.wasmHash()
      : typeof exec.value === 'function'
        ? exec.value()
        : null;
  if (!raw) {
    const err = new Error('SDK cannot read WASM hash from executable');
    err.code = 'parse_error';
    throw err;
  }

  const hash = Buffer.from(raw).toString('hex').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    const e = new Error(`Unexpected WASM hash format: ${hash}`);
    e.code = 'parse_error';
    throw e;
  }
  return hash;
}

async function simulateContractCall(contractId, method, args = []) {
  const sourcePublic = (
    process.env.SOROBAN_SIMULATION_SOURCE_PUBLIC_KEY ||
    process.env.PLATFORM_WALLET_PUBLIC_KEY ||
    ''
  ).trim();

  if (!sourcePublic) {
    const e = new Error(
      'Configure SOROBAN_SIMULATION_SOURCE_PUBLIC_KEY or PLATFORM_WALLET_PUBLIC_KEY.'
    );
    e.code = 'simulation_source_unconfigured';
    throw e;
  }

  const SorobanApi = StellarSdk.rpc?.Api;
  if (!SorobanApi?.isSimulationSuccess) {
    const e = new Error('Stellar SDK is missing rpc.Api simulation helpers; upgrade @stellar/stellar-sdk.');
    e.code = 'sdk_incompatible';
    throw e;
  }

  let account;
  try {
    account = await server.loadAccount(sourcePublic);
  } catch (loadErr) {
    if (loadErr.response?.status === 404) {
      const e = new Error(`Simulation source account not found on ${process.env.STELLAR_NETWORK || 'testnet'}: ${sourcePublic}`);
      e.code = 'simulation_source_not_found';
      throw e;
    }
    throw loadErr;
  }

  const scParams = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (!a || typeof a !== 'object' || typeof a.type !== 'string' || !('value' in a)) {
      const e = new Error(`args[${i}] must be { "type": "<soroban type>", "value": <json> }`);
      e.code = 'invalid_arg';
      throw e;
    }
    scParams.push(StellarSdk.nativeToScVal(a.value, { type: a.type }));
  }

  const contract = new StellarSdk.Contract(contractId);
  const tx = new StellarSdk.TransactionBuilder(account, { fee: StellarSdk.BASE_FEE, networkPassphrase })
    .addOperation(contract.call(method, ...scParams))
    .setTimeout(60)
    .build();

  let sim;
  try {
    sim = await sorobanServer.simulateTransaction(tx);
  } catch (rpcErr) {
    return { success: false, fee: null, result: null, error: rpcErr.message || 'Soroban RPC simulateTransaction failed' };
  }

  if (SorobanApi.isSimulationError(sim)) {
    const msg = typeof sim.error === 'string' ? sim.error : JSON.stringify(sim.error ?? 'Simulation error');
    return { success: false, fee: null, result: null, error: msg };
  }

  if (!SorobanApi.isSimulationSuccess(sim)) {
    return { success: false, fee: null, result: null, error: 'Unexpected simulation response from RPC' };
  }

  const baseFee = BigInt(StellarSdk.BASE_FEE);
  const resourceFee = BigInt(sim.minResourceFee || '0');
  const fee = (baseFee + resourceFee).toString();

  let decoded = null;
  if (sim.result?.retval) {
    try {
      decoded = StellarSdk.scValToNative(sim.result.retval);
    } catch {
      try { decoded = sim.result.retval.toXDR('base64'); } catch { decoded = null; }
    }
  }

  if (SorobanApi.isSimulationRestore(sim)) {
    return {
      success: true,
      fee,
      result: {
        returnValue: decoded,
        restoreRequired: true,
        restoreMinResourceFee: sim.restorePreamble?.minResourceFee != null
          ? String(sim.restorePreamble.minResourceFee)
          : null,
      },
      error: null,
    };
  }

  return { success: true, fee, result: decoded, error: null };
}

async function invokeEscrowContract({ action, senderSecret, orderId, buyerPublicKey, farmerPublicKey, amount, timeoutUnix, userId }) {
  const contractId = process.env.SOROBAN_ESCROW_CONTRACT_ID;
  const xlmTokenContractId = process.env.SOROBAN_XLM_TOKEN_CONTRACT_ID;
  if (!contractId) throw new Error('SOROBAN_ESCROW_CONTRACT_ID is not configured');
  if (!xlmTokenContractId) throw new Error('SOROBAN_XLM_TOKEN_CONTRACT_ID is not configured');

  const keypair = StellarSdk.Keypair.fromSecret(senderSecret);
  const source = await server.loadAccount(keypair.publicKey());
  const contract = new StellarSdk.Contract(contractId);
  const logArgs = { action, orderId, buyerPublicKey, farmerPublicKey, amount, timeoutUnix };

  let operation;
  if (action === 'deposit') {
    const amountStroops = BigInt(Math.round(Number(amount) * 10_000_000));
    operation = contract.call(
      'deposit',
      StellarSdk.nativeToScVal(xlmTokenContractId, { type: 'address' }),
      StellarSdk.nativeToScVal(Number(orderId), { type: 'u64' }),
      StellarSdk.nativeToScVal(buyerPublicKey, { type: 'address' }),
      StellarSdk.nativeToScVal(farmerPublicKey, { type: 'address' }),
      StellarSdk.nativeToScVal(amountStroops, { type: 'i128' }),
      StellarSdk.nativeToScVal(Number(timeoutUnix), { type: 'u64' })
    );
  } else if (action === 'release') {
    operation = contract.call(
      'release',
      StellarSdk.nativeToScVal(xlmTokenContractId, { type: 'address' }),
      StellarSdk.nativeToScVal(Number(orderId), { type: 'u64' })
    );
  } else if (action === 'refund') {
    operation = contract.call(
      'refund',
      StellarSdk.nativeToScVal(xlmTokenContractId, { type: 'address' }),
      StellarSdk.nativeToScVal(Number(orderId), { type: 'u64' })
    );
  } else if (action === 'dispute') {
    operation = contract.call(
      'dispute',
      StellarSdk.nativeToScVal(Number(orderId), { type: 'u64' }),
      StellarSdk.nativeToScVal(keypair.publicKey(), { type: 'address' })
    );
  } else {
    throw new Error(`Unsupported Soroban escrow action: ${action}`);
  }

  let tx = new StellarSdk.TransactionBuilder(source, { fee: StellarSdk.BASE_FEE, networkPassphrase })
    .addOperation(operation)
    .setTimeout(60)
    .build();

  tx = await sorobanServer.prepareTransaction(tx);
  tx.sign(keypair);

  let sendResult;
  try {
    sendResult = await sorobanServer.sendTransaction(tx);
  } catch (submitErr) {
    await logEscrowInvocation({ contractId, method: action, args: logArgs, txHash: null, success: false, error: submitErr.message, userId });
    throw submitErr;
  }

  if (sendResult.status === 'ERROR') {
    const errMsg = sendResult.errorResultXdr || 'Soroban transaction submission failed';
    await logEscrowInvocation({ contractId, method: action, args: logArgs, txHash: null, success: false, error: errMsg, userId });
    throw new Error(errMsg);
  }

  const hash = sendResult.hash || tx.hash().toString('hex');
  for (let i = 0; i < 15; i += 1) {
    const txResult = await sorobanServer.getTransaction(hash);
    if (txResult.status === 'SUCCESS') {
      await logEscrowInvocation({ contractId, method: action, args: logArgs, txHash: hash, success: true, error: null, userId });
      return { txHash: hash, contractId };
    }
    if (txResult.status === 'FAILED') {
      await logEscrowInvocation({ contractId, method: action, args: logArgs, txHash: hash, success: false, error: 'Soroban transaction failed', userId });
      throw new Error('Soroban transaction failed');
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const timeoutErr = 'Soroban transaction confirmation timed out';
  await logEscrowInvocation({ contractId, method: action, args: logArgs, txHash: hash, success: false, error: timeoutErr, userId });
  throw new Error(timeoutErr);
}

async function invokeContract({ contractId, method, args = [], signerSecret }) {
  const keypair = StellarSdk.Keypair.fromSecret(signerSecret);
  const source = await server.loadAccount(keypair.publicKey());
  const contract = new StellarSdk.Contract(contractId);
  const scArgs = args.map((arg) => StellarSdk.nativeToScVal(arg.value, { type: arg.type }));
  let tx = new StellarSdk.TransactionBuilder(source, { fee: StellarSdk.BASE_FEE, networkPassphrase })
    .addOperation(contract.call(method, ...scArgs))
    .setTimeout(60)
    .build();
  tx = await sorobanServer.prepareTransaction(tx);
  tx.sign(keypair);
  const sendResult = await sorobanServer.sendTransaction(tx);
  if (sendResult.status === 'ERROR') {
    throw new Error(`Soroban RPC Error: ${sendResult.errorResultXdr}`);
  }
  const hash = sendResult.hash;
  for (let i = 0; i < 10; i++) {
    const txResult = await sorobanServer.getTransaction(hash);
    if (txResult.status === 'SUCCESS') return { hash, result: txResult.returnValue };
    if (txResult.status === 'FAILED') throw new Error('Soroban transaction failed');
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Transaction confirmation timeout');
}

async function simulateContract({ contractId, method, args = [] }) {
  const sourcePublic = process.env.PLATFORM_WALLET_PUBLIC_KEY;
  const account = await server.loadAccount(sourcePublic);
  const contract = new StellarSdk.Contract(contractId);
  const scArgs = args.map((arg) => StellarSdk.nativeToScVal(arg.value, { type: arg.type }));
  const tx = new StellarSdk.TransactionBuilder(account, { fee: StellarSdk.BASE_FEE, networkPassphrase })
    .addOperation(contract.call(method, ...scArgs))
    .setTimeout(60)
    .build();
  const sim = await sorobanServer.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${JSON.stringify(sim.error)}`);
  }
  return sim;
}

async function getContractABI(contractId) {
  try {
    const contractAddress = new StellarSdk.Address(contractId);
    const ledgerKey = StellarSdk.xdr.LedgerKey.contractData(
      new StellarSdk.xdr.LedgerKeyContractData({
        contract: contractAddress.toScAddress(),
        key: StellarSdk.xdr.ScVal.scvLedgerKeyContractInstance(),
        durability: StellarSdk.xdr.ContractDataDurability.persistent(),
      })
    );
    const response = await sorobanServer.getLedgerEntries(ledgerKey);
    const entries = response.entries || [];
    if (!entries.length) {
      const err = new Error('Contract not found');
      err.code = 404;
      throw err;
    }
    const data = entries[0].val?.contractData?.();
    if (!data) {
      const err = new Error('Cannot parse contract data');
      err.code = 'parse_error';
      throw err;
    }
    let instance;
    try {
      instance = data.val().contractInstance();
    } catch {
      const err = new Error('Contract data is not a contract instance');
      err.code = 'parse_error';
      throw err;
    }
    const spec = instance.contractSpec?.();
    if (!spec || !spec.length) return [];
    const functions = [];
    for (const specEntry of spec) {
      const xdrType = specEntry.switch?.();
      if (!xdrType || xdrType.name !== 'UdtStructV0') continue;
      const struct = specEntry.value?.();
      if (!struct) continue;
      const fields = struct.fields?.() || [];
      const params = (fields).map((field) => ({
        name: field.name?.(),
        type: field.type?.switch?.()?.name || 'unknown',
      }));
      functions.push({ name: struct.name?.(), params, returnType: 'void' });
    }
    return functions;
  } catch (error) {
    if (error.code === 404) throw error;
    console.error('[Stellar] Error fetching contract ABI:', error.message);
    return [];
  }
}

async function analyzeContractFees(contractId, testCases = []) {
  const results = [];
  for (const { method, args = [] } of testCases) {
    try {
      const sim = await simulateContractCall(contractId, method, args);
      if (!sim.success) {
        results.push({ method, args, fee: null, cpu_insns: null, mem_bytes: null, ledger_reads: null, ledger_writes: null, error: sim.error });
        continue;
      }
      const feeNum = BigInt(sim.fee || '0');
      const feeXlm = (Number(feeNum) / 10_000_000).toFixed(7);
      results.push({
        method, args, fee: feeXlm, fee_stroops: sim.fee,
        cpu_insns: sim.result?.cpuInsns || null,
        mem_bytes: sim.result?.memBytes || null,
        ledger_reads: sim.result?.ledgerReads || null,
        ledger_writes: sim.result?.ledgerWrites || null,
        error: null,
      });
    } catch (error) {
      results.push({ method, args, fee: null, cpu_insns: null, mem_bytes: null, ledger_reads: null, ledger_writes: null, error: error.message });
    }
  }
  return results;
}

async function getContractEvents(contractId, filters = {}) {
  const { type, from, to, page = 1, limit = 20 } = filters;
  const latestLedger = await sorobanServer.getLatestLedger();
  const startLedger = from
    ? Math.max(1, latestLedger.sequence - Math.ceil((Date.now() / 1000 - Math.floor(new Date(from).getTime() / 1000)) / 5))
    : Math.max(1, latestLedger.sequence - 17280);

  const response = await sorobanServer.getEvents({
    startLedger,
    filters: [{ type: type || 'contract', contractIds: [contractId] }],
    limit: 200,
  });

  let events = (response.events || []).map((ev) => {
    const topics = (ev.topic || []).map((t) => {
      try { return StellarSdk.scValToNative(t); } catch { return t.toXDR('base64'); }
    });
    let data = null;
    try { data = StellarSdk.scValToNative(ev.value); } catch { data = ev.value?.toXDR?.('base64') ?? null; }
    return { id: ev.id, ledger: ev.ledger, ledgerClosedAt: ev.ledgerClosedAt, type: ev.type, contractId: ev.contractId, topics, data };
  });

  if (from) events = events.filter((e) => new Date(e.ledgerClosedAt) >= new Date(from));
  if (to) events = events.filter((e) => new Date(e.ledgerClosedAt) <= new Date(to));

  const total = events.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const offset = (page - 1) * limit;
  return { events: events.slice(offset, offset + limit), pagination: { page, pages, total, limit } };
}

async function getContractFunctionSignatures(contractId) {
  const contractAddress = new StellarSdk.Address(contractId);
  const ledgerKey = StellarSdk.xdr.LedgerKey.contractData(
    new StellarSdk.xdr.LedgerKeyContractData({
      contract: contractAddress.toScAddress(),
      key: StellarSdk.xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: StellarSdk.xdr.ContractDataDurability.persistent(),
    })
  );

  let response;
  try {
    response = await sorobanServer.getLedgerEntries(ledgerKey);
  } catch (e) {
    if (e.message?.includes('not found') || e.code === 404) {
      const notFound = new Error('Contract not found');
      notFound.code = 404;
      throw notFound;
    }
    throw e;
  }

  const entries = response.entries || [];
  if (!entries.length) {
    const notFound = new Error('Contract instance not found on ledger');
    notFound.code = 404;
    throw notFound;
  }

  const data = entries[0].val?.contractData?.();
  if (!data) return new Map();

  let instance;
  try {
    instance = data.val().contractInstance();
  } catch {
    return new Map();
  }

  const spec = instance.contractSpec?.();
  if (!spec || !spec.length) return new Map();

  const signatures = new Map();
  for (const entry of spec) {
    try {
      const fn = entry.functionV0?.();
      if (!fn) continue;
      const name = fn.name?.().toString() || '';
      const inputs = (fn.inputs?.() || [])
        .map((i) => `${i.name?.()}: ${i.type?.switch?.()?.name || 'unknown'}`)
        .join(', ');
      const outputs = (fn.outputs?.() || [])
        .map((o) => o.switch?.()?.name || 'unknown')
        .join(', ');
      signatures.set(name, `(${inputs}) -> ${outputs || 'void'}`);
    } catch {
      // skip unparseable entries
    }
  }
  return signatures;
}

async function deployContract({ wasmBuffer, deployerSecret }) {
  const deployerKeypair = StellarSdk.Keypair.fromSecret(deployerSecret);
  const deployerAccount = await server.loadAccount(deployerKeypair.publicKey());
  const wasmHash = StellarSdk.hash(wasmBuffer);

  let tx = new StellarSdk.TransactionBuilder(deployerAccount, { fee: StellarSdk.BASE_FEE, networkPassphrase })
    .addOperation(StellarSdk.Operation.uploadContractWasm({ wasm: wasmBuffer }))
    .setTimeout(60)
    .build();
  tx = await sorobanServer.prepareTransaction(tx);
  tx.sign(deployerKeypair);

  const uploadResult = await sorobanServer.sendTransaction(tx);
  if (uploadResult.status === 'ERROR') throw new Error(uploadResult.errorResultXdr || 'WASM upload failed');

  const uploadHash = uploadResult.hash;
  for (let i = 0; i < 15; i++) {
    const txResult = await sorobanServer.getTransaction(uploadHash);
    if (txResult.status === 'SUCCESS') break;
    if (txResult.status === 'FAILED') throw new Error('WASM upload transaction failed');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const createAccount = await server.loadAccount(deployerKeypair.publicKey());
  tx = new StellarSdk.TransactionBuilder(createAccount, { fee: StellarSdk.BASE_FEE, networkPassphrase })
    .addOperation(StellarSdk.Operation.createContract({ wasmHash }))
    .setTimeout(60)
    .build();
  tx = await sorobanServer.prepareTransaction(tx);
  tx.sign(deployerKeypair);

  const createResult = await sorobanServer.sendTransaction(tx);
  if (createResult.status === 'ERROR') throw new Error(createResult.errorResultXdr || 'Contract instantiation failed');

  const createHash = createResult.hash;
  for (let i = 0; i < 15; i++) {
    const txResult = await sorobanServer.getTransaction(createHash);
    if (txResult.status === 'SUCCESS') {
      const contractId = txResult.resultMetaXdr?.v3()?.sorobanMeta()?.events()?.[0]?.contractEvent()?.contractId()?.contractId()?.toString('hex');
      if (contractId) {
        return {
          contractId: StellarSdk.StrKey.encodeContract(StellarSdk.xdr.ScAddressType.scAddressTypeContract().value, Buffer.from(contractId, 'hex')),
          wasmHash: wasmHash.toString('hex'),
          txHash: createHash,
        };
      }
      break;
    }
    if (txResult.status === 'FAILED') throw new Error('Contract instantiation transaction failed');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('Failed to extract contract ID from transaction result');
}

module.exports = {
  normalizeWasmHash,
  getContractState,
  getContractWasmHash,
  simulateContractCall,
  invokeEscrowContract,
  invokeContract,
  simulateContract,
  getContractABI,
  analyzeContractFees,
  getContractEvents,
  getContractFunctionSignatures,
  deployContract,
};
