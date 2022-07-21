import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { Token } from '@uniswap/sdk-core'
import { getContracts, Pool, SupportedChainId } from '../src'
import { RPC_URL } from './00-keys'

// Prepare Provider using ethers.js
const provider = new StaticJsonRpcProvider(RPC_URL, 4)

// Prepare Contract instances
const { hub } = getContracts(SupportedChainId.RINKEBY, provider)

;(async function () {
  // Create token instances
  const USDC = new Token(4, '0xC6399e9E8D6d70A2aA1fc6ade21F56567f6c7862', 6, 'USDC', 'USD Coin')
  const WETH = new Token(4, '0xc778417e063141139fce010982780140aa0cd5ab', 18, 'WETH', 'Wrapped Ether')

  // Compute pool id
  const poolId = Pool.computePoolId(USDC, WETH)

  // Fetch chain data
  const [tickSpacing] = await hub.getPoolParameters(poolId) // 25
  const tiersData = await hub.getAllTiers(poolId)

  console.log(tiersData)

  // Create a Pool instance
  const pool = Pool.fromChainData(USDC, WETH, tickSpacing, tiersData)

  console.log(pool.tiers[0].token1Price.toSignificant(10)) // 1341.551311
})()
