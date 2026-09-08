import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '../components/Sidebar';

export const metadata: Metadata = {
  title: 'SAFARIS Uganda - Admin Command Center',
  description: 'Pure Black Control Center for SAFARIS Mobility & Tourism Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-black text-white selection:bg-white selection:text-black antialiased">
        <div className="flex min-h-screen bg-black">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 bg-black">{children}</div>
        </div>
      </body>
    </html>
  );
}
