/**
 * Client-side Stellar address & memo validation for the Wallet send flow.
 * Mirrors StrKey.isValidEd25519PublicKey / isValidMed25519PublicKey from
 * @stellar/stellar-sdk (base32 + CRC16-XModem checksum) without pulling the
 * SDK into the frontend bundle.
 */

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const VERSION_ED25519_PUBLIC = 6 << 3; // 'G'
const VERSION_MED25519_PUBLIC = 12 << 3; // 'M'

function base32Decode(str) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of str) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  // Non-zero leftover bits mean a non-canonical encoding.
  if (bits > 0 && (value & ((1 << bits) - 1)) !== 0) return null;
  return Uint8Array.from(out);
}

function crc16xmodem(bytes) {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

function isValidStrKey(address, versionByte, payloadLength) {
  if (typeof address !== 'string') return false;
  const decoded = base32Decode(address);
  if (!decoded || decoded.length !== 1 + payloadLength + 2) return false;
  if (decoded[0] !== versionByte) return false;
  const body = decoded.slice(0, decoded.length - 2);
  const checksum = decoded[decoded.length - 2] | (decoded[decoded.length - 1] << 8);
  return crc16xmodem(body) === checksum;
}

export function isValidEd25519PublicKey(address) {
  return typeof address === 'string' && address.length === 56 && isValidStrKey(address, VERSION_ED25519_PUBLIC, 32);
}

export function isValidMuxedAddress(address) {
  return typeof address === 'string' && address.length === 69 && isValidStrKey(address, VERSION_MED25519_PUBLIC, 40);
}

export function isFederationAddress(address) {
  return typeof address === 'string' && /^[^*\s]+\*[a-z0-9.-]+\.[a-z]{2,}$/i.test(address);
}

/** 'ed25519' | 'muxed' | 'federation' | null */
export function classifyDestination(address) {
  const a = String(address || '').trim();
  if (isValidEd25519PublicKey(a)) return 'ed25519';
  if (isValidMuxedAddress(a)) return 'muxed';
  if (isFederationAddress(a)) return 'federation';
  return null;
}

export const MEMO_TYPES = ['text', 'id', 'hash'];

/** Returns an error string, or null when the memo is valid for its type. */
export function validateMemo(type, value) {
  if (!value) return null;
  if (type === 'text') {
    return new TextEncoder().encode(value).length > 28 ? 'Text memo must be 28 bytes or fewer.' : null;
  }
  if (type === 'id') {
    if (!/^\d{1,20}$/.test(value) || BigInt(value) > 18446744073709551615n) {
      return 'ID memo must be a whole number between 0 and 18446744073709551615.';
    }
    return null;
  }
  if (type === 'hash') {
    return /^[0-9a-fA-F]{64}$/.test(value) ? null : 'Hash memo must be 64 hex characters (32 bytes).';
  }
  return 'Unsupported memo type.';
}

export function memoByteLength(value) {
  return new TextEncoder().encode(value || '').length;
}

/** Amount with at most 7 decimal places (Stellar's precision). */
export function isValidAmount(value) {
  return /^\d+(\.\d{1,7})?$/.test(String(value)) && Number(value) > 0;
}

/**
 * Well-known exchange deposit accounts that require a memo. Sending to these
 * without one usually means lost funds.
 */
export const KNOWN_EXCHANGE_ADDRESSES = {
  GA5XIGA5C7QTPTWXQHY6MCJRMTRZDOSHR6EFIBNDQTCQHG262N4GGKTM: 'Kraken',
  GCO2IP3MJNUOKS4PUDI4C7LGGMQDJGXG3COYX3WSB4HHNAHKYV5YL3VC: 'Binance',
  GCGNWKCJ3KHRLPM3TM6N7D3W5YKDJFL6A2YCXFXNMRTZ4Q66MEMZ6FI2: 'Poloniex',
};

export function getExchangeName(address) {
  const a = String(address || '').trim();
  return KNOWN_EXCHANGE_ADDRESSES[a] || null;
}

/** Network fee reserved by the "Max" button (one operation at base fee, with headroom). */
export const SEND_FEE_XLM = 0.00001;

/** Largest sendable amount, leaving the reserve + fee behind (7-decimal floor). */
export function maxSendable(availableAfterReserve) {
  const v = Math.max(0, Number(availableAfterReserve || 0) - SEND_FEE_XLM);
  return Math.floor(v * 1e7) / 1e7;
}
