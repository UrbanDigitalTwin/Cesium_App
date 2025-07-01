#!/usr/bin/env node

// Script to update HTML files to use Supabase authentication instead of Firebase

import fs from "fs";
import path from "path";

const htmlFiles = [
  "../client/public/login.html",
  "../client/public/register.html",
  "../client/src/index.html",
];

function updateHtmlFile(filePath) {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.log(`File not found: ${filePath}`);
      return false;
    }

    // Read file content
    let content = fs.readFileSync(filePath, "utf8");
    let updated = false;

    // Replace Firebase auth script with Supabase auth script
    const firebasePattern =
      /<script type="module" src="\.\.\/auth\/auth\.js"><\/script>/g;
    const supabaseReplacement =
      '<script type="module" src="../auth/supabase-auth.js"></script>';

    if (firebasePattern.test(content)) {
      content = content.replace(firebasePattern, supabaseReplacement);
      updated = true;
      console.log(`Updated auth script in: ${filePath}`);
    }

    // Write updated content back to file
    if (updated) {
      fs.writeFileSync(filePath, content, "utf8");
      return true;
    } else {
      console.log(`No changes needed in: ${filePath}`);
      return false;
    }
  } catch (error) {
    console.error(`Error updating ${filePath}:`, error.message);
    return false;
  }
}

function main() {
  console.log("Updating HTML files to use Supabase authentication...\n");

  let updatedCount = 0;
  let totalFiles = 0;

  for (const filePath of htmlFiles) {
    totalFiles++;
    if (updateHtmlFile(filePath)) {
      updatedCount++;
    }
  }

  console.log(`\nMigration Summary:`);
  console.log(`- Total files processed: ${totalFiles}`);
  console.log(`- Files updated: ${updatedCount}`);
  console.log(`- Files unchanged: ${totalFiles - updatedCount}`);

  if (updatedCount > 0) {
    console.log(
      `\n✅ Successfully updated ${updatedCount} HTML file(s) to use Supabase authentication.`
    );
    console.log(`\nNext steps:`);
    console.log(
      `1. Configure your Supabase credentials in auth/supabase-config.js`
    );
    console.log(`2. Run the database schema in your Supabase SQL Editor`);
    console.log(`3. Test the application`);
  } else {
    console.log(
      `\n⚠️  No files were updated. Please check if the files exist and contain the expected Firebase auth script.`
    );
  }
}

// Run the script
main();
