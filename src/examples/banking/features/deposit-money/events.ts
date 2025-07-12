import { IHasEventType } from '../../../../eventstore/types';

export class MoneyDepositedEvent implements IHasEventType {
  constructor(
    public readonly accountId: string,
    public readonly amount: number,
    public readonly currency: string,
    public readonly depositId: string,
    public readonly timestamp: Date = new Date()
  ) {}

  eventType(): string {
    return 'MoneyDeposited';
  }

  eventVersion(): string {
    return '1.0';
  }
}