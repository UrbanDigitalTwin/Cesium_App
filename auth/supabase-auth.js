import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { supabaseConfig } from "./supabase-config.js";

const supabase = createClient(
  supabaseConfig.supabaseUrl,
  supabaseConfig.supabaseAnonKey
);

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
    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        emailRedirectTo: window.location.origin + "/login.html",
      },
    });

    if (error) {
      errorDiv.textContent = error.message;
      return;
    }

    // Log login event
    if (data.user) {
      await supabase.from("login_events").insert({
        user_id: data.user.id,
        timestamp: Date.now(),
      });
    }

    // Hide form and show confirmation message
    document.getElementById("register-form").style.display = "none";
    const messageDiv = document.getElementById("register-message");
    messageDiv.textContent =
      "Registration successful! Please check your email to confirm.";
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
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) {
      errorDiv.textContent = error.message;
      return;
    }

    if (!data.user.email_confirmed_at) {
      errorDiv.textContent = "Please verify your email before logging in.";
      return;
    }

    // Log login event
    await supabase.from("login_events").insert({
      user_id: data.user.id,
      timestamp: Date.now(),
    });

    window.location.href = "index.html";
  } catch (err) {
    errorDiv.textContent = err.message;
  }
};

// Logout
window.logoutUser = async function () {
  await supabase.auth.signOut();
  window.location.href = "login.html";
};

// Metrics (for index.html sidebar)
window.setupLiveMetrics = function (usersCountId, loginsCountId) {
  // Set up real-time subscriptions for user count
  const usersSubscription = supabase
    .channel("users_count")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "users" },
      async () => {
        const { data: userCount } = await supabase.rpc("get_user_count");
        document.getElementById(usersCountId).textContent = userCount || 0;
      }
    )
    .subscribe();

  // Set up real-time subscriptions for login events count
  const loginsSubscription = supabase
    .channel("logins_count")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "login_events" },
      async () => {
        const { data: loginCount } = await supabase.rpc(
          "get_login_events_count"
        );
        document.getElementById(loginsCountId).textContent = loginCount || 0;
      }
    )
    .subscribe();

  // Initial load of counts
  const loadCounts = async () => {
    const { data: userCount } = await supabase.rpc("get_user_count");
    const { data: loginCount } = await supabase.rpc("get_login_events_count");

    document.getElementById(usersCountId).textContent = userCount || 0;
    document.getElementById(loginsCountId).textContent = loginCount || 0;
  };

  loadCounts();

  // Return cleanup function
  return () => {
    usersSubscription.unsubscribe();
    loginsSubscription.unsubscribe();
  };
};

// Register
export async function registerUser(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email: email,
    password: password,
  });

  if (error) throw error;
  return data;
}

// Login
export async function loginUser(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password,
  });

  if (error) throw error;
  if (!data.user.email_confirmed_at) {
    throw new Error("Please verify your email before logging in.");
  }
  return data;
}

// Forgot password
export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + "/login.html",
  });

  if (error) throw error;
}

// Handle email verification
window.handleEmailVerification = async function () {
  const urlParams = new URLSearchParams(window.location.search);
  const accessToken = urlParams.get("access_token");
  const refreshToken = urlParams.get("refresh_token");

  if (accessToken && refreshToken) {
    try {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) throw error;

      // Show success message
      const messageDiv = document.getElementById("register-message");
      if (messageDiv) {
        messageDiv.textContent =
          "Email verified successfully! You can now log in.";
        messageDiv.style.display = "block";
        messageDiv.style.color = "green";
      }

      // Redirect to login page after 3 seconds
      setTimeout(() => {
        window.location.href = "login.html";
      }, 3000);
    } catch (error) {
      console.error("Error verifying email:", error);
      const messageDiv = document.getElementById("register-message");
      if (messageDiv) {
        messageDiv.textContent = "Error verifying email. Please try again.";
        messageDiv.style.display = "block";
        messageDiv.style.color = "red";
      }
    }
  }
};

// Check authentication state
window.checkAuthState = async function () {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
};

// Call the verification handler when the page loads
window.addEventListener("load", window.handleEmailVerification);

export { supabase, registerUser, loginUser, resetPassword, checkAuthState };
