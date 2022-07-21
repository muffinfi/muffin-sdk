import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { Token } from '@uniswap/sdk-core'
import { encodeRouteToPath, getContracts, MAX_TIER_CHOICES, Pool, Route, SupportedChainId } from '../src'
import { RPC_URL } from './00-keys'

// Prepare Provider using ethers.js
const provider = new StaticJsonRpcProvider(RPC_URL, 4)

// Prepare Contract instances
const { hub, lens } = getContracts(SupportedChainId.RINKEBY, provider)

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
  /*
  [
    {
      liquidity: BigNumber { _hex: '0x05e942307100', _isBigNumber: true },
      sqrtPrice: BigNumber { _hex: '0x6853fbec35b417ced89ca0', _isBigNumber: true },
      sqrtGamma: 99940,
      tick: 203864,
      nextTickBelow: 202600,
      nextTickAbove: 206300,
      feeGrowthGlobal0: BigNumber { _hex: '0x07af47e63b7767', _isBigNumber: true },
      feeGrowthGlobal1: BigNumber { _hex: '0x5f05848afd5b2c1fb8', _isBigNumber: true }
    }
  ]
  */

  // Create a Pool instance
  const pool = Pool.fromChainData(USDC, WETH, tickSpacing, tiersData)

  // Create a Route instance
  const route = new Route([pool], [MAX_TIER_CHOICES], WETH, USDC)

  // Simulate a swap
  const amountIn = 10 ** 14 // 0.0001 WETH
  const { amountOut } = await lens.simulate(encodeRouteToPath(route, false), amountIn.toString())

  console.log(amountOut.toString()) // "134065"
})()
