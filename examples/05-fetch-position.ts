import { Contract } from '@ethersproject/contracts'
import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { CurrencyAmount, Price, Token } from '@uniswap/sdk-core'
import { getContracts, Pool, Position, priceToSqrtPriceX72, SupportedChainId } from '../src'
import { RPC_URL } from './00-keys'

// Prepare Provider and Signer using ethers.js
const provider = new StaticJsonRpcProvider(RPC_URL, 4)

// Prepare Contract instances
const chainId = SupportedChainId.RINKEBY
const { hub, lens } = getContracts(chainId, provider)

//
async function getToken(address: string): Promise<Token> {
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
async function getPool(tokenA: Token, tokenB: Token): Promise<Pool> {
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
   * Nonetheless, you can still use the Muffin subgraph to query the token ids you owned.
   */
  const tokenId = 23
  const positionData = await lens.getDerivedPosition(tokenId)
  /*
  {
    info: {
      owner: string
      token0: string
      token1: string
      tierId: number
      tickLower: number
      tickUpper: number
    }
    position: {
      liquidityD8: BigNumber
      feeGrowthInside0Last: BigNumber
      feeGrowthInside1Last: BigNumber
      limitOrderType: number
      settlementSnapshotId: number
    }
    settled: boolean
    amount0: BigNumber
    amount1: BigNumber
    feeAmount0: BigNumber
    feeAmount1: BigNumber
  }
  */

  // Create Token instances
  const token0 = await getToken(positionData.info.token0)
  const token1 = await getToken(positionData.info.token1)

  // Print fee amounts pending to collect
  const feeAmount0 = CurrencyAmount.fromRawAmount(token0, positionData.feeAmount0)
  const feeAmount1 = CurrencyAmount.fromRawAmount(token1, positionData.feeAmount1)
  console.log('token0 fees: ', feeAmount0.toSignificant(7), token0.symbol)
  console.log('token1 fees: ', feeAmount1.toSignificant(7), token1.symbol)

  // Create a Position instance
  const pool = await getPool(token0, token1)
  const position = new Position({
    pool,
    tierId: positionData.info.tierId,
    tickLower: positionData.info.tickLower,
    tickUpper: positionData.info.tickUpper,
    liquidityD8: positionData.position.liquidityD8.toString(),
    limitOrderType: positionData.position.limitOrderType,
    settled: positionData.settled,
  })

  // Calculate the position's underlying amounts
  console.log('token0 amount: ', position.amount0.toSignificant(7), token0.symbol)
  console.log('token1 amount: ', position.amount1.toSignificant(7), token1.symbol)

  /**
   * We can calculate the underying token amounts when the price is doubled
   */

  // Calcalate the doubled price
  const priceCurrent = position.poolTier.token0Price
  const priceDoubledFraction = priceCurrent.asFraction.multiply(2)
  const priceDoubled = new Price(token0, token1, priceDoubledFraction.denominator, priceDoubledFraction.numerator)

  console.log('Current price: ', priceCurrent.toSignificant(7), `${token1.symbol} per ${token0.symbol}`)
  console.log('Doubled price: ', priceDoubled.toSignificant(7), `${token1.symbol} per ${token0.symbol}`)

  // Calculate the new underlying token amounts
  const amounts = position.amountsAtPrice(priceToSqrtPriceX72(priceDoubled))

  console.log('token0 amount: ', CurrencyAmount.fromRawAmount(token0, amounts.amount0).toSignificant(7), token0.symbol)
  console.log('token1 amount: ', CurrencyAmount.fromRawAmount(token1, amounts.amount1).toSignificant(7), token1.symbol)
})()
