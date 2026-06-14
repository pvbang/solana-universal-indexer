import { Pool, PoolConfig } from 'pg';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { IndexerSchema, SchemaField } from '../types/schema.js';

export class DatabaseManager {
  private static instance: DatabaseManager;
  private pool: Pool;

  private constructor() {
    const poolConfig: PoolConfig = {
      connectionString: config.databaseUrl,
      max: config.databasePoolSize,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };
    this.pool = new Pool(poolConfig);
  }

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  async connect(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
      logger.info('Database connection verified');
    } finally {
      client.release();
    }
  }

  /** Create the schemas metadata table */
  async initializeMetaTables(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS indexer_schemas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(128) UNIQUE NOT NULL,
        program_id VARCHAR(44) NOT NULL,
        instructions TEXT[] NOT NULL,
        fields JSONB NOT NULL,
        description TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        table_name VARCHAR(128) UNIQUE NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS indexer_status (
        schema_id UUID PRIMARY KEY REFERENCES indexer_schemas(id),
        is_running BOOLEAN NOT NULL DEFAULT false,
        last_processed_slot BIGINT NOT NULL DEFAULT 0,
        total_indexed BIGINT NOT NULL DEFAULT 0,
        error_count INTEGER NOT NULL DEFAULT 0,
        started_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_schemas_program_id ON indexer_schemas(program_id);
      CREATE INDEX IF NOT EXISTS idx_schemas_active ON indexer_schemas(is_active);
    `);
  }

  /** Dynamically create a table for a schema */
  async createDynamicTable(schema: IndexerSchema): Promise<void> {
    const columns = schema.fields.map(field => {
      const sqlType = this.fieldTypeToSQL(field);
      const nullable = field.nullable ? '' : ' NOT NULL';
      return `  ${field.name} ${sqlType}${nullable}`;
    });

    const sql = `
      CREATE TABLE IF NOT EXISTS ${schema.tableName} (
        id BIGSERIAL PRIMARY KEY,
        signature VARCHAR(88) NOT NULL,
        slot BIGINT NOT NULL,
        block_time TIMESTAMPTZ,
        instruction VARCHAR(64) NOT NULL,
        ${columns.join(',\n')},
        indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_${schema.tableName}_slot ON ${schema.tableName}(slot DESC);
      CREATE INDEX IF NOT EXISTS idx_${schema.tableName}_signature ON ${schema.tableName}(signature);
      CREATE INDEX IF NOT EXISTS idx_${schema.tableName}_instruction ON ${schema.tableName}(instruction);
    `;

    // Create indexes for indexed fields
    const indexSql = schema.fields
      .filter(f => f.indexed)
      .map(f => `CREATE INDEX IF NOT EXISTS idx_${schema.tableName}_${f.name} ON ${schema.tableName}(${f.name});`)
      .join('\n');

    await this.pool.query(sql);
    if (indexSql) {
      await this.pool.query(indexSql);
    }

    logger.info(`Dynamic table created: ${schema.tableName}`, { fields: schema.fields.length });
  }

  /** Map schema field types to PostgreSQL types */
  private fieldTypeToSQL(field: SchemaField): string {
    const typeMap: Record<string, string> = {
      publicKey: 'VARCHAR(44)',
      u8: 'SMALLINT',
      u16: 'INTEGER',
      u32: 'BIGINT',
      u64: 'NUMERIC(20,0)',
      u128: 'NUMERIC(39,0)',
      i8: 'SMALLINT',
      i16: 'INTEGER',
      i32: 'INTEGER',
      i64: 'BIGINT',
      i128: 'NUMERIC(39,0)',
      bool: 'BOOLEAN',
      string: 'TEXT',
      bytes: 'BYTEA',
      timestamp: 'TIMESTAMPTZ',
    };
    return typeMap[field.type] || 'TEXT';
  }

  /** Insert indexed data into dynamic table */
  async insertData(tableName: string, records: Record<string, unknown>[]): Promise<number> {
    if (records.length === 0) return 0;

    const columns = Object.keys(records[0]);
    const placeholders = records.map((_, i) =>
      `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(', ')})`
    ).join(', ');

    const values = records.flatMap(r => columns.map(c => r[c]));

    const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${placeholders}`;
    const result = await this.pool.query(sql, values);
    return result.rowCount || 0;
  }

  /** Query data from dynamic table with filters and pagination */
  async queryData(
    tableName: string,
    filters: Record<string, unknown> = {},
    page = 1,
    limit = 50,
    sortBy = 'slot',
    sortOrder: 'asc' | 'desc' = 'desc'
  ): Promise<{ data: Record<string, unknown>[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    for (const [key, value] of Object.entries(filters)) {
      conditions.push(`${key} = $${paramIdx}`);
      values.push(value);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const countSql = `SELECT COUNT(*) FROM ${tableName} ${whereClause}`;
    const dataSql = `SELECT * FROM ${tableName} ${whereClause} ORDER BY ${sortBy} ${sortOrder} LIMIT ${limit} OFFSET ${offset}`;

    const [countResult, dataResult] = await Promise.all([
      this.pool.query(countSql, values),
      this.pool.query(dataSql, values),
    ]);

    return {
      data: dataResult.rows,
      total: parseInt(countResult.rows[0].count),
    };
  }

  /** Get pool for direct queries */
  getPool(): Pool {
    return this.pool;
  }

  async disconnect(): Promise<void> {
    await this.pool.end();
  }
}
