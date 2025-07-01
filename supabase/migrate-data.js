// Data Migration Script: Firebase to Supabase
// This script helps migrate existing user data from Firebase to Supabase

import { createClient } from "@supabase/supabase-js";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, get } from "firebase/database";
import { supabaseConfig } from "../auth/supabase-config.js";

// Firebase configuration (keep your existing config)
const firebaseConfig = {
  apiKey: "AIzaSyAfDtdZMgcoNVCcRpS7IHI0aDOzYuzIRP4",
  authDomain: "cesiumapp.firebaseapp.com",
  databaseURL: "https://cesiumapp-default-rtdb.firebaseio.com",
  projectId: "cesiumapp",
  storageBucket: "cesiumapp.firebasestorage.app",
  messagingSenderId: "1116245708",
  appId: "1:1116245708:web:9fd4c831d31ee9c5017c69",
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const firebaseDb = getDatabase(firebaseApp);

// Initialize Supabase
const supabase = createClient(
  supabaseConfig.supabaseUrl,
  supabaseConfig.supabaseAnonKey
);

async function migrateUsers() {
  console.log("Starting user migration...");

  try {
    // Get users from Firebase
    const usersRef = ref(firebaseDb, "users");
    const usersSnapshot = await get(usersRef);
    const firebaseUsers = usersSnapshot.val();

    if (!firebaseUsers) {
      console.log("No users found in Firebase");
      return;
    }

    console.log(`Found ${Object.keys(firebaseUsers).length} users in Firebase`);

    // Migrate each user
    for (const [uid, userData] of Object.entries(firebaseUsers)) {
      try {
        // Check if user already exists in Supabase
        const { data: existingUser } = await supabase
          .from("users")
          .select("id")
          .eq("id", uid)
          .single();

        if (existingUser) {
          console.log(`User ${uid} already exists in Supabase, skipping...`);
          continue;
        }

        // Insert user into Supabase
        const { error } = await supabase.from("users").insert({
          id: uid,
          email: userData.email,
          registration_timestamp: userData.registrationTimestamp,
        });

        if (error) {
          console.error(`Error migrating user ${uid}:`, error);
        } else {
          console.log(`Successfully migrated user ${uid}`);
        }
      } catch (error) {
        console.error(`Error processing user ${uid}:`, error);
      }
    }

    console.log("User migration completed");
  } catch (error) {
    console.error("Error during user migration:", error);
  }
}

async function migrateLoginEvents() {
  console.log("Starting login events migration...");

  try {
    // Get login events from Firebase
    const loginsRef = ref(firebaseDb, "loginEvents");
    const loginsSnapshot = await get(loginsRef);
    const firebaseLogins = loginsSnapshot.val();

    if (!firebaseLogins) {
      console.log("No login events found in Firebase");
      return;
    }

    console.log(
      `Found ${Object.keys(firebaseLogins).length} login events in Firebase`
    );

    // Migrate each login event
    for (const [eventId, loginData] of Object.entries(firebaseLogins)) {
      try {
        // Check if login event already exists in Supabase
        const { data: existingEvent } = await supabase
          .from("login_events")
          .select("id")
          .eq("user_id", loginData.uid)
          .eq("timestamp", loginData.timestamp)
          .single();

        if (existingEvent) {
          console.log(
            `Login event ${eventId} already exists in Supabase, skipping...`
          );
          continue;
        }

        // Insert login event into Supabase
        const { error } = await supabase.from("login_events").insert({
          user_id: loginData.uid,
          timestamp: loginData.timestamp,
        });

        if (error) {
          console.error(`Error migrating login event ${eventId}:`, error);
        } else {
          console.log(`Successfully migrated login event ${eventId}`);
        }
      } catch (error) {
        console.error(`Error processing login event ${eventId}:`, error);
      }
    }

    console.log("Login events migration completed");
  } catch (error) {
    console.error("Error during login events migration:", error);
  }
}

async function runMigration() {
  console.log("Starting Firebase to Supabase migration...");

  // Check Supabase connection
  const { data, error } = await supabase.from("users").select("count").limit(1);
  if (error) {
    console.error("Error connecting to Supabase:", error);
    return;
  }

  console.log("Successfully connected to Supabase");

  // Run migrations
  await migrateUsers();
  await migrateLoginEvents();

  console.log("Migration completed successfully!");
}

// Export functions for use in other scripts
export { migrateUsers, migrateLoginEvents, runMigration };

// Run migration if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigration().catch(console.error);
}

// Alternative execution check for ES modules
if (process.argv[1] && process.argv[1].endsWith("migrate-data.js")) {
  runMigration().catch(console.error);
}
