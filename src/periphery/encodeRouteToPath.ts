import { pack } from '@ethersproject/solidity'
import { Currency } from '@uniswap/sdk-core'
import { Route } from '../entities/route'

export function encodeRouteToPath(route: Route<Currency, Currency>, exactOutput: boolean): string {
  let types = []
  let values = []
  let token = route.input.wrapped
  for (const [i, pool] of route.pools.entries()) {
    if (i === 0) {
      types.push('address')
      values.push(token.address)
    }
    token = pool.token0.equals(token) ? pool.token1 : pool.token0
    types.push('uint8')
    types.push('address')
    values.push(route.tierChoicesList[i])
    values.push(token.address)
  }
  return exactOutput ? pack(types.reverse(), values.reverse()) : pack(types, values)
}
