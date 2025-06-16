import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  applyActionCode,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import {
  getDatabase,
  ref,
  set,
  push,
  onValue,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// Registration
window.registerUser = async function (e) {
  e.preventDefault();
  const email = document.getElementById("register-email").value.trim();
  const password = document.getElementById("register-password").value;
  const confirm = document.getElementById("register-confirm-password").value;
  const errorDiv = document.getElementById("register-error");
  errorDiv.textContent = "";

  if (!email || !password || !confirm) {
    errorDiv.textContent = "All fields are required.";
    return;
  }
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
    errorDiv.textContent = "Invalid email format.";
    return;
  }
  if (password !== confirm) {
    errorDiv.textContent = "Passwords do not match.";
    return;
  }
  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );
    const user = userCredential.user;
    // Send email verification with custom action URL
    const actionCodeSettings = {
      url: window.location.origin + '/login.html',
      handleCodeInApp: true
    };
    await sendEmailVerification(user, actionCodeSettings);
    // Write user to database
    await set(ref(db, "users/" + user.uid), {
      email: user.email,
      registrationTimestamp: Date.now(),
    });
    // Log login event
    await push(ref(db, "loginEvents"), {
      uid: user.uid,
      timestamp: Date.now(),
    });
    // Hide form and show confirmation message
    document.getElementById("register-form").style.display = "none";
    const messageDiv = document.getElementById("register-message");
    messageDiv.textContent = "Registration successful! Please check your email to confirm.";
    messageDiv.style.display = "block";
  } catch (err) {
    errorDiv.textContent = err.message;
  }
};

// Login
window.loginUser = async function (e) {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const errorDiv = document.getElementById("login-error");
  errorDiv.textContent = "";

  if (!email || !password) {
    errorDiv.textContent = "All fields are required.";
    return;
  }
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
    errorDiv.textContent = "Invalid email format.";
    return;
  }
  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );
    const user = userCredential.user;
    if (!user.emailVerified) {
      errorDiv.textContent = "Please verify your email before logging in.";
      return;
    }
    // Log login event
    await push(ref(db, "loginEvents"), {
      uid: user.uid,
      timestamp: Date.now(),
    });
    window.location.href = "index.html";
  } catch (err) {
    errorDiv.textContent = err.message;
  }
};

// Logout
window.logoutUser = async function () {
  await signOut(auth);
  window.location.href = "login.html";
};

// Metrics (for index.html sidebar)
window.setupLiveMetrics = function (usersCountId, loginsCountId) {
  const usersRef = ref(db, "users");
  const loginsRef = ref(db, "loginEvents");
  onValue(usersRef, (snapshot) => {
    const users = snapshot.val();
    document.getElementById(usersCountId).textContent = users
      ? Object.keys(users).length
      : 0;
  });
  onValue(loginsRef, (snapshot) => {
    const logins = snapshot.val();
    document.getElementById(loginsCountId).textContent = logins
      ? Object.keys(logins).length
      : 0;
  });
};

// Register
export async function registerUser(email, password) {
  const userCredential = await createUserWithEmailAndPassword(
    auth,
    email,
    password
  );
  await sendEmailVerification(userCredential.user);
  return userCredential;
}

// Login
export async function loginUser(email, password) {
  const userCredential = await signInWithEmailAndPassword(
    auth,
    email,
    password
  );
  if (!userCredential.user.emailVerified) {
    throw new Error("Please verify your email before logging in.");
  }
  return userCredential;
}

// Forgot password
export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

// Handle email verification
window.handleEmailVerification = async function() {
  const urlParams = new URLSearchParams(window.location.search);
  const oobCode = urlParams.get('oobCode');
  
  if (oobCode) {
    try {
      await applyActionCode(auth, oobCode);
      // Show success message
      const messageDiv = document.getElementById('register-message');
      if (messageDiv) {
        messageDiv.textContent = 'Email verified successfully! You can now log in.';
        messageDiv.style.display = 'block';
        messageDiv.style.color = 'green';
      }
      // Redirect to login page after 3 seconds
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 3000);
    } catch (error) {
      console.error('Error verifying email:', error);
      const messageDiv = document.getElementById('register-message');
      if (messageDiv) {
        messageDiv.textContent = 'Error verifying email. Please try again.';
        messageDiv.style.display = 'block';
        messageDiv.style.color = 'red';
      }
    }
  }
};

// Call the verification handler when the page loads
window.addEventListener('load', window.handleEmailVerification);

export {
  auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  applyActionCode,
};
