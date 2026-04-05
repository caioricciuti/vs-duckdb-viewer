import { DuckDBInstance } from "@duckdb/node-api";
import { mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const DB_PATH = join(process.cwd(), "test", "sample.duckdb");

async function main() {
  mkdirSync(join(process.cwd(), "test"), { recursive: true });
  if (existsSync(DB_PATH)) unlinkSync(DB_PATH);

  const instance = await DuckDBInstance.create(DB_PATH);
  const conn = await instance.connect();

  // ── Users table ──
  await conn.run(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      name VARCHAR NOT NULL,
      email VARCHAR,
      age INTEGER,
      score DOUBLE,
      is_active BOOLEAN,
      created_at TIMESTAMP,
      bio TEXT
    )
  `);

  await conn.run(`
    INSERT INTO users
    SELECT
      i AS id,
      CASE
        WHEN i % 7 = 0 THEN 'Alice ' || (i // 7)
        WHEN i % 7 = 1 THEN 'Bob ' || (i // 7)
        WHEN i % 7 = 2 THEN 'Charlie ' || (i // 7)
        WHEN i % 7 = 3 THEN 'Diana ' || (i // 7)
        WHEN i % 7 = 4 THEN 'Eve ' || (i // 7)
        WHEN i % 7 = 5 THEN 'Frank ' || (i // 7)
        ELSE 'Grace ' || (i // 7)
      END AS name,
      'user' || i || '@example.com' AS email,
      18 + (i % 55) AS age,
      ROUND(random() * 100, 2) AS score,
      i % 3 != 0 AS is_active,
      TIMESTAMP '2024-01-01 00:00:00' + INTERVAL (i * 3723) SECOND AS created_at,
      CASE WHEN i % 5 = 0 THEN NULL ELSE 'Bio for user ' || i END AS bio
    FROM generate_series(1, 500) t(i)
  `);

  // ── Products table ──
  await conn.run(`
    CREATE TABLE products (
      id INTEGER PRIMARY KEY,
      name VARCHAR NOT NULL,
      price DECIMAL(10,2),
      quantity INTEGER,
      category VARCHAR,
      weight_kg FLOAT,
      in_stock BOOLEAN,
      added_date DATE,
      last_updated TIMESTAMP
    )
  `);

  const categories = ["Electronics", "Books", "Clothing", "Home", "Sports", "Food", "Toys"];
  await conn.run(`
    INSERT INTO products
    SELECT
      i AS id,
      'Product ' || i AS name,
      ROUND((random() * 999 + 1)::DECIMAL(10,2), 2) AS price,
      (random() * 500)::INTEGER AS quantity,
      (ARRAY['Electronics','Books','Clothing','Home','Sports','Food','Toys'])[1 + (i % 7)] AS category,
      CASE WHEN i % 8 = 0 THEN NULL ELSE ROUND((random() * 50)::FLOAT, 1) END AS weight_kg,
      random() > 0.2 AS in_stock,
      DATE '2023-01-01' + INTERVAL (i) DAY AS added_date,
      TIMESTAMP '2024-06-01 08:00:00' + INTERVAL (i * 1800) SECOND AS last_updated
    FROM generate_series(1, 200) t(i)
  `);

  // ── Events table ──
  await conn.run(`
    CREATE TABLE events (
      id INTEGER PRIMARY KEY,
      event_type VARCHAR NOT NULL,
      user_id INTEGER,
      payload VARCHAR,
      value DOUBLE,
      occurred_at TIMESTAMP,
      is_processed BOOLEAN
    )
  `);

  await conn.run(`
    INSERT INTO events
    SELECT
      i AS id,
      (ARRAY['page_view','click','purchase','signup','logout','error'])[1 + (i % 6)] AS event_type,
      1 + (i % 500) AS user_id,
      CASE WHEN i % 4 = 0 THEN NULL ELSE '{"page":"/p/' || i || '"}' END AS payload,
      ROUND(random() * 1000, 4) AS value,
      TIMESTAMP '2024-01-01 00:00:00' + INTERVAL (i * 60) SECOND AS occurred_at,
      i % 10 != 0 AS is_processed
    FROM generate_series(1, 1000) t(i)
  `);

  conn.disconnectSync();
  instance.closeSync();

  console.log("Test database created:", DB_PATH);
  console.log("  - users:    500 rows");
  console.log("  - products: 200 rows");
  console.log("  - events:   1000 rows");
}

main().catch((err) => {
  console.error("Failed to create test database:", err);
  process.exit(1);
});
