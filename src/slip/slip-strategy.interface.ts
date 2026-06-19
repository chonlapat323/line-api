export interface SlipVerifyResult {
  success: boolean;
  amount?: number;
  transRef?: string;
  senderName?: string;
  senderBank?: string;
  receiverName?: string;
  receiverBank?: string;
  paidAt?: string;
  raw?: any;
}

export interface ISlipStrategy {
  verify(imageBuffer: Buffer, filename: string): Promise<SlipVerifyResult>;
}
