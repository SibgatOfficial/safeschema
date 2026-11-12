import { Pool } from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 })
  : new Pool({
      user: process.env.DB_USER, password: process.env.DB_PASSWORD,
      host: process.env.DB_HOST, port: Number(process.env.DB_PORT), database: process.env.DB_NAME, max: 5
    });

export const getClient = () => pool;

export async function getLiveDatabaseSchema() {
  try {
    const res = await getClient().query(`SELECT table_name, column_name, data_type, column_default FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position;`);
    const schemaMap: any = {};
    for (const row of res.rows) {
      if (!schemaMap[row.table_name]) schemaMap[row.table_name] = [];
      const defaultText = row.column_default ? ` DEFAULT ${row.column_default}` : "";
      schemaMap[row.table_name].push(`${row.column_name} (${row.data_type}${defaultText})`);
    }
    let schemaString = "";
    for (const table in schemaMap) schemaString += `Table '${table}': ${schemaMap[table].join(", ")}\n`;
    return schemaString;
  } catch (error) { return "Could not read schema."; }
}