// ==========================================
// 0. FIREBASE SETUP (Must be at the very top)
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// Firestore Database Imports
import { getFirestore, collection, addDoc, getDocs, query, orderBy, where, deleteDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// YOUR REAL FIREBASE KEYS
const firebaseConfig = {
    apiKey: "AIzaSyBWXNnpEMjlFXv-CfpS56zJS3HRnChyU0E", 
    authDomain: "miklam-tours.firebaseapp.com",
    projectId: "miklam-tours",
    storageBucket: "miklam-tours.firebasestorage.app",
    messagingSenderId: "766556566113",
    appId: "1:766556566113:web:7ad22c335beca868923020",
    measurementId: "G-JT2RZ0DSSB"
};

// Initialize Firebase 
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app); 


// ==========================================
// TOAST NOTIFICATIONS & CONFIRM MODAL
// (Replaces browser alert()/confirm() popups with modern in-page UI)
// ==========================================
function ensureToastContainer() {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        document.body.appendChild(container);
    }
    return container;
}

window.showToast = function(message, type = 'info', duration = 3500) {
    const container = ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-hide');
        setTimeout(() => toast.remove(), 250);
    }, duration);
};

window.showConfirm = function(message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-card">
                <p>${message}</p>
                <div class="modal-actions">
                    <button class="modal-btn modal-btn-cancel">Cancel</button>
                    <button class="modal-btn modal-btn-confirm">Confirm</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const cleanup = (result) => {
            overlay.remove();
            resolve(result);
        };

        overlay.querySelector('.modal-btn-cancel').onclick = () => cleanup(false);
        overlay.querySelector('.modal-btn-confirm').onclick = () => cleanup(true);
        overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };
    });
};


// ==========================================
// COUPON STATE MANAGEMENT
// ==========================================
let appliedDiscountPercentage = 0;
let appliedCouponCode = "";


