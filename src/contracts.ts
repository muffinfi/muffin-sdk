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
  RINKEBY = 4,
}

/**
 * MuffinHub contract address map
 */
export const MUFFIN_HUB_ADDRESSES: Record<SupportedChainId, string> = {
  [SupportedChainId.RINKEBY]: '0xb74842648CaA2841E1e20f03d318118343fd4c03',
}

/**
 * Manager contract address map
 */
export const MUFFIN_MANAGER_ADDRESSES: Record<SupportedChainId, string> = {
  [SupportedChainId.RINKEBY]: '0x7069713cDfDA0829111ECcEdcF24C2e3f99Cd467',
}

/**
 * Lens contract address map
 */
export const MUFFIN_LENS_ADDRESSES: Record<SupportedChainId, string> = {
  [SupportedChainId.RINKEBY]: '0x81BBb49E7Fb8C20784A52699008d0bE0Bc8baACB',
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
