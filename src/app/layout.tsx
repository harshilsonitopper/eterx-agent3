import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import 'katex/dist/katex.min.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'EterX',
  description: 'Deep Work Autonomous Agent OS Workspace',
  icons: {
    icon: '/logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${ inter.variable } font-sans antialiased min-h-screen selection:bg-[#E2765A]/30 selection:text-white`}>
        {children}
      </body>
    </html>
  );
}
