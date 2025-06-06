console.log("landing.js loaded");
document.addEventListener('DOMContentLoaded', function() {
// Slideshow logic
const slides = document.querySelectorAll('.slide-img');
let currentSlide = 0;
let slideInterval = setInterval(nextSlide, 5000);

function showSlide(idx) {
  slides.forEach((img, i) => {
    img.classList.toggle('active', i === idx);
  });
}
function nextSlide() {
  currentSlide = (currentSlide + 1) % slides.length;
  showSlide(currentSlide);
}
function prevSlide() {
  currentSlide = (currentSlide - 1 + slides.length) % slides.length;
  showSlide(currentSlide);
}
document.getElementById('slideNext').onclick = () => {
  nextSlide();
  resetInterval();
};
document.getElementById('slidePrev').onclick = () => {
  prevSlide();
  resetInterval();
};
function resetInterval() {
  clearInterval(slideInterval);
  slideInterval = setInterval(nextSlide, 5000);
}
showSlide(currentSlide);

// Auth panel logic
const authOptions = document.getElementById('authOptions');
const registerForm = document.getElementById('registerForm');
const loginForm = document.getElementById('loginForm');
const forgotForm = document.getElementById('forgotForm');
const registerSuccess = document.getElementById('registerSuccess');

// Function to show a specific form and hide others
function showForm(formToShow) {
  // Hide all forms and panels
  authOptions.style.display = 'none';
  registerForm.style.display = 'none';
  loginForm.style.display = 'none';
  forgotForm.style.display = 'none';
  registerSuccess.style.display = 'none';
  
  // Show the requested form
  if (formToShow) {
    formToShow.style.display = 'block';
  } else {
    authOptions.style.display = 'flex';
  }
}

// Event listeners for form navigation
document.getElementById('showRegister').onclick = () => showForm(registerForm);

document.getElementById('showLogin').onclick = () => showForm(loginForm);
document.getElementById('toLogin').onclick = (e) => {
  e.preventDefault();
  showForm(loginForm);
};
document.getElementById('toRegister').onclick = (e) => {
  e.preventDefault();
  showForm(registerForm);
};
document.getElementById('forgotPassword').onclick = (e) => {
  e.preventDefault();
  showForm(forgotForm);
};
document.getElementById('backToLogin').onclick = (e) => {
  e.preventDefault();
  showForm(loginForm);
};
document.getElementById('proceedToLogin').onclick = () => {
  showForm(loginForm);
};

// Registration validation
registerForm.onsubmit = async function(e) {
  e.preventDefault();
  let valid = true;
  const email = document.getElementById('regEmail').value.trim();
  const username = document.getElementById('regUsername').value.trim();
  const password = document.getElementById('regPassword').value;
  const confirm = document.getElementById('regConfirm').value;
  
  // Clear previous errors
  document.getElementById('regEmailError').textContent = '';
  document.getElementById('regUsernameError').textContent = '';
  document.getElementById('regPasswordError').textContent = '';
  document.getElementById('regConfirmError').textContent = '';
  
  // Validation
  if (!email) {
    document.getElementById('regEmailError').textContent = 'Email is required.';
    valid = false;
  }
  if (!username) {
    document.getElementById('regUsernameError').textContent = 'Username is required.';
    valid = false;
  }
  if (!password) {
    document.getElementById('regPasswordError').textContent = 'Password is required.';
    valid = false;
  }
  if (password !== confirm) {
    document.getElementById('regConfirmError').textContent = 'Passwords do not match.';
    valid = false;
  }
  if (!valid) return;

  try {
    // Import auth functions
    const { createUserWithEmailAndPassword, sendEmailVerification } = await import('./auth.js');
    const userCredential = await createUserWithEmailAndPassword(email, password);
    await sendEmailVerification(userCredential.user);
    showForm(registerSuccess);
  } catch (error) {
    document.getElementById('regEmailError').textContent = error.message;
  }
};

// Login validation
loginForm.onsubmit = async function(e) {
  e.preventDefault();
  let valid = true;
  const email = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  
  // Clear previous errors
  document.getElementById('loginUsernameError').textContent = '';
  document.getElementById('loginPasswordError').textContent = '';
  
  // Validation
  if (!email) {
    document.getElementById('loginUsernameError').textContent = 'Email is required.';
    valid = false;
  }
  if (!password) {
    document.getElementById('loginPasswordError').textContent = 'Password is required.';
    valid = false;
  }
  if (!valid) return;

  try {
    // Import auth functions
    const { signInWithEmailAndPassword } = await import('./auth.js');
    const userCredential = await signInWithEmailAndPassword(email, password);
    if (!userCredential.user.emailVerified) {
      document.getElementById('loginUsernameError').textContent = 'Please verify your email before logging in.';
      return;
    }
    window.location.href = 'index.html';
  } catch (error) {
    document.getElementById('loginUsernameError').textContent = error.message;
  }
};

// Forgot password validation
forgotForm.onsubmit = async function(e) {
  e.preventDefault();
  const email = document.getElementById('forgotEmail').value.trim();
  document.getElementById('forgotEmailError').textContent = '';
  
  if (!email) {
    document.getElementById('forgotEmailError').textContent = 'Email is required.';
    return;
  }

  try {
    // Import auth functions
    const { sendPasswordResetEmail } = await import('./auth.js');
    await sendPasswordResetEmail(email);
    document.getElementById('forgotEmailError').textContent = 'Reset link sent! Check your email.';
    setTimeout(() => showForm(loginForm), 2000);
  } catch (error) {
    document.getElementById('forgotEmailError').textContent = error.message;
  }
};
}); 