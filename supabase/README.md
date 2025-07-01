# Supabase Migration Files

This folder contains all the necessary files to migrate your Cesium Live Observation App from Firebase to Supabase authentication.

## Files Overview

### `schema.sql`

Contains the complete database schema for Supabase, including:

- `users` table that extends Supabase's built-in `auth.users`
- `login_events` table for tracking user login activity
- Row Level Security (RLS) policies for data protection
- Database functions for efficient metrics calculation
- Triggers for automatic user profile creation

### `MIGRATION_GUIDE.md`

Comprehensive step-by-step guide for migrating from Firebase to Supabase, including:

- Prerequisites and setup instructions
- Configuration steps
- Testing procedures
- Troubleshooting tips
- Security considerations

### `migrate-data.js`

Data migration script to transfer existing user data from Firebase to Supabase:

- Migrates user profiles
- Migrates login events
- Handles duplicate detection
- Provides detailed logging

## Quick Start

1. **Set up Supabase project** and get your credentials
2. **Run the schema** in Supabase SQL Editor
3. **Configure credentials** in `auth/supabase-config.js`
4. **Update HTML files** to use `supabase-auth.js`
5. **Run data migration** (if needed): `node supabase/migrate-data.js`
6. **Test the application**

## Database Schema

### Users Table

```sql
CREATE TABLE public.users (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT NOT NULL,
    registration_timestamp BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Login Events Table

```sql
CREATE TABLE public.login_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    timestamp BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Security Features

- **Row Level Security (RLS)** enabled on all tables
- **User-specific policies** ensure users can only access their own data
- **Automatic user profile creation** via database triggers
- **JWT-based authentication** with Supabase

## Performance Optimizations

- **Database functions** for efficient counting operations
- **Real-time subscriptions** for live metrics updates
- **Connection pooling** handled automatically by Supabase

## Migration Benefits

1. **Better Performance**: PostgreSQL vs Firebase Realtime Database
2. **More Control**: Direct SQL access and custom functions
3. **Cost Effective**: More generous free tier
4. **Better Security**: Row Level Security and advanced policies
5. **Real-time Features**: Built-in real-time subscriptions

## Support

For issues or questions:

- Check the [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)
- Review [Supabase Documentation](https://supabase.com/docs)
- Join the [Supabase Community](https://github.com/supabase/supabase/discussions)
