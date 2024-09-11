import { Account } from "./entities/account";
import { Auction } from "./entities/auction";
import { EsdtAddressRoles } from "./entities/esdt.roles";
import { EsdtSupply } from "./entities/esdt.supply";
import { GatewayComponentRequest } from "./entities/gateway.component.request";
import { MetricsEvents } from "src/utils/metrics-events.constants";
import { LogPerformanceAsync } from "src/utils/log.performance.decorator";
import { HeartbeatStatus } from "./entities/heartbeat.status";
import { TrieStatistics } from "./entities/trie.statistics";
import { NetworkConfig } from "./entities/network.config";
import { NetworkEconomics } from "./entities/network.economics";
import { NetworkStatus } from "./entities/network.status";
import { NftData } from "./entities/nft.data";
import { TokenData } from "./entities/token.data";
import { Transaction } from "./entities/transaction";
import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { ApiConfigService } from "../api-config/api.config.service";
import { BinaryUtils, ContextTracker } from "@multiversx/sdk-nestjs-common";
import { ApiService, ApiSettings } from "@multiversx/sdk-nestjs-http";
import { GuardianResult } from "./entities/guardian.result";
import { TransactionProcessStatus } from "./entities/transaction.process.status";
import { TxPoolGatewayResponse } from "./entities/tx.pool.gateway.response";
import { AddressUtilsV13 } from "src/utils/address.utils";
import { CacheInfo } from "src/utils/cache.info";
import { CacheService } from "@multiversx/sdk-nestjs-cache";

const ETHAliasAddress = '0002';
@Injectable()
export class GatewayService {
  private readonly snapshotlessRequestsSet: Set<String> = new Set([
    GatewayComponentRequest.addressBalance,
    GatewayComponentRequest.addressDetails,
    GatewayComponentRequest.addressEsdt,
    GatewayComponentRequest.addressNftByNonce,
    GatewayComponentRequest.vmQuery,
    GatewayComponentRequest.transactionPool,
  ]);

  private readonly deepHistoryRequestsSet: Set<String> = new Set([
    GatewayComponentRequest.addressDetails,
    GatewayComponentRequest.addressEsdt,
    GatewayComponentRequest.addressEsdtBalance,
    GatewayComponentRequest.addressNftByNonce,
    GatewayComponentRequest.vmQuery,
  ]);

  constructor(
    private readonly apiConfigService: ApiConfigService,
    @Inject(forwardRef(() => ApiService))
    private readonly apiService: ApiService,
    private readonly cachingService: CacheService
  ) { }

  async getVersion(): Promise<string | undefined> {
    const result = await this.get('about', GatewayComponentRequest.about);

    if (result && result.appVersion && result.appVersion !== "undefined") {
      return result.appVersion;
    }

    return undefined;
  }

  async getValidatorAuctions(): Promise<Auction[]> {
    const result = await this.get('validator/auction', GatewayComponentRequest.validatorAuction);
    return result.auctionList;
  }

  async getNetworkStatus(shardId: number | string): Promise<NetworkStatus> {
    const result = await this.get(`network/status/${shardId}`, GatewayComponentRequest.networkStatus);
    return result.status;
  }

  async getNetworkConfig(): Promise<NetworkConfig> {
    const result = await this.get('network/config', GatewayComponentRequest.networkConfig);
    return result.config;
  }

  async getNetworkEconomics(): Promise<NetworkEconomics> {
    const result = await this.get('network/economics', GatewayComponentRequest.networkEconomics);
    return result.metrics;
  }

  async getNodeHeartbeatStatus(): Promise<HeartbeatStatus[]> {
    const result = await this.get('node/heartbeatstatus', GatewayComponentRequest.nodeHeartbeat);
    return result.heartbeats;
  }

  async getTrieStatistics(shardId: number): Promise<TrieStatistics> {
    const result = await this.get(`network/trie-statistics/${shardId}`, GatewayComponentRequest.trieStatistics);

    return new TrieStatistics({
      accounts_snapshot_num_nodes: result['accounts-snapshot-num-nodes'],
    });
  }

  async getAddressDetails(address: string): Promise<Account> {
    const result = await this.get(`address/${address}`, GatewayComponentRequest.addressDetails);
    return result;
  }

