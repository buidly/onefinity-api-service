import { Body, Controller, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TransactionSendResult } from '../transactions/entities/transaction.send.result';
import { FaucetService } from './faucet.service';

@Controller()
@ApiTags('faucet')
export class FaucetController {
  constructor(private readonly faucetService: FaucetService) { }

  @Post('/faucet')
  @ApiOperation({ summary: 'Faucet', description: 'Distribute tokens' })
  @ApiOkResponse({ type: TransactionSendResult })
  async faucet(
    @Body() body: any,
  ): Promise<TransactionSendResult> {
    return await this.faucetService.sendTokensToAddress(body?.address);
  }
}
