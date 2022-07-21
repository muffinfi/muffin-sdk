import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { Wallet } from '@ethersproject/wallet'
import { CurrencyAmount, Percent, Token, TradeType } from '@uniswap/sdk-core'
import {
  encodeRouteToPath,
  getContracts,
  MaxUint256,
  MAX_TIER_CHOICES,
  Pool,
  Route,
  SupportedChainId,
  SwapManager,
  Trade,
} from '../src'
import { PRIVATE_KEY, RPC_URL } from './00-keys'

// Prepare Provider and Signer using ethers.js
const provider = new StaticJsonRpcProvider(RPC_URL, 4)
const signer = new Wallet(PRIVATE_KEY, provider)

// Prepare Contract instances
const { hub, manager, lens } = getContracts(SupportedChainId.RINKEBY, provider)

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
  // Create token instances
  const USDC = new Token(4, '0xC6399e9E8D6d70A2aA1fc6ade21F56567f6c7862', 6, 'USDC', 'USD Coin')
  const WETH = new Token(4, '0xc778417e063141139fce010982780140aa0cd5ab', 18, 'WETH', 'Wrapped Ether')

  // Create a Route instance
  const pool = await getPool(USDC, WETH)
  const route = new Route([pool], [MAX_TIER_CHOICES], WETH, USDC)

  // Simulate a swap
  const amountIn = 10 ** 12 // 0.000001 WETH
  const { amountOut } = await lens.simulate(encodeRouteToPath(route, false), amountIn.toString())

  console.log('input amount:  ', amountIn.toString()) // "1000000000000"
  console.log('output amount: ', amountOut.toString()) // "1340"

  // Create a Trade instance
  const trade = Trade.createUncheckedTrade({
    route,
    tradeType: TradeType.EXACT_INPUT,
    inputAmount: CurrencyAmount.fromRawAmount(WETH, amountIn.toString()),
    outputAmount: CurrencyAmount.fromRawAmount(USDC, amountOut.toString()),
  })

  // Construct callata to swap via manager contract
  const { calldata } = SwapManager.swapCallParameters([trade], {
    recipient: signer.address,
    fromAccount: false,
    toAccount: false,
    slippageTolerance: new Percent(1, 100),
    deadline: MaxUint256,
  })

  // Send transaction
  const tx = await signer.sendTransaction({ from: signer.address, to: manager.address, data: calldata })

  console.log(tx)
})()
