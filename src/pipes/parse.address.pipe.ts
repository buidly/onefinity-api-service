import {
  ArgumentMetadata,
  BadRequestException,
  PipeTransform,
  Injectable,
} from '@nestjs/common';
import { GatewayService } from 'src/common/gateway/gateway.service';
import { AliasAddressInfo } from 'src/endpoints/accounts/entities/alias-address-info';
import { AddressUtilsV13 } from 'src/utils/address.utils';

@Injectable()
export class ParseAddressPipe
  implements PipeTransform<string | undefined, Promise<AliasAddressInfo | undefined>> {
  constructor(private readonly gatewayService: GatewayService) { }

  async transform(
    value: string | undefined,
    metadata: ArgumentMetadata,
  ): Promise<AliasAddressInfo | undefined> {
    if (value === undefined || value === '') {
      return undefined;
    }

    if (AddressUtilsV13.isEvmAddress(value)) {
      const address = await this.gatewayService.getMvxAddress(value);
      if (!address) {
        this.throwInvalidAddressException(metadata.data);
      }
      return { evmAddress: value, address };
    }

    if (AddressUtilsV13.isAddressValid(value)) {
      const evmAddress = await this.gatewayService.getAliasAddress(value);
      return { address: value, evmAddress };
    }

    this.throwInvalidAddressException(metadata.data);
  }

  private throwInvalidAddressException(param: string | undefined): never {
    throw new BadRequestException(
      `Validation failed for argument '${param}' (a valid address is expected)`,
    );
  }
}
