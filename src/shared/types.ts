export interface SchemaColumn {
  name: string;
  type: string;
}

export interface SchemaTable {
  name: string;
  rowCount: number;
  columns: SchemaColumn[];
}

export interface SchemaInfo {
  tables: SchemaTable[];
}

export interface ColumnInfo {
  name: string;
  type: string;
}

export type SortDir = "ASC" | "DESC";

export const PAGE_SIZE = 100;

export interface ExtensionMessage {
  type: string;
  table?: string;
  page?: number;
  sql?: string;
  sortColumn?: string;
  sortDir?: SortDir;
}

export interface QueryResultMsg {
  type: "queryResult";
  columns: ColumnInfo[];
  rows: unknown[][];
  totalRows: number;
  timeMs: number;
  table?: string;
  page?: number;
  sortColumn?: string;
  sortDir?: string;
}

export interface SchemaLoadedMsg {
  type: "schemaLoaded";
  schema: SchemaInfo;
}

export interface HistoryLoadedMsg {
  type: "historyLoaded";
  history: string[];
}

export interface ErrorMsg {
  type: "error";
  message: string;
}

export type WebviewIncomingMessage =
  | QueryResultMsg
  | SchemaLoadedMsg
  | HistoryLoadedMsg
  | ErrorMsg;
