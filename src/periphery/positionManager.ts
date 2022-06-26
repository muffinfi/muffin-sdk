import { Interface } from '@ethersproject/abi'
import { BigintIsh, NativeCurrency, Percent, validateAndParseAddress } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import invariant from 'tiny-invariant'
import { abi as PositionManagerABI } from '../artifacts/contracts/periphery/base/PositionManager.sol/PositionManager.json'
import { BASE_LIQUIDITY_D8, LimitOrderType, ZERO } from '../constants'
import { Pool } from '../entities/pool'
import { Position } from '../entities/position'
import { MethodParameters, toHex } from '../utils/calldata'
import { Multicall } from './multicall'
import { Payments } from './payments'
import { PermitOptions, SelfPermit } from './selfPermit'

/**
 * Options for producing the calldata to transfer position NFT.
 */
export interface SafeTransferOptions {
  /** The account sending the NFT. */
  sender: string
  /** The account that should receive the NFT. */
  recipient: string
  /** The id of the token being sent. */
  tokenId: BigintIsh
  /** The optional parameter that passes data to the `onERC721Received` call for the staker */
  data?: string
}

/**
 * Options for producing the calldata to mint position.
 */
export type MintOptions = {
  /** The account that should receive the minted NFT. */
  recipient: string
  /** Whether to use internal account to pay tokens */
  useAccount: boolean
  /** Creates pool if not initialized before mint. */
  createPool?: boolean
  /** Whether the tier needs to be created */
  createTier?: boolean
  /** How much the pool price is allowed to move. */
  slippageTolerance: Percent
  /** Whether to spend ether. If true, one of the pool tokens must be WETH, by default false */
  useNative?: NativeCurrency
  /** The optional permit parameters for spending token0 */
  token0Permit?: PermitOptions
  /** The optional permit parameters for spending token1 */
  token1Permit?: PermitOptions
}

/**
 * Options for producing the calldata to add liquidity to existing position.
 */
export type IncreaseOptions = {
  /** Indicates the ID of the position to increase liquidity for. */
  tokenId: BigintIsh
  /** Whether to use internal account to pay tokens */
  useAccount: boolean
  /** How much the pool price is allowed to move. */
  slippageTolerance: Percent
  /** Whether to spend ether. If true, one of the pool tokens must be WETH, by default false */
  useNative?: NativeCurrency
  /** The optional permit parameters for spending token0 */
  token0Permit?: PermitOptions
  /** The optional permit parameters for spending token1 */
  token1Permit?: PermitOptions
}

/**
 * Options for producing the calldata to add liquidity.
 */
export type AddLiquidityOptions = MintOptions | IncreaseOptions

/**
 * Options for producing the calldata to remove liquidity from a position.
 */
export interface RemoveLiquidityOptions {
  /** The ID of the token to exit */
  tokenId: BigintIsh
  /** The percentage of position liquidity to exit. */
  liquidityPercentage: Percent
  /** How much the pool price is allowed to move. */
  slippageTolerance: Percent
  /** The address to receive the withdrawn tokens */
  withdrawalRecipient: string
  /** Whether to collect partial or all accrued fees in the position */
  collectAllFees: boolean
  /** The optional permit of the token ID being exited, in case the exit transaction is being sent by an account that does not own the NFT */
  permit?: NFTPermitOptions
}

export interface NFTPermitOptions {
  v: 0 | 1 | 27 | 28
  r: string
  s: string
  deadline: BigintIsh
  spender: string
}

/**
 * Options for producing the calldata to set limit order type for the position
 */
export interface SetLimitOrderTypeOptions {
  /** Id of the position NFT */
  tokenId: BigintIsh
  /** Direction of limit order (0: N/A, 1: zero->one, 2: one->zero) */
  limitOrderType: LimitOrderType
}

// type guard
function isMint(options: AddLiquidityOptions): options is MintOptions {
  return 'recipient' in options
}

export abstract class PositionManager {
  public static INTERFACE = new Interface(PositionManagerABI)

  /**
   * Construct calldata for creating a pool
   * @param pool The pool instance which you want to create it on chain
   * @param useAccount Whether to use internal account to pay tokens
   * @param useNative Whether to spend ether if one of the token in the pool is WETH
   */
  public static createPoolCallParameters(
    pool: Pool,
    useAccount: boolean,
    useNative: NativeCurrency | undefined
  ): MethodParameters {
    const calldata = PositionManager.INTERFACE.encodeFunctionData('createPool', [
      pool.token0.address,
      pool.token1.address,
      pool.tiers[0].sqrtGamma,
      toHex(pool.tiers[0].sqrtPriceX72),
      useAccount,
    ])
    return { calldata, value: this._computeValueForCreateTier(useNative, pool) }
  }

