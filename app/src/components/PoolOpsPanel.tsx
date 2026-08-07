import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useIsConnectionRestored,
  useTonAddress,
  useTonConnectUI,
} from '@tonconnect/ui-react';

import { Button } from '@/components/ui/button';
import { Field, AddrLink } from '@/components/ui/form';
import { ShareInput } from '@/components/ui/ShareInput';
import { RoundAllowanceSelect } from '@/components/ui/RoundAllowanceSelect';
import { useToast } from '@/components/ui/toast';
import { useRouter } from '@/lib/router';
import { prettyError } from '@/lib/errors';
import { invalidatePoolQueries } from '@/lib/query-keys';
import {
  SHARE_BASE,
  addFunds,
  addValidator,
  fmtAddr,
  getLimitsPerValidator,
  getNetworkStakingLimits,
  getOwnerShareInfo,
  getPoolInvariants,
  getPoolOwner,
  getValidatorInfo,
  getValidators,
  getWhitelist,
  makeLimitShare,
  makeLimitTon,
  makeSender,
  ownerWithdrawal,
  shareToPercent,
  recoverStakeUnrestricted,
  removeValidator,
  requireOwner,
  updateNominatorLimits,
  updateNominatorsWhitelist,
  updateValidatorLimit,
  updateValidatorLimits,
  updateVset,
  validateBigIntInput,
  validateGramInput,
  validateNumberInput,
} from '@/lib/pool';
import { Address, fromNano } from '@ton/core';

// Rounds a nano-amount to the given number of fractional GRAM digits and
// returns as a string. More precision than that doesn't work for the
// withdrawal input.
function roundToFrac(nano: bigint, frac: number): string {
  const drop = 9 - frac;
  const pow = 10n ** BigInt(drop);
  const rounded = (nano / pow) * pow;
  return fromNano(rounded);
}
import {
  getWalletBaselineLt,
  waitForRefund,
  waitForOwnerWithdrawal,
  type RefundOutcome,
} from '@/lib/refund';
import { tonscanTxUrl, isValidAddress } from '@/lib/ton';
import type { Network } from '@/lib/router';

type OpTab =
  | 'add-funds'
  | 'add-validator'
  | 'remove-validator'
  | 'recover-stake'
  | 'owner-withdrawal'
  | 'update-validator-limits'
  | 'update-nominator-limits'
  | 'update-validator-limit'
  | 'update-whitelist'
  | 'update-vset';

const TAB_GROUPS: { group: string; tabs: { id: OpTab; label: string }[] }[] = [
  {
    group: 'Pool',
    tabs: [
      { id: 'add-funds', label: 'Add Funds' },
      { id: 'owner-withdrawal', label: 'Owner Withdrawal' },
    ],
  },
  {
    group: 'Validators',
    tabs: [
      { id: 'add-validator', label: 'Add Validator' },
      { id: 'remove-validator', label: 'Remove Validator' },
      { id: 'update-validator-limits', label: 'Global Validator Limits' },
      { id: 'update-validator-limit', label: 'Individual Validator Limit' },
      { id: 'recover-stake', label: 'Recover Stake' },
      { id: 'update-vset', label: 'Update Vset' },
    ],
  },
  {
    group: 'Nominators',
    tabs: [
      { id: 'update-nominator-limits', label: 'Nominator Limits' },
      { id: 'update-whitelist', label: 'Nominator Whitelist' },
    ],
  },
];

