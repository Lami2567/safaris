# Email Verification OTP Setup Guide

This guide explains how to configure email OTP delivery for the **SAFARIS Uganda** backend (pi.mumwesafarisuganda.com / VPS 18.222.41.199).

---

## 1. How Email OTP Verification Works

1. **User Sign Up / Unverified Sign In**:
   - Customer submits their full name, email, phone number, and password via the Safaris mobile app.
   - The backend checks if the email is already registered.
   - A 6-digit numeric OTP (e.g. 482910) is generated and securely stored in memory with a **10-minute expiry window**.
   - The OTP is formatted into a branded, dark-themed HTML email and dispatched via SMTP.
   - The app navigates to the verification screen without destroying state when the user switches to Gmail.

2. **Verification**:
   - When the user enters the 6-digit OTP, the app calls POST /api/v1/auth/verify-email-otp.
   - On success, the account is marked emailVerified = true, a JWT session token is minted, and the user's session is persisted locally on the device.

3. **Development / Fallback Mode**:
   - If SMTP credentials are **not configured**, the server will log the OTP directly to console / docker logs:
     `	ext
     📧 [EMAIL OTP GENERATED] -> user@example.com: 123456 (Valid for 10 min)
     `
   - No emails are lost, and testing is never blocked.

---

## 2. Setting Up an SMTP Email Provider

You can choose any standard SMTP service. Below are instructions for the most popular options:

### Option A: Google Gmail (Recommended for Quick Setup & Testing)
1. Log into your Google account (e.g., mumwesafarisuganda@gmail.com).
2. Go to **Google Account Settings** > **Security**.
3. Enable **2-Step Verification** if it's not already enabled.
4. Under " 2-Step Verification\, scroll down to **App passwords**.
5. Create a new App Password:
 - App name: SAFARIS Production Backend
 - Click **Create**.
6. Google will generate a 16-character password (e.g. bcd efgh ijkl mnop).
7. Use these values in your backend configuration:
 `env
 SMTP_HOST=smtp.gmail.com
 SMTP_PORT=465
 SMTP_SECURE=true
 SMTP_USER=mumwesafarisuganda@gmail.com
 SMTP_PASS=abcdefghijklmnop
 SMTP_FROM=\SAFARIS Uganda\ <mumwesafarisuganda@gmail.com>
 `

---

### Option B: Resend (Best for Deliverability & Custom Domains)
1. Sign up at [resend.com](https://resend.com).
2. Add and verify your domain (e.g., mumwesafarisuganda.com).
3. Generate an API Key under **API Keys**.
4. Configure SMTP:
 `env
 SMTP_HOST=smtp.resend.com
 SMTP_PORT=465
 SMTP_SECURE=true
 SMTP_USER=resend
 SMTP_PASS=re_your_api_key_here
 SMTP_FROM=\SAFARIS Uganda\ <no-reply@mumwesafarisuganda.com>
 `

---

### Option C: Brevo (Formerly Sendinblue - Free 300 emails/day)
1. Sign up at [brevo.com](https://www.brevo.com).
2. Go to **SMTP & API** settings.
3. Obtain your SMTP master password.
4. Configure SMTP:
 `env
 SMTP_HOST=smtp-relay.brevo.com
 SMTP_PORT=587
 SMTP_SECURE=false
 SMTP_USER=your_brevo_account_email@gmail.com
 SMTP_PASS=your_smtp_key_here
 SMTP_FROM=\SAFARIS Uganda\ <noreply@mumwesafarisuganda.com>
 `

---

## 3. Applying the Configuration on the Production VPS

1. Connect to the VPS via SSH:
 `ash
 ssh -i safaris-vps-key.pem ubuntu@18.222.41.199
 `

2. Open the production environment file:
 `ash
 nano /home/ubuntu/safaris/backend/.env.production
 `

3. Add or update the SMTP variables:
 `env
 # Email & OTP Settings
 SMTP_HOST=smtp.gmail.com
 SMTP_PORT=465
 SMTP_SECURE=true
 SMTP_USER=your_email@gmail.com
 SMTP_PASS=your_16_char_app_password
 SMTP_FROM=\SAFARIS Uganda\ <your_email@gmail.com>
 `
 *(Save with Ctrl + O, then exit with Ctrl + X)*

4. Restart the backend container to apply the new credentials:
 `ash
 cd /home/ubuntu/safaris/backend
 docker compose down
 docker compose up -d --build
 `

---

## 4. Testing & Verification

### A. Testing from Mobile App
1. Launch the SAFARIS app.
2. Go to **Sign Up**, fill in the form with a real email address you have access to, and click **Create Account**.
3. Check your email inbox (and spam/junk folder) for:
 - **Subject**: SAFARIS Uganda - Your Email Verification Code
 - **Sender**: Your configured SMTP_FROM address.
 - **Content**: 6-digit code with 10-minute validity indicator.
4. Enter the 6 digits into the app OTP screen.
5. The app verifies the OTP, saves your login session, and takes you to the customer home dashboard.
6. Close the app completely and re-open it: you will remain logged in automatically!

### B. Checking Server Logs in Realtime
If an email is delayed or you want to see the OTP generated directly on the server:
`ash
ssh -i safaris-vps-key.pem ubuntu@18.222.41.199
docker logs -f safaris_backend_prod
`
You will see:
` ext
[EmailService] Sending verification OTP to customer@gmail.com
[EmailService] Verification OTP sent successfully! MessageId: <...>
`
If SMTP is not yet configured:
` ext
📧 [EMAIL OTP GENERATED] -> customer@gmail.com: 482910 (Valid for 10 min)
`

---

## 5. API Reference Endpoints

| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | /api/v1/auth/register | { fullName, email, phone, password } | Registers account & sends OTP |
| POST | /api/v1/auth/login | { identifier, password } | Authenticates. If unverified, sends fresh OTP and responds with { requiresVerification: true } |
| POST | /api/v1/auth/verify-email-otp | { email, otp } | Verifies the 6-digit code and returns JWT token & user profile |
| POST | /api/v1/auth/resend-email-otp | { email } | Dispatches a new 6-digit OTP (subject to cooldown) |