  /**
   * Construct calldata for adding a tier to the pool
   * @param pool The pool instance containing the tier you want to create on chain
   * @param tierId The tier id of the new tier
   * @param useAccount Whether to use internal account to pay tokens
   * @param useNative Whether to spend ether if one of the token in the pool is WETH
   */
  public static addTierCallParameters(
    pool: Pool,
    tierId: number,
    useAccount: boolean,
    useNative: NativeCurrency | undefined
  ): MethodParameters {
    const calldata = PositionManager.INTERFACE.encodeFunctionData('addTier', [
      pool.token0.address,
      pool.token1.address,
      pool.tiers[tierId].sqrtGamma,
      useAccount,
      tierId,
    ])
    return { calldata, value: this._computeValueForCreateTier(useNative, pool) }
  }

  /**
   * Calculate msg.value needed to create tier
   */
  private static _computeValueForCreateTier(useNative: NativeCurrency | undefined, pool: Pool): string {
    let value: string = toHex(0)
    if (useNative) {
      const wrapped = useNative.wrapped
      invariant(pool.token0.equals(wrapped) || pool.token1.equals(wrapped), 'NO_WETH')
      value = pool.token0.equals(wrapped)
        ? toHex(pool.token0AmountForCreateTier.quotient)
        : toHex(pool.token1AmountForCreateTier.quotient)
    }
    return value
  }

  /**
   * Construct calldata for adding liquidity
   */
  public static addCallParameters(position: Position, options: AddLiquidityOptions): MethodParameters {
    invariant(JSBI.greaterThan(position.liquidityD8, ZERO), 'ZERO_LIQUIDITY')

    const calldatas: string[] = []

    // permits if necessary
    if (options.token0Permit) {
      calldatas.push(SelfPermit.encodePermit(position.pool.token0, options.token0Permit))
    }
    if (options.token1Permit) {
      calldatas.push(SelfPermit.encodePermit(position.pool.token1, options.token1Permit))
    }

    // create tier if needed
    let value: string = toHex(0)
    if (isMint(options) && (options.createPool || options.createTier)) {
      invariant(!(options.createPool && options.createTier), 'CREATE_POOL_OR_TIER')

      const params = options.createPool
        ? this.createPoolCallParameters(position.pool, options.useAccount, options.useNative)
        : this.addTierCallParameters(position.pool, position.tierId, options.useAccount, options.useNative)

      calldatas.push(params.calldata)
      value = params.value

      /**
       * Subtract position's liquidity with a base that is used to create tier.
       * Note that base liquidity is taking more tokens than it should, as it's using simple xy=k invariant
       * This will overall charge users more tokens than they desire to input, though small but could be a potential bug
       */
      const liquidityD8 = JSBI.subtract(position.liquidityD8, JSBI.BigInt(BASE_LIQUIDITY_D8))
      invariant(JSBI.greaterThan(liquidityD8, ZERO), 'ZERO_LIQUIDITY_AFTER_CREATE')
      position = new Position({
        pool: position.pool,
        tierId: position.tierId,
        tickLower: position.tickLower,
        tickUpper: position.tickUpper,
        liquidityD8,
        limitOrderType: position.limitOrderType,
        settlementSnapshotId: position.settlementSnapshotId,
        settled: position.settled,
      })
    }

    // get amounts
    const { amount0: amount0Desired, amount1: amount1Desired } = position.mintAmounts
    const { amount0: amount0Min, amount1: amount1Min } = position.mintAmountsWithSlippage(options.slippageTolerance)

    // mint
    calldatas.push(
      isMint(options)
        ? PositionManager.INTERFACE.encodeFunctionData('mint', [
            {
              token0: position.pool.token0.address,
              token1: position.pool.token1.address,
              tierId: position.tierId,
              tickLower: position.tickLower,
              tickUpper: position.tickUpper,
              amount0Desired: toHex(amount0Desired),
              amount1Desired: toHex(amount1Desired),
              amount0Min: toHex(amount0Min),
              amount1Min: toHex(amount1Min),
              recipient: validateAndParseAddress(options.recipient),
              useAccount: options.useAccount,
            },
          ])
        : PositionManager.INTERFACE.encodeFunctionData('addLiquidity', [
            {
              tokenId: toHex(options.tokenId),
              amount0Desired: toHex(amount0Desired),
              amount1Desired: toHex(amount1Desired),
              amount0Min: toHex(amount0Min),
              amount1Min: toHex(amount1Min),
              useAccount: options.useAccount,
            },
          ])
    )

    // set limit order type if minting a limit range order
    if (isMint(options) && position.limitOrderType) {
      calldatas.push(
        PositionManager.INTERFACE.encodeFunctionData('setLimitOrderType', [
          toHex(0), // tokenId 0 means using the latest token ID, only feasible with multicall
          toHex(position.limitOrderType),
        ])
      )
    }

    // calcalute msg.value if using native eth
    if (options.useNative) {
      const wrapped = options.useNative.wrapped
      const wrappedValue = position.pool.token0.equals(wrapped) ? amount0Desired : amount1Desired
      invariant(position.pool.token0.equals(wrapped) || position.pool.token1.equals(wrapped), 'NO_WETH')

      // we only need to refund if we're actually sending >0 ETH
      if (JSBI.greaterThan(wrappedValue, ZERO)) {
        calldatas.push(Payments.encodeRefundETH())
        value = toHex(JSBI.add(JSBI.BigInt(value), wrappedValue))
      }
    }

    return {
      calldata: Multicall.encodeMulticall(calldatas),
      value,
    }
  }

