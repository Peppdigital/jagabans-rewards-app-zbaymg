import type { Metadata } from 'next';
import MaintenancePage from '../../components/MaintenancePage';

export const metadata: Metadata = {
  title: "We'll Be Right Back | Jagabans L.A.",
  description:
    "Jagabans L.A. is temporarily offline for improvements. We're preparing something exceptional — check back soon.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Jagabans L.A. — We'll Be Right Back",
    description: "We're refreshing the Jagabans experience. Back shortly.",
    siteName: 'Jagabans L.A.',
    type: 'website',
  },
};

export default function Page() {
  return <MaintenancePage />;
}
