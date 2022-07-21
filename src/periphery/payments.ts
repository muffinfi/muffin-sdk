import { Interface } from '@ethersproject/abi'
import { abi as IManagerBaseABI } from '@muffinfi/muffin-contracts/artifacts/contracts/interfaces/manager/IManagerBase.sol/IManagerBase.json'
import { validateAndParseAddress } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import { toHex } from '../utils/calldata'

export abstract class Payments {
  public static INTERFACE = new Interface(IManagerBaseABI)

  public static encodeUnwrapWETH(amountMinimum: JSBI, recipient: string): string {
    return Payments.INTERFACE.encodeFunctionData('unwrapWETH', [
      toHex(amountMinimum),
      validateAndParseAddress(recipient),
    ])
  }

  public static encodeRefundETH(): string {
    return Payments.INTERFACE.encodeFunctionData('refundETH')
  }
}
