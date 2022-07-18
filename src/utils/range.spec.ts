import { Price, Token } from '@uniswap/sdk-core'
import { Range } from './range'

function token({
  sortOrder,
  decimals = 18,
  chainId = 1,
}: {
  sortOrder: number
  decimals?: number
  chainId?: number
}): Token {
  if (sortOrder > 9 || sortOrder % 1 !== 0) throw new Error('invalid sort order')
  return new Token(
    chainId,
    `0x${new Array<string>(40).fill(`${sortOrder}`).join('')}`,
    decimals,
    `T${sortOrder}`,
    `token${sortOrder}`
  )
}

describe('Range', () => {
  const token0 = token({ sortOrder: 0 })
  const token1 = token({ sortOrder: 1 })

  it('#fromTickInput', () => {
    const range = Range.fromTickInput(token1, token0, 1, 9999, 10)

    // expect correct token order
    expect(range.token0).toEqual(token0)
    expect(range.token1).toEqual(token1)
    expect(range.inverted).toEqual(true)

    // expect tick rounded
    expect(range.tickLower).toEqual(0)
    expect(range.tickUpper).toEqual(10000)

    // expect correct price values
    expect(range.priceLower.toSignificant(7)).toEqual('1')
    expect(range.priceUpper.toSignificant(7)).toEqual('2.718146')
    expect(range.quotePriceLower.toSignificant(7)).toEqual('0.3678978')
    expect(range.quotePriceUpper.toSignificant(7)).toEqual('1')

    // expect correct price units
    expect(range.priceLower.baseCurrency).toEqual(token0)
    expect(range.priceLower.quoteCurrency).toEqual(token1)
    expect(range.priceUpper.baseCurrency).toEqual(token0)
    expect(range.priceUpper.quoteCurrency).toEqual(token1)
    expect(range.quotePriceLower.baseCurrency).toEqual(token1)
    expect(range.quotePriceLower.quoteCurrency).toEqual(token0)
    expect(range.quotePriceUpper.baseCurrency).toEqual(token1)
    expect(range.quotePriceUpper.quoteCurrency).toEqual(token0)
  })

  describe('#fromPriceInput', () => {
    it('works', () => {
      const priceLower = new Price(token1, token0, '10000000', '3678978') // +0.000001
      const priceUpper = new Price(token1, token0, '1', '1')
      const range = Range.fromPriceInput(priceLower, priceUpper, 10)

      // expect correct token order
      expect(range.token0).toEqual(token0)
      expect(range.token1).toEqual(token1)
      expect(range.inverted).toEqual(true)

      // expect tick rounded
      expect(range.tickLower).toEqual(0)
      expect(range.tickUpper).toEqual(10000)

      // expect correct price values
      expect(range.priceLower.toSignificant(7)).toEqual('1')
      expect(range.priceUpper.toSignificant(7)).toEqual('2.718146')
      expect(range.quotePriceLower.toSignificant(7)).toEqual('0.3678978')
      expect(range.quotePriceUpper.toSignificant(7)).toEqual('1')
    })

    const ONE = new Price(token0, token1, '1', '1')

    it('rounding down prices', () => {
      // 1. inputs:             [1.0000, 1.00009]
      // 2. round down prices:  [1.0000, 1.0000] <-- error
      // 3. convert to ticks:   [0, 0]
      // 4. round off ticks:    [0, 0]
      expect(() => Range.fromPriceInput(ONE, new Price(token0, token1, '100000', '100009'), 1)).toThrow('TICK ORDER')

      // 1. inputs:             [1.0000, 1.00019]
      // 2. round down prices:  [1.0000, 1.0001]
      // 3. convert to ticks:   [0, 1]
      // 4. round off ticks:    [0, 1]
      const range = Range.fromPriceInput(ONE, new Price(token0, token1, '100000', '100019'), 1)
      expect(range.tickLower).toEqual(0)
      expect(range.tickUpper).toEqual(1)
    })

    it('rounding off ticks', () => {
      // 1. inputs:             [1.0000, 1.0001]
      // 2. round down prices:  [1.0000, 1.0001]
      // 3. convert to ticks:   [0, 1]
      // 4. round off ticks:    [0, 0] <-- error, since TS = 3
      expect(() => Range.fromPriceInput(ONE, new Price(token0, token1, '10000', '10001'), 3)).toThrow('TICK ORDER')

      // 1. inputs:             [1.0000, 1.0001]
      // 2. round down prices:  [1.0000, 1.0001]
      // 3. convert to ticks:   [0, 1]
      // 4. round off ticks:    [0, 2] <-- 1 rounded off to 2, since TS = 2
      const range = Range.fromPriceInput(ONE, new Price(token0, token1, '10000', '10001'), 2)
      expect(range.tickLower).toEqual(0)
      expect(range.tickUpper).toEqual(2)
    })
  })

  it('#fromPriceStringInput', () => {
    const range = Range.fromPriceStringInput(token1, token0, '0.3678978', '1', 10)

    // expect correct token order
    expect(range.token0).toEqual(token0)
    expect(range.token1).toEqual(token1)
    expect(range.inverted).toEqual(true)

    // expect tick rounded
    expect(range.tickLower).toEqual(0)
    expect(range.tickUpper).toEqual(10000)

    // expect correct price values
    expect(range.priceLower.toSignificant(7)).toEqual('1')
    expect(range.priceUpper.toSignificant(7)).toEqual('2.718146')
    expect(range.quotePriceLower.toSignificant(7)).toEqual('0.3678978')
    expect(range.quotePriceUpper.toSignificant(7)).toEqual('1')
  })
})
