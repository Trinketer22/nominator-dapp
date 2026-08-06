// Shared react-query keys for pool data. Both PoolInfoPanel and PoolOpsPanel
// use these so they share the same cache, and operations can invalidate them
// after a transaction to force a refetch.
export const poolQueryKeys = {
  info: (network: string, poolAddress: string) =>
    ['pool-info', network, poolAddress] as const,
  limits: (network: string, poolAddress: string) =>
    ['pool-limits', network, poolAddress] as const,
  validators: (network: string, poolAddress: string) =>
    ['pool-validators', network, poolAddress] as const,
  networkStakingLimits: (network: string) =>
    ['network-staking-limits', network] as const,
  roundInfos: (network: string, poolAddress: string) =>
    ['pool-round-infos', network, poolAddress] as const,
  stakeReturneds: (network: string, poolAddress: string) =>
    ['pool-stake-returneds', network, poolAddress] as const,
  liveRounds: (network: string, poolAddress: string) =>
    ['pool-live-rounds', network, poolAddress] as const,
};

// Invalidate all pool-specific queries (info, limits, validators) for a given
// network + pool address. Called after any owner operation mutates on-chain state.
export function invalidatePoolQueries(
  queryClient: { invalidateQueries: (q: { queryKey: unknown[] }) => void },
  network: string,
  poolAddress: string,
): void {
  queryClient.invalidateQueries({
    queryKey: ['pool-info', network, poolAddress],
  });
  queryClient.invalidateQueries({
    queryKey: ['pool-limits', network, poolAddress],
  });
  queryClient.invalidateQueries({
    queryKey: ['pool-validators', network, poolAddress],
  });
  queryClient.invalidateQueries({
    queryKey: ['pool-whitelist', network, poolAddress],
  });
  queryClient.invalidateQueries({
    queryKey: ['pool-max-owner-share', network, poolAddress],
  });
  queryClient.invalidateQueries({
    queryKey: ['pool-owner-share', network, poolAddress],
  });
  queryClient.invalidateQueries({
    queryKey: ['pool-owner', network, poolAddress],
  });
  queryClient.invalidateQueries({
    queryKey: ['pool-round-infos', network, poolAddress],
  });
  queryClient.invalidateQueries({
    queryKey: ['pool-stake-returneds', network, poolAddress],
  });
  queryClient.invalidateQueries({
    queryKey: ['pool-live-rounds', network, poolAddress],
  });
}
