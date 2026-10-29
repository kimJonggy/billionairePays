/**
 * usePreApprove — one-time max-allowance approval so future payments
 * never need an extra wallet confirmation.
 *
 * Once the payer calls approve(BillSwipe, maxUint256) this hook returns
 * isApproved=true and the PaySheet skips the approve step entirely.
 */
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useReadContract } from 'wagmi'
import { erc20Abi, maxUint256 } from 'viem'
import { getBillSwipeAddress, USDC_ADDRESS_BY_CHAIN, ARC_TESTNET_ID, isArcChain } from '../contract'

function useArcChainId() {
  const { chainId } = useAccount()
  return isArcChain(chainId) ? chainId : ARC_TESTNET_ID
}

export function usePreApprove() {
  const { address } = useAccount()
  const arcChainId  = useArcChainId()
  const contractAddress = getBillSwipeAddress(arcChainId)
  const usdcAddress     = USDC_ADDRESS_BY_CHAIN[arcChainId]

  const { data: allowance, refetch } = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, contractAddress] : undefined,
    query: { enabled: !!address, refetchInterval: 8000 },
  })

  const { writeContractAsync, isPending, data: hash, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  // Considered "pre-approved" when allowance covers at least half of maxUint256
  const isApproved = allowance !== undefined && allowance >= maxUint256 / 2n

  async function preApprove() {
    await writeContractAsync({
      address: usdcAddress,
      abi: erc20Abi,
      functionName: 'approve',
      args: [contractAddress, maxUint256],
    })
    void refetch()
  }

  return { isApproved, preApprove, isPending, isConfirming, isSuccess, error, allowance }
}
