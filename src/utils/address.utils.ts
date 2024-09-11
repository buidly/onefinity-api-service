import { Address } from '@multiversx/sdk-core/out';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { Logger } from '@nestjs/common';
import { isAddress } from 'web3-validator';

const EVM_VM_TYPE = '0600';

// TODO Fix AddressUtils from @multiversx/sdk-nestjs-common to use sdk-core V13
export class AddressUtilsV13 {
  static bech32Encode(publicKey: string) {
    return Address.newFromHex(publicKey).bech32();
  }

  static bech32Decode(address: string) {
    return Address.newFromBech32(address).hex();
  }

  static isValidHexAddress(address: string): boolean {
    try {
      Address.newFromHex(address);
      return true;
    } catch (error) {
      return false;
    }
  }

  static isAddressValid(address: string): boolean {
    try {
      Address.newFromBech32(address);
      return true;
    } catch (error) {
      return false;
    }
  }

  static isEvmAddress(address: string): boolean {
    return isAddress(address);
  }

  static isSmartContractAddress(address: string) {
    if (address.toLowerCase() === 'metachain') {
      return true;
    }

    if (address === '4294967295') {
      return true;
    }

    try {
      return Address.newFromBech32(address).isContractAddress();
    } catch (error) {
      const logger = new Logger(AddressUtilsV13.name);
      logger.error(
        `Error when determining whether address '${address}' is a smart contract address`,
      );
      logger.error(error);
      return false;
    }
  }

  private static calculateMasks(numOfShards: number) {
    const n = Math.ceil(Math.log2(numOfShards));
    const mask1 = (1 << n) - 1;
    const mask2 = (1 << (n - 1)) - 1;
    return [mask1, mask2];
  }

  static computeShard(hexPubKey: string, totalShards: number) {
    const [maskHigh, maskLow] = AddressUtilsV13.calculateMasks(totalShards);
    const pubKey = Buffer.from(hexPubKey, 'hex');
    const lastByteOfPubKey = pubKey[31];

    if (AddressUtilsV13.isAddressOfMetachain(pubKey)) {
      return 4294967295;
    }

    let shard = lastByteOfPubKey & maskHigh;

    if (shard > totalShards - 1) {
      shard = lastByteOfPubKey & maskLow;
    }

    return shard;
  }

  private static isAddressOfMetachain(pubKey: Buffer) {
    // prettier-ignore
    const metachainPrefix = Buffer.from([
      0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    const pubKeyPrefix = pubKey.slice(0, metachainPrefix.length);

    if (pubKeyPrefix.equals(metachainPrefix)) {
      return true;
    }

    const zeroAddress = Buffer.alloc(32).fill(0);

    if (pubKey.equals(zeroAddress)) {
      return true;
    }

    return false;
  }

  static decodeCodeMetadata(codeMetadata: string): { isUpgradeable: boolean, isReadable: boolean, isGuarded: boolean, isPayable: boolean, isPayableBySmartContract: boolean; } | undefined {
    if (!codeMetadata) {
      return undefined;
    }

    const codeHex = BinaryUtils.tryBase64ToHex(codeMetadata);
    if (!codeHex || codeHex.length !== 4) {
      return undefined;
    }

    const firstOctet = parseInt(codeHex.slice(0, 2), 16).toString(2).padStart(4, '0');
    const isUpgradeable = firstOctet.charAt(3) === '1';
    const isReadable = firstOctet.charAt(1) === '1';
    const isGuarded = firstOctet.charAt(0) === '1';

    const secondOctet = parseInt(codeHex.slice(2), 16).toString(2).padStart(4, '0');
    const isPayable = secondOctet.charAt(2) === '1';
    const isPayableBySmartContract = secondOctet.charAt(1) === '1';

    return { isUpgradeable, isReadable, isGuarded, isPayable, isPayableBySmartContract };
  }

  static isEvmContractAddress(inputAddress: string): boolean {
    try {
      const address = Address.newFromBech32(inputAddress);

      if (!this.isSmartContractAddress(inputAddress)) {
        return false;
      }

      const vmType = this.getVmType(address);
      return vmType === EVM_VM_TYPE;
    } catch (error) {
      const logger = new Logger(AddressUtilsV13.name);
      logger.error(
        `Error when determining whether address '${inputAddress}' is an EVM smart contract address`,
      );
      logger.error(error);
      return false;
    }
  }

  static getVmType(address: Address) {
    const hexAddress = address.toHex();
    const vmType = hexAddress.slice(16, 20);

    return vmType;
  }
}
