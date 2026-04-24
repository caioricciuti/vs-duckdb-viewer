import {
  DuckDBInstance,
  DuckDBConnection,
  DuckDBResultReader,
} from "@duckdb/node-api";
import {
  PAGE_SIZE,
  type ColumnInfo,
  type SchemaInfo,
  type SchemaTable,
  type SchemaColumn,
  type SortDir,
} from "./shared/types";

export type { ColumnInfo, SchemaInfo, SchemaTable, SchemaColumn };

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

const DATA_FILE_EXTS = new Set([".csv", ".parquet", ".json", ".jsonl", ".ndjson"]);

function isDataFile(filePath: string): boolean {
  const ext = filePath.toLowerCase().replace(/^.*(\.[^.]+)$/, "$1");
  return DATA_FILE_EXTS.has(ext);
}

function readerFn(filePath: string): string {
  const ext = filePath.toLowerCase().replace(/^.*(\.[^.]+)$/, "$1");
  switch (ext) {
    case ".csv":
      return "read_csv_auto";
    case ".parquet":
      return "read_parquet";
    case ".json":
    case ".jsonl":
    case ".ndjson":
      return "read_json_auto";
    default:
      return "read_csv_auto";
  }
}

export class DuckDBProvider {
  private instance: DuckDBInstance | null = null;
  private connection: DuckDBConnection | null = null;
  readonly filePath: string;
  private isDataFileMode: boolean;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.isDataFileMode = isDataFile(filePath);
  }

  async connect(): Promise<void> {
    if (this.isDataFileMode) {
      this.instance = await DuckDBInstance.create();
      this.connection = await this.instance.connect();
      const escaped = this.filePath.replace(/'/g, "''");
      await this.connection.run(
        `CREATE OR REPLACE VIEW data AS SELECT * FROM ${readerFn(this.filePath)}('${escaped}')`
      );
    } else {
      this.instance = await DuckDBInstance.create(this.filePath, {
        access_mode: "READ_ONLY",
      });
      this.connection = await this.instance.connect();
    }
  }

  async reconnect(): Promise<void> {
    this.dispose();
    await this.connect();
  }

  async getSchema(): Promise<SchemaInfo> {
    this.assertConnected();

    const colReader = await this.connection!.runAndReadAll(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'main'
      ORDER BY table_name, ordinal_position
    `);
    const colRows = colReader.getRows();

    const tableMap = new Map<string, SchemaColumn[]>();
    for (const row of colRows) {
      const tableName = row[0] as string;
      const colName = row[1] as string;
      const colType = row[2] as string;
      if (!tableMap.has(tableName)) tableMap.set(tableName, []);
      tableMap.get(tableName)!.push({ name: colName, type: colType });
    }

    const tables: SchemaTable[] = [];
    for (const [name, columns] of tableMap) {
      let rowCount = -1;
      try {
        const countReader = await this.connection!.runAndReadAll(
          `SELECT COUNT(*)::INTEGER FROM "${name}"`
        );
        rowCount = Number(countReader.getRows()[0][0]);
      } catch {
        // ignore
      }
      tables.push({ name, rowCount, columns });
    }

    return { tables };
  }

  async getTableData(
    table: string,
    page: number,
    sortCol?: string,
    sortDirection?: SortDir
  ): Promise<QueryResult> {
    this.assertConnected();
    const offset = page * PAGE_SIZE;
    let dataSql = `SELECT * FROM "${table}"`;
    if (sortCol) {
      const dir = sortDirection === "DESC" ? "DESC" : "ASC";
      dataSql += ` ORDER BY "${sortCol}" ${dir}`;
    }
    dataSql += ` LIMIT ${PAGE_SIZE} OFFSET ${offset}`;
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

  get canAttachFiles(): boolean {
    return this.isDataFileMode;
  }

  async attachFile(filePath: string, alias: string): Promise<void> {
    this.assertConnected();
    if (!this.isDataFileMode) {
      throw new Error(
        "Attach is only supported when viewing data files (CSV, Parquet, JSON)."
      );
    }
    const escaped = filePath.replace(/'/g, "''");
    await this.connection!.run(
      `CREATE OR REPLACE VIEW "${alias}" AS SELECT * FROM ${readerFn(filePath)}('${escaped}')`
    );
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
