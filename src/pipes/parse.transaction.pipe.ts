import { BinaryUtils } from "@multiversx/sdk-nestjs-common";
import { ArgumentMetadata, BadRequestException, PipeTransform } from "@nestjs/common";

export class ParseTransactionHashPipe implements PipeTransform<string | string[] | undefined, Promise<string | string[] | undefined>> {
  private entity: string = 'transaction';
  private length = 64;

  transform(value: string | string[] | undefined, metadata: ArgumentMetadata): Promise<string | string[] | undefined> {
    return new Promise(resolve => {
      if (value === undefined || value === '') {
        return resolve(undefined);
      }

      const valueWithoutPrefix = remove0x(value);

      const values = Array.isArray(valueWithoutPrefix) ? valueWithoutPrefix : [valueWithoutPrefix];

      for (const _value of values) {
        const hash = _value.startsWith('0x') ? _value.slice(2) : _value;
        if (!BinaryUtils.isHash(hash)) {
          throw new BadRequestException(`Validation failed for ${this.entity} hash '${metadata.data}'. Value does not represent a hash`);
        }

        if (hash.length !== 64) {
          throw new BadRequestException(`Validation failed for ${this.entity} hash '${metadata.data}'. Length should be ${this.length}.`);
        }
      }

      return resolve(valueWithoutPrefix);
    });
  }
}

export function remove0x(value: string | string[]): string | string[] {
  const removePrefix = (str: string) => str.startsWith('0x') ? str.slice(2) : str;

  if (Array.isArray(value)) {
    return value.map(removePrefix);
  } else if (typeof value === 'string') {
    return removePrefix(value);
  }

  return value;
}