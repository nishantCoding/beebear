import { z } from 'zod';
import { makeSuccessResult, buildImportLines } from './helpers.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const scaffoldEventPublisherSchema = {
  transport: z.enum(['rabbitmq', 'kafka', 'sqs', 'outbox']).describe('Message transport for event publishing'),
};

export type ScaffoldEventPublisherInput = z.objectOutputType<typeof scaffoldEventPublisherSchema, z.ZodTypeAny>;

function generatePort(): string {
  const imports = buildImportLines([
    { names: ['Port'], from: 'beebear' },
    { names: ['DomainEvent'], from: '@beebear-plugins/ddd', typeOnly: true },
  ]);

  return `${imports}

export interface EventPublisher {
  publish(events: ReadonlyArray<DomainEvent>): Promise<void>;
}

export const EventPublisher = Port<EventPublisher>('EventPublisher');
`;
}

const ADAPTERS: Record<string, string> = {
  rabbitmq: `import type { EventPublisher } from '../../domain/ports/EventPublisher.js';
import type { DomainEvent } from '@beebear-plugins/ddd';

export class RabbitMQEventPublisher implements EventPublisher {
  constructor(private channel: any) {}

  async publish(events: ReadonlyArray<DomainEvent>) {
    for (const event of events) {
      await this.channel.publish(
        'events',
        event.eventName,
        Buffer.from(JSON.stringify(event)),
      );
    }
  }
}
`,
  kafka: `import type { EventPublisher } from '../../domain/ports/EventPublisher.js';
import type { DomainEvent } from '@beebear-plugins/ddd';

export class KafkaEventPublisher implements EventPublisher {
  constructor(private producer: any) {}

  async publish(events: ReadonlyArray<DomainEvent>) {
    await this.producer.sendBatch({
      topicMessages: events.map((event) => ({
        topic: event.eventName,
        messages: [{
          key: String(event.aggregateId),
          value: JSON.stringify(event),
        }],
      })),
    });
  }
}
`,
  sqs: `import type { EventPublisher } from '../../domain/ports/EventPublisher.js';
import type { DomainEvent } from '@beebear-plugins/ddd';

export class SQSEventPublisher implements EventPublisher {
  constructor(private sqs: any, private queueUrl: string) {}

  async publish(events: ReadonlyArray<DomainEvent>) {
    for (const event of events) {
      await this.sqs.sendMessage({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(event),
        MessageAttributes: {
          eventName: { DataType: 'String', StringValue: event.eventName },
        },
      });
    }
  }
}
`,
  outbox: `import type { EventPublisher } from '../../domain/ports/EventPublisher.js';
import type { DomainEvent } from '@beebear-plugins/ddd';

export class OutboxEventPublisher implements EventPublisher {
  constructor(private db: any) {}

  async publish(events: ReadonlyArray<DomainEvent>) {
    await this.db.outboxEvents.insertMany(
      events.map((e) => ({
        eventName: e.eventName,
        aggregateId: String(e.aggregateId),
        payload: JSON.stringify(e),
        occurredAt: e.occurredAt,
        published: false,
      })),
    );
  }
}
`,
};

export function scaffoldEventPublisher(input: ScaffoldEventPublisherInput): string {
  const port = generatePort();
  const adapter = ADAPTERS[input.transport];

  return `// --- Port (domain/ports/EventPublisher.ts) ---

${port}
// --- Adapter (infrastructure/services/${input.transport}-event-publisher.ts) ---

${adapter}`;
}

export function handleScaffoldEventPublisher(input: ScaffoldEventPublisherInput): CallToolResult {
  return makeSuccessResult(scaffoldEventPublisher(input));
}
