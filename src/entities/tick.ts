import { BigintIsh } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import invariant from 'tiny-invariant'
import { MAX_TICK, MIN_TICK } from '../constants'

type BigNumberish = BigintIsh | { toString(): string }

export type TickChainData = {
  index: number
  liquidityLowerD8: BigNumberish
  liquidityUpperD8: BigNumberish
  nextBelow: number
  nextAbove: number
  needSettle0: boolean
  needSettle1: boolean
  feeGrowthOutside0: BigNumberish
  feeGrowthOutside1: BigNumberish
}

export class Tick {
  public readonly index: number
  public readonly liquidityLowerD8: JSBI
  public readonly liquidityUpperD8: JSBI
  public readonly nextBelow: number
  public readonly nextAbove: number

  constructor({
    index,
    liquidityLowerD8,
    liquidityUpperD8,
    nextBelow,
    nextAbove,
  }: {
    index: number
    liquidityLowerD8: BigintIsh
    liquidityUpperD8: BigintIsh
    nextBelow: number
    nextAbove: number
  }) {
    invariant(index >= MIN_TICK && index <= MAX_TICK, 'TICK')
    invariant(nextBelow < nextAbove, 'invalid next ticks')
    this.index = index
    this.liquidityLowerD8 = JSBI.BigInt(liquidityLowerD8)
    this.liquidityUpperD8 = JSBI.BigInt(liquidityUpperD8)
    this.nextBelow = nextBelow
    this.nextAbove = nextAbove
  }
}
