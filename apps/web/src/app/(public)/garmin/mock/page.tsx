import { MockAuthorization } from '../../../../features/garmin/public-garmin';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Simulador Garmin | BalduCore',
  robots: { index: false, follow: false },
};
export default function Page() {
  return <MockAuthorization />;
}
