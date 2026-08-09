import {
  Address,
  Cell,
  Dictionary,
  beginCell,
  fromNano,
  toNano,
  type Sender,
  type SenderArguments,
} from '@ton/core';
import { TonClient } from '@ton/ton';
import type { SendTransactionRequest } from '@tonconnect/ui';

import {
  NominatorPool,
  NominatorsSettings,
  GlobalValidatorsLimit,
  GlobalNominatorsLimit,
  ValidatorSpecific,
  ValidatorLimitTon,
  ValidatorLimitShare,
  type ValidatorLimit,
  type Storage,
  type GetValidatorInfo,
} from '@wrappers/Pool.gen';

import { getTonClient } from './ton';
export { getNetworkStakingLimits, type StakingLimits } from './ton';
import type { Network } from './router';

export const SHARE_BASE = 256n * 256n * 256n; // 16777216 = 2^24 (see contracts/types.tolk)
export const POOL_MIN_STORAGE = toNano('10'); // 10 TON (see contracts/fees.tolk)

// Convert between raw share (0..SHARE_BASE) and percentage (0..100).
export function shareToPercent(share: bigint): string {
  return ((Number(share) / Number(SHARE_BASE)) * 100).toFixed(2);
}
export function percentToShare(percent: string): string {
  if (!percent.trim()) return '';
  const n = Number(percent);
  if (!Number.isFinite(n)) return '0';
  return BigInt(Math.round((n / 100) * Number(SHARE_BASE))).toString();
}

export function tonToNano(ton: string): bigint {
  try {
    return toNano(ton);
  } catch {
    return 0n;
  }
}

// Non-throwing parse helpers for numeric form inputs. Return null when the
// string is empty or not a valid number so callers can surface an inline
// field error instead of silently sending 0 / NaN to the contract.
export function parseGram(ton: string): bigint | null {
  if (!ton.trim()) return null;
  try {
    const v = toNano(ton);
    return v > 0n ? v : null;
  } catch {
    return null;
  }
}

export function parseBigInt(s: string): bigint | null {
  if (!s.trim()) return null;
  try {
    const v = BigInt(s);
    return Number.isFinite(Number(v)) ? v : null;
  } catch {
    return null;
  }
}

