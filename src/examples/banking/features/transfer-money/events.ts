import { HasEventType } from '../../../../eventstore/types';

export class MoneyTransferredEvent implements HasEventType {
  constructor(
    public readonly fromAccountId: string,
    public readonly toAccountId: string,
    public readonly amount: number,
    public readonly currency: string,
    public readonly transferId: string,
    public readonly timestamp: Date = new Date()
  ) {}

  eventType(): string {
    return 'MoneyTransferred';
  }

  eventVersion(): string {
    return '1.0';
  }
}