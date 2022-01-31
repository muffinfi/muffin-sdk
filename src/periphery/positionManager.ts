import { Interface } from '@ethersproject/abi'
import { BigintIsh, NativeCurrency, Percent, validateAndParseAddress } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import invariant from 'tiny-invariant'
import { abi as PositionManagerABI } from '../artifacts/contracts/periphery/base/PositionManager.sol/PositionManager.json'
import { BASE_LIQUIDITY_D8, ZERO } from '../constants'
import { Pool } from '../entities/pool'
import { Position } from '../entities/position'
import { MethodParameters, toHex } from '../utils/calldata'
import { Multicall } from './multicall'
import { Payments } from './payments'
import { PermitOptions, SelfPermit } from './selfPermit'

// --------------------------------------

export interface SafeTransferOptions {
  sender: string //     The account sending the NFT.
  recipient: string //  The account that should receive the NFT.
  tokenId: BigintIsh // The id of the token being sent.
  data?: string //      The optional parameter that passes data to the `onERC721Received` call for the staker
}

// --------------------------------------

export type MintOptions = {
  recipient: string //            The account that should receive the minted NFT.
  useAccount: boolean
  createPool?: boolean //         Creates pool if not initialized before mint.
  slippageTolerance: Percent //   How much the pool price is allowed to move.
  useNative?: NativeCurrency //   Whether to spend ether. If true, one of the pool tokens must be WETH, by default false
  token0Permit?: PermitOptions // The optional permit parameters for spending token0
  token1Permit?: PermitOptions // The optional permit parameters for spending token1
}

export type IncreaseOptions = {
  tokenId: BigintIsh //           Indicates the ID of the position to increase liquidity for.
  useAccount: boolean
  slippageTolerance: Percent //   How much the pool price is allowed to move.
  useNative?: NativeCurrency //   Whether to spend ether. If true, one of the pool tokens must be WETH, by default false
  token0Permit?: PermitOptions // The optional permit parameters for spending token0
  token1Permit?: PermitOptions // The optional permit parameters for spending token1
}

export type AddLiquidityOptions = MintOptions | IncreaseOptions

// type guard
function isMint(options: AddLiquidityOptions): options is MintOptions {
  return Object.keys(options).some(k => k === 'recipient')
}

// --------------------------------------

export interface RemoveLiquidityOptions {
  tokenId: BigintIsh //           The ID of the token to exit
  liquidityPercentage: Percent // The percentage of position liquidity to exit.
  slippageTolerance: Percent //   How much the pool price is allowed to move.
  withdrawalRecipient: string
  collectAllFee: boolean
  isSettledPosition?: boolean
  permit?: NFTPermitOptions //    The optional permit of the token ID being exited, in case the exit transaction is being sent by an account that does not own the NFT
}

export interface NFTPermitOptions {
  v: 0 | 1 | 27 | 28
  r: string
  s: string
  deadline: BigintIsh
  spender: string
}

// --------------------------------------

export abstract class PositionManager {
  public static INTERFACE = new Interface(PositionManagerABI)

  private static encodeCreate(pool: Pool) {
    return PositionManager.INTERFACE.encodeFunctionData('createPool', [
      pool.token0.address,
      pool.token1.address,
      pool.tiers[0].sqrtGamma,
      toHex(pool.tiers[0].sqrtPriceX72)
    ])
  }

  public static createCallParameters(pool: Pool): MethodParameters {
    return {
      calldata: this.encodeCreate(pool),
      value: toHex(0)
    }
  }

  public static addCallParameters(position: Position, options: AddLiquidityOptions): MethodParameters {
    invariant(JSBI.greaterThan(position.liquidityD8, ZERO), 'ZERO_LIQUIDITY')

    const calldatas: string[] = []

    // create pool if needed
    if (isMint(options) && options.createPool) {
      calldatas.push(this.encodeCreate(position.pool))

      /**
       * Subtract position's liquidity with a base that is used to create pool.
       * Note that base liquidity is taking more tokens than it should, as it's using simple xy=k invariant
       * This can makes users have not enough tokens to mint liquidity, which is a potential bug
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
        settled: position.settled
      })
    }

    // permits if necessary
    if (options.token0Permit) {
      calldatas.push(SelfPermit.encodePermit(position.pool.token0, options.token0Permit))
    }
    if (options.token1Permit) {
      calldatas.push(SelfPermit.encodePermit(position.pool.token1, options.token1Permit))
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
              useAccount: options.useAccount
            }
          ])
        : PositionManager.INTERFACE.encodeFunctionData('addLiquidity', [
            {
              tokenId: toHex(options.tokenId),
              amount0Desired: toHex(amount0Desired),
              amount1Desired: toHex(amount1Desired),
              amount0Min: toHex(amount0Min),
              amount1Min: toHex(amount1Min),
              useAccount: options.useAccount
            }
          ])
    )

    // calcalute msg.value if neccessary
    let value = toHex(0)
    if (options.useNative) {
      const wrapped = options.useNative.wrapped
      const wrappedValue = position.pool.token0.equals(wrapped) ? amount0Desired : amount1Desired
      invariant(position.pool.token0.equals(wrapped) || position.pool.token1.equals(wrapped), 'NO_WETH')

      // we only need to refund if we're actually sending >0 ETH
      if (JSBI.greaterThan(wrappedValue, ZERO)) calldatas.push(Payments.encodeRefundETH())
      value = toHex(wrappedValue)
    }

    return {
      calldata: Multicall.encodeMulticall(calldatas),
      value
    }
  }

  /**
   * Produces the calldata for completely or partially exiting a position
   * @param position The position to exit
   * @param options Additional information necessary for generating the calldata
   * @returns The call parameters
   */
  public static removeCallParameters(position: Position, options: RemoveLiquidityOptions): MethodParameters {
    const calldatas: string[] = []
    const tokenId = toHex(options.tokenId)

    // construct a partial position with a percentage of liquidity for calculating amount{0,1}Min with slippage tolerance
    const _partialPosition = new Position({
      pool: position.pool,
      tierId: position.tierId,
      tickLower: position.tickLower,
      tickUpper: position.tickUpper,
      liquidityD8: options.liquidityPercentage.multiply(position.liquidityD8).quotient
    })
    const liquidityD8 = _partialPosition.liquidityD8
    invariant(JSBI.greaterThan(liquidityD8, ZERO), 'ZERO_LIQUIDITY')

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
          options.permit.s
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
          collectAllFees: options.collectAllFee,
          settled: options.isSettledPosition === true
        }
      ])
    )

    return {
      calldata: Multicall.encodeMulticall(calldatas),
      value: toHex(0)
    }
  }

  public static safeTransferFromParameters(options: SafeTransferOptions): MethodParameters {
    const recipient = validateAndParseAddress(options.recipient)
    const sender = validateAndParseAddress(options.sender)
    const calldata = options.data
      ? PositionManager.INTERFACE.encodeFunctionData('safeTransferFrom(address,address,uint256,bytes)', [
          sender,
          recipient,
          toHex(options.tokenId),
          options.data
        ])
      : PositionManager.INTERFACE.encodeFunctionData('safeTransferFrom(address,address,uint256)', [
          sender,
          recipient,
          toHex(options.tokenId)
        ])

    return {
      calldata: calldata,
      value: toHex(0)
    }
  }
}
