import './globals.css';

export const metadata = {
  title: 'TradeWall',
  description: 'Forex, gold, and crypto intelligence dashboard',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
