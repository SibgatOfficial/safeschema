CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS migration_history (
  id SERIAL PRIMARY KEY,
  user_prompt TEXT,
  generated_sql TEXT,
  embedding vector(3) -- Keeping it simple for the demo
);