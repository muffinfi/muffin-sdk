import { Interface } from '@ethersproject/abi'
import { abi as IMulticallABI } from '@muffinfi/muffin-contracts/artifacts/contracts/interfaces/common/IMulticall.sol/IMulticall.json'

export abstract class Multicall {
  public static INTERFACE = new Interface(IMulticallABI)

  public static encodeMulticall(calldatas: string | string[]): string {
    if (!Array.isArray(calldatas)) return calldatas
    return calldatas.length === 1 ? calldatas[0] : Multicall.INTERFACE.encodeFunctionData('multicall', [calldatas])
  }
}
