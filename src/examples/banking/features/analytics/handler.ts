import { getAccountAnalytics } from './query';
import { AnalyticsQuery, AnalyticsResult } from './types';

export async function queryHandler(
  connectionString: string,
  query: AnalyticsQuery = {}
): Promise<AnalyticsResult> {
  return await getAccountAnalytics(connectionString, query);
}