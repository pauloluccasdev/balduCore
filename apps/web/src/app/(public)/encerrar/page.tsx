import { PublicJourney } from '../../../features/invitations/public-journey';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Encerrar acompanhamento | BalduCore',
  robots: { index: false, follow: false },
};
export default function WithdrawalPage() {
  return <PublicJourney kind="withdrawal" />;
}
