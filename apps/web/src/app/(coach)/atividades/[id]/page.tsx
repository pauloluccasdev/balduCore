import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireCoach, serverApi } from '../../../../lib/server-auth';
import { Card, Badge, MetricCard } from '../../../../components/ui';
import {
  type Activity,
  sports,
  sources,
  formatNumber,
  formatPace,
} from '../../../../features/activities/types';
interface Sample {
  ordinal: number;
  timestamp: string;
  distanceMeters: number | null;
  speedMetersPerSecond: number | null;
  heartRateBpm: number | null;
  cadenceRpm: number | null;
  altitudeMeters: number | null;
}
interface Split {
  ordinal: number;
  distanceMeters: number | null;
  timerSeconds: number | null;
  elapsedSeconds: number | null;
  avgHeartRateBpm: number | null;
  avgCadenceRpm: number | null;
}
export default async function Detail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireCoach();
  const { id } = await params;
  const search = await searchParams;
  const number = (key: string) =>
    typeof search[key] === 'string' && /^\d+$/.test(search[key])
      ? Math.min(10000, Math.max(1, Number(search[key])))
      : 1;
  const samplePage = number('samples'),
    splitPage = number('splits');
  const response = await serverApi(`/activities/${encodeURIComponent(id)}`);
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error('Não foi possível carregar atividade.');
  const item: Activity = await response.json();
  const [samplesResponse, splitsResponse] = await Promise.all([
    serverApi(`/activities/${id}/samples?page=${samplePage}&limit=100`),
    serverApi(`/activities/${id}/splits?page=${splitPage}&limit=100`),
  ]);
  if (!samplesResponse.ok || !splitsResponse.ok)
    throw new Error('Não foi possível carregar dados esportivos.');
  const samples: { items: Sample[]; total: number } =
    await samplesResponse.json();
  const splits: { items: Split[]; total: number } = await splitsResponse.json();
  const pagination = (page: number, total: number, key: string) => (
    <nav
      className="pagination"
      aria-label={`Paginação de ${key === 'samples' ? 'amostras' : 'splits'}`}
    >
      {page > 1 && (
        <Link
          className="button"
          href={`?samples=${key === 'samples' ? page - 1 : samplePage}&splits=${key === 'splits' ? page - 1 : splitPage}`}
        >
          Anterior
        </Link>
      )}
      <span>Página {page}</span>
      {page * 100 < total && (
        <Link
          className="button"
          href={`?samples=${key === 'samples' ? page + 1 : samplePage}&splits=${key === 'splits' ? page + 1 : splitPage}`}
        >
          Próxima
        </Link>
      )}
    </nav>
  );
  return (
    <main id="dashboard" className="main-content">
      <header className="page-header">
        <div>
          <Link
            className="muted small"
            href={`/atividades?athleteId=${item.athleteId}`}
          >
            ← Histórico do aluno
          </Link>
          <h1>
            {sports[item.sport]} · {item.athleteName}
          </h1>
          <p className="subtitle">
            {new Date(item.startedAt).toLocaleString('pt-BR', {
              timeZone: 'UTC',
            })}{' '}
            UTC · {sources[item.source]}
          </p>
        </div>
        <Badge tone="warning">Dados sintéticos</Badge>
      </header>
      <section className="metrics-grid activity-metrics">
        <MetricCard label="Distância">
          {formatNumber(item.distanceMeters, ' km', 1000)}
        </MetricCard>
        <MetricCard label="Duração" description={`Base: ${item.durationBasis}`}>
          {formatNumber(item.durationSeconds, ' min', 60)}
        </MetricCard>
        <MetricCard
          label="Ritmo médio"
          description="Duração ÷ distância, quando disponíveis"
        >
          {formatPace(item.paceSecondsPerKm)}
        </MetricCard>
        <MetricCard label="FC média">
          {formatNumber(item.avgHeartRateBpm, ' bpm')}
        </MetricCard>
      </section>
      <Card title="Dados e disponibilidade">
        <dl className="profile-status">
          <dt>Cronômetro / decorrido</dt>
          <dd>
            {formatNumber(item.timerSeconds, ' s')} /{' '}
            {formatNumber(item.elapsedSeconds, ' s')}
          </dd>
          <dt>Velocidade média</dt>
          <dd>{formatNumber(item.speedKmh, ' km/h')}</dd>
          <dt>Cadência média</dt>
          <dd>{formatNumber(item.avgCadenceRpm, ' ciclos/min')}</dd>
          <dt>Elevação acumulada</dt>
          <dd>{formatNumber(item.totalAscentMeters, ' m')}</dd>
        </dl>
        <p className="muted small">
          Valores ausentes são —. Cadência em ciclos por minuto conforme FIT,
          sem conversão automática para passos. Não há inferência de sensação ou
          causa. Gráficos e análise entram na Sprint 06.
        </p>
        {Boolean(item.possibleDuplicates) && (
          <p role="status">
            Há outra atividade com início e modalidade iguais em outra origem.
            Possível duplicata; os registros foram preservados.
          </p>
        )}
        {item.qualityWarnings.length > 0 && (
          <p>Qualidade: {item.qualityWarnings.join(', ')}</p>
        )}
        <Link href={`/alunos/${item.athleteId}`}>Abrir perfil do aluno →</Link>
      </Card>
      <Card title={`Splits recebidos (${splits.total})`}>
        {!splits.total ? (
          <p className="empty-state">
            Nenhum split recebido. Não foram fabricados quilômetros.
          </p>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Split</th>
                    <th>Distância</th>
                    <th>Cronômetro</th>
                    <th>Decorrido</th>
                    <th>FC média</th>
                    <th>Cadência média</th>
                  </tr>
                </thead>
                <tbody>
                  {splits.items.map((split) => (
                    <tr key={split.ordinal}>
                      <td>{split.ordinal + 1}</td>
                      <td>{formatNumber(split.distanceMeters, ' m')}</td>
                      <td>{formatNumber(split.timerSeconds, ' s')}</td>
                      <td>{formatNumber(split.elapsedSeconds, ' s')}</td>
                      <td>{formatNumber(split.avgHeartRateBpm, ' bpm')}</td>
                      <td>
                        {formatNumber(split.avgCadenceRpm, ' ciclos/min')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pagination(splitPage, splits.total, 'splits')}
          </>
        )}
      </Card>
      <Card title={`Amostras recebidas (${samples.total})`}>
        {!samples.total ? (
          <p className="empty-state">
            Séries temporais indisponíveis nesta atividade.
          </p>
        ) : (
          <>
            <div className="table-scroll activities-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Horário UTC</th>
                    <th>Distância</th>
                    <th>Velocidade</th>
                    <th>FC</th>
                    <th>Cadência</th>
                    <th>Elevação</th>
                  </tr>
                </thead>
                <tbody>
                  {samples.items.map((sample) => (
                    <tr key={sample.ordinal}>
                      <td>
                        {new Date(sample.timestamp).toLocaleTimeString(
                          'pt-BR',
                          { timeZone: 'UTC' },
                        )}
                      </td>
                      <td>{formatNumber(sample.distanceMeters, ' m')}</td>
                      <td>
                        {formatNumber(sample.speedMetersPerSecond, ' m/s')}
                      </td>
                      <td>{formatNumber(sample.heartRateBpm, ' bpm')}</td>
                      <td>{formatNumber(sample.cadenceRpm, ' ciclos/min')}</td>
                      <td>{formatNumber(sample.altitudeMeters, ' m')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pagination(samplePage, samples.total, 'samples')}
          </>
        )}
      </Card>
    </main>
  );
}
