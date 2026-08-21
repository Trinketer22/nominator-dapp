import { fromNano } from '@ton/core';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { useRouter } from '@/lib/router';
import { poolQueryKeys } from '@/lib/query-keys';
import {
  getGlobalLimitsMismatch,
  getLimitsPerValidator,
  getNetworkStakingLimits,
} from '@/lib/pool';

// Global banner shown when the pool's stored global validator limits fall
// outside the current network staking range (config param 17) — e.g. after a
// network config change. The contract re-checks the stored limits against the
// live network config on every NewStake (errors 98/99), so in this state all
// validator stakes are rejected until the owner updates the global limits.
export function PoolLimitsAlert({
  poolAddress,
  onOpenGlobalLimits,
}: {
  poolAddress: string;
  onOpenGlobalLimits: () => void;
}) {
  const { network } = useRouter();

  // Shares the cache with the ops panels (same query keys). The network
  // staking config is polled so a settings change is noticed while the app
  // stays open; the pool limits are invalidated after every owner operation.
  const { data: globalLimits } = useQuery({
    queryKey: poolQueryKeys.limits(network, poolAddress),
    queryFn: () => getLimitsPerValidator(network, poolAddress),
  });
  const { data: networkLimits } = useQuery({
    queryKey: poolQueryKeys.networkStakingLimits(network),
    queryFn: () => getNetworkStakingLimits(network),
    refetchInterval: 60_000,
  });

  if (!globalLimits || !networkLimits) return null;

  const mismatch = getGlobalLimitsMismatch(
    {
      minTonPerValidator: globalLimits[0],
      maxTonPerValidator: globalLimits[1],
    },
    networkLimits,
  );
  if (!mismatch) return null;

  const details: string[] = [];
  if (mismatch.minBelowNetwork) {
    details.push(
      `pool min ${fromNano(globalLimits[0])} GRAM is below the network minimum ${fromNano(networkLimits.minStake)} GRAM`,
    );
  }
  if (mismatch.maxAboveNetwork) {
    details.push(
      `pool max ${fromNano(globalLimits[1])} GRAM is above the network maximum ${fromNano(networkLimits.maxStake)} GRAM`,
    );
  }

  return (
    <div className="w-full max-w-xl rounded-xl border border-warning/50 bg-warning/10 p-4 flex flex-col gap-2 text-left">
      <p className="text-[13px] font-semibold text-warning">
        Validator stakes are blocked
      </p>
      <p className="text-[13px] text-foreground/90">
        The current staking limits are outside of the network staking
        configuration. Adjust the global limits to continue operation.
      </p>
      <p className="text-muted-foreground text-[12px]">{details.join('; ')}.</p>
      <div>
        <Button size="sm" onClick={onOpenGlobalLimits}>
          Adjust global limits
        </Button>
      </div>
    </div>
  );
}