export function PoolOpsPanel({ poolAddress }: { poolAddress: string }) {
  const { network } = useRouter();
  const wallet = useTonAddress();
  const restored = useIsConnectionRestored();
  const queryClient = useQueryClient();
  const [tc] = useTonConnectUI();
  const sender = useMemo(
    () => (tc && wallet && tc.account ? makeSender(tc, network) : null),
    [tc, network, wallet],
  );

  const [tab, setTab] = useState<OpTab>('add-funds');
  const [busy, setBusy] = useState(false);

  const toast = useToast();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const setErr = (field: string, msg: string) =>
    setFieldErrors((p) => ({ ...p, [field]: msg }));
  const clearErr = (field: string) =>
    setFieldErrors((p) => {
      if (!(field in p)) return p;
      const n = { ...p };
      delete n[field];
      return n;
    });
  const withClear =
    (setter: (v: string) => void, field: string) => (v: string) => {
      setter(v);
      clearErr(field);
    };
  const clearAllErr = () => setFieldErrors({});

  // shared
  const [msgValue, setMsgValue] = useState('1');
  const [validatorAddr, setValidatorAddr] = useState('');
  const [roundAllowance, setRoundAllowance] = useState('3');

  // add-funds
  const [fundsAmount, setFundsAmount] = useState('10');

  // owner-withdrawal
  const [withdrawAmount, setWithdrawAmount] = useState('1');

  // validator limits (global)
  const [gMinTon, setGMinTon] = useState('300000');
  const [gMaxTon, setGMaxTon] = useState('10000000');
  const [gRefundBonus, setGRefundBonus] = useState('3');

  // nominator limits
  const [maxNominators, setMaxNominators] = useState('1023');
  const [minStake, setMinStake] = useState('1000');

  // per-validator limit
  const [limitType, setLimitType] = useState<'ton' | 'share'>('ton');
  const [limitTonMax, setLimitTonMax] = useState('1000000');
  const [limitShareMax, setLimitShareMax] = useState('8388608');
  const [limitShareMode, setLimitShareMode] = useState<'share' | 'percent'>(
    'percent',
  );
  const [limitPercentInput, setLimitPercentInput] = useState('50.00');

  // add-validator
  const [addValMsgValue, setAddValMsgValue] = useState('250');

  // recover-stake
  const [recoverAmount, setRecoverAmount] = useState('1');

  // add-validator: per-validator limit applied at add time
  // 'global' = no individual limit (use pool's global limits)
  const [addValLimitType, setAddValLimitType] = useState<
    'global' | 'ton' | 'share'
  >('global');
  const [addValLimitTonMax, setAddValLimitTonMax] = useState('1000000');
  const [addValLimitShareMax, setAddValLimitShareMax] = useState('8388608');
  const [addValShareMode, setAddValShareMode] = useState<'share' | 'percent'>(
    'percent',
  );
  const [addValPercentInput, setAddValPercentInput] = useState('50.00');

  // whitelist
  const [wlInput, setWlInput] = useState('');
  const [wlEntries, setWlEntries] = useState<string[]>([]);

  // Fetch the pool's global validator limits so the Add Validator / per-validator
  // limit forms can show the valid range and validate against it. The contract
  // rejects individual GRAM limits outside [minTonPerValidator, maxTonPerValidator]
  // (ErrorsPool.IndividualLimitIsBelowGlobal / ...AboveGlobal).
  const { data: globalLimits } = useQuery({
    queryKey: ['pool-limits', network, poolAddress],
    enabled: !!poolAddress,
    queryFn: () => getLimitsPerValidator(network, poolAddress),
  });
  const globalMinTon = globalLimits?.[0];
  const globalMaxTon = globalLimits?.[1];

  // Populate the global validator limits form with the pool's current values
  // when they're first loaded, so the user sees what's on-chain rather than
  // hardcoded placeholders.
  useEffect(() => {
    if (globalLimits) {
      setGMinTon(fromNano(globalLimits[0]));
      setGMaxTon(fromNano(globalLimits[1]));
      setGRefundBonus(fromNano(globalLimits[2]));
    }
  }, [globalLimits]);

  // Fetch the network staking limits (config param 17) so we can validate
  // global pool limits against them (the contract asserts minTon >= network
  // min and maxTon <= network max — ErrorsPool.MinStakeBelowNetworkLimit /
  // MaxStakeAboveNetworkLimit). These differ between testnet and mainnet.
  const { data: networkLimits } = useQuery({
    queryKey: ['network-staking-limits', network],
    queryFn: () => getNetworkStakingLimits(network),
  });
  const networkMinStake = networkLimits?.minStake;
  const networkMaxStake = networkLimits?.maxStake;

  // Fetch the pool's validators for the picker in the per-validator limit tab.
  const { data: validators } = useQuery({
    queryKey: ['pool-validators', network, poolAddress],
    enabled: !!poolAddress,
    queryFn: () => getValidators(network, poolAddress),
  });

  // Fetch detailed validator info (rotation data) for the recover-stake tab.
  // get_validator_info may advance round state, so it's only called when the
  // recover-stake tab is active and a validator is selected.
  const { data: recoverValidatorInfo, isLoading: rviLoading } = useQuery({
    queryKey: [
      'pool-recover-validator-info',
      network,
      poolAddress,
      validatorAddr,
    ],
    enabled: !!poolAddress && tab === 'recover-stake' && !!validatorAddr,
    queryFn: () => getValidatorInfo(network, poolAddress, validatorAddr),
    retry: false,
  });

  // Compute recovery eligibility for the selected validator in the
  // recover-stake tab, mirroring the contract's checkRecoverRequirements.
  const recoverEligible = useMemo(() => {
    if (!recoverValidatorInfo) return false;
    const info = recoverValidatorInfo;
    const roundIndex = Number(info.roundIndex);
    const usageState =
      validators?.find((x) => x.address === validatorAddr)?.usageState ?? 0n;
    let bitIdx = 2 - ((roundIndex - 1) & 1);
    if ((Number(usageState) & bitIdx) === 0) bitIdx += 1;
    const closest =
      (bitIdx & 1) === 1 ? info.usage.curRoundUsage : info.usage.prevRoundUsage;
    if (!closest) return false;
    const rot = closest.usage.rotation;
    if (rot.rotationCount < 2n) return false;
    if (rot.rotationCount === 2n) {
      const now = Math.floor(Date.now() / 1000);
      const eligibleAt =
        Number(rot.rotationTime) + Number(closest.usage.heldFor) + 60;
      return now > eligibleAt;
    }
    return true;
  }, [recoverValidatorInfo, validators, validatorAddr]);
  // form with that validator's current individual limit (type + values) so the
  // user sees what's on-chain rather than hardcoded placeholders.
  useEffect(() => {
    if (!validators || !validatorAddr) return;
    const v = validators.find((x) => x.address === validatorAddr);
    if (!v) return;
    if (v.limit) {
      if (v.limit.$ === 'ValidatorLimitTon') {
        setLimitType('ton');
        setLimitTonMax(fromNano(v.limit.maxTon));
      } else {
        setLimitType('share');
        setLimitShareMax(v.limit.maxShare.toString());
        setLimitPercentInput(shareToPercent(v.limit.maxShare));
      }
    }
  }, [validators, validatorAddr]);

  // Fetch the current nominator whitelist so it can be displayed in the
  // whitelist tab alongside the entries being composed.
  const { data: currentWhitelist } = useQuery({
    queryKey: ['pool-whitelist', network, poolAddress],
    enabled: !!poolAddress,
    queryFn: () => getWhitelist(network, poolAddress),
  });

  // Sync the editable whitelist from the on-chain state whenever it changes
  // (on load, after refresh, after an update transaction confirms). User
  // edits are local until submitted; after submission the on-chain state
  // becomes the source of truth again.
  useEffect(() => {
    if (currentWhitelist) {
      setWlEntries(currentWhitelist.map((a) => fmtAddr(a, network)));
    }
  }, [currentWhitelist, network]);

  // Fetch the projected owner share info for the Owner Withdrawal tab.
  // Returns both the withdrawable amount and the total owner share.
  const { data: ownerShareInfo } = useQuery({
    queryKey: ['pool-owner-share', network, poolAddress],
    enabled: !!poolAddress,
    queryFn: () => getOwnerShareInfo(network, poolAddress),
  });

  // Fetch the pool invariants for showing the projected balance and approx
  // GRAM amounts when a share-based limit is selected.
  const { data: poolInvariants } = useQuery({
    queryKey: ['pool-invariants', network, poolAddress],
    enabled: !!poolAddress,
    queryFn: () => getPoolInvariants(network, poolAddress),
  });
  const projectedBalance = poolInvariants?.projectedBalance;

  // Fetch the pool owner to determine whether the connected wallet can send
  // owner-only transactions. Add Funds and Deploy are not owner-only.
  const { data: poolOwner } = useQuery({
    queryKey: ['pool-owner', network, poolAddress],
    enabled: !!poolAddress,
    queryFn: () => getPoolOwner(network, poolAddress),
  });
  const isOwner = !!(
    poolOwner &&
    wallet &&
    poolOwner.equals(Address.parse(wallet))
  );

  // Validate a per-validator GRAM limit against the pool's global range and the
  // network staking range. Returns an error message or null if valid.
  function validateTonLimit(maxTon: bigint, context: string): string | null {
    if (globalMinTon && maxTon < globalMinTon) {
      return `${context}: max GRAM (${fromNano(maxTon)}) is below the pool minimum (${fromNano(globalMinTon)}).`;
    }
    if (globalMaxTon && maxTon > globalMaxTon) {
      return `${context}: max GRAM (${fromNano(maxTon)}) is above the pool maximum (${fromNano(globalMaxTon)}).`;
    }
    if (networkMinStake && maxTon < networkMinStake) {
      return `${context}: max GRAM (${fromNano(maxTon)}) is below the network minimum (${fromNano(networkMinStake)}).`;
    }
    if (networkMaxStake && maxTon > networkMaxStake) {
      return `${context}: max GRAM (${fromNano(maxTon)}) is above the network maximum (${fromNano(networkMaxStake)}).`;
    }
    return null;
  }

  // Validate global pool limits against the network staking range. Returns
  // the error keyed to the field it belongs to so the inline message renders
  // under the correct input rather than always under Max.
  function validateGlobalLimits(
    min: bigint,
    max: bigint,
  ): { field: 'gMinTon' | 'gMaxTon'; msg: string } | null {
    if (max <= min) {
      return {
        field: 'gMaxTon',
        msg: 'Max GRAM/validator must be > min GRAM/validator.',
      };
    }
    if (networkMinStake && min < networkMinStake) {
      return {
        field: 'gMinTon',
        msg: `Min GRAM/validator (${fromNano(min)}) is below the network minimum (${fromNano(networkMinStake)}).`,
      };
    }
    if (networkMaxStake && max > networkMaxStake) {
      return {
        field: 'gMaxTon',
        msg: `Max GRAM/validator (${fromNano(max)}) is above the network maximum (${fromNano(networkMaxStake)}).`,
      };
    }
    return null;
  }

  // Runs an operation. Owner-only operations (everything except Add Funds) are
  // gated on requireOwner and wait for the pool's RefundMessage reply, decoding
  // the errorCode into a human-readable report. Add Funds just tops up the
  // balance (no refund, not owner-only), so it only confirms the send.
  // OwnerWithdrawal sends OwnerWithdrawalSuccess on success instead of
  // RefundMessage, so a custom waitFn can be passed to handle that.
  async function run(
    name: string,
    fn: () => Promise<void>,
    opts: {
      ownerOnly?: boolean;
      awaitRefund?: boolean;
      waitFn?: (
        network: Network,
        wallet: string,
        poolAddress: string,
        baselineLt: bigint,
      ) => Promise<RefundOutcome>;
    } = {},
  ) {
    const { ownerOnly = true, awaitRefund = true } = opts;
    if (!sender) {
      toast.error('Connect your wallet first.');
      return;
    }
    if (!poolAddress) {
      toast.error('Pool address is required.');
      return;
    }
    setBusy(true);
    clearAllErr();
    const pendingId = toast.pending(`Working: ${name}...`);
    try {
      if (ownerOnly) {
        await requireOwner(network, poolAddress, wallet);
      }
      // Snapshot the wallet's latest tx lt before sending so the refund poll
      // only picks up messages that arrive after this send.
      const baselineLt = awaitRefund
        ? await getWalletBaselineLt(network, wallet)
        : 0n;
      await fn();

      if (!awaitRefund) {
        toast.dismiss(pendingId);
        toast.info(
          `${name} transaction sent. The pool balance will update once the network confirms.`,
        );
      } else {
        toast.update(
          pendingId,
          `${name} transaction sent. Waiting for the pool to confirm on-chain...`,
        );
        const wait = opts.waitFn ?? waitForRefund;
        const result = await wait(network, wallet, poolAddress, baselineLt);
        toast.dismiss(pendingId);
        if ('timeout' in result) {
          toast.warn(
            <>
              {`${name} transaction sent, but no refund was received within the timeout. `}
              {result.sendTxHash ? (
                <a
                  href={tonscanTxUrl(network, result.sendTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-primary break-all"
                >
                  {tonscanTxUrl(network, result.sendTxHash)}
                </a>
              ) : (
                'Verify the result in a block explorer.'
              )}
            </>,
          );
        } else if (result.ok) {
          toast.info(
            `${name} succeeded on-chain (${result.opName}, queryId ${result.queryId}).`,
          );
        } else {
          toast.error(
            <>
              {`${name} was rejected by the contract: ${result.errorLabel} ` +
                `(code ${result.errorCode}, op ${result.opName}). `}
              {result.sendTxHash && (
                <a
                  href={tonscanTxUrl(network, result.sendTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-primary break-all"
                >
                  {tonscanTxUrl(network, result.sendTxHash)}
                </a>
              )}
            </>,
          );
        }
      }
      // The transaction has been sent but may take a few seconds to be
      // processed by the network. Invalidate immediately, then again after
      // a delay so the refetch picks up the updated on-chain state.
      invalidatePoolQueries(queryClient, network, poolAddress);
      setTimeout(() => {
        invalidatePoolQueries(queryClient, network, poolAddress);
      }, 5000);
      setTimeout(() => {
        invalidatePoolQueries(queryClient, network, poolAddress);
      }, 15000);
    } catch (e) {
      toast.dismiss(pendingId);
      toast.error(prettyError(name, e));
    } finally {
      setBusy(false);
    }
  }

  // ── handlers ──────────────────────────────────────────────────────────────

  function onAddFunds() {
    const amount = validateGramInput(
      fundsAmount,
      'fundsAmount',
      setErr,
      clearErr,
    );
    if (amount === null) return;
    // Add Funds is not owner-only and produces no RefundMessage (the pool just
    // accepts the attached GRAM), so we skip the owner check and refund wait.
    run(
      'Add funds',
      () => addFunds(network, sender!, { poolAddress, amount }),
      { ownerOnly: false, awaitRefund: false },
    );
  }

  function onAddValidator() {
    if (!validatorAddr) {
      setErr('validatorAddr', 'Validator address is required.');
      return;
    }
    if (!isValidAddress(validatorAddr)) {
      setErr('validatorAddr', 'Invalid address format.');
      return;
    }
    if (validators) {
      const exists = validators.some(
        (v) => fmtAddr(v.address, network) === fmtAddr(validatorAddr, network),
      );
      if (exists) {
        setErr('validatorAddr', 'This validator is already in the pool.');
        return;
      }
    }
    const ra = validateBigIntInput(
      roundAllowance,
      'roundAllowance',
      setErr,
      clearErr,
    );
    if (ra === null) return;
    if (ra < 1n || ra > 3n) {
      setErr('roundAllowance', 'Must be 1 (odd), 2 (even), or 3 (all).');
      return;
    }
    let limit = null;
    if (addValLimitType === 'ton') {
      if (!globalMinTon || !globalMaxTon) {
        setErr(
          'addValLimitTonMax',
          'Pool limits not loaded yet. Wait a moment and retry.',
        );
        return;
      }
      const maxTon = validateGramInput(
        addValLimitTonMax,
        'addValLimitTonMax',
        setErr,
        clearErr,
      );
      if (maxTon === null) return;
      const err = validateTonLimit(maxTon, 'Add validator');
      if (err) {
        setErr('addValLimitTonMax', err);
        return;
      }
      limit = makeLimitTon(maxTon);
    } else if (addValLimitType === 'share') {
      const ms = validateBigIntInput(
        addValLimitShareMax,
        'addValLimitShareMax',
        setErr,
        clearErr,
      );
      if (ms === null) return;
      if (ms < 0n || ms > SHARE_BASE) {
        setErr('addValLimitShareMax', `maxShare must be in 0..${SHARE_BASE}.`);
        return;
      }
      limit = makeLimitShare(ms);
    }
    const valMsgValue = validateGramInput(
      addValMsgValue,
      'addValMsgValue',
      setErr,
      clearErr,
    );
    if (valMsgValue === null) return;
    run('Add validator', () =>
      addValidator(network, sender!, {
        poolAddress,
        validator: validatorAddr,
        roundAllowance: ra,
        limit,
        value: valMsgValue,
      }),
    );
  }

  function onRemoveValidator() {
    if (!validatorAddr) {
      setErr('validatorAddr', 'Validator address is required.');
      return;
    }
    if (!isValidAddress(validatorAddr)) {
      setErr('validatorAddr', 'Invalid address format.');
      return;
    }
    const value = validateGramInput(msgValue, 'msgValue', setErr, clearErr);
    if (value === null) return;
    run('Remove validator', () =>
      removeValidator(network, sender!, {
        poolAddress,
        validator: validatorAddr,
        value,
      }),
    );
  }

  function onRecoverStake() {
    if (!validatorAddr) {
      setErr('validatorAddr', 'Validator address is required.');
      return;
    }
    if (!isValidAddress(validatorAddr)) {
      setErr('validatorAddr', 'Invalid address format.');
      return;
    }
    const amount = validateGramInput(
      recoverAmount,
      'recoverAmount',
      setErr,
      clearErr,
    );
    if (amount === null) return;
    if (amount <= 0n) {
      setErr('recoverAmount', 'Recovery value must be greater than 0.');
      return;
    }
    const value = validateGramInput(msgValue, 'msgValue', setErr, clearErr);
    if (value === null) return;
    if (value < amount) {
      setErr('msgValue', 'Must cover the recovery value plus gas fees.');
      return;
    }
    run(
      'Recover stake',
      () =>
        recoverStakeUnrestricted(network, sender!, {
          poolAddress,
          validator: validatorAddr,
          amount,
          value,
        }),
      { ownerOnly: false },
    );
  }

  function onUpdateVset() {
    const value = validateGramInput(msgValue, 'msgValue', setErr, clearErr);
    if (value === null) return;
    run(
      'Update vset',
      () => updateVset(network, sender!, { poolAddress, value }),
      { ownerOnly: false },
    );
  }

  function onOwnerWithdrawal() {
    const amount = validateGramInput(
      withdrawAmount,
      'withdrawAmount',
      setErr,
      clearErr,
    );
    if (amount === null) return;
    const value = validateGramInput(msgValue, 'msgValue', setErr, clearErr);
    if (value === null) return;
    run(
      'Owner withdrawal',
      () => ownerWithdrawal(network, sender!, { poolAddress, amount, value }),
      { waitFn: waitForOwnerWithdrawal },
    );
  }

  function onUpdateValidatorLimits() {
    const min = validateGramInput(gMinTon, 'gMinTon', setErr, clearErr);
    if (min === null) return;
    const max = validateGramInput(gMaxTon, 'gMaxTon', setErr, clearErr);
    if (max === null) return;
    const err = validateGlobalLimits(min, max);
    if (err) {
      setErr(err.field, err.msg);
      return;
    }
    const refundBonus = validateGramInput(
      gRefundBonus,
      'gRefundBonus',
      setErr,
      clearErr,
    );
    if (refundBonus === null) return;
    const value = validateGramInput(msgValue, 'msgValue', setErr, clearErr);
    if (value === null) return;
    run('Update global validator limits', () =>
      updateValidatorLimits(network, sender!, {
        poolAddress,
        minTonPerValidator: min,
        maxTonPerValidator: max,
        refundBonus,
        value,
      }),
    );
  }

  function onUpdateNominatorLimits() {
    const mn = validateNumberInput(
      maxNominators,
      'maxNominators',
      setErr,
      clearErr,
    );
    if (mn === null) return;
    if (mn < 0 || mn > 1023) {
      setErr('maxNominators', 'Must be in 0..1023.');
      return;
    }
    const stake = validateGramInput(minStake, 'minStake', setErr, clearErr);
    if (stake === null) return;
    const value = validateGramInput(msgValue, 'msgValue', setErr, clearErr);
    if (value === null) return;
    run('Update nominator limits', () =>
      updateNominatorLimits(network, sender!, {
        poolAddress,
        maxNominators: mn,
        minStake: stake,
        value,
      }),
    );
  }

  function onUpdateValidatorLimit() {
    if (!validatorAddr) {
      setErr('validatorAddr', 'Validator address is required.');
      return;
    }
    let limit;
    if (limitType === 'ton') {
      const maxTon = validateGramInput(
        limitTonMax,
        'limitTonMax',
        setErr,
        clearErr,
      );
      if (maxTon === null) return;
      limit = makeLimitTon(maxTon);
    } else {
      const ms = validateBigIntInput(
        limitShareMax,
        'limitShareMax',
        setErr,
        clearErr,
      );
      if (ms === null) return;
      limit = makeLimitShare(ms);
    }
    if (limit.$ === 'ValidatorLimitShare') {
      if (limit.maxShare < 0n || limit.maxShare > SHARE_BASE) {
        setErr('limitShareMax', `maxShare must be in 0..${SHARE_BASE}.`);
        return;
      }
    } else {
      const err = validateTonLimit(limit.maxTon, 'Update per-validator limit');
      if (err) {
        setErr('limitTonMax', err);
        return;
      }
    }
    const value = validateGramInput(msgValue, 'msgValue', setErr, clearErr);
    if (value === null) return;
    run('Update per-validator limit', () =>
      updateValidatorLimit(network, sender!, {
        poolAddress,
        validator: validatorAddr,
        limit,
        value,
      }),
    );
  }

  function onUpdateWhitelist() {
    const value = validateGramInput(msgValue, 'msgValue', setErr, clearErr);
    if (value === null) return;
    run('Update whitelist', async () => {
      await updateNominatorsWhitelist(network, sender!, {
        poolAddress,
        whitelist: new Map(wlEntries.map((a) => [a, true])),
        value,
      });
    });
  }

  // ── render ────────────────────────────────────────────────────────────────

  if (!sender) {
    return (
      <div className="w-full max-w-md rounded-xl border p-6 text-center">
        <p className="text-muted-foreground text-[14px]">
          {restored
            ? 'Connect your wallet to perform pool operations.'
            : 'Restoring wallet connection...'}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl flex flex-col gap-4 text-left">
      <div className="flex flex-col gap-2">
        {TAB_GROUPS.map((group) => (
          <div key={group.group} className="flex flex-col gap-1">
            <span className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
              {group.group}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {group.tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTab(t.id);
                  }}
                  className={
                    tab === t.id
                      ? 'rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-[12px] font-medium'
                      : 'rounded-md border px-3 py-1.5 text-[12px] font-medium hover:bg-accent'
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <section className="rounded-xl border p-5 flex flex-col gap-3">
        {tab === 'add-funds' && (
          <>
            <h2 className="text-[15px] font-semibold">Add funds</h2>
            <p className="text-muted-foreground text-[12px]">
              Tops up the pool balance. The sent amount is added directly.
            </p>
            <Field
              label="Amount (GRAM)"
              type="number"
              value={fundsAmount}
              onChange={withClear(setFundsAmount, 'fundsAmount')}
              error={fieldErrors.fundsAmount}
            />
            <Button onClick={onAddFunds} disabled={busy}>
              Add funds
            </Button>
          </>
        )}

        {tab === 'add-validator' && (
          <>
            <h2 className="text-[15px] font-semibold">Add validator</h2>
            {validators && validators.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-[12px]">
                  Current validators:
                </span>
                <div className="flex flex-col gap-1">
                  {validators.map((v) => (
                    <div
                      key={v.address}
                      className="flex items-center justify-between rounded-md border px-3 py-1.5 text-[12px] font-mono"
                    >
                      <span className="break-all">
                        {v.isMain ? '(main) ' : ''}
                        <AddrLink
                          addr={v.address}
                          network={network}
                          display={fmtAddr(v.address, network)}
                        />
                      </span>
                      <span className="text-muted-foreground shrink-0 ml-2">
                        {v.isBanned ? 'banned' : 'active'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Field
              label="Validator address"
              value={validatorAddr}
              onChange={withClear(setValidatorAddr, 'validatorAddr')}
              placeholder="UQ..."
              error={fieldErrors.validatorAddr}
            />
            <RoundAllowanceSelect
              value={roundAllowance}
              onChange={(v) => {
                setRoundAllowance(v);
                clearErr('roundAllowance');
              }}
            />
            <label className="flex flex-col gap-1 text-left">
              <span className="text-muted-foreground text-[12px]">
                Per-validator limit
              </span>
              <select
                value={addValLimitType}
                onChange={(e) =>
                  setAddValLimitType(
                    e.target.value as 'global' | 'ton' | 'share',
                  )
                }
                className="h-9 rounded-md border border-input bg-background px-3 text-[13px]"
              >
                <option value="global">Global (use pool limits)</option>
                <option value="ton">GRAM max</option>
                <option value="share">Share max</option>
              </select>
            </label>
            {addValLimitType === 'global' && globalMinTon && globalMaxTon && (
              <p className="text-muted-foreground text-[12px]">
                Validator will use the pool's global range:{' '}
                <span className="font-mono">
                  {fromNano(globalMinTon)} – {fromNano(globalMaxTon)} GRAM
                </span>
              </p>
            )}
            {addValLimitType === 'ton' && (
              <>
                <Field
                  label={
                    globalMinTon && globalMaxTon
                      ? `Max GRAM (pool range: ${fromNano(globalMinTon)} – ${fromNano(globalMaxTon)})`
                      : 'Max GRAM'
                  }
                  type="number"
                  value={addValLimitTonMax}
                  onChange={withClear(
                    setAddValLimitTonMax,
                    'addValLimitTonMax',
                  )}
                  error={fieldErrors.addValLimitTonMax}
                />
                {globalMinTon && globalMaxTon && (
                  <p className="text-muted-foreground text-[12px]">
                    Pool range:{' '}
                    <span className="font-mono">
                      {fromNano(globalMinTon)} – {fromNano(globalMaxTon)} GRAM
                    </span>
                    {networkMinStake && networkMaxStake && (
                      <>
                        {' · '}
                        Network:{' '}
                        <span className="font-mono">
                          {fromNano(networkMinStake)} –{' '}
                          {fromNano(networkMaxStake)} GRAM
                        </span>
                      </>
                    )}
                  </p>
                )}
              </>
            )}
            {addValLimitType === 'share' && (
              <ShareInput
                share={addValLimitShareMax}
                onShareChange={setAddValLimitShareMax}
                mode={addValShareMode}
                onModeChange={setAddValShareMode}
                percentInput={addValPercentInput}
                onPercentInputChange={setAddValPercentInput}
                label="Max share"
                subject="projected balance"
                error={fieldErrors.addValLimitShareMax}
                onClearError={() => clearErr('addValLimitShareMax')}
                projectedBalance={projectedBalance}
              />
            )}
            <Field
              label="Message value (GRAM)"
              type="number"
              value={addValMsgValue}
              onChange={withClear(setAddValMsgValue, 'addValMsgValue')}
            />
            <Button onClick={onAddValidator} disabled={busy || !isOwner}>
              Add validator{!isOwner && ' (not owner)'}
            </Button>
          </>
        )}

        {tab === 'remove-validator' && (
          <>
            <h2 className="text-[15px] font-semibold">Remove validator</h2>
            <p className="text-muted-foreground text-[12px]">
              The main validator cannot be removed. Validators with outstanding
              stake are banned and purged after recovery.
            </p>
            <label className="flex flex-col gap-1 text-left">
              <span className="text-muted-foreground text-[12px]">
                Validator
              </span>
              {validators && validators.length > 0 ? (
                <select
                  value={validatorAddr}
                  onChange={(e) => {
                    setValidatorAddr(e.target.value);
                    clearErr('validatorAddr');
                  }}
                  className="h-9 rounded-md border border-input bg-background px-3 text-[13px] font-mono"
                >
                  <option value="">Select a validator...</option>
                  {validators
                    .filter((v) => !v.isMain)
                    .map((v) => (
                      <option key={v.address} value={v.address}>
                        {fmtAddr(v.address, network)}
                        {v.isBanned ? ' (banned)' : ''}
                      </option>
                    ))}
                </select>
              ) : (
                <input
                  value={validatorAddr}
                  onChange={(e) => {
                    setValidatorAddr(e.target.value);
                    clearErr('validatorAddr');
                  }}
                  placeholder={poolAddress ? 'No validators loaded' : 'UQ...'}
                  className="h-9 rounded-md border border-input bg-background px-3 text-[13px] font-mono outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              )}
            </label>
            {validatorAddr && validators && (
              <p className="text-muted-foreground text-[12px]">
                {(() => {
                  const v = validators.find((x) => x.address === validatorAddr);
                  if (!v) return null;
                  return (
                    <>
                      round parity: {v.roundParity.toString()} ·{' '}
                      {v.isBanned ? 'banned' : 'active'}
                      {v.limit
                        ? ` · limit: ${v.limit.$ === 'ValidatorLimitTon' ? `${fromNano(v.limit.maxTon)} GRAM` : `share ${v.limit.maxShare}/${SHARE_BASE}`}`
                        : ' · no individual limit'}
                    </>
                  );
                })()}
              </p>
            )}
            <Field
              label="Message value (GRAM)"
              type="number"
              value={msgValue}
              onChange={withClear(setMsgValue, 'msgValue')}
              error={fieldErrors.msgValue}
            />
            <Button
              onClick={onRemoveValidator}
              disabled={busy || !isOwner || !validatorAddr}
            >
              Remove validator{!isOwner && ' (not owner)'}
            </Button>
          </>
        )}

        {tab === 'owner-withdrawal' && (
          <>
            <h2 className="text-[15px] font-semibold">Owner withdrawal</h2>
            <p className="text-muted-foreground text-[12px]">
              Withdraws owner share from the pool. Use "Use max" to withdraw the
              full available amount.
            </p>
            {ownerShareInfo !== undefined && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground text-[12px]">
                    Available to withdraw:
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[13px]">
                      {roundToFrac(
                        ownerShareInfo.available < 0n
                          ? 0n
                          : ownerShareInfo.available,
                        2,
                      )}{' '}
                      GRAM
                    </span>
                    <button
                      className="text-primary text-[12px] shrink-0"
                      onClick={() =>
                        setWithdrawAmount(
                          roundToFrac(
                            ownerShareInfo.available < 0n
                              ? 0n
                              : ownerShareInfo.available,
                            2,
                          ),
                        )
                      }
                    >
                      Use max
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground text-[12px]">
                    Total owner share:
                  </span>
                  <span className="font-mono text-[13px] text-muted-foreground">
                    {roundToFrac(ownerShareInfo.ownerShare, 2)} GRAM
                  </span>
                </div>
              </div>
            )}
            <Field
              label="Amount (GRAM)"
              type="number"
              value={withdrawAmount}
              onChange={withClear(setWithdrawAmount, 'withdrawAmount')}
            />
            <Field
              label="Message value (GRAM)"
              type="number"
              value={msgValue}
              onChange={withClear(setMsgValue, 'msgValue')}
              error={fieldErrors.msgValue}
            />
            <Button onClick={onOwnerWithdrawal} disabled={busy || !isOwner}>
              Withdraw{!isOwner && ' (not owner)'}
            </Button>
          </>
        )}

        {tab === 'update-validator-limits' && (
          <>
            <h2 className="text-[15px] font-semibold">
              Update global validator limits
            </h2>
            {networkMinStake && networkMaxStake && (
              <p className="text-muted-foreground text-[12px]">
                Network range:{' '}
                <span className="font-mono">
                  {fromNano(networkMinStake)} – {fromNano(networkMaxStake)} GRAM
                </span>
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 items-start">
              <Field
                label="Min GRAM/validator"
                type="number"
                value={gMinTon}
                onChange={withClear(setGMinTon, 'gMinTon')}
                error={fieldErrors.gMinTon}
              />
              <Field
                label="Max GRAM/validator"
                type="number"
                value={gMaxTon}
                onChange={withClear(setGMaxTon, 'gMaxTon')}
                error={fieldErrors.gMaxTon}
              />
            </div>
            <Field
              label="Refund bonus (GRAM)"
              type="number"
              value={gRefundBonus}
              onChange={withClear(setGRefundBonus, 'gRefundBonus')}
            />
            <Field
              label="Message value (GRAM)"
              type="number"
              value={msgValue}
              onChange={withClear(setMsgValue, 'msgValue')}
            />
            <Button
              onClick={onUpdateValidatorLimits}
              disabled={busy || !isOwner}
            >
              Update limits{!isOwner && ' (not owner)'}
            </Button>
          </>
        )}

        {tab === 'update-nominator-limits' && (
          <>
            <h2 className="text-[15px] font-semibold">
              Update nominator limits
            </h2>
            <div className="grid grid-cols-2 gap-3 items-start">
              <Field
                label="Max nominators (0..1023)"
                type="number"
                value={maxNominators}
                onChange={withClear(setMaxNominators, 'maxNominators')}
                error={fieldErrors.maxNominators}
              />
              <Field
                label="Min stake (GRAM)"
                type="number"
                value={minStake}
                onChange={withClear(setMinStake, 'minStake')}
              />
            </div>
            <Field
              label="Message value (GRAM)"
              type="number"
              value={msgValue}
              onChange={withClear(setMsgValue, 'msgValue')}
            />
            <Button
              onClick={onUpdateNominatorLimits}
              disabled={busy || !isOwner}
            >
              Update limits{!isOwner && ' (not owner)'}
            </Button>
          </>
        )}

        {tab === 'update-validator-limit' && (
          <>
            <h2 className="text-[15px] font-semibold">
              Update individual validator limit
            </h2>
            <label className="flex flex-col gap-1 text-left">
              <span className="text-muted-foreground text-[12px]">
                Validator
              </span>
              {validators && validators.length > 0 ? (
                <select
                  value={validatorAddr}
                  onChange={(e) => {
                    setValidatorAddr(e.target.value);
                    clearErr('validatorAddr');
                  }}
                  className="h-9 rounded-md border border-input bg-background px-3 text-[13px] font-mono"
                >
                  <option value="">Select a validator...</option>
                  {validators.map((v) => (
                    <option key={v.address} value={v.address}>
                      {v.isMain ? '(main) ' : ''}
                      {fmtAddr(v.address, network)}
                      {v.isBanned ? ' (banned)' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={validatorAddr}
                  onChange={(e) => {
                    setValidatorAddr(e.target.value);
                    clearErr('validatorAddr');
                  }}
                  placeholder={poolAddress ? 'No validators loaded' : 'UQ...'}
                  className="h-9 rounded-md border border-input bg-background px-3 text-[13px] font-mono outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              )}
            </label>
            {validatorAddr && validators && (
              <p className="text-muted-foreground text-[12px]">
                {(() => {
                  const v = validators.find((x) => x.address === validatorAddr);
                  if (!v) return null;
                  return (
                    <>
                      {v.isMain ? '(main)' : 'extra'} · round parity:{' '}
                      {v.roundParity.toString()} ·{' '}
                      {v.isBanned ? 'banned' : 'active'}
                      {v.limit
                        ? ` · current limit: ${v.limit.$ === 'ValidatorLimitTon' ? `${fromNano(v.limit.maxTon)} GRAM` : `share ${v.limit.maxShare}/${SHARE_BASE}`}`
                        : ' · no individual limit'}
                    </>
                  );
                })()}
              </p>
            )}
            <label className="flex flex-col gap-1 text-left">
              <span className="text-muted-foreground text-[12px]">
                Limit type
              </span>
              <select
                value={limitType}
                onChange={(e) =>
                  setLimitType(e.target.value as 'ton' | 'share')
                }
                className="h-9 rounded-md border border-input bg-background px-3 text-[13px]"
              >
                <option value="ton">GRAM max</option>
                <option value="share">Share max</option>
              </select>
            </label>
            {limitType === 'ton' ? (
              <>
                <Field
                  label={
                    globalMinTon && globalMaxTon
                      ? `Max GRAM (pool range: ${fromNano(globalMinTon)} – ${fromNano(globalMaxTon)})`
                      : 'Max GRAM'
                  }
                  type="number"
                  value={limitTonMax}
                  onChange={withClear(setLimitTonMax, 'limitTonMax')}
                  error={fieldErrors.limitTonMax}
                />
                {networkMinStake && networkMaxStake && (
                  <p className="text-muted-foreground text-[12px]">
                    Network range:{' '}
                    <span className="font-mono">
                      {fromNano(networkMinStake)} – {fromNano(networkMaxStake)}{' '}
                      GRAM
                    </span>
                  </p>
                )}
              </>
            ) : (
              <ShareInput
                share={limitShareMax}
                onShareChange={setLimitShareMax}
                mode={limitShareMode}
                onModeChange={setLimitShareMode}
                percentInput={limitPercentInput}
                onPercentInputChange={setLimitPercentInput}
                label="Max share"
                subject="projected balance"
                error={fieldErrors.limitShareMax}
                onClearError={() => clearErr('limitShareMax')}
                projectedBalance={projectedBalance}
              />
            )}
            <Field
              label="Message value (GRAM)"
              type="number"
              value={msgValue}
              onChange={withClear(setMsgValue, 'msgValue')}
            />
            <Button
              onClick={onUpdateValidatorLimit}
              disabled={busy || !isOwner}
            >
              Update limit{!isOwner && ' (not owner)'}
            </Button>
          </>
        )}

        {tab === 'recover-stake' && (
          <>
            <h2 className="text-[15px] font-semibold">Recover stake</h2>
            <p className="text-muted-foreground text-[12px]">
              Owner-only unrestricted stake recovery. Forwards the specified
              amount to the validator's proxy to recover its stake from the
              elector. The contract enforces the recovery timing window; ensure
              enough message value to cover the amount plus gas.
            </p>
            <label className="flex flex-col gap-1 text-left">
              <span className="text-muted-foreground text-[12px]">
                Validator
              </span>
              {validators && validators.length > 0 ? (
                <select
                  value={validatorAddr}
                  onChange={(e) => {
                    setValidatorAddr(e.target.value);
                    clearErr('validatorAddr');
                  }}
                  className="h-9 rounded-md border border-input bg-background px-3 text-[13px] font-mono"
                >
                  <option value="">Select a validator...</option>
                  {validators.map((v) => (
                    <option key={v.address} value={v.address}>
                      {v.isMain ? '(main) ' : ''}
                      {fmtAddr(v.address, network)}
                      {v.isBanned ? ' (banned)' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={validatorAddr}
                  onChange={(e) => {
                    setValidatorAddr(e.target.value);
                    clearErr('validatorAddr');
                  }}
                  placeholder={poolAddress ? 'No validators loaded' : 'UQ...'}
                  className="h-9 rounded-md border border-input bg-background px-3 text-[13px] font-mono outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              )}
            </label>
            {validatorAddr && validators && (
              <div className="flex flex-col gap-1 text-[12px] text-muted-foreground">
                {(() => {
                  const v = validators.find((x) => x.address === validatorAddr);
                  if (!v) return null;
                  return (
                    <p>
                      {v.isBanned ? 'banned' : 'active'} · usage state:{' '}
                      {v.usageState.toString()}
                    </p>
                  );
                })()}
                {rviLoading && (
                  <p className="text-muted-foreground">Loading rotation...</p>
                )}
                {recoverValidatorInfo &&
                  (() => {
                    // Mirror the contract's closest-round selection:
                    //   roundBitIdx = toBitIndex(roundIndex - 1) = 2 - ((roundIndex-1) & 1)
                    //   if (usageState & roundBitIdx) == 0 → roundBitIdx += 1
                    //   roundBitIdx & 1 → odd round (prevRoundUsage when parity matches)
                    const info = recoverValidatorInfo;
                    const roundIndex = Number(info.roundIndex);
                    const usageState =
                      validators?.find((x) => x.address === validatorAddr)
                        ?.usageState ?? 0n;
                    let bitIdx = 2 - ((roundIndex - 1) & 1);
                    if ((Number(usageState) & bitIdx) === 0) bitIdx += 1;
                    // bitIdx 1 → odd parity → curRoundUsage if roundIndex is odd
                    // bitIdx 2 → even parity → prevRoundUsage
                    const isOdd = (bitIdx & 1) === 1;
                    const closest = isOdd
                      ? info.usage.curRoundUsage
                      : info.usage.prevRoundUsage;
                    if (!closest) {
                      return (
                        <p>
                          No usage record for the closest round (stake may
                          already be recovered).
                        </p>
                      );
                    }
                    const rot = closest.usage.rotation;
                    const heldFor = closest.usage.heldFor;
                    const rotTime = Number(rot.rotationTime);
                    const eligible = rot.rotationCount >= 2n;
                    const eligibleAt =
                      rot.rotationCount === 2n
                        ? rotTime + Number(heldFor) + 60
                        : 0;
                    const now = Math.floor(Date.now() / 1000);
                    const timeLeft = eligibleAt > 0 ? eligibleAt - now : 0;
                    return (
                      <>
                        <p>
                          closest round: {isOdd ? 'odd (cur)' : 'even (prev)'} ·{' '}
                          ton used: {fromNano(closest.usage.tonUsed)} GRAM
                        </p>
                        <p>
                          rotation count: {rot.rotationCount.toString()} ·{' '}
                          rotation time:{' '}
                          {rotTime > 0
                            ? new Date(rotTime * 1000).toLocaleString()
                            : '—'}
                        </p>
                        <p
                          className={eligible ? 'text-success' : 'text-warning'}
                        >
                          {eligible
                            ? timeLeft > 0
                              ? `eligible in ${Math.ceil(timeLeft / 60)} min`
                              : 'eligible for recovery'
                            : 'not yet eligible (needs 2 rotations)'}
                        </p>
                      </>
                    );
                  })()}
              </div>
            )}
            <Field
              label="Recovery message value (GRAM, max 1)"
              type="number"
              value={recoverAmount}
              onChange={withClear(setRecoverAmount, 'recoverAmount')}
              error={fieldErrors.recoverAmount}
            />
            <Field
              label="Message value (GRAM)"
              type="number"
              value={msgValue}
              onChange={withClear(setMsgValue, 'msgValue')}
              error={fieldErrors.msgValue}
            />
            <Button
              onClick={onRecoverStake}
              disabled={
                busy ||
                !validatorAddr ||
                (recoverValidatorInfo !== undefined && !recoverEligible)
              }
            >
              Recover stake
            </Button>
          </>
        )}

        {tab === 'update-vset' && (
          <>
            <h2 className="text-[15px] font-semibold">Update validator set</h2>
            <p className="text-muted-foreground text-[12px]">
              Advances the pool's validator set to the current round. Anyone can
              send this — it's not owner-only.
            </p>
            <Field
              label="Message value (GRAM)"
              type="number"
              value={msgValue}
              onChange={withClear(setMsgValue, 'msgValue')}
              error={fieldErrors.msgValue}
            />
            <Button onClick={onUpdateVset} disabled={busy}>
              Update vset
            </Button>
          </>
        )}

        {tab === 'update-whitelist' && (
          <>
            <h2 className="text-[15px] font-semibold">
              Update nominators whitelist
            </h2>
            <p className="text-muted-foreground text-[12px]">
              An empty list clears the restriction (open to all). Adding entries
              restricts deposits to listed addresses only.
            </p>
            {wlEntries.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-[12px]">
                  Whitelist ({wlEntries.length}):
                </span>
                {wlEntries.map((a, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-md border px-3 py-1.5 text-[12px] font-mono"
                  >
                    <AddrLink
                      addr={a}
                      network={network}
                      display={fmtAddr(a, network)}
                    />
                    <button
                      className="text-destructive ml-2 shrink-0"
                      onClick={() => {
                        setWlEntries(wlEntries.filter((_, j) => j !== i));
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            {wlEntries.length === 0 && (
              <p className="text-muted-foreground text-[12px]">
                Whitelist is empty (open to all).
              </p>
            )}
            <div className="flex gap-2">
              <input
                value={wlInput}
                onChange={(e) => {
                  setWlInput(e.target.value);
                  clearErr('wlInput');
                }}
                placeholder="UQ..."
                className={
                  'h-9 flex-1 rounded-md border bg-background px-3 text-[13px] font-mono outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ' +
                  (fieldErrors.wlInput ? 'border-destructive' : 'border-input')
                }
              />
              <Button
                variant="outline"
                onClick={() => {
                  const trimmed = wlInput.trim();
                  if (!trimmed) return;
                  if (!isValidAddress(trimmed)) {
                    setErr('wlInput', 'Invalid address format');
                    return;
                  }
                  clearErr('wlInput');
                  const normalized = fmtAddr(trimmed, network);
                  if (!wlEntries.includes(normalized)) {
                    setWlEntries([...wlEntries, normalized]);
                  }
                  setWlInput('');
                }}
              >
                Add
              </Button>
            </div>
            {fieldErrors.wlInput && (
              <span className="text-destructive text-[11px] leading-tight">
                {fieldErrors.wlInput}
              </span>
            )}
            <Field
              label="Message value (GRAM)"
              type="number"
              value={msgValue}
              onChange={withClear(setMsgValue, 'msgValue')}
            />
            <Button onClick={onUpdateWhitelist} disabled={busy || !isOwner}>
              {wlEntries.length === 0 ? 'Clear whitelist' : 'Update whitelist'}
              {!isOwner && ' (not owner)'}
            </Button>
          </>
        )}
      </section>

      <div className="text-muted-foreground text-[12px] flex flex-col gap-1">
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-[12px]">Pool</span>
          <AddrLink addr={poolAddress} network={network} bounceable />
        </div>
      </div>
    </div>
  );
}