  /**
   * Produces the calldata for completely or partially exiting a position
   * @param position The position to exit
   * @param options Additional information necessary for generating the calldata
   * @returns The call parameters
   */
  public static removeCallParameters(position: Position, options: RemoveLiquidityOptions): MethodParameters {
    invariant(options.tokenId > 0, 'ZERO_TOKEN_ID')

    const calldatas: string[] = []
    const tokenId = toHex(options.tokenId)

    // construct a partial position with a percentage of liquidity for calculating amount{0,1}Min with slippage tolerance
    const _partialPosition = new Position({
      pool: position.pool,
      tierId: position.tierId,
      tickLower: position.tickLower,
      tickUpper: position.tickUpper,
      liquidityD8: options.liquidityPercentage.multiply(position.liquidityD8).quotient,
    })
    const liquidityD8 = _partialPosition.liquidityD8

    // adjust for slippage tolerance
    const { amount0: amount0Min, amount1: amount1Min } = _partialPosition.burnAmountsWithSlippage(
      options.slippageTolerance
    )

    // add NFT permit
    if (options.permit) {
      calldatas.push(
        PositionManager.INTERFACE.encodeFunctionData('permit', [
          validateAndParseAddress(options.permit.spender),
          tokenId,
          toHex(options.permit.deadline),
          options.permit.v,
          options.permit.r,
          options.permit.s,
        ])
      )
    }

    // remove liquidity
    calldatas.push(
      PositionManager.INTERFACE.encodeFunctionData('removeLiquidity', [
        {
          tokenId,
          liquidityD8: toHex(liquidityD8),
          amount0Min: toHex(amount0Min),
          amount1Min: toHex(amount1Min),
          withdrawTo: validateAndParseAddress(options.withdrawalRecipient),
          collectAllFees: options.collectAllFees,
          settled: position.settled,
        },
      ])
    )

    return {
      calldata: Multicall.encodeMulticall(calldatas),
      value: toHex(0),
    }
  }

  /**
   * Construct calldata for setting limit order type for a position
   */
  public static setLimitOrderTypeParameters(options: SetLimitOrderTypeOptions): MethodParameters {
    invariant(options.tokenId > 0, 'ZERO_TOKEN_ID')
    const calldata = PositionManager.INTERFACE.encodeFunctionData('setLimitOrderType', [
      toHex(options.tokenId),
      toHex(options.limitOrderType),
    ])
    return { calldata, value: toHex(0) }
  }

  /**
   * Construct calldata for transfering a position NFT
   */
  public static safeTransferFromParameters(options: SafeTransferOptions): MethodParameters {
    const recipient = validateAndParseAddress(options.recipient)
    const sender = validateAndParseAddress(options.sender)
    const calldata = options.data
      ? PositionManager.INTERFACE.encodeFunctionData('safeTransferFrom(address,address,uint256,bytes)', [
          sender,
          recipient,
          toHex(options.tokenId),
          options.data,
        ])
      : PositionManager.INTERFACE.encodeFunctionData('safeTransferFrom(address,address,uint256)', [
          sender,
          recipient,
          toHex(options.tokenId),
        ])

    return { calldata, value: toHex(0) }
  }
}
