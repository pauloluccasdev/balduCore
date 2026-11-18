import { PublicJourney } from '../../../features/invitations/public-journey';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Convite de acompanhamento | BalduCore',
  robots: { index: false, follow: false },
};
export default function InvitationPage() {
  return <PublicJourney kind="invitation" />;
}
