// Human-readable catalogs mirroring contracts/errors.tolk and the message
// opcodes in contracts/messages.tolk. The pool reports operation outcomes by
// sending a RefundMessage (opcode 0x21a6a2b3) whose RefundContext carries the
// original op and a numeric errorCode (0 on success, an ErrorsPool/ErrorsPayout
// value on failure). These maps turn those numbers back into something useful.

export const REFUND_OPCODE = 0x21a6a2b3;
export const INIT_POOL_OPCODE = 0xcbfcc337;
export const INIT_POOL_SUCCESS_OPCODE = 0xd9478669;
export const OWNER_WITHDRAWAL_SUCCESS_OPCODE = 0x43921f80;
export const BOUNCED_PREFIX = 0xffffffff;

// ErrorsPool — see contracts/errors.tolk. Auto-incremented enum members are
// resolved to their effective numeric values (e.g. InvalidValidatorShare = 95).
export const POOL_ERROR_CODES: Record<number, string> = {
  78: 'Invalid workchain (only masterchain -1 is allowed)',
  80: 'Query ID is required (must be > 0)',
  81: 'Stake is below the minimum limit',
  82: 'Not enough pool balance to cover the requested amount',
  86: 'Not enough value attached to fund the new stake',
  90: 'Pool storage is not initialized yet',
  91: 'Pool is already initialized',
  92: 'Invalid max/min: max TON/validator must be greater than min TON/validator',
  93: 'At least one round must be allowed',
  94: 'Invalid owner share (must be in 0..SHARE_BASE)',
  95: 'Invalid validator share (must be in 0..SHARE_BASE)',
  96: 'Individual limit is above the global maximum',
  97: 'Individual limit is below the global minimum',
  98: 'Min TON/validator is below the network minimum',
  99: 'Max TON/validator is above the network maximum',
  200: 'Not owner: the connected wallet is not the pool owner',
  201: 'Owner not found in the nominators map',
  202: 'Withdrawal already requested for this round',
  203: 'Deposit already requested for this round',
  204: 'Nothing to withdraw',
  205: 'Nothing to deposit',
  206: 'Reward is below the minimal withdrawable amount',
  207: 'Deposit not found for this sender',
  208: 'Deposit not allowed: sender is not on the whitelist',
  209: 'Pool is insolvent (obligations exceed available balance)',
  300: 'Not enough gas to process the message',
  400: 'Too many nominators',
  401: 'Too many validators',
  402: 'Nominators map is too deep',
  500: 'Invalid new-stake message body',
  501: 'Round is too early',
  502: 'Recovery time is too early',
  600: 'Validator not found in the pool',
  601: 'Validator already exists in the pool',
  602: 'Main validator cannot be removed',
  603: 'Elections have not started yet',
  604: 'Elections have already ended',
  605: 'Owner share is undercapitalized for the active slots',
  606: 'Stake is above the limit',
  607: 'Round is closed',
  608: 'Already staked in that round',
  609: 'Round is not allowed for this validator',
  700: 'Usage record not found',
  701: 'Message is not from the expected proxy',
  702: 'Pool is halted',
  65535: 'Invalid message (unknown opcode / body)',
};

// ErrorsPayout — see contracts/errors.tolk.
export const PAYOUT_ERROR_CODES: Record<number, string> = {
  800: 'Invalid sender (only the payout item may send this)',
  801: 'Payout item is already initialized',
};

// Message opcodes — see contracts/messages.tolk.
export const OPCODE_NAMES: Record<number, string> = {
  [REFUND_OPCODE]: 'Refund',
  [INIT_POOL_OPCODE]: 'Init pool',
  [INIT_POOL_SUCCESS_OPCODE]: 'Init pool success',
  [OWNER_WITHDRAWAL_SUCCESS_OPCODE]: 'Owner withdrawal success',
  0x219d71f5: 'Add validator',
  0x66d3ad60: 'Remove validator',
  0x42a515de: 'Add funds',
  0x11c31b99: 'Owner withdrawal',
  0xf36da828: 'Update limits',
  0xc2d9e5ad: 'Update nominators whitelist',
  0x4e73744b: 'New stake',
  0x47657424: 'Recover stake',
  0x47657442: 'Recover stake (unrestricted)',
  0x00000007: 'Update vset',
};

export function describePoolError(code: number): string {
  return (
    POOL_ERROR_CODES[code] ??
    PAYOUT_ERROR_CODES[code] ??
    `Unknown error code ${code}`
  );
}

export function describeOp(op: number): string {
  return OPCODE_NAMES[op] ?? `op 0x${op.toString(16).padStart(8, '0')}`;
}

// Turns a thrown error from a send/read path into a user-facing message. Wallet
// rejections and common tonconnect failures are recognized so the UI doesn't
// show a raw technical blob. Falls back to the original error message.
export function prettyError(opName: string, e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();
  if (lower.includes('user declined') || lower.includes('reject')) {
    return `${opName} cancelled: the request was rejected in the wallet.`;
  }
  if (lower.includes('expired') || lower.includes('valid_until')) {
    return `${opName} failed: the transaction expired before it was signed.`;
  }
  if (lower.includes('not enough')) {
    return `${opName} failed: not enough TON — ${msg}`;
  }
  return `${opName} failed: ${msg}`;
}
