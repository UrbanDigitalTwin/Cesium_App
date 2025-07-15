# Firebase to Supabase Migration Guide

This guide will help you migrate your Cesium Live Observation App from Firebase to Supabase authentication.

## Prerequisites

1. Create a Supabase account at [supabase.com](https://supabase.com)
2. Create a new project in Supabase
3. Note down your project URL and anon key

## Step 1: Set Up Supabase Database

1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Copy and paste the contents of `supabase/schema.sql` into the SQL Editor
4. Execute the SQL script

This will create:

- `users` table (extends Supabase auth.users)
- `login_events` table
- Row Level Security (RLS) policies
- Database functions for metrics
- Triggers for automatic user profile creation

## Step 2: Configure Supabase

1. Open `auth/supabase-config.js`
2. Replace the placeholder values with your actual Supabase credentials:
   ```javascript
   export const supabaseConfig = {
     supabaseUrl: "https://your-project-id.supabase.co",
     supabaseAnonKey: "your-anon-key-here",
   };
   ```

## Step 3: Update HTML Files

### Update login.html

Replace:

```html
<script type="module" src="../auth/auth.js"></script>
```

With:

```html
<script type="module" src="../auth/supabase-auth.js"></script>
```

### Update register.html

Replace:

```html
<script type="module" src="../auth/auth.js"></script>
```

With:

```html
<script type="module" src="../auth/supabase-auth.js"></script>
```

### Update index.html

Replace:

```html
<script type="module" src="../auth/auth.js"></script>
```

With:

```html
<script type="module" src="../auth/supabase-auth.js"></script>
```

## Step 4: Configure Email Templates (Optional)

1. In your Supabase dashboard, go to Authentication > Email Templates
2. Customize the email templates for:
   - Confirm signup
   - Reset password
   - Magic link

## Step 5: Configure Redirect URLs

1. In your Supabase dashboard, go to Authentication > URL Configuration
2. Add your redirect URLs:
   - Site URL: `http://localhost:3001` (for development)
   - Redirect URLs: `http://localhost:3001/login.html`

## Step 6: Test the Migration

1. Start your application: `npm start`
2. Test user registration
3. Test email verification
4. Test user login
5. Test logout functionality
6. Verify that metrics are working in the sidebar

## Key Differences Between Firebase and Supabase

### Authentication

- **Firebase**: Uses `user.emailVerified`
- **Supabase**: Uses `user.email_confirmed_at`

### Database Operations

- **Firebase**: Uses Realtime Database with `ref`, `set`, `push`
- **Supabase**: Uses PostgreSQL with SQL queries and RPC functions

### Real-time Subscriptions

- **Firebase**: Uses `onValue` for real-time updates
- **Supabase**: Uses `channel().on().subscribe()` for real-time updates

### Error Handling

- **Firebase**: Errors are thrown directly
- **Supabase**: Errors are returned in the `error` property of the response

## Troubleshooting

### Common Issues

1. **CORS Errors**: Make sure your Supabase project allows requests from your domain
2. **RLS Policy Errors**: Check that your Row Level Security policies are correctly configured
3. **Email Verification**: Ensure your email templates are properly configured
4. **Real-time Updates**: Verify that your database functions are accessible

### Debugging

1. Check the browser console for JavaScript errors
2. Check the Supabase dashboard logs for authentication errors
3. Verify your Supabase configuration values
4. Test database connections in the Supabase SQL Editor

## Security Considerations

1. **Row Level Security**: All tables have RLS enabled with appropriate policies
2. **JWT Tokens**: Supabase uses JWT tokens for authentication
3. **API Keys**: Keep your service role key secure and only use the anon key in client-side code
4. **Email Verification**: Email verification is required before login

## Performance Optimizations

1. **Database Functions**: Use the provided RPC functions for counting users and login events
2. **Real-time Subscriptions**: Efficiently handle real-time updates with Supabase channels
3. **Connection Pooling**: Supabase handles connection pooling automatically

## Rollback Plan

If you need to rollback to Firebase:

1. Keep the original `auth/auth.js` and `auth/firebase-config.js` files
2. Update HTML files to use the Firebase auth script
3. Remove Supabase-related files
4. Ensure your Firebase project is still active

## Support

For additional help:

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Community](https://github.com/supabase/supabase/discussions)
- [Supabase Discord](https://discord.supabase.com)
