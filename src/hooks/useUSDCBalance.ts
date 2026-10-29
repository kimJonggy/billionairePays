import { useReadContract, useAccount } from 'wagmi'
import { erc20Abi, formatUnits } from 'viem'
import { USDC_ADDRESS_BY_CHAIN, USDC_DECIMALS, ARC_TESTNET_ID, isArcChain } from '../contract'

export function useUSDCBalance(address: `0x${string}` | undefined) {
  const { chainId } = useAccount()
  const arcChainId  = isArcChain(chainId) ? chainId : ARC_TESTNET_ID
  const usdcAddress = USDC_ADDRESS_BY_CHAIN[arcChainId]

  const { data, isLoading, refetch } = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: arcChainId,
    query: { enabled: !!address, refetchInterval: 8000 },
  })
  const raw       = data ?? 0n
  const formatted = formatUnits(raw, USDC_DECIMALS)
  const display   = parseFloat(formatted).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return { raw, formatted, display, isLoading, refetch }
}
