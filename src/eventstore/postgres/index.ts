export { buildContextQuery, buildContextVersionQuery } from './query';
export { buildCteInsertQuery } from './insert';
export { deserializeEvent, mapRecordsToEvents, extractMaxSequenceNumber, prepareInsertParams } from './transform';
export { PostgresEventStore, type PostgresEventStoreOptions } from './store';
export {
  CREATE_EVENTS_TABLE,
  CREATE_EVENT_TYPE_INDEX,
  CREATE_OCCURRED_AT_INDEX,
  CREATE_PAYLOAD_GIN_INDEX,
  createDatabaseQuery,
  changeDatabaseInConnectionString,
  getDatabaseNameFromConnectionString
} from './schema';