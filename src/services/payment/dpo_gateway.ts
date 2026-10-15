import http from 'http';
import https from 'https';
import { URL } from 'url';
import { ENV } from '../../config/env';

export interface DpoCreateTokenParams {
  amountUgx: number;
  currency?: string;
  referenceId: string;
  description: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  redirectUrl?: string;
  backUrl?: string;
}

export interface DpoCreateTokenResult {
  success: boolean;
  transToken: string;
  transRef?: string;
  paymentUrl: string;
  resultCode: string;
  resultExplanation: string;
  environment: 'sandbox' | 'production';
}

export interface DpoVerifyTokenResult {
  success: boolean;
  resultCode: string;
  resultExplanation: string;
  customerName?: string;
  customerPhone?: string;
  transAmount?: number;
  transCurrency?: string;
  transactionApproved: boolean;
  rawResponse?: string;
  environment: 'sandbox' | 'production';
}

/**
 * Official DPO Pay (Direct Pay Online) Production-Ready Gateway Client
 * Implements DPO API v6 XML protocol for Card and Mobile Money processing.
 *
 * NOTE: Sensitive card credentials (PAN, CVV, PIN) are NEVER captured or stored
 * on SAFARIS servers. Payment is tokenized and processed through DPO Pay secure endpoints.
 */
export class DpoPayGateway {
  public static get environment(): 'sandbox' | 'production' {
    return ENV.DPO_ENVIRONMENT || 'sandbox';
  }

  private static get companyToken(): string {
    return (ENV.DPO_COMPANY_TOKEN || process.env.DPO_COMPANY_TOKEN || '').trim();
  }

  private static get serviceType(): string {
    return (ENV.DPO_SERVICE_TYPE || process.env.DPO_SERVICE_TYPE || '5525').trim();
  }

  private static get apiUrl(): string {
    return ENV.DPO_API_BASE_URL || ENV.DPO_API_URL || 'https://secure.3gdirectpay.com/API/v6/';
  }

  private static get payUrl(): string {
    return ENV.DPO_PAY_URL || 'https://secure.3gdirectpay.com/payv3.php';
  }

  private static get callbackUrl(): string {
    return ENV.DPO_CALLBACK_URL || 'https://admin.mumwesafarisuganda.com/api/v1/payments/dpo/callback';
  }

  private static get cancelUrl(): string {
    return ENV.DPO_CANCEL_URL || 'https://admin.mumwesafarisuganda.com/api/v1/payments/dpo/cancel';
  }

