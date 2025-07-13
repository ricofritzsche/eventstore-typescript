import { HasEventType } from '../../../../eventstore/types';

export class BankAccountOpenedEvent implements HasEventType {
  constructor(
    public readonly accountId: string,
    public readonly customerName: string,
    public readonly accountType: 'checking' | 'savings',
    public readonly initialDeposit: number,
    public readonly currency: string,
    public readonly openedAt: Date = new Date()
  ) {}

  eventType(): string {
    return 'BankAccountOpened';
  }

  eventVersion(): string {
    return '1.0';
  }
}