import { Contract } from '@ethersproject/contracts'
import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { Wallet } from '@ethersproject/wallet'
import { Percent, Token } from '@uniswap/sdk-core'
import { getContracts, Pool, Position, PositionManager, SupportedChainId } from '../src'
import { PRIVATE_KEY, RPC_URL } from './00-keys'

// Prepare Provider and Signer using ethers.js
const provider = new StaticJsonRpcProvider(RPC_URL, 4)
const signer = new Wallet(PRIVATE_KEY, provider)

// Prepare Contract instances
const chainId = SupportedChainId.RINKEBY
const { hub, manager, lens } = getContracts(chainId, provider)

//
async function getToken(address: string) {
  const erc20ABI = [
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function name() view returns (string)',
  ]
  const tokenContract = new Contract(address, erc20ABI, provider)

  const [symbol, decimals, name] = await Promise.all([
    tokenContract.symbol(),
    tokenContract.decimals(),
    tokenContract.name(),
  ])

  return new Token(chainId, address, decimals, symbol, name)
}

//
async function getPool(tokenA: Token, tokenB: Token) {
  // Compute pool id
  const poolId = Pool.computePoolId(tokenA, tokenB)

  // Fetch chain data
  const [tickSpacing] = await hub.getPoolParameters(poolId) // 25
  const tiersData = await hub.getAllTiers(poolId)

  // Create a Pool instance
  return Pool.fromChainData(tokenA, tokenB, tickSpacing, tiersData)
}

//
;(async function () {
  /**
   * The protocol never stores what position NFTs you own. It only stores whether you own this position given a NFT id.
   * Nonethesless, you can still use the Muffin subgraph to query the token ids you owned.
   */
  const tokenId = 23
  const positionData = await lens.getDerivedPosition(tokenId)

  // Create Token instances and a Pool instance
  const token0 = await getToken(positionData.info.token0)
  const token1 = await getToken(positionData.info.token1)
  const pool = await getPool(token0, token1)

  // Create a Position instance
  const position = new Position({
    pool,
    tierId: positionData.info.tierId,
    tickLower: positionData.info.tickLower,
    tickUpper: positionData.info.tickUpper,
    liquidityD8: positionData.position.liquidityD8.toString(),
    limitOrderType: positionData.position.limitOrderType,
    settled: positionData.settled,
  })

  // Current underlying token amounts
  console.log('token0 amount: ', position.amount0.toSignificant(7), token0.symbol)
  console.log('token1 amount: ', position.amount1.toSignificant(7), token1.symbol)

  // Construct calldata to withdraw liquidity
  const { calldata } = PositionManager.removeCallParameters(position, {
    tokenId,
    liquidityPercentage: new Percent(100, 100), // Withdraw 100% liquidity
    slippageTolerance: new Percent(1, 100),
    withdrawalRecipient: signer.address,
    collectAllFees: true,
  })

  // Send transaction
  const tx = await signer.sendTransaction({ from: signer.address, to: manager.address, data: calldata })

  console.log(tx)
})()
