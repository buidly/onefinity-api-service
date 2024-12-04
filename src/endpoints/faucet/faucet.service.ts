
import { Account, Address, Transaction, TransactionPayload } from "@multiversx/sdk-core";
import { CacheService } from "@multiversx/sdk-nestjs-cache";
import { Constants, OriginLogger } from '@multiversx/sdk-nestjs-common';
import { ProxyNetworkProvider } from "@multiversx/sdk-network-providers/out";
import { UserSecretKey, UserSigner } from "@multiversx/sdk-wallet";
import { BadRequestException, Injectable, NotAcceptableException } from '@nestjs/common';
import BigNumber from "bignumber.js";
import { ApiConfigService } from 'src/common/api-config/api.config.service';
import { AddressUtilsV13, ONE_HRP } from 'src/utils/address.utils';
import { CacheInfo } from "src/utils/cache.info";
import { AccountService } from "../accounts/account.service";
import { TransactionSendResult } from '../transactions/entities/transaction.send.result';
import { TransactionService } from '../transactions/transaction.service';
import { GatewayService } from "src/common/gateway/gateway.service";

@Injectable()
export class FaucetService {
  private readonly logger = new OriginLogger(FaucetService.name);

  private provider?: ProxyNetworkProvider;
  private faucetAccount?: Account;
  private signer?: UserSigner;

  constructor(
    private readonly transactionService: TransactionService,
    private readonly apiConfigService: ApiConfigService,
    private readonly accountService: AccountService,
    private readonly cachingService: CacheService,
    private readonly gatewayService: GatewayService,
  ) {
    this.provider = new ProxyNetworkProvider(this.apiConfigService.getSelfUrl());
  }

  async initialize(): Promise<boolean> {
    try {
      const privateKey = this.apiConfigService.getFaucetPrivateKey();
      if (!privateKey) {
        return false;
      }

      this.signer = new UserSigner(UserSecretKey.fromString(privateKey));
      this.faucetAccount = new Account(Address.newFromBech32(this.signer.getAddress(ONE_HRP).bech32()));
      return true;
    } catch (e) {
      this.logger.error('Could not initialize faucet');
      this.logger.error(e);
      return false;
    }
  }

  async sendTokensToAddress(address: string | undefined): Promise<TransactionSendResult> {
    try {
      if (!address || (!AddressUtilsV13.isAddressValid(address) && !AddressUtilsV13.isEvmAddress(address))) {
        throw new NotAcceptableException('Provided address is not valid');
      }

      const initialized = await this.initialize();
      if (!initialized) {
        throw new Error('Faucet is disabled');
      }

      if (!this.signer) {
        throw new Error('No signer initialized');
      }

      if (!this.provider) {
        throw new Error('No provider initialized');
      }

      if (!this.faucetAccount) {
        throw new Error('No faceut account initialized');
      }

      let mvxAddress: string | null = address;
      if (AddressUtilsV13.isEvmAddress(address)) {
        mvxAddress = await this.gatewayService.getMvxAddress(address);
      }

      const account = await this.accountService.getAccount(mvxAddress ?? '');
      const maxOneAmount = new BigNumber(1).shiftedBy(18);
      if (account && new BigNumber(account.balance).isGreaterThan(maxOneAmount)) {
        throw new NotAcceptableException("Account balance exceeds 1 ONE");
      }

      const lastClaimTs = await this.cachingService.get(CacheInfo.FaucetClaim(address).key);
      if (lastClaimTs && ((Date.now() - Number(lastClaimTs)) < 5 * 60 * 1000)) {
        throw new NotAcceptableException("You can only claim once every 5 minutes. Please try again later.");
      }

      this.logger.warn(`Send tokens to address: ${address}`);

      const nonce = await this.getNonce();

      const transaction = new Transaction({
        gasLimit: BigInt(500000),
        sender: this.faucetAccount.address,
        receiver: AddressUtilsV13.isAddressValid(address) ? address : this.apiConfigService.getCrossAddressTransferContract(),
        value: BigInt(5000000000000000000000), // 5 ONE
        chainID: this.apiConfigService.getChainId(),
        nonce: nonce,
        data: AddressUtilsV13.isAddressValid(address) ? undefined : new TransactionPayload(`crossAddressTransfer@${AddressUtilsV13.sliceEvmAddress(address)}@0002`)
      });
      const signature = await this.signer.sign(transaction.serializeForSigning());
      transaction.applySignature(signature);

      const transferResult = await this.transactionService.createTransaction(transaction.toSendable());

      if (typeof transferResult === 'string' || transferResult instanceof String) {
        throw new BadRequestException(transferResult);
      }

      await this.cachingService.set(CacheInfo.FaucetClaim(address).key, Date.now(), CacheInfo.FaucetClaim(address).ttl);

      return transferResult;
    } catch (error) {
      this.logger.error(`An error has occurred sending faucet funds to ${address}`);
      this.logger.error(error);
      throw error;
    }
  }

  private async getNonce(): Promise<number> {
    const value = await this.getFaucetNonce();
    if (!value) {
      const accountNonce = await this.getLatestNonce();

      await this.setFaucetNonce(accountNonce);

      return accountNonce;
    }

    return await this.incrementFaucetNonce();
  }

  async getLatestNonce(): Promise<number> {
    if (!this.faucetAccount) {
      throw new Error('No faucet account initialized');
    }

    if (!this.provider) {
      throw new Error('No provider initialized');
    }

    const account = await this.provider.getAccount(this.faucetAccount.address);
    this.faucetAccount.update(account);

    return this.faucetAccount.nonce.valueOf();
  }

  async setFaucetNonce(nonce: number) {
    await this.cachingService.setRemote(this.getFaucetNonceKey(), nonce, Constants.oneMinute() * 5);
  }

  async getFaucetNonce(): Promise<number | undefined> {
    return this.cachingService.getRemote(this.getFaucetNonceKey());
  }

  async incrementFaucetNonce(): Promise<number> {
    // @ts-ignore
    return this.cachingService.redisCacheService.incrby(this.getFaucetNonceKey(), 1);
  }

  private getFaucetNonceKey(): string {
    return 'faucetWalletNonce';
  }
}
