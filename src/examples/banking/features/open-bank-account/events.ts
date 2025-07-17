import { Event } from '../../../../eventstore/types';

export class BankAccountOpenedEvent implements Event {
  public readonly eventType: string = 'BankAccountOpened';
  public readonly payload: Record<string, unknown>;

  constructor(
    public readonly accountId: string,
    public readonly customerName: string,
    public readonly accountType: 'checking' | 'savings',
    public readonly initialDeposit: number,
    public readonly currency: string,
    public readonly openedAt: Date = new Date()
  ) {
    this.payload = {
      accountId,
      customerName,
      accountType,
      initialDeposit,
      currency,
      openedAt
    };
  }
}