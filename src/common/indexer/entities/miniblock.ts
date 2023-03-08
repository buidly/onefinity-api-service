export interface MiniBlock {
  miniBlockHash: string;
  senderShard: number;
  receiverShard: number;
  senderBlockHash: string;
  receiverBlockHash: string;
  type: string;
  procTypeD: string;
  timestamp: number;
  procTypeS: string;
  senderBlockNonce: string;
  receiverBlockNonce: string;
}
