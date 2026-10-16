import type { Metadata } from 'next';
import './globals.css';
import { AdminLayoutWrapper } from '../components/AdminLayoutWrapper';

export const metadata: Metadata = {
  title: 'SAFARIS Uganda - Operations & Recruitment',
  description: 'Pure Black Control Center & Careers Portal for SAFARIS Mobility & Tourism Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-black text-white selection:bg-white selection:text-black antialiased">
        <AdminLayoutWrapper>{children}</AdminLayoutWrapper>
      </body>
    </html>
  );
}
