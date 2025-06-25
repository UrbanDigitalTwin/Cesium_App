const admin = require('firebase-admin');
const { initializeApp } = require('firebase/app');
const { getAuth, createUserWithEmailAndPassword, sendEmailVerification, updateProfile } = require('firebase/auth');

// Initialize Firebase Admin SDK if not already initialized
let adminApp;
try {
  adminApp = admin.app();
} catch (e) {
  adminApp = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\n/g, '\n'),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
}

// Initialize Firebase Client SDK for auth
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

// Initialize Firebase app and auth
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);

exports.handler = async function(event, context) {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only accept POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse request body
    const { email, password, name } = JSON.parse(event.body);

    if (!email || !password) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Email and password are required' })
      };
    }

    // Create user with Firebase Authentication using modular API
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Send email verification
      await sendEmailVerification(user);
      
      // Update user profile with name if provided
      if (name) {
        await updateProfile(user, {
          displayName: name
        });
      }
      
      // Update user count in the database
      try {
        const db = admin.database();
        const usersRef = db.ref('users');
        await usersRef.child(user.uid).set({
          email: user.email,
          createdAt: new Date().toISOString()
        });
        
        // Update total user count
        const statsRef = db.ref('stats/users');
        await statsRef.transaction(currentValue => (currentValue || 0) + 1);
      } catch (dbError) {
        console.error('Database error:', dbError);
        // Continue even if the database update fails
      }

    } catch (error) {
      console.error('Registration error:', error);
      
      // Map Firebase error codes to user-friendly messages
      let errorMessage = 'Registration failed';
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'Email is already in use';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email format';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak';
      }
      
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: errorMessage,
          code: error.code || 'unknown'
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Registration successful',
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified
      })
    };
  } catch (error) {
    console.error('Registration error:', error);
    
    // Map Firebase error codes to user-friendly messages
    let errorMessage = 'Registration failed';
    if (error.code === 'auth/email-already-in-use') {
      errorMessage = 'Email is already in use';
    } else if (error.code === 'auth/invalid-email') {
      errorMessage = 'Invalid email format';
    } else if (error.code === 'auth/weak-password') {
      errorMessage = 'Password is too weak';
    }
    
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ 
        error: errorMessage,
        code: error.code || 'unknown'
      })
    };
  }
};
