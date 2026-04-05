import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import type { SchemaTable } from "../shared/types";

const DUCKDB_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "GROUP BY", "ORDER BY", "LIMIT", "OFFSET",
  "JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "CROSS", "FULL", "ON", "USING",
  "AS", "WITH", "HAVING", "UNION", "UNION ALL", "EXCEPT", "INTERSECT",
  "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE",
  "CREATE", "DROP", "ALTER", "TABLE", "VIEW", "INDEX", "SCHEMA",
  "EXISTS", "NOT", "AND", "OR", "IN", "BETWEEN", "LIKE", "ILIKE",
  "IS", "NULL", "TRUE", "FALSE", "DEFAULT",
  "CASE", "WHEN", "THEN", "ELSE", "END",
  "DISTINCT", "ALL", "ANY", "CAST", "TRY_CAST",
  "EXPLAIN", "ANALYZE", "DESCRIBE", "SHOW", "PRAGMA",
  "COPY", "EXPORT", "IMPORT",
  "PIVOT", "UNPIVOT", "QUALIFY", "WINDOW", "OVER", "PARTITION BY",
  "ROWS", "RANGE", "GROUPS", "PRECEDING", "FOLLOWING", "CURRENT ROW",
  "EXCLUDE", "FILTER", "SAMPLE", "TABLESAMPLE",
  "LATERAL", "UNNEST", "GENERATE_SERIES",
  "ASC", "DESC", "NULLS FIRST", "NULLS LAST",
  "GROUP", "BY", "ORDER", "PARTITION",
  "IF", "REPLACE", "TEMPORARY", "TEMP", "RECURSIVE",
  "RETURNING", "CONFLICT", "DO", "NOTHING",
  "BEGIN", "COMMIT", "ROLLBACK", "TRANSACTION",
  "READ_CSV", "READ_PARQUET", "READ_JSON",
  "ATTACH", "DETACH", "USE",
];

const DUCKDB_FUNCTIONS = [
  "count", "sum", "avg", "min", "max", "first", "last",
  "list_agg", "string_agg", "array_agg", "group_concat",
  "median", "mode", "stddev", "variance", "corr",
  "row_number", "rank", "dense_rank", "ntile", "lag", "lead",
  "first_value", "last_value", "nth_value",
  "length", "lower", "upper", "trim", "ltrim", "rtrim",
  "replace", "substring", "left", "right", "reverse",
  "starts_with", "ends_with", "contains", "position",
  "regexp_matches", "regexp_replace", "regexp_extract",
  "split_part", "concat", "concat_ws", "repeat", "lpad", "rpad",
  "strftime", "strptime", "date_part", "date_trunc", "date_diff", "date_add",
  "current_date", "current_timestamp", "now", "today",
  "epoch_ms", "epoch", "make_date", "make_timestamp",
  "extract", "year", "month", "day", "hour", "minute", "second",
  "abs", "ceil", "floor", "round", "ln", "log", "log2", "log10",
  "exp", "pow", "power", "sqrt", "sign", "pi", "random",
  "greatest", "least", "coalesce", "nullif", "ifnull",
  "typeof", "hash", "md5", "sha256",
  "list_value", "list_extract", "list_concat", "list_contains",
  "list_sort", "list_reverse", "list_distinct", "list_filter",
  "list_transform", "list_reduce", "flatten", "unnest", "range",
  "generate_series", "struct_pack", "struct_extract",
  "json_extract", "json_extract_string", "json_type",
  "json_array_length", "json_keys", "json_valid",
  "read_csv", "read_parquet", "read_json",
  "read_csv_auto", "read_json_auto",
  "to_json", "from_json",
  "encode", "decode",
  "printf", "format", "bar",
  "map", "map_keys", "map_values", "map_entries",
  "columns", "exclude", "struct",
];

const keywordCompletions: Completion[] = DUCKDB_KEYWORDS.map((kw) => ({
  label: kw,
  type: "keyword",
  boost: -1,
}));

const functionCompletions: Completion[] = DUCKDB_FUNCTIONS.map((fn) => ({
  label: fn,
  type: "function",
  apply: fn + "()",
  boost: 0,
}));

let tableCompletions: Completion[] = [];
let columnCompletions: Completion[] = [];

export function updateSchema(tables: SchemaTable[]): void {
  tableCompletions = tables.map((t) => ({
    label: t.name,
    type: "class",
    detail: `${t.rowCount.toLocaleString()} rows`,
    boost: 2,
  }));

  columnCompletions = [];
  for (const table of tables) {
    for (const col of table.columns) {
      columnCompletions.push({
        label: col.name,
        type: "property",
        detail: `${table.name}.${col.type}`,
        boost: 1,
      });
    }
  }
}

export function duckdbCompletion(
  context: CompletionContext
): CompletionResult | null {
  const word = context.matchBefore(/[\w."]*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;

  const all = [
    ...tableCompletions,
    ...columnCompletions,
    ...functionCompletions,
    ...keywordCompletions,
  ];

  return {
    from: word.from,
    options: all,
    validFor: /^[\w"]*$/,
  };
}
