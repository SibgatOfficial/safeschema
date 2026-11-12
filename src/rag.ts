import { getClient } from "./db";

export async function getMigrationHistory() {
  try {
    const res = await getClient().query(`SELECT user_prompt, generated_sql FROM migration_history ORDER BY id DESC LIMIT 1;`);
    if (res.rows.length === 0) return "No past migrations found.";
    return `Past successful migration: User asked "${res.rows[0].user_prompt}" and SQL was "${res.rows[0].generated_sql}"`;
  } catch (e) { return "Could not read history."; }
}