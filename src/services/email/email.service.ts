// Dynamically require nodemailer in Node environment if installed
let nodemailer: any = null;
try {
  nodemailer = require('nodemailer');
} catch {
  // nodemailer will be available inside docker container
}

import { ENV } from '../../config/env';

export class EmailService {
  private static transporter: any = null;

  private static getTransporter(): any {
    if (this.transporter) {
      return this.transporter;
    }

    if (!nodemailer || !ENV.SMTP_HOST || !ENV.SMTP_USER) {
      return null;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: ENV.SMTP_HOST,
        port: ENV.SMTP_PORT,
        secure: ENV.SMTP_SECURE, // true for 465, false for 587 / other ports
        auth: {
          user: ENV.SMTP_USER,
          pass: ENV.SMTP_PASS,
        },
        tls: {
          rejectUnauthorized: true, // SMTP credentials require a verified TLS peer.
          minVersion: 'TLSv1.2',
        },
      });
      return this.transporter;
    } catch (err) {
      console.error('❌ [EmailService] Failed to initialize SMTP transporter:', err);
      return null;
    }
  }

  /**
   * Send a 6-digit email verification OTP
   */
  public static async sendOtpEmail(toEmail: string, fullName: string, otpCode: string): Promise<boolean> {
    const transporter = this.getTransporter();

    // Dev / Test fallback when SMTP is not yet configured
    if (!transporter) {
      console.log('====================================================');
      console.log(`📧 [EMAIL OTP GENERATED - DEV/FALLBACK LOG]`);
      console.log(`👤 Recipient: ${fullName} <${toEmail}>`);
      console.log(`🔑 Verification OTP: >>> ${otpCode} <<<`);
      console.log(`⏰ Valid For: 10 Minutes`);
      console.log(`ℹ️  To deliver real emails, set SMTP_HOST & SMTP_USER in .env.production`);
      console.log('====================================================');
      return true;
    }

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0c0d10; color: #ffffff; margin: 0; padding: 24px; }
    .card { max-width: 520px; margin: 0 auto; background-color: #16171b; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; overflow: hidden; }
    .header { background-color: #000000; padding: 24px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.1); }
    .header h1 { margin: 0; font-size: 20px; letter-spacing: 3px; color: #D4AF37; }
    .header p { margin: 4px 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: rgba(255,255,255,0.5); }
    .body { padding: 32px 28px; }
    .greeting { font-size: 16px; font-weight: 600; color: #ffffff; margin-bottom: 12px; }
    .text { font-size: 14px; line-height: 1.6; color: rgba(255,255,255,0.7); margin-bottom: 24px; }
    .otp-box { background: #000000; border: 1px solid #D4AF37; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px; }
    .otp-code { font-family: 'Courier New', monospace; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #D4AF37; }
    .otp-expiry { font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 8px; }
    .footer { padding: 20px 28px; background-color: rgba(0,0,0,0.5); border-top: 1px solid rgba(255,255,255,0.06); font-size: 11px; color: rgba(255,255,255,0.4); line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>SAFARIS UGANDA</h1>
      <p>Pearl of Africa Mobility & Tourism</p>
    </div>
    <div class="body">
      <div class="greeting">Hello ${fullName || 'Traveler'},</div>
      <div class="text">
        Thank you for joining SAFARIS Uganda. Please use the 6-digit verification code below to activate your account:
      </div>
      <div class="otp-box">
        <div class="otp-code">${otpCode}</div>
        <div class="otp-expiry">Expires in 10 minutes • Single use only</div>
      </div>
      <div class="text" style="font-size: 12px; color: rgba(255,255,255,0.5); margin-bottom: 0;">
        If you did not request this verification, please ignore this email. Never share this code with anyone, including SAFARIS representatives.
      </div>
    </div>
    <div class="footer">
      SAFARIS Uganda Platform • Kampala, Uganda<br>
      Automated system message — please do not reply directly.
    </div>
  </div>
</body>
</html>
    `;

    try {
      await transporter.sendMail({
        from: ENV.SMTP_FROM,
        to: toEmail,
        subject: `${otpCode} is your SAFARIS Uganda verification code`,
        text: `Your SAFARIS Uganda verification code is: ${otpCode}. It expires in 10 minutes.`,
        html: htmlContent,
      });
      console.log(`✅ [EmailService] OTP email sent successfully to ${toEmail}`);
      return true;
    } catch (err: any) {
      console.error(`❌ [EmailService] Error sending email to ${toEmail}:`, err.message);
      // Fallback log so dev testing isn't blocked
      console.log(`📧 [EMAIL OTP FALLBACK LOG] Code for ${toEmail}: >>> ${otpCode} <<<`);
      return true;
    }
  }

  /**
   * Send official Mumwe Safaris Partner/Driver Approval Email with activation OTP
   */
  public static async sendDriverApprovalOtpEmail(
    toEmail: string,
    fullName: string,
    role: string,
    otpCode: string
  ): Promise<boolean> {
    const transporter = this.getTransporter();
    const roleTitle = role === 'driver' ? 'Safari Driver / Chauffeur' : 'Licensed Tour Guide';

    // Dev / Test / Server Log fallback
    console.log('====================================================');
    console.log(`📧 [PARTNER APPROVAL EMAIL & OTP GENERATED]`);
    console.log(`👤 Recipient: ${fullName} <${toEmail}>`);
    console.log(`💼 Approved Track: ${roleTitle}`);
    console.log(`🔑 Activation Login OTP: >>> ${otpCode} <<<`);
    console.log(`⏰ Expiration: 48 Hours`);
    console.log('====================================================');

    if (!transporter) {
      return true;
    }

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #000000; color: #ffffff; margin: 0; padding: 24px; }
    .card { max-width: 540px; margin: 0 auto; background-color: #0d0e12; border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 14px; overflow: hidden; }
    .header { background-color: #000000; padding: 28px; text-align: center; border-bottom: 1px solid rgba(245, 158, 11, 0.2); }
    .header h1 { margin: 0; font-size: 22px; letter-spacing: 3px; color: #F59E0B; }
    .header p { margin: 6px 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: rgba(255,255,255,0.6); }
    .body { padding: 32px 28px; }
    .badge { display: inline-block; padding: 6px 14px; background: rgba(16, 185, 129, 0.15); border: 1px solid #10B981; border-radius: 20px; color: #10B981; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px; }
    .greeting { font-size: 18px; font-weight: 700; color: #ffffff; margin-bottom: 12px; }
    .text { font-size: 14px; line-height: 1.6; color: rgba(255,255,255,0.8); margin-bottom: 24px; }
    .otp-box { background: #000000; border: 2px solid #F59E0B; border-radius: 12px; padding: 22px; text-align: center; margin-bottom: 24px; box-shadow: 0 0 20px rgba(245, 158, 11, 0.15); }
    .otp-code { font-family: 'Courier New', monospace; font-size: 40px; font-weight: 900; letter-spacing: 10px; color: #F59E0B; }
    .otp-expiry { font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 8px; }
    .steps { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 18px; margin-bottom: 24px; font-size: 13px; line-height: 1.6; color: rgba(255,255,255,0.8); }
    .footer { padding: 20px 28px; background-color: #050608; border-top: 1px solid rgba(255,255,255,0.08); font-size: 11px; color: rgba(255,255,255,0.4); line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>MUMWE SAFARIS UGANDA</h1>
      <p>Partner & Driver Recruitment Operations</p>
    </div>
    <div class="body">
      <div class="badge">Application Approved ✓</div>
      <div class="greeting">Congratulations, ${fullName}!</div>
      <div class="text">
        We are thrilled to inform you that your application as a <strong>${roleTitle}</strong> has been officially approved by Mumwe Safaris administrators.
      </div>
      <div class="text">
        Use your 6-digit One-Time Passcode (OTP) below to log in to the partner app and initialize your dashboard:
      </div>
      <div class="otp-box">
        <div class="otp-code">${otpCode}</div>
        <div class="otp-expiry">Valid for 48 Hours • Account Activation Code</div>
      </div>
      <div class="steps">
        <strong>Next Steps to Enter Your Dashboard:</strong><br>
        1. Open the <strong>Mumwe Safaris Driver Portal</strong> (careers.mumwesafarisuganda.com) or the mobile application.<br>
        2. Enter your registered email address (<code>${toEmail}</code>) and this 6-digit OTP code.<br>
        3. You will be prompted to create your new permanent password.<br>
        4. Once your password is saved, you will immediately enter your <strong>App Dashboard</strong> to toggle your online status and transmit live GPS.
      </div>
      <div class="text" style="font-size: 12px; color: rgba(255,255,255,0.5); margin-bottom: 0;">
        Never share this activation code with anyone. If you have any inquiries, contact our dispatch operations team at support@mumwesafarisuganda.com.
      </div>
    </div>
    <div class="footer">
      Mumwe Safaris Uganda Ltd • Plot 14, Jinja Road, Kampala, Uganda<br>
      Automated dispatch notification — please do not reply directly.
    </div>
  </div>
</body>
</html>
    `;

    try {
      await transporter.sendMail({
        from: ENV.SMTP_FROM,
        to: toEmail,
        subject: `Your Mumwe Safaris Application is Approved! Activation Code: ${otpCode}`,
        text: `Congratulations ${fullName}! Your Mumwe Safaris ${roleTitle} application has been approved. Use activation code ${otpCode} to log in, set your permanent password, and enter your app dashboard.`,
        html: htmlContent,
      });
      console.log(`✅ [EmailService] Approval OTP email delivered to ${toEmail}`);
      return true;
    } catch (err: any) {
      console.error(`❌ [EmailService] Failed to send approval email to ${toEmail}:`, err.message);
      return true;
    }
  }
}

