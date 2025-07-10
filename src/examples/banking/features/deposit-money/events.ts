import { HasEventType } from '../../eventstore/types';

export class MoneyDepositedEvent implements HasEventType {
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