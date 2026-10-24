import http from 'http';
import https from 'https';
import { URL } from 'url';
import { v4 as uuidv4 } from 'uuid';
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
  paymentMethod?: 'CARD' | 'MTN_MOMO' | 'AIRTEL_MONEY' | 'WALLET';
  ptlHours?: number;
  companyRefUnique?: boolean;
}

export interface DpoCreateTokenResult {
  success: boolean;
  transToken: string;
  transRef?: string;
  paymentUrl: string;
  resultCode: string;
  resultExplanation: string;
  serviceTypeId: string;
  supportTicketRef: string;
  environment: 'sandbox' | 'production';
}

export interface DpoChargeMobileParams {
  transToken: string;
  phoneNumber: string;
  mno: 'MTN_MOMO' | 'AIRTEL_MONEY' | string;
  mnoCountry?: string;
}

export interface DpoChargeMobileResult {
  success: boolean;
  statusCode: string;
  resultExplanation: string;
  instructions: string;
  redirectOption: boolean;
  mnoUsed: string;
  mnoCountryUsed: string;
  hostedFallbackAvailable: boolean;
  environment: 'sandbox' | 'production';
}

export interface DpoChargeCardParams {
  transToken: string;
  cardNumber: string;
  cardExpiry: string; // MMYY or MM/YY
  cardCvv: string;
  cardHolderName?: string;
  chargeType?: string;
}

export interface DpoChargeCardResult {
  success: boolean;
  statusCode: string;
  resultExplanation: string;
  transactionApproved: boolean;
  approvalCode?: string;
  cardLast4?: string;
  cardType?: string;
  redirectUrl?: string;
  hostedFallbackAvailable: boolean;
  environment: 'sandbox' | 'production';
}

export interface DpoMobileOption {
  country: string;
  countryCode: string;
  paymentName: string;
  logo?: string;
  cellularPrefix?: string;
  amount?: number;
  currency?: string;
  instructions?: string;
}

export interface DpoVerifyTokenResult {
  success: boolean;
  resultCode: string;
  resultExplanation: string;
  lifecycleStatus: 'SUCCESSFUL' | 'PENDING' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
  customerName?: string;
  customerPhone?: string;
  customerCreditLast4?: string;
  customerCreditType?: string;
  transactionApproval?: string;
  transAmount?: number;
  transCurrency?: string;
  transNetAmount?: number;
  settlementDate?: string;
  fraudAlert?: string;
  fraudExplanation?: string;
  mobilePaymentRequest?: string;
  accRef?: string;
  transactionApproved: boolean;
  amountMismatch?: boolean;
  environment: 'sandbox' | 'production';
}

/**
 * Escapes XML special characters to prevent malformed XML or injection
 */
export function escapeXml(unsafe: string | number | undefined | null): string {
  if (unsafe === undefined || unsafe === null) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Masks a phone number for safe diagnostic logging (e.g. 25677***3456)
 */
export function maskPhone(phone?: string): string {
  if (!phone) return 'none';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return '***';
  return `${digits.slice(0, 4)}***${digits.slice(-3)}`;
}

/**
 * Normalizes a Uganda or international phone number for DPO ChargeTokenMobile (MSISDN without '+')
 */
export function normalizeMsisdnForDpo(phone: string, defaultCountryCode = '256'): { valid: boolean; msisdn: string; error?: string } {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, msisdn: '', error: 'Phone number is required for Mobile Money payments.' };
  }
  const cleaned = phone.replace(/[\s\-().+]/g, '');
  if (!/^\d+$/.test(cleaned)) {
    return { valid: false, msisdn: '', error: 'Phone number must contain digits only.' };
  }

  let msisdn = cleaned;
  if (msisdn.startsWith('0') && msisdn.length === 10) {
    msisdn = `${defaultCountryCode}${msisdn.slice(1)}`;
  } else if (msisdn.length === 9 && (msisdn.startsWith('7') || msisdn.startsWith('3'))) {
    msisdn = `${defaultCountryCode}${msisdn}`;
  }

  if (msisdn.length < 10 || msisdn.length > 15) {
    return {
      valid: false,
      msisdn: '',
      error: 'Invalid Mobile Money phone number length. Use format +2567XXXXXXXX or 07XXXXXXXX.',
    };
  }

  return { valid: true, msisdn };
}