  /**
   * Generates formatted ServiceDate for DPO (YYYY/MM/DD HH:MM)
   */
  private static formatServiceDate(date: Date = new Date()): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const h = pad(date.getHours());
    const min = pad(date.getMinutes());
    return `${y}/${m}/${d} ${h}:${min}`;
  }

  /**
   * Helper to perform HTTP/HTTPS POST request with XML body
   */
  private static async postXml(targetUrl: string, xmlBody: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(targetUrl);
      const isHttps = parsed.protocol === 'https:';
      const client = isHttps ? https : http;

      const options = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml',
          'Content-Length': Buffer.byteLength(xmlBody, 'utf-8'),
          'Accept': 'application/xml, text/xml, */*',
        },
        timeout: 15000,
      };

      const req = client.request(options, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve(data);
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('DPO Pay gateway request timed out (15s).'));
      });

      req.write(xmlBody);
      req.end();
    });
  }

  /**
   * Extracts text between simple XML tags without external dependencies
   */
  private static extractXmlTag(xml: string, tag: string): string | null {
    const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
    const match = xml.match(regex);
    return match ? match[1].trim() : null;
  }

  /**
   * Creates a transaction token with DPO Pay
   */
  public static async createToken(params: DpoCreateTokenParams): Promise<DpoCreateTokenResult> {
    const currentEnv = this.environment;
    const token = this.companyToken;
    const currency = params.currency || 'UGX';
    const redirect = params.redirectUrl || this.callbackUrl;
    const back = params.backUrl || this.cancelUrl;
    const serviceDate = this.formatServiceDate();

    // Verify presence of required DPO credentials
    if (!token) {
      console.warn(`[DPO Pay] Cannot initialize ${currentEnv} payment: DPO_COMPANY_TOKEN is missing.`);
      return {
        success: false,
        transToken: '',
        paymentUrl: '',
        resultCode: '900',
        resultExplanation: `DPO Pay credentials not configured for ${currentEnv} environment. Please configure DPO_COMPANY_TOKEN in backend environment.`,
        environment: currentEnv,
      };
    }

    // Split customer name into first and last
    const nameParts = (params.customerName || 'SAFARIS Guest').trim().split(/\s+/);
    const firstName = nameParts[0] || 'Customer';
    const lastName = nameParts.slice(1).join(' ') || 'Safaris';

    const xmlPayload = `<?xml version="1.0" encoding="utf-8"?>
<API3G>
  <CompanyToken>${token}</CompanyToken>
  <Request>createToken</Request>
  <Transaction>
    <PaymentAmount>${params.amountUgx}</PaymentAmount>
    <PaymentCurrency>${currency}</PaymentCurrency>
    <CompanyRef>${params.referenceId}</CompanyRef>
    <RedirectURL>${redirect}</RedirectURL>
    <BackURL>${back}</BackURL>
    <CompanyRefUnique>0</CompanyRefUnique>
    <PTL>5</PTL>
    <customerFirstName>${firstName}</customerFirstName>
    <customerLastName>${lastName}</customerLastName>
    <customerEmail>${params.customerEmail || 'payments@mumwesafarisuganda.com'}</customerEmail>
    <customerPhone>${params.customerPhone || '+256700000000'}</customerPhone>
  </Transaction>
  <Services>
    <Service>
      <ServiceType>${this.serviceType}</ServiceType>
      <ServiceDescription>${params.description.replace(/&/g, '&amp;')}</ServiceDescription>
      <ServiceDate>${serviceDate}</ServiceDate>
    </Service>
  </Services>
</API3G>`;

    try {
      console.log(`[DPO Pay] Initializing ${currentEnv} token for ref=${params.referenceId}, amount=${params.amountUgx} ${currency}`);
      const responseXml = await this.postXml(this.apiUrl, xmlPayload);
      const result = this.extractXmlTag(responseXml, 'Result') || '999';
      const resultExplanation = this.extractXmlTag(responseXml, 'ResultExplanation') || 'Unknown DPO response';
      const transToken = this.extractXmlTag(responseXml, 'TransToken') || '';
      const transRef = this.extractXmlTag(responseXml, 'TransRef') || '';

      if (result === '000' && transToken) {
        console.log(`[DPO Pay] Transaction token generated successfully: token=${transToken.substring(0, 10)}... (env: ${currentEnv})`);
        return {
          success: true,
          transToken,
          transRef,
          paymentUrl: `${this.payUrl}?ID=${transToken}`,
          resultCode: result,
          resultExplanation,
          environment: currentEnv,
        };
      }

      console.warn(`[DPO Pay] createToken declined: Result=${result}, Explanation=${resultExplanation}`);
      return {
        success: false,
        transToken: '',
        paymentUrl: '',
        resultCode: result,
        resultExplanation,
        environment: currentEnv,
      };
    } catch (err: any) {
      console.error('[DPO Pay Gateway] createToken error:', err);
      throw new Error(`Failed to initialize DPO Pay transaction: ${err.message}`);
    }
  }

  /**
   * Verifies payment status with DPO Pay via verifyToken API
   */
  public static async verifyToken(transToken: string): Promise<DpoVerifyTokenResult> {
    const currentEnv = this.environment;
    const token = this.companyToken;

    if (!token) {
      return {
        success: false,
        resultCode: '900',
        resultExplanation: `DPO credentials missing. Cannot verify transaction in ${currentEnv} mode.`,
        transactionApproved: false,
        environment: currentEnv,
      };
    }

    if (!transToken || transToken.trim() === '') {
      return {
        success: false,
        resultCode: '901',
        resultExplanation: 'Missing TransactionToken for DPO verification.',
        transactionApproved: false,
        environment: currentEnv,
      };
    }

    const xmlPayload = `<?xml version="1.0" encoding="utf-8"?>
<API3G>
  <CompanyToken>${token}</CompanyToken>
  <Request>verifyToken</Request>
  <TransactionToken>${transToken}</TransactionToken>
</API3G>`;

    try {
      console.log(`[DPO Pay] Sending verifyToken request to DPO endpoint (${currentEnv})...`);
      const responseXml = await this.postXml(this.apiUrl, xmlPayload);
      const result = this.extractXmlTag(responseXml, 'Result') || '999';
      const resultExplanation = this.extractXmlTag(responseXml, 'ResultExplanation') || 'Unknown verification response';
      const customerName = this.extractXmlTag(responseXml, 'CustomerName') || undefined;
      const customerPhone = this.extractXmlTag(responseXml, 'CustomerPhone') || undefined;
      const transAmount = Number(this.extractXmlTag(responseXml, 'TransactionAmount') || 0);
      const transCurrency = this.extractXmlTag(responseXml, 'TransactionCurrency') || 'UGX';

      // DPO Result 000 indicates Transaction Paid & Approved
      const isApproved = result === '000';

      console.log(`[DPO Pay] verifyToken response: Result=${result} (${resultExplanation}), Approved=${isApproved}`);

      return {
        success: isApproved,
        resultCode: result,
        resultExplanation,
        customerName,
        customerPhone,
        transAmount,
        transCurrency,
        transactionApproved: isApproved,
        rawResponse: responseXml,
        environment: currentEnv,
      };
    } catch (err: any) {
      console.error('[DPO Pay Gateway] verifyToken error:', err);
      throw new Error(`Failed to verify DPO Pay transaction: ${err.message}`);
    }
  }
}
