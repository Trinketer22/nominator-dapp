import { useState } from 'react';
import { Address, fromNano } from '@ton/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Field, AddrLink } from '@/components/ui/form';
import { useRouter } from '@/lib/router';
import { invalidatePoolQueries } from '@/lib/query-keys';
import {
  SHARE_BASE,
  fmtAddr,
  getLimitsPerValidator,
  getNominatorData,
  getNominatorMinimalStake,
  getPoolBalance,
  getPoolData,
  getPoolInvariants,
  getValidatorInfo,
  getValidators,
} from '@/lib/pool';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-[13px]">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-mono text-right break-all">{value}</span>
    </div>
  );
}

function AddrRow({
  label,
  addr,
  network,
}: {
  label: string;
  addr: string;
  network: 'mainnet' | 'testnet';
}) {
  return (
    <div className="flex justify-between gap-4 py-1 text-[13px]">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <AddrLink addr={addr} network={network} />
    </div>
  );
}

export function PoolInfoPanel({ poolAddress }: { poolAddress: string }) {
  const { network } = useRouter();
  const queryClient = useQueryClient();
  const [selectedValidator, setSelectedValidator] = useState('');
  const [nominatorAddr, setNominatorAddr] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['pool-info', network, poolAddress],
    enabled: !!poolAddress,
    queryFn: async () => {
      const [poolData, limits, balance, minStake, invariants] =
        await Promise.all([
          getPoolData(network, poolAddress),
          getLimitsPerValidator(network, poolAddress),
          getPoolBalance(network, poolAddress),
          getNominatorMinimalStake(network, poolAddress),
          getPoolInvariants(network, poolAddress).catch(() => null),
        ]);
      return { poolData, limits, balance, minStake, invariants };
    },
  });

  // Shared validator list query (same key as PoolOpsPanel so it's cached).
  // getValidators returns { validators, maxNominators }; this panel only needs
  // the array (maxNominators comes from the pool-info query below).
  const { data: validatorsData } = useQuery({
    queryKey: ['pool-validators', network, poolAddress],
    enabled: !!poolAddress,
    queryFn: () => getValidators(network, poolAddress),
  });
  const validators = validatorsData?.validators;

  const selectedVal = validators?.find((v) => v.address === selectedValidator);

  // Fetch detailed validator info (incl. projected stakeable amount) for the
  // selected validator. get_validator_info may advance round state like a real
  // UpdateVset message, so it is only called when a validator is selected.
  const {
    data: validatorInfo,
    isLoading: viLoading,
    error: viError,
  } = useQuery({
    queryKey: ['pool-validator-info', network, poolAddress, selectedValidator],
    enabled: !!poolAddress && !!selectedValidator,
    queryFn: () => getValidatorInfo(network, poolAddress, selectedValidator),
  });

  // Fetch nominator data for a specific address. The getter throws if the
  // nominator is not found in the pool.
  const nmAddrValid = (() => {
    try {
      Address.parse(nominatorAddr);
      return true;
    } catch {
      return false;
    }
  })();
  const {
    data: nominatorData,
    isLoading: nmLoading,
    error: nmError,
  } = useQuery({
    queryKey: ['pool-nominator-data', network, poolAddress, nominatorAddr],
    enabled: !!poolAddress && !!nominatorAddr && nmAddrValid,
    queryFn: () => getNominatorData(network, poolAddress, nominatorAddr),
  });

  if (!poolAddress) {
    return (
      <div className="w-full max-w-md rounded-xl border p-6 text-center">
        <p className="text-muted-foreground text-[14px]">
          Enter a pool address to view its state.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl flex flex-col gap-4 text-left">
      <div className="flex items-center gap-3">
        <Button
          onClick={() => {
            invalidatePoolQueries(queryClient, network, poolAddress);
          }}
          disabled={isLoading}
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-[13px]">
          Failed to load pool data: {(error as Error).message}
        </div>
      )}

      {data && (
        <>
          <section className="rounded-xl border p-5 flex flex-col gap-1">
            <h2 className="text-[15px] font-semibold mb-2">Pool state</h2>
            <AddrRow
              label="Owner"
              addr={data.poolData.owner.toString()}
              network={network}
            />
            <Row label="Pool ID" value={data.poolData.poolId.toString()} />
            <Row label="Halted" value={String(data.poolData.halted)} />
            <Row
              label="Round closed"
              value={String(data.poolData.roundClosed)}
            />
            <Row
              label="Round index"
              value={data.poolData.roundIndex.toString()}
            />
            <Row
              label="Owner share"
              value={`${data.poolData.ownerShare} / ${SHARE_BASE}`}
            />
            <Row
              label="Pool supply"
              value={`${fromNano(data.poolData.poolSupply)} GRAM`}
            />
            <Row
              label="Nominators amount"
              value={`${fromNano(data.poolData.nominatorsAmount)} GRAM`}
            />
            <Row
              label="Pending deposits"
              value={`${fromNano(data.poolData.pendingDeposits)} GRAM`}
            />
            <Row
              label="Pending withdrawals"
              value={`${fromNano(data.poolData.pendingWithdrawals)} GRAM`}
            />
            <Row
              label="Max nominators"
              value={data.poolData.maxNominators.toString()}
            />
            <Row
              label="Pool balance"
              value={`${fromNano(data.balance)} GRAM`}
            />
          </section>

          <section className="rounded-xl border p-5 flex flex-col gap-1">
            <h2 className="text-[15px] font-semibold mb-2">
              Global validator limits
            </h2>
            <Row
              label="Min GRAM/validator"
              value={`${fromNano(data.limits[0])} GRAM`}
            />
            <Row
              label="Max GRAM/validator"
              value={`${fromNano(data.limits[1])} GRAM`}
            />
            <Row
              label="Refund bonus"
              value={`${fromNano(data.limits[2])} GRAM`}
            />
          </section>

          <section className="rounded-xl border p-5 flex flex-col gap-1">
            <h2 className="text-[15px] font-semibold mb-2">
              Nominator settings
            </h2>
            <Row
              label="Min stake"
              value={`${fromNano(data.minStake.minStake)} GRAM`}
            />
            <Row
              label="Min expected value"
              value={`${fromNano(data.minStake.minExpectedValue)} GRAM`}
            />
          </section>

          {data.invariants && (
            <section className="rounded-xl border p-5 flex flex-col gap-1">
              <h2 className="text-[15px] font-semibold mb-2">
                Nominators & invariants
              </h2>
              <Row
                label="Nominators amount"
                value={`${fromNano(data.invariants.nominatorsAmount)} GRAM`}
              />
              <Row
                label="Nominator count"
                value={data.invariants.recomputedNmCount.toString()}
              />
              <Row
                label="Recomputed supply"
                value={`${fromNano(data.invariants.recomputedSupply)} GRAM`}
              />
              <Row
                label="Recomputed GRAM amount"
                value={`${fromNano(data.invariants.recomputedTonAmount)} GRAM`}
              />
              <Row
                label="Projected balance"
                value={`${fromNano(data.invariants.projectedBalance)} GRAM`}
              />
              <div className="mt-2 flex flex-col gap-1">
                <div className="flex items-center gap-2 text-[13px]">
                  <span
                    className={
                      data.invariants.supplyMatch
                        ? 'text-success'
                        : 'text-destructive'
                    }
                  >
                    {data.invariants.supplyMatch ? '✓' : '✗'}
                  </span>
                  <span className="text-muted-foreground">Supply match</span>
                </div>
                <div className="flex items-center gap-2 text-[13px]">
                  <span
                    className={
                      data.invariants.pendingWithdrawalsMatch
                        ? 'text-success'
                        : 'text-destructive'
                    }
                  >
                    {data.invariants.pendingWithdrawalsMatch ? '✓' : '✗'}
                  </span>
                  <span className="text-muted-foreground">
                    Pending withdrawals match
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[13px]">
                  <span
                    className={
                      data.invariants.pendingDepositsMatch
                        ? 'text-success'
                        : 'text-destructive'
                    }
                  >
                    {data.invariants.pendingDepositsMatch ? '✓' : '✗'}
                  </span>
                  <span className="text-muted-foreground">
                    Pending deposits match
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[13px]">
                  <span
                    className={
                      data.invariants.nmCountMatch
                        ? 'text-success'
                        : 'text-destructive'
                    }
                  >
                    {data.invariants.nmCountMatch ? '✓' : '✗'}
                  </span>
                  <span className="text-muted-foreground">
                    Nominator count match
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[13px] font-semibold mt-1">
                  <span
                    className={
                      data.invariants.allMatch
                        ? 'text-success'
                        : 'text-destructive'
                    }
                  >
                    {data.invariants.allMatch ? '✓' : '✗'}
                  </span>
                  <span>All invariants match</span>
                </div>
              </div>
            </section>
          )}

          <section className="rounded-xl border p-5 flex flex-col gap-3">
            <h2 className="text-[15px] font-semibold mb-1">Validator info</h2>
            {validators && validators.length > 0 ? (
              <>
                <label className="flex flex-col gap-1 text-left">
                  <span className="text-muted-foreground text-[12px]">
                    Validator
                  </span>
                  <select
                    value={selectedValidator}
                    onChange={(e) => setSelectedValidator(e.target.value)}
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
                </label>
                {selectedVal && (
                  <div className="flex flex-col gap-1">
                    <Row
                      label="Role"
                      value={selectedVal.isMain ? '(main)' : 'extra'}
                    />
                    <Row label="Banned" value={String(selectedVal.isBanned)} />
                    <Row
                      label="Usage state"
                      value={selectedVal.usageState.toString()}
                    />
                    <Row
                      label="Round parity"
                      value={
                        selectedVal.roundParity === 1n
                          ? 'Odd rounds'
                          : selectedVal.roundParity === 2n
                            ? 'Even rounds'
                            : 'All rounds'
                      }
                    />
                    <Row
                      label="Even proxy"
                      value={
                        selectedVal.evenProxy
                          ? `0x${selectedVal.evenProxy.toString(16)}`
                          : 'none'
                      }
                    />
                    <Row
                      label="Odd proxy"
                      value={
                        selectedVal.oddProxy
                          ? `0x${selectedVal.oddProxy.toString(16)}`
                          : 'none'
                      }
                    />
                    <Row
                      label="Individual limit"
                      value={
                        selectedVal.limit
                          ? selectedVal.limit.$ === 'ValidatorLimitTon'
                            ? `GRAM max: ${fromNano(selectedVal.limit.maxTon)} GRAM`
                            : `Share: ${selectedVal.limit.maxShare} / ${SHARE_BASE}`
                          : 'none (uses global)'
                      }
                    />
                    {viLoading && (
                      <p className="text-muted-foreground text-[12px]">
                        Loading stakeable...
                      </p>
                    )}
                    {viError && (
                      <p className="text-destructive text-[12px]">
                        Could not load stakeable: {(viError as Error).message}
                      </p>
                    )}
                    {validatorInfo && (
                      <>
                        <Row
                          label="Stakeable"
                          value={`${fromNano(validatorInfo.stakeable)} GRAM`}
                        />
                        <Row
                          label="Projected round"
                          value={validatorInfo.roundIndex.toString()}
                        />
                        <Row
                          label="Rotated"
                          value={String(validatorInfo.rotated)}
                        />
                        <Row
                          label="Cur round stake"
                          value={
                            validatorInfo.usage.curRoundUsage
                              ? `${fromNano(validatorInfo.usage.curRoundUsage.usage.tonUsed)} GRAM`
                              : 'none'
                          }
                        />
                        {validatorInfo.usage.curRoundUsage && (
                          <>
                            <Row
                              label="Cur round held for"
                              value={`${validatorInfo.usage.curRoundUsage.usage.heldFor}`}
                            />
                            <Row
                              label="Cur round rotations"
                              value={validatorInfo.usage.curRoundUsage.usage.rotation.rotationCount.toString()}
                            />
                            <Row
                              label="Cur round rot. time"
                              value={validatorInfo.usage.curRoundUsage.usage.rotation.rotationTime.toString()}
                            />
                          </>
                        )}
                        <Row
                          label="Prev round stake"
                          value={
                            validatorInfo.usage.prevRoundUsage
                              ? `${fromNano(validatorInfo.usage.prevRoundUsage.usage.tonUsed)} GRAM`
                              : 'none'
                          }
                        />
                        {validatorInfo.usage.prevRoundUsage && (
                          <>
                            <Row
                              label="Prev round held for"
                              value={`${validatorInfo.usage.prevRoundUsage.usage.heldFor}`}
                            />
                            <Row
                              label="Prev round rotations"
                              value={validatorInfo.usage.prevRoundUsage.usage.rotation.rotationCount.toString()}
                            />
                            <Row
                              label="Prev round rot. time"
                              value={validatorInfo.usage.prevRoundUsage.usage.rotation.rotationTime.toString()}
                            />
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground text-[12px]">
                {poolAddress ? 'No validators found.' : 'Enter a pool address.'}
              </p>
            )}
          </section>

          <section className="rounded-xl border p-5 flex flex-col gap-3">
            <h2 className="text-[15px] font-semibold mb-1">Nominator info</h2>
            <Field
              label="Nominator address"
              value={nominatorAddr}
              onChange={setNominatorAddr}
              placeholder="UQ..."
            />
            {nominatorAddr && !nmAddrValid && (
              <p className="text-destructive text-[12px]">Invalid address.</p>
            )}
            {nominatorAddr && nmAddrValid && nmLoading && (
              <p className="text-muted-foreground text-[12px]">Loading...</p>
            )}
            {nominatorAddr && nmAddrValid && !nmLoading && nmError && (
              <p className="text-destructive text-[12px]">
                Nominator not found.
              </p>
            )}
            {nominatorAddr &&
              nmAddrValid &&
              !nmLoading &&
              !nmError &&
              nominatorData && (
                <div className="flex flex-col gap-1">
                  <AddrRow
                    label="Address"
                    addr={nominatorAddr}
                    network={network}
                  />
                  <Row
                    label="Amount"
                    value={`${fromNano(nominatorData.amount)} GRAM`}
                  />
                  <Row
                    label="Pending deposit"
                    value={`${fromNano(
                      nominatorData.pendingDepositAmount,
                    )} GRAM`}
                  />
                  <Row
                    label="Withdraw found"
                    value={String(nominatorData.withdrawFound)}
                  />
                  <Row
                    label="Reward"
                    value={`${fromNano(nominatorData.reward)} GRAM`}
                  />
                </div>
              )}
          </section>
        </>
      )}

      <div className="text-muted-foreground text-[12px]">
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-[12px]">Pool</span>
          <AddrLink addr={poolAddress} network={network} bounceable />
        </div>
      </div>
    </div>
  );
}
