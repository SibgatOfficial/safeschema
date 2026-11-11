// The current state of the database (we copied this from your JSON output)
const currentSchema = [
  { table_name: "users", column_name: "id", data_type: "integer", is_nullable: "NO" },
  { table_name: "users", column_name: "full_name", data_type: "character varying", is_nullable: "NO" },
  { table_name: "users", column_name: "email", data_type: "character varying", is_nullable: "YES" }
];

// The target state (what you WANT the database to look like)
const targetSchema = [
  { table_name: "users", column_name: "id", data_type: "integer", is_nullable: "NO" },
  { table_name: "users", column_name: "first_name", data_type: "character varying", is_nullable: "NO" }, // Added
  { table_name: "users", column_name: "last_name", data_type: "character varying", is_nullable: "NO" },  // Added
  { table_name: "users", column_name: "email", data_type: "character varying", is_nullable: "YES" }
  // Notice "full_name" is gone! We want to split it.
];

type Change = {
  type: "ADD_COLUMN" | "DROP_COLUMN" | "MODIFY_COLUMN";
  table: string;
  column: string;
  risk: "SAFE" | "RISKY";
  reason: string;
};

function diffSchemas(current: any[], target: any[]): Change[] {
  const changes: Change[] = [];

  // Helper to find a column in an array
  const findCol = (schema: any[], table: string, col: string) => 
    schema.find(c => c.table_name === table && c.column_name === col);

  // 1. Find ADDED columns (in target, but not in current)
  for (const targetCol of target) {
    const currentCol = findCol(current, targetCol.table_name, targetCol.column_name);
    
    if (!currentCol) {
      // If it's a new column and it's NOT NULL, but has no default, it's RISKY
      // (Because existing rows won't have data for it)
      const isRisky = targetCol.is_nullable === "NO"; 
      changes.push({
        type: "ADD_COLUMN",
        table: targetCol.table_name,
        column: targetCol.column_name,
        risk: isRisky ? "RISKY" : "SAFE",
        reason: isRisky 
          ? "Adding a NOT NULL column without a default value will fail on existing rows." 
          : "Safe to add."
      });
    } else if (currentCol.data_type !== targetCol.data_type) {
       changes.push({
        type: "MODIFY_COLUMN",
        table: targetCol.table_name,
        column: targetCol.column_name,
        risk: "RISKY",
        reason: `Changing type from ${currentCol.data_type} to ${targetCol.data_type} might cause data truncation.`
      });
    }
  }

  // 2. Find DROPPED columns (in current, but not in target)
  for (const currentCol of current) {
    const targetCol = findCol(target, currentCol.table_name, currentCol.column_name);
    
    if (!targetCol) {
      changes.push({
        type: "DROP_COLUMN",
        table: currentCol.table_name,
        column: currentCol.column_name,
        risk: "RISKY",
        reason: "Dropping a column will permanently delete all its data."
      });
    }
  }

  return changes;
}

// Run the engine
const detectedChanges = diffSchemas(currentSchema, targetSchema);

console.log("🔍 Detected Schema Changes:");
console.log(JSON.stringify(detectedChanges, null, 2));