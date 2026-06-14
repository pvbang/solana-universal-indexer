import { z } from 'zod';

/** Supported field types for dynamic schemas */
export const FieldTypeEnum = z.enum([
  'publicKey',
  'u8', 'u16', 'u32', 'u64', 'u128',
  'i8', 'i16', 'i32', 'i64', 'i128',
  'bool',
  'string',
  'bytes',
  'timestamp',
]);

export type FieldType = z.infer<typeof FieldTypeEnum>;

/** Schema field definition */
export const SchemaFieldSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
  type: FieldTypeEnum,
  indexed: z.boolean().default(false),
  nullable: z.boolean().default(false),
  description: z.string().optional(),
});

export type SchemaField = z.infer<typeof SchemaFieldSchema>;

/** Create schema request */
export const CreateSchemaSchema = z.object({
  name: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  programId: z.string().min(32).max(44),
  instructions: z.array(z.string()).min(1),
  fields: z.array(SchemaFieldSchema).min(1).max(50),
  description: z.string().optional(),
  version: z.number().int().positive().default(1),
});

export type CreateSchemaInput = z.infer<typeof CreateSchemaSchema>;

/** Stored schema with metadata */
export interface IndexerSchema {
  id: string;
  name: string;
  programId: string;
  instructions: string[];
  fields: SchemaField[];
  description?: string;
  version: number;
  tableName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Query parameters for data retrieval */
export const QueryParamsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  filters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export type QueryParams = z.infer<typeof QueryParamsSchema>;

/** Indexer status */
export interface IndexerStatus {
  schemaId: string;
  schemaName: string;
  isRunning: boolean;
  lastProcessedSlot: number;
  totalIndexed: number;
  errorCount: number;
  startedAt?: Date;
}

/** Transaction data from Solana */
export interface SolanaTransaction {
  signature: string;
  slot: number;
  blockTime: number | null;
  programId: string;
  instruction: string;
  data: Record<string, unknown>;
  accounts: string[];
}
