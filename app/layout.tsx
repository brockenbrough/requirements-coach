import './globals.css';
import { UserProvider } from '../components/UserProvider';

export const metadata = {
  title: {
    default: 'Requirements Coach',
    template: '%s – Requirements Coach',
  },
  description: 'Practice writing and evaluating software requirements, with gamified feedback.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <UserProvider>{children}</UserProvider>
      </body>
    </html>
  );
}
