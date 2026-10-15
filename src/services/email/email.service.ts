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
          rejectUnauthorized: false, // Prevents self-signed cert blocks
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
}
