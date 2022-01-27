import { Interface } from '@ethersproject/abi'
import { abi as MulticallABI } from '../artifacts/contracts/periphery/base/Multicall.sol/Multicall.json'

export abstract class Multicall {
  public static INTERFACE = new Interface(MulticallABI)

  public static encodeMulticall(calldatas: string | string[]): string {
    if (!Array.isArray(calldatas)) {
      calldatas = [calldatas]
    }
    return calldatas.length === 1 ? calldatas[0] : Multicall.INTERFACE.encodeFunctionData('multicall', [calldatas])
  }
}