export function parseNumber(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Form-field validators: parse + set an inline error on failure. Each takes
// the field's current value, the field id (keyed into the panel's
// fieldErrors map), and the setErr/clearErr callbacks the panel already
// provides. Returns the parsed value, or null on failure so the caller can
// early-return out of its submit handler.
type SetErr = (field: string, msg: string) => void;
type ClearErr = (field: string) => void;

export function validateGramInput(
  value: string,
  fieldId: string,
  setErr: SetErr,
  clearErr: ClearErr,
): bigint | null {
  const v = parseGram(value);
  if (v === null) {
    setErr(fieldId, 'Enter a valid GRAM amount.');
    return null;
  }
  clearErr(fieldId);
  return v;
}

export function validateNumberInput(
  value: string,
  fieldId: string,
  setErr: SetErr,
  clearErr: ClearErr,
): number | null {
  const v = parseNumber(value);
  if (v === null) {
    setErr(fieldId, 'Enter a valid number.');
    return null;
  }
  if (!Number.isInteger(v)) {
    setErr(fieldId, 'Enter a whole number.');
    return null;
  }
  clearErr(fieldId);
  return v;
}

export function validateBigIntInput(
  value: string,
  fieldId: string,
  setErr: SetErr,
  clearErr: ClearErr,
): bigint | null {
  const v = parseBigInt(value);
  if (v === null) {
    setErr(fieldId, 'Enter a valid number.');
    return null;
  }
  clearErr(fieldId);
  return v;
}

export interface TonConnectSender {
  sendTransaction: (
    tx: SendTransactionRequest,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  account: { address: string } | null;
}

// Adapter that lets `@ton/ton` wrappers send via TonConnect.
export function makeSender(
  tc: TonConnectSender,
  network: Network,
): Sender | null {
  if (!tc.account) return null;
  const testOnly = network === 'testnet';
  const address = Address.parse(tc.account.address);
  return {
    address,
    send: async (args: SenderArguments) => {
      const bodyCell = args.body ?? Cell.EMPTY;
      const stateInitCell = args.init
        ? beginCell()
            .storeBit(false) // no split depth
            .storeBit(false) // no special
            .storeMaybeRef(args.init.code)
            .storeMaybeRef(args.init.data)
            .storeBit(false) // no libraries
            .endCell()
        : undefined;

      const message: SendTransactionRequest['messages'][number] = {
        address: args.to.toString({
          bounceable: args.bounce ?? true,
          testOnly,
        }),
        amount: args.value.toString(),
        payload: bodyCell.toBoc().toString('base64'),
      };
      if (stateInitCell) {
        message.stateInit = stateInitCell.toBoc().toString('base64');
      }

      await tc.sendTransaction(
        {
          validUntil: Math.floor(Date.now() / 1000) + 240,
          from: address.toString({ testOnly }),
          network: testOnly ? '-3' : '-239',
          messages: [message],
        },
        { notifications: [], modals: [] },
      );
    },
  };
}

export function fmtAddr(addr: string, network: Network): string {
  try {
    return Address.parse(addr).toString({
      bounceable: false,
      testOnly: network === 'testnet',
    });
  } catch {
    return addr;
  }
}

// Compact address format showing the start and end with the middle truncated,
// e.g. "UQAB...XYZ4" — useful in narrow table columns where wrapping is
// undesirable.
export function fmtAddrCompact(addr: string, network: Network): string {
  const full = fmtAddr(addr, network);
  if (full.length <= 12) return full;
  return `${full.slice(0, 4)}…${full.slice(-4)}`;
}

export interface PoolDeployParams {
  owner: string;
  poolId: number;
  value: bigint;
}

export function buildPool(params: PoolDeployParams): NominatorPool {
  return NominatorPool.fromStorage({
    owner: Address.parse(params.owner),
    poolId: BigInt(params.poolId),
  });
}

export function poolAddress(
  params: PoolDeployParams,
  network: Network,
): string {
  return buildPool(params).address.toString({
    testOnly: network === 'testnet',
  });
}

export async function deployPool(
  network: Network,
  via: Sender,
  params: PoolDeployParams,
): Promise<string> {
  const client = getTonClient(network);
  const pool = buildPool(params);
  const opened = client.open(pool);
  await opened.sendDeploy(via, params.value);
  return pool.address.toString({ testOnly: network === 'testnet' });
}

export interface PoolInitParams {
  poolAddress: string;
  mainValidator: string;
  roundAllowance: bigint;
  ownerShare: bigint;
  maxTonPerValidator: bigint;
  minTonPerValidator: bigint;
  refundBonus: bigint;
  maxNominators: number;
  minStake: bigint;
  minWithdrawableRewards: bigint;
  value: bigint;
  limit: ValidatorLimit | null;
}

// Builds the pool from storage (owner + poolId) so the contract carries its
// StateInit, then sends InitPoolMessage in a single transaction — the
// StateInit is attached automatically by @ton/ton when `init` is set,
// deploying and initializing the contract in one message.
export async function deployAndInitPool(
  network: Network,
  via: Sender,
  deploy: PoolDeployParams,
  init: Omit<PoolInitParams, 'poolAddress'>,
): Promise<string> {
  const client = getTonClient(network);
  const pool = buildPool(deploy);
  const opened = client.open(pool);
  await opened.sendInitPoolMessage(via, init.value, {
    queryId: 0n,
    mainValidator: Address.parse(init.mainValidator),
    roundAllowance: init.roundAllowance,
    limit: init.limit,
    ownerShare: init.ownerShare,
    maxTonPerValidator: init.maxTonPerValidator,
    minTonPerValidator: init.minTonPerValidator,
    refundBonus: init.refundBonus,
    nominatorsSettings: {
      ref: NominatorsSettings.create({
        maxNominators: BigInt(init.maxNominators),
        minStake: init.minStake,
        minWithdrawableRewards: init.minWithdrawableRewards,
        whitelist: Dictionary.empty(
          Dictionary.Keys.Address(),
          Dictionary.Values.Bool(),
        ),
      }),
    },
  });
  return pool.address.toString({ testOnly: network === 'testnet' });
}

export async function initPool(
  network: Network,
  via: Sender,
  params: PoolInitParams,
): Promise<void> {
  const client = getTonClient(network);
  const pool = NominatorPool.fromAddress(Address.parse(params.poolAddress));
  const opened = client.open(pool);

  await opened.sendInitPoolMessage(via, params.value, {
    queryId: 0n,
    mainValidator: Address.parse(params.mainValidator),
    roundAllowance: params.roundAllowance,
    limit: params.limit,
    ownerShare: params.ownerShare,
    maxTonPerValidator: params.maxTonPerValidator,
    minTonPerValidator: params.minTonPerValidator,
    refundBonus: params.refundBonus,
    nominatorsSettings: {
      ref: NominatorsSettings.create({
        maxNominators: BigInt(params.maxNominators),
        minStake: params.minStake,
        minWithdrawableRewards: params.minWithdrawableRewards,
        whitelist: Dictionary.empty(
          Dictionary.Keys.Address(),
          Dictionary.Values.Bool(),
        ),
      }),
    },
  });
}

// A pool counts as "deployed" once its StateInit has landed on-chain, which
// populates the account's code. A never-touched address also reports
// state === 'uninitialized', so state alone is not a reliable signal.
export async function isContractDeployed(
  network: Network,
  address: string,
): Promise<boolean> {
  const client: TonClient = getTonClient(network);
  const state = await client.getContractState(Address.parse(address));
  return state.code !== null;
}

// Verify that the contract at `address` runs the expected pool code. Returns
// null if the code matches (or the contract isn't deployed yet), or an error
// message describing the mismatch. Used to warn the user before they interact
// with an address that is not the pool contract.
export async function verifyPoolCode(
  network: Network,
  address: string,
): Promise<string | null> {
  const client: TonClient = getTonClient(network);
  const state = await client.getContractState(Address.parse(address));
  if (state.code === null) return null; // not deployed — not a code mismatch
  const expectedHash = NominatorPool.CodeCell.hash().toString('hex');
  const actualHash = Cell.fromBoc(state.code)[0].hash().toString('hex');
  if (expectedHash !== actualHash) {
    return 'The contract at this address does not match the expected pool code. Interacting with it may have unexpected results.';
  }
  return null;
}

export async function getPoolOwner(
  network: Network,
  address: string,
): Promise<Address> {
  const client = getTonClient(network);
  const opened = client.open(NominatorPool.fromAddress(Address.parse(address)));
  return opened.getOwner();
}

export function validateInitParams(
  p: PoolInitParams,
): { field: string; message: string } | null {
  if (p.ownerShare < 0n || p.ownerShare > SHARE_BASE) {
    return {
      field: 'ownerShare',
      message: `Owner share must be in 0..${SHARE_BASE}.`,
    };
  }
  if (p.maxTonPerValidator <= p.minTonPerValidator) {
    return {
      field: 'maxTonPerValidator',
      message:
        'Max GRAM per validator must be greater than min GRAM per validator.',
    };
  }
  if (p.maxNominators < 0 || p.maxNominators > 1023) {
    return {
      field: 'maxNominators',
      message: 'Max nominators must be in 0..1023.',
    };
  }
  // Address.parse throws on invalid input; guard with a try/catch so this
  // function returns an error string instead of throwing into the caller
  // (which calls it outside its own try/catch and would crash the page).
  let mainValidatorAddr: Address;
  try {
    mainValidatorAddr = Address.parse(p.mainValidator);
  } catch {
    return {
      field: 'mainValidator',
      message: 'Main validator address is not valid.',
    };
  }
  if (!Address.isAddress(mainValidatorAddr)) {
    return {
      field: 'mainValidator',
      message: 'Main validator address is not valid.',
    };
  }
  return null;
}

// Ranges used to validate a per-validator GRAM limit. The pool's global range
// comes from getLimitsPerValidator (on-chain) or, at init time, from the
// global-limit fields in the same form. The network range comes from
// getNetworkStakingLimits (config param 17). Any bound may be undefined when
// the corresponding data hasn't loaded yet (or isn't established yet, e.g. the
// pool's global range during init); in that case that bound is not checked.
export interface ValidatorLimitRanges {
  globalMinTon?: bigint;
  globalMaxTon?: bigint;
  networkMinStake?: bigint;
  networkMaxStake?: bigint;
}

// Validate a per-validator GRAM max against the pool's global range and the
// network staking range. The contract rejects individual GRAM limits outside
// [minTonPerValidator, maxTonPerValidator] (IndividualLimitIsBelowGlobal /
// ...AboveGlobal), and the global range itself must sit within the network
// range (MinStakeBelowNetworkLimit / MaxStakeAboveNetworkLimit), so an
// individual limit outside the network range is also invalid. Returns an error
// message or null if valid.
export function validateValidatorGramLimit(
  maxTon: bigint,
  context: string,
  ranges: ValidatorLimitRanges,
): string | null {
  const { globalMinTon, globalMaxTon, networkMinStake, networkMaxStake } =
    ranges;
  if (globalMinTon !== undefined && maxTon < globalMinTon) {
    return `${context}: max GRAM (${fromNano(maxTon)}) is below the pool minimum (${fromNano(globalMinTon)}).`;
  }
  if (globalMaxTon !== undefined && maxTon > globalMaxTon) {
    return `${context}: max GRAM (${fromNano(maxTon)}) is above the pool maximum (${fromNano(globalMaxTon)}).`;
  }
  if (networkMinStake !== undefined && maxTon < networkMinStake) {
    return `${context}: max GRAM (${fromNano(maxTon)}) is below the network minimum (${fromNano(networkMinStake)}).`;
  }
  if (networkMaxStake !== undefined && maxTon > networkMaxStake) {
    return `${context}: max GRAM (${fromNano(maxTon)}) is above the network maximum (${fromNano(networkMaxStake)}).`;
  }
  return null;
}

// Validate the pool's global validator GRAM range (min/max per validator)
// against the network staking range. Returns the error keyed to 'min' or 'max'
// so the caller can map it to its own field id and render the inline message
// under the correct input. Used by Update global validator limits and by
// Deploy & Initialize (which sets the global range alongside the main
// validator's individual limit).
export function validateGlobalGramLimits(
  min: bigint,
  max: bigint,
  network: { minStake?: bigint; maxStake?: bigint },
): { field: 'min' | 'max'; msg: string } | null {
  if (max <= min) {
    return {
      field: 'max',
      msg: 'Max GRAM/validator must be > min GRAM/validator.',
    };
  }
  if (network.minStake !== undefined && min < network.minStake) {
    return {
      field: 'min',
      msg: `Min GRAM/validator (${fromNano(min)}) is below the network minimum (${fromNano(network.minStake)}).`,
    };
  }
  if (network.maxStake !== undefined && max > network.maxStake) {
    return {
      field: 'max',
      msg: `Max GRAM/validator (${fromNano(max)}) is above the network maximum (${fromNano(network.maxStake)}).`,
    };
  }
  return null;
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

function openPool(network: Network, poolAddress: string) {
  const client = getTonClient(network);
  return client.open(NominatorPool.fromAddress(Address.parse(poolAddress)));
}

/** Throws if the connected wallet is not the pool owner. */
export async function requireOwner(
  network: Network,
  poolAddress: string,
  wallet: string,
): Promise<void> {
  const owner = await getPoolOwner(network, poolAddress);
  if (!owner.equals(Address.parse(wallet))) {
    throw new Error(
      `Connected wallet (${fmtAddr(wallet, network)}) is not the pool owner (${fmtAddr(owner.toString(), network)}).`,
    );
  }
}

// ─── Read helpers ───────────────────────────────────────────────────────────

export async function getPoolData(
  network: Network,
  poolAddress: string,
): Promise<Storage> {
  return openPool(network, poolAddress).getPoolData();
}

export async function getPoolBalance(
  network: Network,
  poolAddress: string,
): Promise<bigint> {
  const client = getTonClient(network);
  const state = await client.getContractState(Address.parse(poolAddress));
  return state.balance;
}

export async function getPoolInvariants(network: Network, poolAddress: string) {
  return openPool(network, poolAddress).getPoolInvariants();
}

export async function getNominatorData(
  network: Network,
  poolAddress: string,
  nominatorAddress: string,
) {
  const addr = Address.parse(nominatorAddress);
  // The getter takes the address hash as int and tries both workchain 0 and -1.
  return openPool(network, poolAddress).getNominatorData(
    BigInt('0x' + Buffer.from(addr.hash).toString('hex')),
  );
}

export async function getValidatorInfo(
  network: Network,
  poolAddress: string,
  validatorAddress: string,
): Promise<GetValidatorInfo> {
  return openPool(network, poolAddress).getValidatorInfo(
    Address.parse(validatorAddress),
  );
}

export async function getLimitsPerValidator(
  network: Network,
  poolAddress: string,
): Promise<[bigint, bigint, bigint]> {
  return openPool(network, poolAddress).getLimitsPerValidator();
}

export async function getNominatorMinimalStake(
  network: Network,
  poolAddress: string,
): Promise<{ minStake: bigint; minExpectedValue: bigint }> {
  return openPool(network, poolAddress).getNominatorMinimalStake();
}

// Computes the theoretical max owner-withdrawable amount, matching the logic
// in contracts/owner.tolk's OwnerWithdrawal handler:
//   availableBalance = getOriginalBalance() - value - pendingDeposits - POOL_MIN_STORAGE
// Computes both the withdrawable amount and the total projected owner share,
// matching the contract's OwnerWithdrawal handler:
//   getOriginalBalance() = onchain_balance + msgValue
//   availableBalance = getOriginalBalance() - value - pendingDeposits - POOL_MIN_STORAGE
//   Since value = msgValue, they cancel:
//   availableBalance = onchain_balance - pendingDeposits - POOL_MIN_STORAGE
//   totalBalance = availableBalance + stakeUsed
//   ownerShare = totalBalance - nominatorsAmount - maxPunishment * activeSlots
//   withdrawable = min(ownerShare, availableBalance)
export interface OwnerShareInfo {
  available: bigint; // min(ownerShare, availableBalance) — what can be withdrawn now
  ownerShare: bigint; // total owner share (may exceed available if stake is locked)
}

export async function getOwnerShareInfo(
  network: Network,
  poolAddress: string,
): Promise<OwnerShareInfo> {
  const opened = openPool(network, poolAddress);
  const poolData = await opened.getPoolData();
  const validators = poolData.validators.ref;
  const [balance, maxPunishment] = await Promise.all([
    getPoolBalance(network, poolAddress),
    opened.getMaxPunishment(validators.minTonPerValidator),
  ]);
  const availableBalance =
    balance - POOL_MIN_STORAGE - poolData.pendingDeposits;
  const fullBalance = availableBalance + validators.stakeUsed;
  const ownerShare =
    fullBalance -
    poolData.nominatorsAmount -
    maxPunishment * validators.activeSlots;
  const available =
    availableBalance < ownerShare ? availableBalance : ownerShare;
  return { available, ownerShare };
}

export async function getMaxOwnerShare(
  network: Network,
  poolAddress: string,
): Promise<bigint> {
  const info = await getOwnerShareInfo(network, poolAddress);
  return info.available;
}

export interface ValidatorEntry {
  address: string;
  isMain: boolean;
  isBanned: boolean;
  usageState: bigint;
  roundParity: bigint;
  evenProxy: bigint | null;
  oddProxy: bigint | null;
  limit: ValidatorLimit | null;
}

// Returns the list of validators in the pool: the main validator first, then
// any extra validators from the validators map. Matches the picker in
// pool-utils.tolk's collectValidatorOptions (includeMain = true). Also
// surfaces the pool's current maxNominators from the same get_pool_data call,
// so callers (e.g. the Update nominator limits form) can read it without a
// separate fetch.
export async function getValidators(
  network: Network,
  poolAddress: string,
): Promise<{ validators: ValidatorEntry[]; maxNominators: bigint }> {
  const data = await getPoolData(network, poolAddress);
  const vd = data.validators.ref;
  const result: ValidatorEntry[] = [];

  const mainAddr = vd.mainValidatorAddress.toString();
  const main = vd.mainValidatorData.ref;
  result.push({
    address: mainAddr,
    isMain: true,
    isBanned: main.isBanned,
    usageState: main.usageState,
    roundParity: main.roundParity,
    evenProxy: main.evenProxy,
    oddProxy: main.oddProxy,
    limit: main.limit,
  });

  for (const [addr, val] of vd.validators) {
    result.push({
      address: addr.toString(),
      isMain: false,
      isBanned: val.isBanned,
      usageState: val.usageState,
      roundParity: val.roundParity,
      evenProxy: val.evenProxy,
      oddProxy: val.oddProxy,
      limit: val.limit,
    });
  }

  return { validators: result, maxNominators: data.maxNominators };
}

// Returns the current nominator whitelist addresses from the pool's nominators
// cell. An empty array means the whitelist is cleared (open to all).
export async function getWhitelist(
  network: Network,
  poolAddress: string,
): Promise<string[]> {
  const data = await getPoolData(network, poolAddress);
  const wl = data.nominators.ref.nominatorsWhitelist;
  const result: string[] = [];
  for (const [addr] of wl) {
    result.push(addr.toString());
  }
  return result;
}

// ─── Operations (all owner-only) ────────────────────────────────────────────

export interface AddFundsParams {
  poolAddress: string;
  amount: bigint; // also the message value (contract accepts sent TON)
  queryId?: bigint;
}

export async function addFunds(
  network: Network,
  via: Sender,
  params: AddFundsParams,
): Promise<void> {
  await openPool(network, params.poolAddress).sendAddFunds(via, params.amount, {
    queryId: params.queryId ?? 1n,
  });
}

export interface AddValidatorParams {
  poolAddress: string;
  validator: string;
  roundAllowance: bigint; // 1=odd, 2=even, 3=all
  limit: ValidatorLimit | null; // null = use global
  value: bigint;
  queryId?: bigint;
}

export async function addValidator(
  network: Network,
  via: Sender,
  params: AddValidatorParams,
): Promise<void> {
  await openPool(network, params.poolAddress).sendAddValidator(
    via,
    params.value,
    {
      queryId: params.queryId ?? 1n,
      validator: Address.parse(params.validator),
      roundAllowance: params.roundAllowance,
      limits: params.limit,
    },
  );
}

export interface RemoveValidatorParams {
  poolAddress: string;
  validator: string;
  value: bigint;
  queryId?: bigint;
}

export async function removeValidator(
  network: Network,
  via: Sender,
  params: RemoveValidatorParams,
): Promise<void> {
  await openPool(network, params.poolAddress).sendRemoveValidator(
    via,
    params.value,
    {
      queryId: params.queryId ?? 1n,
      validator: Address.parse(params.validator),
    },
  );
}

// RecoverStakeUnrestricted is an owner-only operation that recovers a
// validator's stake from the elector outside the normal RecoverStakeCompat
// flow. Unlike RecoverStakeCompat (which the validator sends itself and which
// carries the full recovery value), the owner specifies the validator and the
// amount of GRAM to forward to the proxy for the recovery. The contract
// checks recovery timing and gas (see contracts/Pool.tolk).
export interface RecoverStakeUnrestrictedParams {
  poolAddress: string;
  validator: string;
  amount: bigint; // GRAM forwarded to the proxy for recovery
  value: bigint; // total message value (must cover amount + gas)
  queryId?: bigint;
}

export async function recoverStakeUnrestricted(
  network: Network,
  via: Sender,
  params: RecoverStakeUnrestrictedParams,
): Promise<void> {
  await openPool(network, params.poolAddress).sendRecoverStakeUnrestricted(
    via,
    params.value,
    {
      queryId: params.queryId ?? 1n,
      validator: Address.parse(params.validator),
      amount: params.amount,
    },
  );
}

export interface UpdateVsetParams {
  poolAddress: string;
  value: bigint;
  queryId?: bigint;
}

// Anyone can send UpdateVset to advance the pool's validator set to the
// current round. Not owner-only.
export async function updateVset(
  network: Network,
  via: Sender,
  params: UpdateVsetParams,
): Promise<void> {
  await openPool(network, params.poolAddress).sendUpdateVset(
    via,
    params.value,
    {
      queryId: params.queryId ?? 1n,
    },
  );
}

export interface OwnerWithdrawalParams {
  poolAddress: string;
  amount: bigint;
  value: bigint;
  queryId?: bigint;
}

export async function ownerWithdrawal(
  network: Network,
  via: Sender,
  params: OwnerWithdrawalParams,
): Promise<void> {
  await openPool(network, params.poolAddress).sendOwnerWithdrawal(
    via,
    params.value,
    {
      queryId: params.queryId ?? 1n,
      amount: params.amount,
    },
  );
}

export interface UpdateValidatorLimitsParams {
  poolAddress: string;
  minTonPerValidator: bigint;
  maxTonPerValidator: bigint;
  refundBonus: bigint;
  value: bigint;
  queryId?: bigint;
}

export async function updateValidatorLimits(
  network: Network,
  via: Sender,
  params: UpdateValidatorLimitsParams,
): Promise<void> {
  await openPool(network, params.poolAddress).sendUpdateLimits(
    via,
    params.value,
    {
      queryId: params.queryId ?? 1n,
      limit: GlobalValidatorsLimit.create({
        minTonPerValidator: params.minTonPerValidator,
        maxTonPerValidator: params.maxTonPerValidator,
        refundBonus: params.refundBonus,
      }),
    },
  );
}

export interface UpdateNominatorLimitsParams {
  poolAddress: string;
  maxNominators: number; // 0..1023
  minStake: bigint;
  value: bigint;
  queryId?: bigint;
}

export async function updateNominatorLimits(
  network: Network,
  via: Sender,
  params: UpdateNominatorLimitsParams,
): Promise<void> {
  await openPool(network, params.poolAddress).sendUpdateLimits(
    via,
    params.value,
    {
      queryId: params.queryId ?? 1n,
      limit: GlobalNominatorsLimit.create({
        maxNm: BigInt(params.maxNominators),
        minStake: params.minStake,
      }),
    },
  );
}

export interface UpdateValidatorLimitParams {
  poolAddress: string;
  validator: string;
  limit: ValidatorLimit; // must be Ton or Share, not null
  value: bigint;
  queryId?: bigint;
}

export async function updateValidatorLimit(
  network: Network,
  via: Sender,
  params: UpdateValidatorLimitParams,
): Promise<void> {
  await openPool(network, params.poolAddress).sendUpdateLimits(
    via,
    params.value,
    {
      queryId: params.queryId ?? 1n,
      limit: ValidatorSpecific.create({
        validator: Address.parse(params.validator),
        limit: params.limit,
      }),
    },
  );
}

export interface UpdateWhitelistParams {
  poolAddress: string;
  whitelist: Map<string, boolean>; // address string -> true
  value: bigint;
  queryId?: bigint;
}

export async function updateNominatorsWhitelist(
  network: Network,
  via: Sender,
  params: UpdateWhitelistParams,
): Promise<void> {
  let dict = Dictionary.empty(
    Dictionary.Keys.Address(),
    Dictionary.Values.Bool(),
  );
  for (const [addr, val] of params.whitelist) {
    dict = dict.set(Address.parse(addr), val);
  }
  await openPool(network, params.poolAddress).sendUpdateNominatorsWhitelist(
    via,
    params.value,
    {
      queryId: params.queryId ?? 1n,
      whitelist: dict,
    },
  );
}

// ─── Validator limit builders ───────────────────────────────────────────────

export function makeLimitTon(maxTon: bigint): ValidatorLimitTon {
  return ValidatorLimitTon.create({ maxTon });
}

export function makeLimitShare(maxShare: bigint): ValidatorLimitShare {
  return ValidatorLimitShare.create({ maxShare });
}
