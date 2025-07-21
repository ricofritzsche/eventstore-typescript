import { Event } from '../../../../eventstore/types';

export class MoneyWithdrawnEvent implements Event {
  public readonly eventType: string = 'MoneyWithdrawn';
  public readonly payload: Record<string, unknown>;

  constructor(
    public readonly accountId: string,
    public readonly amount: number,
    public readonly currency: string,
    public readonly withdrawalId: string,
    public readonly timestamp: Date = new Date()
  ) {
    this.payload = {
      accountId,
      amount,
      currency,
      withdrawalId,
      timestamp
    };
  }
}