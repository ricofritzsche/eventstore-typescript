import { EventStream } from './types';
import { EventFilter } from '../eventstore/types';

export interface ProjectionHandler<T = any> {
  (event: T): Promise<void>;
}

export interface ProjectionEventHandlers {
  [eventType: string]: ProjectionHandler;
}

export interface ProjectionConfig {
  eventTypes: string[];
  handlers: ProjectionEventHandlers;
  batchSize?: number;
  errorHandler?: (error: Error, event: any) => void;
}

export interface ProjectorConfig {
  connectionString: string;
  tableName?: string;
}

let projectorConfig: ProjectorConfig;

export function configureProjector(config: ProjectorConfig): void {
  projectorConfig = config;
}

export function getProjectorConfig(): ProjectorConfig {
  if (!projectorConfig) {
    throw new Error('Projector not configured. Call configureProjector() first.');
  }
  return projectorConfig;
}

export async function startProjectionListener(
  eventStream: EventStream,
  config: ProjectionConfig
): Promise<() => Promise<void>> {
  const { eventTypes, handlers, batchSize = 10, errorHandler } = config;
  
  const filter: EventFilter = {
    eventTypes
  };

  const handleEvents = async (events: any[]) => {
    for (const event of events) {
      const handler = handlers[event.eventType];
      if (handler) {
        try {
          await handler(event);
        } catch (error) {
          if (errorHandler) {
            errorHandler(error as Error, event);
          } else {
            console.error(`Error processing event ${event.eventType}:`, error);
          }
        }
      }
    }
  };

  const subscription = await eventStream.subscribe(filter, handleEvents, {
    batchSize
  });

  return async () => {
    await subscription.unsubscribe();
  };
}

export function createProjectionConfig(
  eventTypes: string[], 
  handlers: ProjectionEventHandlers,
  options: { batchSize?: number; errorHandler?: (error: Error, event: any) => void } = {}
): ProjectionConfig {
  const config: ProjectionConfig = {
    eventTypes,
    handlers,
    batchSize: options.batchSize || 10
  };
  
  if (options.errorHandler) {
    config.errorHandler = options.errorHandler;
  }
  
  return config;
}