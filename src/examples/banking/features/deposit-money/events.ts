import { Event } from '../../../../eventstore/types';

export class MoneyDepositedEvent implements Event {
  public readonly eventType: string = 'MoneyDeposited';
  public readonly payload: Record<string, unknown>;

  constructor(
    public readonly accountId: string,
    public readonly amount: number,
    public readonly currency: string,
    public readonly depositId: string,
    public readonly timestamp: Date = new Date()
  ) {
    this.payload = {
      accountId,
      amount,
      currency,
      depositId,
      timestamp
    };
  }
}