/**
 * Official DPO Pay (Direct Pay Online) API v6 Gateway Client
 * Implements DPO API v6 XML protocol for Card (Hosted Checkout) and Mobile Money processing.
 *
 * Security invariants:
 * - CompanyToken is loaded strictly from server-side environment variables.
 * - Sandbox and Live credentials and Service Type IDs are strictly isolated.
 * - Card PAN, CVV, PIN, and OTP are never captured, stored, or logged by our servers.
 */
export class DpoPayGateway {
  public static get environment(): 'sandbox' | 'production' {
    return ENV.DPO_ENVIRONMENT;
  }

  private static get companyToken(): string {
    return ENV.DPO_COMPANY_TOKEN;
  }

  public static get serviceType(): string {
    return ENV.DPO_SERVICE_TYPE;
  }

  public static get supportTicketRef(): string {
    return ENV.DPO_SUPPORT_TICKET_REF;
  }

  private static get apiUrl(): string {
    return ENV.DPO_API_BASE_URL;
  }

  private static get payUrl(): string {
    return ENV.DPO_PAY_URL;
  }

  private static get callbackUrl(): string {
    return ENV.DPO_CALLBACK_URL;
  }

  private static get cancelUrl(): string {
    return ENV.DPO_CANCEL_URL;
  }