// ==========================================
// MAIN DOM CONTENT LOADED EVENT
// ==========================================
document.addEventListener('DOMContentLoaded', () => {

    // --- 1. Booking Button Logic (Home Page) ---
    const bookButton = document.getElementById('bookBtn');
    if (bookButton) {
        bookButton.addEventListener('click', () => {
            window.location.href = 'book.html';
        });
    }

    // --- 2. Scroll Reveal Animation Logic ---
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.15 
    };

    const scrollObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target); 
            }
        });
    }, observerOptions);

    const fadeElements = document.querySelectorAll('.fade-in');
    fadeElements.forEach(el => {
        scrollObserver.observe(el);
    });

    // --- 3. Dynamic Booking Form Logic (Booking Page + Discounts + Dynamic QR) ---
    const packageSelect = document.getElementById('packageSelect');
    const guestsInput = document.getElementById('guests');
    const travelDateInput = document.getElementById('travelDate');
    
    const summaryPackage = document.getElementById('summaryPackage');
    const summaryDate = document.getElementById('summaryDate');
    const summaryGuests = document.getElementById('summaryGuests');
    const summaryPrice = document.getElementById('summaryPrice');
    const summaryAdvance = document.getElementById('summaryAdvance');
    const summaryBalance = document.getElementById('summaryBalance');

    const payableAmountElem = document.getElementById('paymentPayableAmount');
    const balanceAmountElem = document.getElementById('paymentBalanceAmount');

    // Only this fraction of the total is collected online; the rest is settled before departure.
    const ADVANCE_PAYMENT_RATIO = 0.5;

    function updateSummary() {
        if (!packageSelect || !guestsInput) return; 

        const selectedOption = packageSelect.options[packageSelect.selectedIndex];
        let basePrice = 0;
        
        if (selectedOption.value !== "") {
            summaryPackage.textContent = selectedOption.text.split(':')[0]; 
            basePrice = parseInt(selectedOption.getAttribute('data-price')) || 0;
        } else {
            summaryPackage.textContent = "None Selected";
        }

        const guests = parseInt(guestsInput.value) || 1;
        summaryGuests.textContent = guests;

        if (travelDateInput.value) {
            summaryDate.textContent = new Date(travelDateInput.value).toLocaleDateString();
        }

        let total = basePrice * guests;

        // Apply active coupon code discount if valid
        if (appliedDiscountPercentage > 0) {
            const discountAmount = (total * appliedDiscountPercentage) / 100;
            total = total - discountAmount;
        }

        // Only 50% is collected online now — the balance is paid before the trip departs.
        const advanceAmount = Math.round(total * ADVANCE_PAYMENT_RATIO);
        const balanceAmount = total - advanceAmount;

        const formattedTotal = '₹' + total.toLocaleString('en-IN');
        const formattedAdvance = '₹' + advanceAmount.toLocaleString('en-IN');
        const formattedBalance = '₹' + balanceAmount.toLocaleString('en-IN');

        summaryPrice.textContent = formattedTotal;
        if (summaryAdvance) summaryAdvance.textContent = formattedAdvance;
        if (summaryBalance) summaryBalance.textContent = formattedBalance;

        if (payableAmountElem) {
            payableAmountElem.textContent = formattedAdvance;
        }
        if (balanceAmountElem) {
            balanceAmountElem.textContent = formattedBalance;
        }

        // Generate Dynamic UPI QR Code for the 50% advance only — not the full trip cost
        updateDynamicQR(advanceAmount);
    }

    if (packageSelect) packageSelect.addEventListener('change', updateSummary);
    if (guestsInput) guestsInput.addEventListener('input', updateSummary);
    if (travelDateInput) travelDateInput.addEventListener('change', updateSummary);

    // --- Coupon Code Application Logic ---
    const applyCouponBtn = document.getElementById('applyCouponBtn');
    const couponInput = document.getElementById('couponCode');
    const couponMessage = document.getElementById('couponMessage');

    if (applyCouponBtn && couponInput) {
        applyCouponBtn.addEventListener('click', () => {
            const code = couponInput.value.trim().toUpperCase();
            
            // Define active coupon promotional codes
            const validCoupons = {
                "MIKLAM10": 10, // 10% off
                "SPITI20": 20   // 20% off
            };

            if (validCoupons[code]) {
                appliedDiscountPercentage = validCoupons[code];
                appliedCouponCode = code;
                couponMessage.style.color = "#10B981";
                couponMessage.textContent = `Success! ${appliedDiscountPercentage}% discount applied.`;
                updateSummary();
            } else {
                appliedDiscountPercentage = 0;
                appliedCouponCode = "";
                couponMessage.style.color = "#ef4444";
                couponMessage.textContent = "Invalid or expired coupon code.";
                updateSummary();
            }
        });
    }
    
    // --- 4. Booking Submission (Sends to Google Apps Script + UTR Verification) ---
    const bookingForm = document.getElementById('bookingForm');
    if (bookingForm) {
        bookingForm.addEventListener('submit', async (e) => {
            e.preventDefault(); 
            
            const submitBtn = bookingForm.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.textContent;

            // Validate 12-digit UTR input before dispatching
            const transactionIdInput = document.getElementById('transactionId');
            const utrValue = transactionIdInput ? transactionIdInput.value.trim() : "";

            if (!/^\d{12}$/.test(utrValue)) {
                showToast("Please enter a valid 12-digit UPI Transaction (UTR) reference number.", "error");
                return;
            }

            submitBtn.textContent = "Checking Seat Availability...";
            submitBtn.disabled = true;

            const selectedOption = packageSelect.options[packageSelect.selectedIndex];
            
            const bookingData = {
                action: "newBooking",
                fullName: document.getElementById('fullName').value,
                email: document.getElementById('email').value,
                phone: document.getElementById('phone').value,
                package: selectedOption ? selectedOption.value : "Not Selected",
                travelDate: document.getElementById('travelDate').value,
                guests: document.getElementById('guests').value,
                couponUsed: appliedCouponCode || "None",
                totalPrice: document.getElementById('summaryPrice').textContent,
                advancePaid: document.getElementById('summaryAdvance') ? document.getElementById('summaryAdvance').textContent : "",
                balanceDue: document.getElementById('summaryBalance') ? document.getElementById('summaryBalance').textContent : "",
                paymentMethod: "Merchant UPI QR - 50% Advance",
                transactionId: utrValue,
                paymentStatus: "Advance Pending Verification"
            };

            // LIVE GOOGLE APPS SCRIPT URL
            const scriptURL = 'https://script.google.com/macros/s/AKfycbzsXF0LzzftL8dn4tCa9gjdewGSx4OjWBS-JiWc7j3gqpWo458emEXjhM1dnXDAsbZ_IQ/exec';

            try {
                const response = await fetch(scriptURL, {
                    method: 'POST',
                    body: JSON.stringify(bookingData),
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' } 
                });

                const result = await response.json();

                if (result.status === "success") {
                    submitBtn.textContent = "Advance Confirmed! ✔️";
                    submitBtn.style.backgroundColor = "#10B981"; 
                    showToast("Success! Your 50% advance has been received and is pending bank verification. The balance is payable before departure.", "success");
                    bookingForm.reset();
                    updateSummary();
                } else if (result.status === "error") {
                    showToast("Booking Failed: " + result.message, "error");
                    submitBtn.textContent = originalBtnText;
                    submitBtn.disabled = false;
                }
            } catch (error) {
                console.error('Error!', error.message);
                showToast("Network error. Please try again.", "error");
                submitBtn.textContent = originalBtnText;
                submitBtn.disabled = false;
            }
        });
    }

    // --- 5. Manual Login/Signup Form Logic ---
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', (e) => {
            e.preventDefault(); 
            
            const name = document.getElementById('signupName').value;
            const email = document.getElementById('signupEmail').value;
            const password = document.getElementById('signupPassword').value;
            
            const submitBtn = signupForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = "Creating Account...";
            submitBtn.disabled = true;

            createUserWithEmailAndPassword(auth, email, password)
                .then((userCredential) => {
                    const user = userCredential.user;
                    return updateProfile(user, { displayName: name }).then(() => user);
                })
                .then((user) => {
                    saveUserToGoogleSheets(user); 
                })
                .catch((error) => {
                    console.error(error);
                    showToast("Error: " + error.message, "error");
                    submitBtn.textContent = originalText;
                    submitBtn.disabled = false;
                });
        });
    }

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            
            const submitBtn = loginForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = "Signing In...";
            submitBtn.disabled = true;

            signInWithEmailAndPassword(auth, email, password)
                .then((userCredential) => {
                    const user = userCredential.user;
                    saveUserToGoogleSheets(user);
                })
                .catch((error) => {
                    console.error(error);
                    showToast("Invalid Email or Password. Please try again.", "error");
                    submitBtn.textContent = originalText;
                    submitBtn.disabled = false;
                });
        });
    }

    // --- 6. Google Sign-In Logic ---
    const googleBtn = document.getElementById('googleSignInBtn');
    if (googleBtn) {
        googleBtn.addEventListener('click', () => {
            signInWithPopup(auth, provider)
                .then((result) => {
                    const user = result.user;
                    console.log("Logged in as:", user.displayName);
                    saveUserToGoogleSheets(user);
                }).catch((error) => {
                    console.error("Login Failed:", error.message);
                    showToast("Google Sign-In Failed.", "error");
                });
        });
    }

    // --- 7. Dynamic Navbar (Profile Dropdown Menu) ---
    const isLoggedIn = localStorage.getItem("isLoggedIn");
    const userName = localStorage.getItem("userName");

    if (isLoggedIn === "true") {
        const authLinks = document.querySelectorAll('a[href="login.html"]');
        
        authLinks.forEach(link => {
            const firstName = userName ? userName.split(' ')[0] : "Profile";
            
            const profileContainer = document.createElement('div');
            profileContainer.style.position = "relative";
            profileContainer.style.display = "inline-block";
            
            link.parentNode.insertBefore(profileContainer, link);
            profileContainer.appendChild(link);
            
            link.textContent = "Hi, " + firstName + " ▼";
            link.href = "#"; 
            link.style.color = "var(--primary-blue)";
            link.style.cursor = "pointer";
            
            const dropdown = document.createElement('div');
            dropdown.style.display = "none";
            dropdown.style.position = "absolute";
            dropdown.style.top = "100%";
            dropdown.style.right = "0";
            dropdown.style.marginTop = "15px";
            dropdown.style.backgroundColor = "white";
            dropdown.style.boxShadow = "0 8px 16px rgba(0,0,0,0.1)";
            dropdown.style.borderRadius = "8px";
            dropdown.style.padding = "12px 24px";
            dropdown.style.zIndex = "1000";
            
            const myAccountBtn = document.createElement('a');
            myAccountBtn.textContent = "My Account";
            myAccountBtn.href = "account.html";
            myAccountBtn.style.color = "var(--text-dark)";
            myAccountBtn.style.fontWeight = "600";
            myAccountBtn.style.display = "block";
            myAccountBtn.style.marginBottom = "10px";

            const logoutBtn = document.createElement('a');
            logoutBtn.textContent = "Logout";
            logoutBtn.href = "#";
            logoutBtn.style.color = "red"; 
            logoutBtn.style.fontWeight = "600";
            logoutBtn.style.display = "block";
            
            dropdown.appendChild(myAccountBtn);
            dropdown.appendChild(logoutBtn);
            profileContainer.appendChild(dropdown);
            
            link.addEventListener('click', (e) => {
                e.preventDefault();
                dropdown.style.display = (dropdown.style.display === "none") ? "block" : "none";
            });
            
            document.addEventListener('click', (e) => {
                if (!profileContainer.contains(e.target)) {
                    dropdown.style.display = "none";
                }
            });
            
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                signOut(auth).then(() => {
                    localStorage.clear();
                    window.location.reload(); 
                });
            });
        });
    }

    // ==========================================
    // 8 & 9. REVIEWS SYSTEM (UI & FIRESTORE)
    // ==========================================
    const reviewForm = document.getElementById('reviewForm');
    const loginPrompt = document.getElementById('loginPrompt');
    const nameDisplay = document.getElementById('reviewerNameDisplay');
    const reviewsGrid = document.getElementById('reviewsGrid');
    const stars = document.querySelectorAll('.star-rating-input span');
    const ratingInput = document.getElementById('ratingValue');

    // A. Interactive Stars Logic
    if (stars.length > 0) {
        stars.forEach(star => {
            star.addEventListener('click', () => {
                const value = star.getAttribute('data-value');
                ratingInput.value = value;
                stars.forEach(s => {
                    if (s.getAttribute('data-value') <= value) {
                        s.classList.add('active');
                    } else {
                        s.classList.remove('active');
                    }
                });
            });
        });
    }

    // B. Show Form ONLY if Logged In
    if (reviewForm && loginPrompt && nameDisplay) {
        if (localStorage.getItem("isLoggedIn") === "true") {
            loginPrompt.style.display = "none";
            reviewForm.style.display = "block";
            nameDisplay.textContent = localStorage.getItem("userName");

            const userGreetingReview = document.getElementById('userGreetingReview');
            if (userGreetingReview) userGreetingReview.style.display = "flex";
        }
    }

    // C. Load Reviews from Firestore Database
    async function loadReviews() {
        if (!reviewsGrid) return; 
        try {
            const q = query(collection(db, "reviews"), orderBy("timestamp", "desc"));
            const querySnapshot = await getDocs(q);
            
            reviewsGrid.innerHTML = ''; 
            
            if (querySnapshot.empty) {
                reviewsGrid.innerHTML = '<p style="color: #666; grid-column: 1 / -1; text-align: center;">No reviews yet. Be the first to share your experience!</p>';
                return;
            }

            const currentUid = localStorage.getItem("userUid");

            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const starsHTML = '★'.repeat(data.rating) + '<span style="color:#e5e7eb;">★</span>'.repeat(5 - data.rating);
                
                const verifiedBadgeHTML = data.isVerified === true 
                    ? `<span class="verified-badge">✓ Verified Traveler</span>` 
                    : '';

                const isOwnReview = currentUid && data.reviewerUid && data.reviewerUid === currentUid;
                const deleteButtonHTML = isOwnReview
                    ? `<button onclick="deleteMyReview('${docSnap.id}')" style="background:none; border:none; color:#ef4444; font-size:0.85rem; font-weight:600; cursor:pointer; margin-top:12px; padding:0;">🗑️ Delete my review</button>`
                    : '';

                const reviewCard = `
                    <div class="review-card">
                        <div class="reviewer-profile">
                            <div class="avatar">${data.name ? data.name.charAt(0).toUpperCase() : 'T'}</div>
                            <div class="reviewer-info">
                                <h4>${data.name || "Traveler"}</h4>
                                ${verifiedBadgeHTML}
                            </div>
                        </div>
                        <div class="stars">${starsHTML}</div>
                        <p class="review-text">"${data.text}"</p>
                        ${deleteButtonHTML}
                    </div>
                `;
                reviewsGrid.innerHTML += reviewCard;
            });
        } catch (error) {
            console.error("Error loading reviews: ", error);
        }
    }

    loadReviews();

    // C2. Delete a review (exposed globally so the inline onclick can reach it)
    window.deleteMyReview = async function(reviewId) {
        if (!(await showConfirm("Delete your review? This can't be undone."))) return;
        try {
            await deleteDoc(doc(db, "reviews", reviewId));
            loadReviews();
        } catch (error) {
            console.error("Error deleting review: ", error);
            showToast("Couldn't delete the review. Please try again.", "error");
        }
    };

    // D. Save New Review to Firestore
    if (reviewForm) {
        reviewForm.addEventListener('submit', async (e) => {
            e.preventDefault(); 
            
            const submitBtn = reviewForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = "Posting...";
            submitBtn.disabled = true;

            const rating = parseInt(ratingInput.value);
            const text = document.getElementById('reviewTextInput').value;
            const name = localStorage.getItem("userName") || "Anonymous Traveler";
            const reviewerUid = localStorage.getItem("userUid") || null;
            const reviewerEmail = localStorage.getItem("userEmail") || null;

            if (rating === 0) {
                showToast("Please select a star rating first!", "error");
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
                return;
            }

            try {
                await addDoc(collection(db, "reviews"), {
                    name: name,
                    rating: rating,
                    text: text,
                    isVerified: false,
                    reviewerUid: reviewerUid,
                    reviewerEmail: reviewerEmail,
                    timestamp: serverTimestamp()
                });
                
                reviewForm.reset();
                stars.forEach(s => s.classList.remove('active'));
                ratingInput.value = 0;
                
                submitBtn.textContent = "Posted Successfully! ✔️";
                submitBtn.style.backgroundColor = "#10B981";
                
                loadReviews(); 
                
                setTimeout(() => {
                    submitBtn.textContent = originalText;
                    submitBtn.style.backgroundColor = "var(--accent-orange)";
                    submitBtn.disabled = false;
                }, 3000);
                
            } catch (error) {
                console.error("Error adding review: ", error);
                showToast("Failed to post review. Please check your console.", "error");
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        });
    }

}); // END OF DOMContentLoaded


