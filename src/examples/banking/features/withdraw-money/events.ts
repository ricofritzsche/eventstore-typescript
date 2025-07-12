import { IHasEventType } from '../../../../eventstore/types';

export class MoneyWithdrawnEvent implements IHasEventType {
  constructor(
    public readonly accountId: string,
    public readonly amount: number,
    public readonly currency: string,
    public readonly withdrawalId: string,
    public readonly timestamp: Date = new Date()
  ) {}

  eventType(): string {
    return 'MoneyWithdrawn';
  }

  eventVersion(): string {
    return '1.0';
  }
}