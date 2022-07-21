import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { Wallet } from '@ethersproject/wallet'
import { Percent, Token } from '@uniswap/sdk-core'
import { getContracts, Pool, Position, PositionManager, Range, SupportedChainId } from '../src'
import { PRIVATE_KEY, RPC_URL } from './00-keys'

// Prepare Provider and Signer using ethers.js
const provider = new StaticJsonRpcProvider(RPC_URL, 4)
const signer = new Wallet(PRIVATE_KEY, provider)

// Prepare Contract instances
const { hub, manager } = getContracts(SupportedChainId.RINKEBY, provider)

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

  // Create a Pool instance
  const pool = await getPool(USDC, WETH)

  // Construct a range that is about 500 — 2000 USDC per WETH
  const range = Range.fromPriceStringInput(WETH, USDC, '500', '2000', pool.tickSpacing)

  console.log('Lower tick:  ', range.tickLower) // 200300
  console.log('Upper tick:  ', range.tickUpper) // 214200
  console.log('Lower price: ', range.quotePriceLower.toSignificant(7)) // 498.7436
  console.log('Upper price: ', range.quotePriceUpper.toSignificant(7)) // 2002.241

  /**
   * Create a Position instance.
   * We specify the maxmium amounts of tokens we're willing to put into the position.
   */
  const maxInputWETH = 10 ** 12 // 0.000001 WETH
  const maxInputUSDC = 1400 // 0.0014 USDC
  const position = Position.fromAmounts({
    pool,
    tierId: 0,
    tickLower: range.tickLower,
    tickUpper: range.tickUpper,
    amount0: pool.token0 === WETH ? maxInputWETH : maxInputUSDC,
    amount1: pool.token1 === WETH ? maxInputWETH : maxInputUSDC,
  })

  console.log(`Input ${pool.token0.symbol} amount: `, position.mintAmounts.amount0.toString())
  console.log(`Input ${pool.token1.symbol} amount: `, position.mintAmounts.amount1.toString())

  // Construct callata to mint position NFT
  const { calldata } = PositionManager.addCallParameters(position, {
    recipient: signer.address,
    useAccount: false,
    slippageTolerance: new Percent(1, 100),
  })

  // Send transaction
  const tx = await signer.sendTransaction({ from: signer.address, to: manager.address, data: calldata })

  console.log(tx)
})()