// ==========================================
// GLOBAL FUNCTIONS (Outside DOMContentLoaded)
// ==========================================

// Auth Tab Switcher Logic
window.switchTab = function(tab) {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const tabLogin = document.getElementById('tabLogin');
    const tabSignup = document.getElementById('tabSignup');

    if (!loginForm || !signupForm) return; 

    if (tab === 'login') {
        loginForm.style.display = 'block';
        signupForm.style.display = 'none';
        tabLogin.classList.add('active');
        tabSignup.classList.remove('active');
    } else if (tab === 'signup') {
        loginForm.style.display = 'none';
        signupForm.style.display = 'block';
        tabSignup.classList.add('active');
        tabLogin.classList.remove('active');
    }
};

// Dynamic QR Code Generator Function
function updateDynamicQR(totalAmount) {
    const qrImage = document.getElementById('dynamicUpiQr');
    const qrPlaceholder = document.getElementById('qrPlaceholder');
    const merchantUpiId = "SBIBHIM.INSTANT92854251487043657@SBIPAY"; // Updated SBI Merchant VPA
    const payeeName = "MIKLAM Tours";

    if (totalAmount > 0 && qrImage) {
        const upiString = `upi://pay?pa=${merchantUpiId}&pn=${encodeURIComponent(payeeName)}&am=${totalAmount}&cu=INR`;
        
        qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(upiString)}`;
        qrImage.style.display = 'block';
        if (qrPlaceholder) qrPlaceholder.style.display = 'none';
    } else if (qrImage) {
        qrImage.style.display = 'none';
        if (qrPlaceholder) qrPlaceholder.style.display = 'block';
    }
}
// Save User to Google Sheets Logic
async function saveUserToGoogleSheets(user) {
    const scriptURL = 'https://script.google.com/macros/s/AKfycbzsXF0LzzftL8dn4tCa9gjdewGSx4OjWBS-JiWc7j3gqpWo458emEXjhM1dnXDAsbZ_IQ/exec';
    
    const userData = {
        action: "registerUser",
        uid: user.uid,
        name: user.displayName,
        email: user.email
    };

    try {
        const response = await fetch(scriptURL, {
            method: 'POST',
            body: JSON.stringify(userData),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        
        const result = await response.json();

        if (result.status === "existing") {
            showToast(result.message + " You have " + result.history.length + " past/upcoming bookings on record.", "success");
            localStorage.setItem("userHistory", JSON.stringify(result.history));
        } else if (result.status === "new") {
            showToast(result.message, "success");
        }

        localStorage.setItem("isLoggedIn", "true");
        localStorage.setItem("userName", user.displayName);
        localStorage.setItem("userEmail", user.email);
        localStorage.setItem("userUid", user.uid);
        window.location.href = 'index.html'; 

    } catch (error) {
        console.error('Error saving to sheets!', error);
        showToast("There was an issue connecting to the database.", "error");
    }
}
function sendWhatsAppNotification(phone, customerName, packageName, travelDate) {
  try {
    // Example using an SMS/WhatsApp gateway provider API key
    const apiKey = "YOUR_API_KEY_HERE";
    const formattedMessage = encodeURIComponent(`Hi ${customerName}, thank you for booking ${packageName} with MIKLAM Tours for ${travelDate}! Your seats are reserved and we are verifying your payment.`);
    
    // Endpoint sample for dispatching automated text alerts
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}&route=q&message=${formattedMessage}&language=english&flash=0&numbers=${phone}`;
    
    UrlFetchApp.fetch(url, { method: 'get' });
  } catch (error) {
    console.error("Failed to send text notification: ", error);
  }
}
