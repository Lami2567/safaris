import { Express } from 'express';
import { lookup } from 'dns/promises';

/** Trust only addresses resolved for the internal Nginx service, never a forwarding header. */
export function configureTrustedProxy(app: Express, hostname = process.env.TRUSTED_PROXY_HOST,
  resolve: (host: string) => Promise<string[]> = async host => (await lookup(host, { all: true })).map(r => r.address)) {
  const normalize = (address: string) => address.replace(/^::ffff:/, '');
  let addresses = new Set<string>();
  app.set('trust proxy', hostname ? (ip: string) => addresses.has(normalize(ip)) : 'loopback');
  const refresh = async () => {
    if (!hostname) return;
    try { addresses = new Set((await resolve(hostname)).map(normalize)); }
    catch { addresses.clear(); throw new Error('Trusted gateway resolution unavailable.'); }
  };
  const timer = hostname ? setInterval(() => { refresh().catch(() => {}); }, 5000) : undefined;
  timer?.unref();
  return { refresh, stop: () => { if (timer) clearInterval(timer); } };
}