  async getEsdtSupply(identifier: string): Promise<EsdtSupply> {
    const result = await this.get(`network/esdt/supply/${identifier}`, GatewayComponentRequest.esdtSupply);
    return result;
  }

  async getEsdtFungibleTokens(): Promise<string[]> {
    const result = await this.get('network/esdt/fungible-tokens', GatewayComponentRequest.allFungibleTokens);
    return result.tokens;
  }

  async getAddressEsdtRoles(address: string): Promise<EsdtAddressRoles> {
    const result = await this.get(`address/${address}/esdts/roles`, GatewayComponentRequest.addressEsdtAllRoles);
    return result;
  }

  async getGuardianData(address: string): Promise<GuardianResult> {
    const result = await this.get(`address/${address}/guardian-data`, GatewayComponentRequest.guardianData);
    return result;
  }

  async getNodeWaitingEpochsLeft(bls: string): Promise<number> {
    const result = await this.get(`node/waiting-epochs-left/${bls}`, GatewayComponentRequest.getNodeWaitingEpochsLeft);
    return result.epochsLeft;
  }

  async getTransactionProcessStatus(txHash: string): Promise<TransactionProcessStatus> {
    // eslint-disable-next-line require-await
    const result = await this.get(`transaction/${txHash}/process-status`, GatewayComponentRequest.transactionProcessStatus, async (error) => {
      const errorMessage = error?.response?.data?.error;
      if (errorMessage && errorMessage.includes('transaction not found')) {
        return true;
      }

      return false;
    });

    return result;
  }

  async getAddressEsdt(address: string, identifier: string): Promise<TokenData> {
    // eslint-disable-next-line require-await
    const result = await this.get(`address/${address}/esdt/${identifier}`, GatewayComponentRequest.addressEsdtBalance, async (error) => {
      const errorMessage = error?.response?.data?.error;
      if (errorMessage && errorMessage.includes('account was not found')) {
        return true;
      }

      return false;
    });

    return new TokenData(result.tokenData);
  }

  async getAddressNft(address: string, identifier: string): Promise<NftData> {
    const esdtIdentifier = identifier.split('-').slice(0, 2).join('-');
    const nonceHex = identifier.split('-').last();
    const nonceNumeric = BinaryUtils.hexToNumber(nonceHex);

    // eslint-disable-next-line require-await
    const result = await this.get(`address/${address}/nft/${esdtIdentifier}/nonce/${nonceNumeric}`, GatewayComponentRequest.addressNftByNonce, async (error) => {
      const errorMessage = error?.response?.data?.error;
      if (errorMessage && errorMessage.includes('account was not found')) {
        return true;
      }

      return false;
    });

    return new NftData(result.tokenData);
  }

  async getTransactionPool(): Promise<TxPoolGatewayResponse> {
    return await this.get(`transaction/pool?fields=nonce,sender,receiver,gaslimit,gasprice,receiverusername,data,value`, GatewayComponentRequest.transactionPool);
  }

  async getTransaction(txHash: string): Promise<Transaction | undefined> {
    // eslint-disable-next-line require-await
    const result = await this.get(`transaction/${txHash}?withResults=true`, GatewayComponentRequest.transactionDetails, async (error) => {
      if (error.response.data.error === 'transaction not found') {
        return true;
      }

      return false;
    });

    return result?.transaction;
  }

  async getBlockByShardAndNonce(shard: number, nonce: number, withTxs?: boolean): Promise<any> {
    const result = await this.get(`block/${shard}/by-nonce/${nonce}?withTxs=${withTxs ?? false}`, GatewayComponentRequest.blockByNonce);

    return result.block;
  }

  @LogPerformanceAsync(MetricsEvents.SetGatewayDuration, { argIndex: 1 })
  async get(url: string, component: GatewayComponentRequest, errorHandler?: (error: any) => Promise<boolean>): Promise<any> {
    const result = await this.getRaw(url, component, errorHandler);

    this.applyDeepHistoryBlockInfoIfRequired(component, result);

    return result?.data?.data;
  }

  @LogPerformanceAsync(MetricsEvents.SetGatewayDuration, { argIndex: 1 })
  async getRaw(url: string, component: GatewayComponentRequest, errorHandler?: (error: any) => Promise<boolean>): Promise<any> {
    const fullUrl = this.getFullUrl(component, url);

    return await this.apiService.get(fullUrl, new ApiSettings(), errorHandler);
  }

