import { useWriteContract, useWaitForTransactionReceipt, useAccount, useSwitchChain, useReadContract } from 'wagmi'
import { parseUnits, erc20Abi, maxUint256 } from 'viem'
import {
  BILLSWIPE_ABI, getBillSwipeAddress, USDC_ADDRESS_BY_CHAIN,
  USDC_DECIMALS, ARC_TESTNET_ID, ARC_MAINNET_ID, isArcChain,
} from '../contract'

/** Returns the Arc chain ID the wallet is on, defaulting to testnet. */
function useArcChainId() {
  const { chainId } = useAccount()
  return isArcChain(chainId) ? chainId : ARC_TESTNET_ID
}

export function usePayBill() {
  const { chainId, address } = useAccount()
  const { switchChain } = useSwitchChain()
  const arcChainId = useArcChainId()
  const contractAddress = getBillSwipeAddress(arcChainId)
  const usdcAddress = USDC_ADDRESS_BY_CHAIN[arcChainId]

  // Read current allowance — used to skip the approve step when pre-approved
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, contractAddress] : undefined,
    query: { enabled: !!address },
  })

  // Separate hooks so approve hash doesn't overwrite pay hash
  const approve = useWriteContract()
  const pay     = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: pay.data })

  const wrongChain  = !isArcChain(chainId)
  const isPending   = approve.isPending || pay.isPending
  const isApproved  = allowance !== undefined && allowance >= maxUint256 / 2n

  async function payBill(billId: bigint, amountUSDC: string, txNote: string) {
    if (wrongChain) {
      switchChain({ chainId: isArcChain(chainId) ? chainId : ARC_TESTNET_ID })
      return
    }
    const amountRaw = parseUnits(amountUSDC, USDC_DECIMALS)
    // Only approve if current allowance is insufficient
    if (!allowance || allowance < amountRaw) {
      await approve.writeContractAsync({
        address: usdcAddress,
        abi: erc20Abi,
        functionName: 'approve',
        args: [contractAddress, amountRaw],
      })
    }
    await pay.writeContractAsync({
      address: contractAddress,
      abi: BILLSWIPE_ABI,
      functionName: 'payBill',
      args: [billId, txNote],
    })
  }

  async function contribute(billId: bigint, amountUSDC: string, txNote: string) {
    if (wrongChain) {
      switchChain({ chainId: isArcChain(chainId) ? chainId : ARC_TESTNET_ID })
      return
    }
    const amountRaw = parseUnits(amountUSDC, USDC_DECIMALS)
    if (!allowance || allowance < amountRaw) {
      await approve.writeContractAsync({
        address: usdcAddress,
        abi: erc20Abi,
        functionName: 'approve',
        args: [contractAddress, amountRaw],
      })
    }
    await pay.writeContractAsync({
      address: contractAddress,
      abi: BILLSWIPE_ABI,
      functionName: 'contribute',
      args: [billId, amountRaw, txNote],
    })
  }

  function reset() {
    approve.reset()
    pay.reset()
    void refetchAllowance()
  }

  return {
    payBill, contribute, isPending, isConfirming, isSuccess, isApproved,
    hash: pay.data, error: pay.error ?? approve.error, reset, wrongChain,
    allowance,
  }
}

export function useCreateBill() {
  const { chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const arcChainId      = useArcChainId()
  const contractAddress = getBillSwipeAddress(arcChainId)
  const { writeContractAsync, isPending, data: hash, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const wrongChain = !isArcChain(chainId)

  async function createBill(
    amountUSDC: string,
    metadataURI: string,
    deadlineTs: number,
    payoutAddress: `0x${string}` = '0x0000000000000000000000000000000000000000',
  ) {
    if (wrongChain) {
      switchChain({ chainId: isArcChain(chainId) ? chainId : ARC_TESTNET_ID })
      return
    }
    const amountRaw = parseUnits(amountUSDC, USDC_DECIMALS)
    await writeContractAsync({
      address: contractAddress,
      abi: BILLSWIPE_ABI,
      functionName: 'createBill',
      args: [amountRaw, metadataURI, BigInt(deadlineTs), payoutAddress],
    })
  }

  return { createBill, isPending, isConfirming, isSuccess, hash, error, reset, wrongChain }
}

export function usePassBill() {
  const arcChainId      = useArcChainId()
  const contractAddress = getBillSwipeAddress(arcChainId)
  const { writeContractAsync } = useWriteContract()
  async function passBill(billId: bigint) {
    await writeContractAsync({ address: contractAddress, abi: BILLSWIPE_ABI, functionName: 'passBill', args: [billId] })
  }
  return { passBill }
}

export function useCancelBill() {
  const arcChainId      = useArcChainId()
  const contractAddress = getBillSwipeAddress(arcChainId)
  const { writeContractAsync, isPending, data: hash } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  async function cancelBill(billId: bigint) {
    await writeContractAsync({ address: contractAddress, abi: BILLSWIPE_ABI, functionName: 'cancelBill', args: [billId] })
  }
  return { cancelBill, isPending, isConfirming, isSuccess }
}

// Re-export for backward compat (ARC_MAINNET_ID used in other files)
export { ARC_MAINNET_ID }
