import type { Metadata } from 'next';
import './globals.css';
import { AdminLayoutWrapper } from '../components/AdminLayoutWrapper';
import { ThemeProvider } from '../components/ThemeProvider';

export const metadata: Metadata = {
  title: 'SAFARIS Uganda - Operations & Recruitment',
  referrer: 'no-referrer',
  description: 'Control Center & Careers Portal for SAFARIS Mobility & Tourism Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          <AdminLayoutWrapper>{children}</AdminLayoutWrapper>
        </ThemeProvider>
      </body>
    </html>
  );
}