  @LogPerformanceAsync(MetricsEvents.SetGatewayDuration, { argIndex: 1 })
  async create(url: string, component: GatewayComponentRequest, data: any, errorHandler?: (error: any) => Promise<boolean>): Promise<any> {
    const result = await this.createRaw(url, component, data, errorHandler);

    this.applyDeepHistoryBlockInfoIfRequired(component, result);

    return result?.data?.data;
  }

  @LogPerformanceAsync(MetricsEvents.SetGatewayDuration, { argIndex: 1 })
  async createRaw(url: string, component: GatewayComponentRequest, data: any, errorHandler?: (error: any) => Promise<boolean>): Promise<any> {
    const fullUrl = this.getFullUrl(component, url);

    return await this.apiService.post(fullUrl, data, new ApiSettings(), errorHandler);
  }

  private getFullUrl(component: GatewayComponentRequest, suffix: string) {
    const url = new URL(`${this.getGatewayUrl(component)}/${suffix}`);

    const context = ContextTracker.get();
    if (context && context.deepHistoryBlockNonce && this.deepHistoryRequestsSet.has(component)) {
      url.searchParams.set('blockNonce', context.deepHistoryBlockNonce);
    }

    return url.href;
  }

  private getGatewayUrl(component: GatewayComponentRequest): string {
    const context = ContextTracker.get();
    if (context && context.deepHistoryBlockNonce && this.deepHistoryRequestsSet.has(component)) {
      return this.apiConfigService.getDeepHistoryGatewayUrl();
    }

    if (this.snapshotlessRequestsSet.has(component)) {
      return this.apiConfigService.getSnapshotlessGatewayUrl() ?? this.apiConfigService.getGatewayUrl();
    }

    return this.apiConfigService.getGatewayUrl();
  }

  private applyDeepHistoryBlockInfoIfRequired(component: GatewayComponentRequest, result: any) {
    const context = ContextTracker.get();
    if (context && context.deepHistoryBlockNonce && this.deepHistoryRequestsSet.has(component)) {
      const blockInfo = result?.data?.data?.blockInfo;
      if (blockInfo) {
        ContextTracker.assign({
          deepHistoryBlockInfo: blockInfo,
        });
      }
    }
  }

  async getAliasAddress(address: string): Promise<string | null> {
    return await this.cachingService.getOrSet(
      CacheInfo.AliasAddress(address).key,
      async () => await this.getAliasAddressRaw(address),
      CacheInfo.AliasAddress(address).ttl,
    );
  }

  async getAliasAddressRaw(address: string): Promise<string | null> {
    try {
      const result = await this.create('address/alias-address', GatewayComponentRequest.aliasAddress, [{
        mvxAddress: address,
        requestedIdentifier: ETHAliasAddress,
      }]);

      let data = result[address] as string | null;
      if (data && !data.startsWith('0x')) {
        data = '0x' + data;
      }

      return data;
    } catch (error: any) {
      return null;
    }
  }

  async getMvxAddress(address: string): Promise<string | null> {
    return await this.cachingService.getOrSet(
      CacheInfo.MvxAddress(address).key,
      async () => await this.getMvxAddressRaw(address),
      CacheInfo.MvxAddress(address).ttl,
    );
  }

  async getMvxAddressRaw(address: string): Promise<string | null> {
    try {
      const hexAddress = address.startsWith('0x') ? address.slice(2) : address;
      const result = await this.create('address/mvx-address', GatewayComponentRequest.mvxAddress, [{
        aliasAddress: hexAddress,
        aliasIdentifier: ETHAliasAddress,
      }]);

      return result[hexAddress];
    } catch (error: any) {
      return null;
    }
  }

  async getAliasAddresses(address: string): Promise<[string | null, string | null]> {
    try {
      if (AddressUtilsV13.isAddressValid(address)) {
        const evmAddress = await this.getAliasAddress(address);
        return [address, evmAddress];
      }

      const mvxAddress = await this.getMvxAddress(address);
      return [mvxAddress, address];
    } catch (error: any) {
      return [null, null];
    }
  }
}