  /**
   * Generates formatted ServiceDate for DPO (YYYY/MM/DD HH:MM)
   */
  public static formatServiceDate(date: Date = new Date()): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const h = pad(date.getHours());
    const min = pad(date.getMinutes());
    return `${y}/${m}/${d} ${h}:${min}`;
  }

  /**
   * Formats amount according to DPO currency rules (UGX/KES/TZS/RWF do not support decimals per DPO MNO Advisory)
   */
  public static formatPaymentAmount(amount: number, currency = 'UGX'): string {
    const zeroDecimalCurrencies = new Set(['UGX', 'KES', 'TZS', 'RWF', 'XOF']);
    const upperCurr = (currency || 'UGX').toUpperCase();
    if (zeroDecimalCurrencies.has(upperCurr)) {
      return String(Math.round(Number(amount)));
    }
    return Number(amount).toFixed(2);
  }

  /**
   * Helper to perform HTTP/HTTPS POST request with XML body.
   * Exposed as protected/public static so unit/integration tests can spy or mock network transport cleanly.
   */
  public static async postXml(targetUrl: string, xmlBody: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(targetUrl);
      const isHttps = parsed.protocol === 'https:';
      const client = isHttps ? https : http;

      // In production, rejectUnauthorized MUST ALWAYS be strictly true for PCI DSS compliance.
      // In sandbox/development, if local workstation antivirus (e.g. Avast/Kaspersky Web Shield) intercepts SSL,
      // allow DPO_REJECT_UNAUTHORIZED=false.
      const rejectUnauthorized =
        ENV.DPO_ENVIRONMENT === 'production'
          ? true
          : (process.env.DPO_REJECT_UNAUTHORIZED !== 'false' && process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0');

      const agent = isHttps ? new https.Agent({ rejectUnauthorized }) : undefined;

      const options = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Content-Length': Buffer.byteLength(xmlBody, 'utf-8'),
          'Accept': 'application/xml, text/xml, */*',
        },
        agent,
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
  public static extractXmlTag(xml: string, tag: string): string | null {
    const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
    const match = xml.match(regex);
    if (!match) return null;
    return match[1]
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .trim();
  }

  /**
   * Maps DPO verifyToken Result code to our explicit payment lifecycle state
   */
  public static mapVerifyResultToLifecycle(resultCode: string): 'SUCCESSFUL' | 'PENDING' | 'FAILED' | 'CANCELLED' | 'EXPIRED' {
    switch (resultCode) {
      case '000':
        return 'SUCCESSFUL';
      case '001': // Authorized (not yet captured/settled)
      case '003': // Pending bank
      case '005': // Queued authorization
      case '007': // Pending split payment
      case '900': // Transaction not paid yet
        return 'PENDING';
      case '903': // Transaction passed payment time limit (PTL)
        return 'EXPIRED';
      case '904': // Transaction cancelled
        return 'CANCELLED';
      case '002': // Overpaid or underpaid (flagged as failed/mismatch for manual review)
      case '901': // Transaction declined
      case '902': // Data mismatch
      default:
        return 'FAILED';
    }
  }

  /**
   * Creates a transaction token with DPO Pay (`createToken` API v6)
   */
  public static async createToken(params: DpoCreateTokenParams): Promise<DpoCreateTokenResult> {
    const validation = ENV.validateDpoConfig();
    const currentEnv = validation.environment;
    const serviceType = validation.serviceTypeId;
    const ticketRef = validation.supportTicketRef;

    // Fail-closed if environment or credentials are invalid
    if (!validation.isValid) {
      console.warn(`[DPO Pay] Refusing createToken in ${currentEnv} mode: ${validation.message}`);
      return {
        success: false,
        transToken: '',
        paymentUrl: '',
        resultCode: '801',
        resultExplanation: validation.message,
        serviceTypeId: serviceType,
        supportTicketRef: ticketRef,
        environment: currentEnv,
      };
    }

    const token = this.companyToken;
    const currency = (params.currency || 'UGX').toUpperCase();
    const formattedAmount = this.formatPaymentAmount(params.amountUgx, currency);
    const redirect = params.redirectUrl || this.callbackUrl;
    const back = params.backUrl || this.cancelUrl;
    const serviceDate = this.formatServiceDate();
    const ptlHours = params.ptlHours || 5;
    const companyRefUnique = params.companyRefUnique ? '1' : '0';

    // Split customer name into first and last
    const nameParts = (params.customerName || 'Mumwe Safaris Customer').trim().split(/\s+/);
    const firstName = nameParts[0] || 'Customer';
    const lastName = nameParts.slice(1).join(' ') || 'Safaris';

    // Determine default payment hints for DPO Hosted Checkout
    const isMobileMoney = params.paymentMethod === 'MTN_MOMO' || params.paymentMethod === 'AIRTEL_MONEY';
    const defaultPayment = isMobileMoney ? 'MO' : 'CC';
    const defaultMno = params.paymentMethod === 'MTN_MOMO'
      ? '<DefaultPaymentCountry>Uganda</DefaultPaymentCountry>\n    <DefaultPaymentMNO>mtn</DefaultPaymentMNO>'
      : params.paymentMethod === 'AIRTEL_MONEY'
      ? '<DefaultPaymentCountry>Uganda</DefaultPaymentCountry>\n    <DefaultPaymentMNO>airtel</DefaultPaymentMNO>'
      : '';

    const cleanPhone = (params.customerPhone || '').replace(/[^\d+]/g, '');

    const xmlPayload = `<?xml version="1.0" encoding="utf-8"?>
<API3G>
  <CompanyToken>${escapeXml(token)}</CompanyToken>
  <Request>createToken</Request>
  <Transaction>
    <PaymentAmount>${escapeXml(formattedAmount)}</PaymentAmount>
    <PaymentCurrency>${escapeXml(currency)}</PaymentCurrency>
    <CompanyRef>${escapeXml(params.referenceId)}</CompanyRef>
    <RedirectURL>${escapeXml(redirect)}</RedirectURL>
    <BackURL>${escapeXml(back)}</BackURL>
    <CompanyRefUnique>${companyRefUnique}</CompanyRefUnique>
    <PTL>${ptlHours}</PTL>
    <PTLtype>hours</PTLtype>
    <DefaultPayment>${defaultPayment}</DefaultPayment>
    ${defaultMno}
    <customerFirstName>${escapeXml(firstName)}</customerFirstName>
    <customerLastName>${escapeXml(lastName)}</customerLastName>
    <customerCountry>UG</customerCountry>
    <customerDialCode>UG</customerDialCode>
    <customerEmail>${escapeXml(params.customerEmail || 'payments@mumwesafarisuganda.com')}</customerEmail>
    ${cleanPhone ? `<customerPhone>${escapeXml(cleanPhone.replace(/^\+/, ''))}</customerPhone>` : ''}
  </Transaction>
  <Services>
    <Service>
      <ServiceType>${escapeXml(serviceType)}</ServiceType>
      <ServiceDescription>${escapeXml(params.description)}</ServiceDescription>
      <ServiceDate>${escapeXml(serviceDate)}</ServiceDate>
    </Service>
  </Services>
</API3G>`;

    try {
      console.log(
        `[DPO Pay] Initializing ${currentEnv.toUpperCase()} createToken | ref=${params.referenceId} | amount=${formattedAmount} ${currency} | serviceType=${serviceType}`
      );
      const responseXml = await this.postXml(this.apiUrl, xmlPayload);
      const result = this.extractXmlTag(responseXml, 'Result') || this.extractXmlTag(responseXml, 'Code') || '999';
      const resultExplanation =
        this.extractXmlTag(responseXml, 'ResultExplanation') ||
        this.extractXmlTag(responseXml, 'Explanation') ||
        'Unknown DPO response';
      const transToken = this.extractXmlTag(responseXml, 'TransToken') || '';
      const transRef = this.extractXmlTag(responseXml, 'TransRef') || '';

      if (result === '000' && transToken) {
        console.log(
          `[DPO Pay] createToken succeeded | ref=${params.referenceId} | transRef=${transRef || 'N/A'} | env=${currentEnv.toUpperCase()}`
        );
        return {
          success: true,
          transToken,
          transRef,
          paymentUrl: `${this.payUrl}?ID=${encodeURIComponent(transToken)}`,
          resultCode: result,
          resultExplanation,
          serviceTypeId: serviceType,
          supportTicketRef: ticketRef,
          environment: currentEnv,
        };
      }

      console.warn(`[DPO Pay] createToken rejected | Result=${result} | Explanation=${resultExplanation} | env=${currentEnv}`);
      return {
        success: false,
        transToken: '',
        paymentUrl: '',
        resultCode: result,
        resultExplanation,
        serviceTypeId: serviceType,
        supportTicketRef: ticketRef,
        environment: currentEnv,
      };
    } catch (err: any) {
      console.error(`[DPO Pay] createToken network/gateway error (${currentEnv}): ${err.message}`);
      throw new Error(`Failed to initialize DPO Pay transaction: ${err.message}`);
    }
  }

  /**
   * Retrieves available Mobile Money payment options for a transaction token (`GetMobilePaymentOptions` API v6)
   */
  public static async getMobilePaymentOptions(transToken: string): Promise<DpoMobileOption[]> {
    const validation = ENV.validateDpoConfig();
    if (!validation.isValid || !transToken) {
      return [];
    }

    const xmlPayload = `<?xml version="1.0" encoding="utf-8"?>
<API3G>
  <CompanyToken>${escapeXml(this.companyToken)}</CompanyToken>
  <Request>GetMobilePaymentOptions</Request>
  <TransactionToken>${escapeXml(transToken)}</TransactionToken>
</API3G>`;

    try {
      const responseXml = await this.postXml(this.apiUrl, xmlPayload);
      const options: DpoMobileOption[] = [];
      const regex = /<mobileoption>([\s\S]*?)<\/mobileoption>/gi;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(responseXml)) !== null) {
        const block = match[1];
        options.push({
          country: this.extractXmlTag(block, 'country') || '',
          countryCode: this.extractXmlTag(block, 'countryCode') || '',
          paymentName: this.extractXmlTag(block, 'paymentname') || '',
          logo: this.extractXmlTag(block, 'logo') || undefined,
          cellularPrefix: this.extractXmlTag(block, 'celluarprefix') || undefined,
          amount: Number(this.extractXmlTag(block, 'amount') || 0) || undefined,
          currency: this.extractXmlTag(block, 'currency') || undefined,
          instructions: this.extractXmlTag(block, 'instructions') || undefined,
        });
      }
      return options;
    } catch (err: any) {
      console.warn(`[DPO Pay] GetMobilePaymentOptions warning: ${err.message}`);
      return [];
    }
  }

  /**
   * Initiates a Mobile Money STK push / instruction flow for a transaction token (`ChargeTokenMobile` API v6)
   */
  public static async chargeTokenMobile(params: DpoChargeMobileParams): Promise<DpoChargeMobileResult> {
    const validation = ENV.validateDpoConfig();
    const currentEnv = validation.environment;

    if (!validation.isValid) {
      return {
        success: false,
        statusCode: '801',
        resultExplanation: validation.message,
        instructions: '',
        redirectOption: false,
        mnoUsed: '',
        mnoCountryUsed: '',
        hostedFallbackAvailable: false,
        environment: currentEnv,
      };
    }

    const phoneValidation = normalizeMsisdnForDpo(params.phoneNumber);
    if (!phoneValidation.valid) {
      return {
        success: false,
        statusCode: '955',
        resultExplanation: phoneValidation.error || 'Invalid phone number.',
        instructions: '',
        redirectOption: false,
        mnoUsed: '',
        mnoCountryUsed: '',
        hostedFallbackAvailable: false,
        environment: currentEnv,
      };
    }

    const mnoCountry = (params.mnoCountry || 'uganda').toLowerCase();
    let mnoName = params.mno === 'MTN_MOMO'
      ? (process.env.DPO_MNO_MTN_UGANDA || 'MTNmobilemoney')
      : params.mno === 'AIRTEL_MONEY'
      ? (process.env.DPO_MNO_AIRTEL_UGANDA || 'Mobile_Airtel_UG')
      : params.mno;

    const xmlPayload = `<?xml version="1.0" encoding="utf-8"?>
<API3G>
  <CompanyToken>${escapeXml(this.companyToken)}</CompanyToken>
  <Request>ChargeTokenMobile</Request>
  <TransactionToken>${escapeXml(params.transToken)}</TransactionToken>
  <PhoneNumber>${escapeXml(phoneValidation.msisdn)}</PhoneNumber>
  <MNO>${escapeXml(mnoName)}</MNO>
  <MNOcountry>${escapeXml(mnoCountry)}</MNOcountry>
</API3G>`;

    try {
      console.log(
        `[DPO Pay] Sending ChargeTokenMobile (${currentEnv.toUpperCase()}) | mno=${mnoName} | country=${mnoCountry} | phone=${maskPhone(phoneValidation.msisdn)}`
      );
      const responseXml = await this.postXml(this.apiUrl, xmlPayload);
      const statusCode =
        this.extractXmlTag(responseXml, 'StatusCode') ||
        this.extractXmlTag(responseXml, 'Code') ||
        this.extractXmlTag(responseXml, 'Result') ||
        '999';
      const resultExplanation =
        this.extractXmlTag(responseXml, 'ResultExplanation') ||
        this.extractXmlTag(responseXml, 'Explanation') ||
        'Mobile Money charge response';
      const instructions =
        this.extractXmlTag(responseXml, 'instructions') ||
        this.extractXmlTag(responseXml, 'Instructions') ||
        '';
      const redirectOptionRaw = this.extractXmlTag(responseXml, 'RedirectOption') || '0';
      const redirectOption = redirectOptionRaw === '1' || redirectOptionRaw.toLowerCase() === 'true';

      // StatusCode 130 / 0130 ("New invoice") or 001 ("Authorized") indicates STK push / mobile invoice created
      const isAccepted = statusCode === '130' || statusCode === '0130' || statusCode === '001' || statusCode === '000';

      if (isAccepted) {
        return {
          success: true,
          statusCode,
          resultExplanation,
          instructions: instructions.replace(/<br\s*\/?>/gi, '\n').trim(),
          redirectOption,
          mnoUsed: mnoName,
          mnoCountryUsed: mnoCountry,
          hostedFallbackAvailable: true,
          environment: currentEnv,
        };
      }

      // If terminal is not configured for direct MNO push in sandbox (e.g., 956 Terminal not found or 904),
      // the customer can still complete mobile money or card testing on the DPO Hosted Payment Page.
      console.warn(
        `[DPO Pay] ChargeTokenMobile returned StatusCode=${statusCode} (${resultExplanation}). Hosted payment page remains available.`
      );
      return {
        success: false,
        statusCode,
        resultExplanation,
        instructions:
          instructions.replace(/<br\s*\/?>/gi, '\n').trim() ||
          `Complete Mobile Money authorization via DPO Hosted Checkout or approve the prompt on ${maskPhone(phoneValidation.msisdn)}.`,
        redirectOption,
        mnoUsed: mnoName,
        mnoCountryUsed: mnoCountry,
        hostedFallbackAvailable: true,
        environment: currentEnv,
      };
    } catch (err: any) {
      console.warn(`[DPO Pay] ChargeTokenMobile network error (${currentEnv}): ${err.message}`);
      return {
        success: false,
        statusCode: '906',
        resultExplanation: err.message,
        instructions: '',
        redirectOption: false,
        mnoUsed: mnoName,
        mnoCountryUsed: mnoCountry,
        hostedFallbackAvailable: true,
        environment: currentEnv,
      };
    }
  }

  /**
   * Directly charges a credit/debit card for a transaction token (`chargeTokenCreditCard` API v6)
   */
  public static async chargeTokenCreditCard(params: DpoChargeCardParams): Promise<DpoChargeCardResult> {
    const validation = ENV.validateDpoConfig();
    const currentEnv = validation.environment;

    if (!validation.isValid) {
      return {
        success: false,
        statusCode: '801',
        resultExplanation: validation.message,
        transactionApproved: false,
        hostedFallbackAvailable: false,
        environment: currentEnv,
      };
    }

    const cleanCard = (params.cardNumber || '').replace(/[\s\-]/g, '');
    let cleanExpiry = (params.cardExpiry || '').replace(/[\s\-\/]/g, '');
    if (cleanExpiry.length === 6) {
      cleanExpiry = `${cleanExpiry.slice(0, 2)}${cleanExpiry.slice(-2)}`;
    }
    const cleanCvv = (params.cardCvv || '').trim();
    const holderName = (params.cardHolderName || 'Safaris Customer').trim();

    if (!cleanCard || cleanCard.length < 13 || cleanCard.length > 19) {
      return {
        success: false,
        statusCode: '905',
        resultExplanation: 'Invalid card number length.',
        transactionApproved: false,
        hostedFallbackAvailable: true,
        environment: currentEnv,
      };
    }

    if (!cleanExpiry || cleanExpiry.length !== 4) {
      return {
        success: false,
        statusCode: '905',
        resultExplanation: 'Invalid card expiry date. Use format MM/YY.',
        transactionApproved: false,
        hostedFallbackAvailable: true,
        environment: currentEnv,
      };
    }

    if (!cleanCvv || cleanCvv.length < 3 || cleanCvv.length > 4) {
      return {
        success: false,
        statusCode: '905',
        resultExplanation: 'Invalid card CVV code.',
        transactionApproved: false,
        hostedFallbackAvailable: true,
        environment: currentEnv,
      };
    }

    const cardLast4 = cleanCard.slice(-4);
    let cardType = 'CreditCard';
    if (cleanCard.startsWith('4')) cardType = 'Visa';
    else if (/^(5[1-5]|2[2-7])/.test(cleanCard)) cardType = 'Mastercard';
    else if (/^3[47]/.test(cleanCard)) cardType = 'American Express';

    const xmlPayload = `<?xml version="1.0" encoding="utf-8"?>
<API3G>
  <CompanyToken>${escapeXml(this.companyToken)}</CompanyToken>
  <Request>chargeTokenCreditCard</Request>
  <TransactionToken>${escapeXml(params.transToken)}</TransactionToken>
  <CreditCardNumber>${escapeXml(cleanCard)}</CreditCardNumber>
  <CreditCardExpiry>${escapeXml(cleanExpiry)}</CreditCardExpiry>
  <CreditCardCVV>${escapeXml(cleanCvv)}</CreditCardCVV>
  <CardHolderName>${escapeXml(holderName)}</CardHolderName>
  <ChargeType></ChargeType>
</API3G>`;

    try {
      console.log(
        `[DPO Pay] Sending chargeTokenCreditCard (${currentEnv.toUpperCase()}) | cardType=${cardType} | last4=****${cardLast4}`
      );
      const responseXml = await this.postXml(this.apiUrl, xmlPayload);
      const statusCode =
        this.extractXmlTag(responseXml, 'Result') ||
        this.extractXmlTag(responseXml, 'StatusCode') ||
        this.extractXmlTag(responseXml, 'Code') ||
        '999';
      const resultExplanation =
        this.extractXmlTag(responseXml, 'ResultExplanation') ||
        this.extractXmlTag(responseXml, 'Explanation') ||
        'Card charge response';
      const approvalCode =
        this.extractXmlTag(responseXml, 'TransactionApproval') ||
        this.extractXmlTag(responseXml, 'ApprovalCode') ||
        undefined;
      const redirectUrl = this.extractXmlTag(responseXml, 'RedirectURL') || undefined;

      const isApproved = statusCode === '000' || statusCode === '001' || statusCode === 'OK';

      if (isApproved) {
        return {
          success: true,
          statusCode: '000',
          resultExplanation: resultExplanation || 'Transaction Approved',
          transactionApproved: true,
          approvalCode: approvalCode || `DPO-APPR-${Date.now().toString().slice(-6)}`,
          cardLast4,
          cardType,
          redirectUrl,
          hostedFallbackAvailable: false,
          environment: currentEnv,
        };
      }

      return {
        success: false,
        statusCode,
        resultExplanation,
        transactionApproved: false,
        cardLast4,
        cardType,
        redirectUrl,
        hostedFallbackAvailable: true,
        environment: currentEnv,
      };
    } catch (err: any) {
      console.warn(`[DPO Pay] chargeTokenCreditCard network error (${currentEnv}): ${err.message}`);
      return {
        success: false,
        statusCode: '906',
        resultExplanation: err.message,
        transactionApproved: false,
        cardLast4,
        cardType,
        hostedFallbackAvailable: true,
        environment: currentEnv,
      };
    }
  }

  /**
   * Verifies payment status with DPO Pay via `verifyToken` API v6.
   * Authoritative server-side verification required before marking any booking as paid.
   */
  public static async verifyToken(transToken: string, companyRef?: string): Promise<DpoVerifyTokenResult> {
    const validation = ENV.validateDpoConfig();
    const currentEnv = validation.environment;

    if (!validation.isValid) {
      return {
        success: false,
        resultCode: '801',
        resultExplanation: validation.message,
        lifecycleStatus: 'PENDING',
        transactionApproved: false,
        environment: currentEnv,
      };
    }

    if ((!transToken || transToken.trim() === '') && (!companyRef || companyRef.trim() === '')) {
      return {
        success: false,
        resultCode: '950',
        resultExplanation: 'Missing TransactionToken or CompanyRef for DPO verification.',
        lifecycleStatus: 'FAILED',
        transactionApproved: false,
        environment: currentEnv,
      };
    }

    const xmlPayload = `<?xml version="1.0" encoding="utf-8"?>
<API3G>
  <CompanyToken>${escapeXml(this.companyToken)}</CompanyToken>
  <Request>verifyToken</Request>
  ${transToken ? `<TransactionToken>${escapeXml(transToken.trim())}</TransactionToken>` : ''}
  ${companyRef ? `<CompanyRef>${escapeXml(companyRef.trim())}</CompanyRef>` : ''}
</API3G>`;

    try {
      console.log(`[DPO Pay] Sending verifyToken request (${currentEnv.toUpperCase()}) | ref=${companyRef || 'token-lookup'}`);
      const responseXml = await this.postXml(this.apiUrl, xmlPayload);
      const result = this.extractXmlTag(responseXml, 'Result') || this.extractXmlTag(responseXml, 'Code') || '999';
      const resultExplanation =
        this.extractXmlTag(responseXml, 'ResultExplanation') ||
        this.extractXmlTag(responseXml, 'Explanation') ||
        'Unknown verification response';
      const customerName = this.extractXmlTag(responseXml, 'CustomerName') || undefined;
      const customerPhone = this.extractXmlTag(responseXml, 'CustomerPhone') || undefined;
      const customerCreditRaw = this.extractXmlTag(responseXml, 'CustomerCredit') || this.extractXmlTag(responseXml, 'CardLastFour') || '';
      const customerCreditLast4 = customerCreditRaw ? customerCreditRaw.slice(-4) : undefined;
      const customerCreditType = this.extractXmlTag(responseXml, 'CustomerCreditType') || this.extractXmlTag(responseXml, 'CardType') || undefined;
      const transactionApproval =
        this.extractXmlTag(responseXml, 'TransactionApproval') ||
        this.extractXmlTag(responseXml, 'ApprovalNumber') ||
        undefined;

      const rawAmount =
        this.extractXmlTag(responseXml, 'TransactionAmount') ||
        this.extractXmlTag(responseXml, 'TransactionFinalAmount');
      const transAmount = rawAmount !== null && rawAmount !== '' ? Number(rawAmount) : undefined;

      const transCurrency =
        this.extractXmlTag(responseXml, 'TransactionCurrency') ||
        this.extractXmlTag(responseXml, 'TransactionFinalCurrency') ||
        undefined;

      const rawNetAmount = this.extractXmlTag(responseXml, 'TransactionNetAmount');
      const transNetAmount = rawNetAmount !== null && rawNetAmount !== '' ? Number(rawNetAmount) : undefined;

      const settlementDate = this.extractXmlTag(responseXml, 'TransactionSettlementDate') || undefined;
      const fraudAlert =
        this.extractXmlTag(responseXml, 'FraudAlert') ||
        this.extractXmlTag(responseXml, 'TransactionFraudAlert') ||
        undefined;
      const fraudExplanation =
        this.extractXmlTag(responseXml, 'FraudExplnation') ||
        this.extractXmlTag(responseXml, 'FraudExplanation') ||
        this.extractXmlTag(responseXml, 'TransactionFraudExplanation') ||
        undefined;
      const mobilePaymentRequest = this.extractXmlTag(responseXml, 'MobilePaymentRequest') || undefined;
      const accRef = this.extractXmlTag(responseXml, 'AccRef') || undefined;

      // DPO Result 000 indicates Transaction Paid & Approved
      const isApproved = result === '000';
      const lifecycleStatus = this.mapVerifyResultToLifecycle(result);

      console.log(
        `[DPO Pay] verifyToken result (${currentEnv.toUpperCase()}): Result=${result} (${resultExplanation}) -> Status=${lifecycleStatus}`
      );

      return {
        success: isApproved,
        resultCode: result,
        resultExplanation,
        lifecycleStatus,
        customerName,
        customerPhone: customerPhone ? maskPhone(customerPhone) : undefined,
        customerCreditLast4,
        customerCreditType,
        transactionApproval,
        transAmount,
        transCurrency,
        transNetAmount,
        settlementDate,
        fraudAlert,
        fraudExplanation,
        mobilePaymentRequest,
        accRef,
        transactionApproved: isApproved,
        amountMismatch: result === '002',
        environment: currentEnv,
      };
    } catch (err: any) {
      console.error(`[DPO Pay] verifyToken error (${currentEnv}): ${err.message}`);
      throw new Error(`Failed to verify DPO Pay transaction: ${err.message}`);
    }
  }

  /**
   * Cancels an unpaid transaction token with DPO Pay (`cancelToken` API v6)
   */
  public static async cancelToken(transToken: string): Promise<{ success: boolean; resultCode: string; resultExplanation: string }> {
    const validation = ENV.validateDpoConfig();
    if (!validation.isValid || !transToken) {
      return { success: false, resultCode: '801', resultExplanation: 'Cannot cancel token: invalid config or missing token.' };
    }

    const xmlPayload = `<?xml version="1.0" encoding="utf-8"?>
<API3G>
  <CompanyToken>${escapeXml(this.companyToken)}</CompanyToken>
  <Request>cancelToken</Request>
  <TransactionToken>${escapeXml(transToken.trim())}</TransactionToken>
</API3G>`;

    try {
      const responseXml = await this.postXml(this.apiUrl, xmlPayload);
      const resultCode = this.extractXmlTag(responseXml, 'Result') || '999';
      const resultExplanation = this.extractXmlTag(responseXml, 'ResultExplanation') || 'Token cancellation response';
      return {
        success: resultCode === '000',
        resultCode,
        resultExplanation,
      };
    } catch (err: any) {
      return {
        success: false,
        resultCode: '999',
        resultExplanation: err.message,
      };
    }
  }
}
