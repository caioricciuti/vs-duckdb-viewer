import {
  DuckDBInstance,
  DuckDBConnection,
  DuckDBResultReader,
} from "@duckdb/node-api";

export interface ColumnInfo {
  name: string;
  type: string;
}

export interface QueryResult {
  columns: ColumnInfo[];
  rows: unknown[][];
  totalRows: number;
  timeMs: number;
}

export interface TableInfo {
  name: string;
  rowCount: number;
}

const PAGE_SIZE = 100;

export class DuckDBProvider {
  private instance: DuckDBInstance | null = null;
  private connection: DuckDBConnection | null = null;
  readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async connect(): Promise<void> {
    this.instance = await DuckDBInstance.create(this.filePath, {
      access_mode: "READ_ONLY",
    });
    this.connection = await this.instance.connect();
  }

  async reconnect(): Promise<void> {
    this.dispose();
    await this.connect();
  }

  async getTables(): Promise<TableInfo[]> {
    this.assertConnected();
    const reader = await this.connection!.runAndReadAll("SHOW TABLES");
    const tableNames = reader.getRows().map((row) => row[0] as string);

    const tables: TableInfo[] = [];
    for (const name of tableNames) {
      try {
        const countReader = await this.connection!.runAndReadAll(
          `SELECT COUNT(*)::INTEGER FROM "${name}"`
        );
        const countRows = countReader.getRows();
        tables.push({ name, rowCount: Number(countRows[0][0]) });
      } catch {
        tables.push({ name, rowCount: -1 });
      }
    }
    return tables;
  }

  async getTableData(table: string, page: number): Promise<QueryResult> {
    this.assertConnected();
    const offset = page * PAGE_SIZE;
    const dataSql = `SELECT * FROM "${table}" LIMIT ${PAGE_SIZE} OFFSET ${offset}`;
    const countSql = `SELECT COUNT(*)::INTEGER FROM "${table}"`;

    const start = performance.now();
    const [dataReader, countReader] = await Promise.all([
      this.connection!.runAndReadAll(dataSql),
      this.connection!.runAndReadAll(countSql),
    ]);
    const timeMs = Math.round(performance.now() - start);

    return {
      columns: extractColumns(dataReader),
      rows: sanitizeRows(dataReader.getRowsJS()),
      totalRows: Number(countReader.getRows()[0][0]),
      timeMs,
    };
  }

  async runQuery(sql: string): Promise<QueryResult> {
    this.assertConnected();
    const start = performance.now();
    const reader = await this.connection!.runAndReadAll(sql);
    const timeMs = Math.round(performance.now() - start);
    const rows = sanitizeRows(reader.getRowsJS());

    return {
      columns: extractColumns(reader),
      rows,
      totalRows: rows.length,
      timeMs,
    };
  }

  dispose(): void {
    try {
      this.connection?.disconnectSync();
    } catch {
      /* already closed */
    }
    try {
      this.instance?.closeSync();
    } catch {
      /* already closed */
    }
    this.connection = null;
    this.instance = null;
  }

  private assertConnected(): void {
    if (!this.connection) {
      throw new Error("Not connected to DuckDB. Call connect() first.");
    }
  }
}

function extractColumns(reader: DuckDBResultReader): ColumnInfo[] {
  const columns: ColumnInfo[] = [];
  for (let i = 0; i < reader.columnCount; i++) {
    columns.push({
      name: reader.columnName(i),
      type: String(reader.columnType(i)),
    });
  }
  return columns;
}

/** Convert BigInt and Date values to JSON-safe types for postMessage. */
function sanitizeRows(rows: unknown[][]): unknown[][] {
  return rows.map((row) => row.map(sanitizeValue));
}

function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") {
    return Number.MIN_SAFE_INTEGER <= value && value <= Number.MAX_SAFE_INTEGER
      ? Number(value)
      : value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    return String(value);
  }
  return value;
}
