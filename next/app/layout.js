import './globals.css';

export const metadata = {
  title: 'MIM VENTURES — Trading Intelligence Dashboard',
  description: 'MIM VENTURES forex, gold, and crypto intelligence dashboard',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
