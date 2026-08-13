import './globals.css';
import { OnboardingTourProvider } from '../components/OnboardingTourProvider';
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
        <UserProvider>
          <OnboardingTourProvider>{children}</OnboardingTourProvider>
        </UserProvider>
      </body>
    </html>
  );
}
