import { Provider } from '@ethersproject/abstract-provider'
import { Signer } from '@ethersproject/abstract-signer'
import { Contract } from '@ethersproject/contracts'
import { abi as IMuffinHubABI } from '@muffinfi/muffin-contracts/artifacts/contracts/interfaces/hub/IMuffinHubCombined.sol/IMuffinHubCombined.json'
import { abi as ILensABI } from '@muffinfi/muffin-contracts/artifacts/contracts/interfaces/lens/ILens.sol/ILens.json'
import { abi as IManagerABI } from '@muffinfi/muffin-contracts/artifacts/contracts/interfaces/manager/IManager.sol/IManager.json'

/**
 * Network IDs which Muffin supports
 */
export enum SupportedChainId {
  MAINNET = 1,
  RINKEBY = 4,
  GOERLI = 5,
}

/**
 * MuffinHub contract address map
 */
export const MUFFIN_HUB_ADDRESSES: Record<SupportedChainId, string> = {
  [SupportedChainId.MAINNET]: '0x6690384822afF0B65fE0C21a809F187F5c3fcdd8',
  [SupportedChainId.RINKEBY]: '0x42789c4D6c5Cc9334fef4da662A57D78771Ce9E5',
  [SupportedChainId.GOERLI]: '0xA06c455D19704E4871c547211504e17E2199308D',
}

/**
 * Manager contract address map
 */
export const MUFFIN_MANAGER_ADDRESSES: Record<SupportedChainId, string> = {
  [SupportedChainId.MAINNET]: '0xded07E2da859714F69d93f9794344606Ed67907E',
  [SupportedChainId.RINKEBY]: '0x5e090C58E71B86b94fB544b0143363C3414D0579',
  [SupportedChainId.GOERLI]: '0x95186358C4F2f64AE33264494E4A7c6Cd5Dd80dd',
}

/**
 * Lens contract address map
 */
export const MUFFIN_LENS_ADDRESSES: Record<SupportedChainId, string> = {
  [SupportedChainId.MAINNET]: '0xAA7d5bdF76F6143F200F6F2D831bb049a37De935',
  [SupportedChainId.RINKEBY]: '0xED6165A870F48eA4244D6D2cdf4e19737c9B1E2D',
  [SupportedChainId.GOERLI]: '0xe44361A70C9944B10F225037308250E911B24502',
}

/**
 * Returns Muffin deployed contract addresses
 */
export const getContractAddresses = (chainId: number) => {
  const _isSupportedChain = (chainId: number): chainId is SupportedChainId => chainId in SupportedChainId
  if (!_isSupportedChain(chainId)) {
    throw new Error(`Chain is not supported by Muffin SDK (chain id: ${chainId})`)
  }
  return {
    hub: MUFFIN_HUB_ADDRESSES[chainId],
    manager: MUFFIN_MANAGER_ADDRESSES[chainId],
    lens: MUFFIN_LENS_ADDRESSES[chainId],
  }
}

/**
 * Returns Muffin deployed contracts as `ethers.Contract` instances
 */
export const getContracts = (chainId: SupportedChainId, signerOrProvider?: Signer | Provider) => {
  const addresses = getContractAddresses(chainId)
  return {
    hub: new Contract(addresses.hub, IMuffinHubABI, signerOrProvider),
    manager: new Contract(addresses.manager, IManagerABI, signerOrProvider),
    lens: new Contract(addresses.lens, ILensABI, signerOrProvider),
  }
}
