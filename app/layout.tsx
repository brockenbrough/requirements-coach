import './globals.css';

export const metadata = {
  title: 'SSU Starter App',
  description: 'Next.js + Tailwind + Supabase starter for students',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
