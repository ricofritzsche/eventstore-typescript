/**
 * Redis key patterns and schema definitions for event storage using Redis Streams
 */

export const STREAM_KEY = 'eventstore:stream';
export const SEQUENCE_COUNTER_KEY = 'eventstore:sequence:counter';
export const EVENT_INDEX_TYPE_KEY = 'eventstore:index:type:';
export const EVENT_INDEX_TYPE_PATTERN = `${EVENT_INDEX_TYPE_KEY}*`;

/**
 * Gets the Redis key for event type index
 */
export function getEventTypeIndexKey(eventType: string): string {
  return `${EVENT_INDEX_TYPE_KEY}${eventType}`;
}

/**
 * Parses sequence number from stream entry ID
 * Stream IDs are in format: <timestamp>-<sequence>
 * We store sequence_number as a field, but can also extract from ID if needed
 */
export function parseSequenceNumberFromStreamId(streamId: string | undefined): number | null {
  if (!streamId) {
    return null;
  }
  // Stream IDs are in format: "1234567890-0"
  // We'll primarily use the sequence_number field, but this can be a fallback
  const parts = streamId.split('-');
  if (parts.length === 2) {
    const seq = parseInt(parts[1] || '0', 10);
    return isNaN(seq) ? null : seq;
  }
  return null;
}

/**
 * Gets database number from Redis connection string/URL
 */
export function getDatabaseNameFromConnectionString(connectionString: string): number {
  try {
    // Handle both URL format (redis://host:port?db=0) and simple format
    if (connectionString.includes('?')) {
      // Parse URL manually to avoid URL constructor issues
      const urlParts = connectionString.split('?');
      if (urlParts.length === 2) {
        const params = urlParts[1]?.split('&') || [];
        for (const param of params) {
          const [key, value] = param.split('=');
          if (key === 'db' && value) {
            return parseInt(value, 10);
          }
        }
      }
    }
    // If not a URL format, assume default database 0
    return 0;
  } catch (err) {
    // If not a URL, assume default database 0
    return 0;
  }
}

