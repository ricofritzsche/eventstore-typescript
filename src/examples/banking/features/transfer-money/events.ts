import { Event } from '../../../../eventstore/types';

export class MoneyTransferredEvent implements Event {
  public readonly eventType: string = 'MoneyTransferred';
  public readonly payload: Record<string, unknown>;

  constructor(
    public readonly fromAccountId: string,
    public readonly toAccountId: string,
    public readonly amount: number,
    public readonly currency: string,
    public readonly transferId: string,
    public readonly timestamp: Date = new Date()
  ) {
    this.payload = {
      fromAccountId,
      toAccountId,
      amount,
      currency,
      transferId,
      timestamp
    };
  }
}