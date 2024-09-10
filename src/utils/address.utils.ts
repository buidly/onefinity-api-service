import { Address } from '@multiversx/sdk-core/out';
import { Logger } from '@nestjs/common';

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
