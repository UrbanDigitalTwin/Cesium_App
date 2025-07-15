#!/usr/bin/env node

// Simple script to run the data migration
import { runMigration } from "./migrate-data.js";

console.log("Starting Firebase to Supabase data migration...\n");

runMigration()
  .then(() => {
    console.log("\n✅ Migration completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  });
