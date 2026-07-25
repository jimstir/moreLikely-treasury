import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Web3Provider } from "@/context/Web3Context";
import ConnectWalletModal from "@/components/ConnectWalletModal";

export const metadata: Metadata = {
  title: "moreLikely Smart Treasury",
  description: "Deploy, manage, and govern tokenized smart treasuries with AI-powered decision making on the 0G Network.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Web3Provider>
          <nav className="navbar">
            <div className="navbar-left">
              <Link href="/" className="navbar-brand">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <rect width="24" height="24" rx="6" fill="url(#brandGrad)" />
                  <path d="M7 12l3 3 7-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <defs>
                    <linearGradient id="brandGrad" x1="0" y1="0" x2="24" y2="24">
                      <stop stopColor="#3b82f6" />
                      <stop offset="1" stopColor="#8b5cf6" />
                    </linearGradient>
                  </defs>
                </svg>
                moreLikely Treasury
              </Link>
              <Link href="/" className="navbar-home">
                Home
              </Link>
            </div>
            <div className="navbar-actions">
              <ConnectWalletModal />
            </div>
          </nav>
          <main className="page">
            {children}
          </main>
        </Web3Provider>
      </body>
    </html>
  );
}
