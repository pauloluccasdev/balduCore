'use client';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
  usePlotArea,
  useXAxisInverseDataSnapScale,
} from 'recharts';
import { Card } from '../../components/ui';
import { basisLabels, type Workspace, type Channel } from './types';
import { formatNumber, formatPace } from '../activities/types';
const labels = {
  pace: 'Ritmo',
  heartRate: 'Frequência cardíaca',
  cadence: 'Cadência',
  altitude: 'Elevação',
};
const units = {
  pace: 's/km',
  heartRate: 'bpm',
  cadence: 'ciclos/min',
  altitude: 'm',
};
// Seleção pelo ponto observado mais próximo, independente do tooltip/hover.
// O overlay também recebe toque; teclado usa os controles de trechos.
function SelectionOverlay({ onPoint }: { onPoint: (x: number) => void }) {
  const plot = usePlotArea();
  const snap = useXAxisInverseDataSnapScale();
  if (!plot || !snap) return null;
  return (
    <rect
      x={plot.x}
      y={plot.y}
      width={plot.width}
      height={plot.height}
      fill="transparent"
      pointerEvents="all"
      aria-hidden="true"
      onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (!bounds.width) return;
        const x = Number(
          snap(
            plot.x +
              ((event.clientX - bounds.left) * plot.width) / bounds.width,
          ),
        );
        if (Number.isFinite(x)) onPoint(x);
      }}
    />
  );
}
function Chart({
  channel,
  workspace,
  range,
  onPoint,
}: {
  channel: Channel;
  workspace: Workspace;
  range: [number, number] | null;
  onPoint: (x: number) => void;
}) {
  // Separadores nulos marcam descontinuidades; não são observações nem entram nos cálculos.
  const data = channel.points.flatMap((point) =>
    point.breakBefore
      ? [
          { ...point, value: null, separator: true },
          { ...point, separator: false },
        ]
      : [{ ...point, separator: false }],
  );
  const main = channel.channel === 'pace';
  const reference =
    main &&
    workspace.activity.distanceMeters !== null &&
    workspace.activity.distanceMeters > 0 &&
    workspace.activity.durationSeconds !== null &&
    workspace.activity.durationSeconds > 0
      ? workspace.activity.durationSeconds /
        (workspace.activity.distanceMeters / 1000)
      : null;
  const markers = new Map<number, number>();
  if (main)
    for (const event of workspace.analysis.result?.events ?? []) {
      const x =
        workspace.series.axis === 'time'
          ? event.marker.timeSeconds
          : event.marker.distanceMeters;
      if (
        x !== null &&
        channel.points.length &&
        x >= channel.points[0].x &&
        x <= channel.points.at(-1)!.x
      )
        markers.set(x, (markers.get(x) ?? 0) + 1);
    }
  return (
    <Card
      title={labels[channel.channel]}
      aside={<span className="small muted">{units[channel.channel]}</span>}
      className={main ? 'analysis-pace' : ''}
    >
      {!channel.knownCount ? (
        <div className="analysis-chart-empty">
          Série de {labels[channel.channel].toLocaleLowerCase('pt-BR')}{' '}
          indisponível. O resumo não substitui amostras.
        </div>
      ) : (
        <>
          <div
            className="analysis-chart"
            style={{ height: main ? 320 : 220 }}
            role="group"
            aria-label={`Gráfico de ${labels[channel.channel]}. Seleção também disponível nos controles de trechos.`}
          >
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart
                data={data}
                syncId={`activity-${workspace.activity.id}-${workspace.activity.revision}-${workspace.series.axis}`}
                syncMethod="value"
                margin={{ top: 12, right: 16, bottom: 18, left: 4 }}
              >
                <CartesianGrid
                  stroke="var(--border)"
                  strokeDasharray="4 4"
                  vertical={false}
                />
                <XAxis
                  dataKey="x"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tick={{ fill: 'var(--muted)', fontSize: 11 }}
                  tickFormatter={(value) =>
                    formatNumber(
                      Number(value),
                      workspace.series.axis === 'distance' ? ' km' : ' s',
                      workspace.series.axis === 'distance' ? 1000 : 1,
                    )
                  }
                  minTickGap={40}
                  label={{
                    value:
                      workspace.series.axis === 'distance'
                        ? 'Distância acumulada (km)'
                        : 'Segundos desde início da atividade',
                    position: 'bottom',
                    fill: 'var(--muted)',
                    fontSize: 11,
                  }}
                />
                <YAxis
                  reversed={main}
                  width={60}
                  tick={{ fill: 'var(--muted)', fontSize: 10 }}
                  tickFormatter={(value) =>
                    main
                      ? formatPace(Number(value)).replace(' /km', '')
                      : String(value)
                  }
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    color: 'var(--text)',
                  }}
                  labelFormatter={(value) =>
                    `${formatNumber(Number(value), workspace.series.axis === 'distance' ? ' km' : ' s', workspace.series.axis === 'distance' ? 1000 : 1)}`
                  }
                  formatter={(value) => [
                    main
                      ? formatPace(typeof value === 'number' ? value : null)
                      : formatNumber(
                          typeof value === 'number' ? value : null,
                          ` ${units[channel.channel]}`,
                        ),
                    labels[channel.channel],
                  ]}
                />
                {range && (
                  <ReferenceArea
                    x1={Math.min(...range)}
                    x2={Math.max(...range)}
                    fill="#EF3338"
                    fillOpacity={0.12}
                    stroke="#EF3338"
                  />
                )}
                {[...markers].map(([x, count]) => (
                  <ReferenceLine
                    key={x}
                    x={x}
                    stroke="var(--warning)"
                    strokeDasharray="3 3"
                    label={{
                      value: `Split com ${count} evento(s)`,
                      fill: 'var(--warning)',
                      fontSize: 10,
                      position: 'insideTopRight',
                    }}
                  />
                ))}
                {reference !== null && (
                  <ReferenceLine
                    y={reference}
                    stroke="var(--muted)"
                    strokeDasharray="5 5"
                  />
                )}
                <Line
                  type="linear"
                  dataKey="value"
                  stroke={
                    main
                      ? '#EF3338'
                      : channel.channel === 'heartRate'
                        ? 'var(--warning)'
                        : channel.channel === 'cadence'
                          ? '#7C83FF'
                          : 'var(--success)'
                  }
                  strokeWidth={2}
                  dot={data.length < 60 ? { r: 2 } : false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <SelectionOverlay onPoint={onPoint} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {reference !== null && (
            <p className="muted small">
              Tracejado: ritmo do resumo, base{' '}
              {basisLabels[workspace.activity.durationBasis]}.
            </p>
          )}
          <p className="muted small">
            {channel.knownCount} valores recebidos
            {channel.reduced
              ? `; visualização reduzida para ${channel.points.length} pontos observados`
              : ''}
            . Lacunas não são interpoladas.
          </p>
        </>
      )}
    </Card>
  );
}
export function Charts({
  workspace,
  range,
  onPoint,
}: {
  workspace: Workspace;
  range: [number, number] | null;
  onPoint: (x: number) => void;
}) {
  return (
    <>
      <Chart
        channel={workspace.series.channels[0]}
        workspace={workspace}
        range={range}
        onPoint={onPoint}
      />
      <div className="analysis-secondary">
        {workspace.series.channels.slice(1).map((channel) => (
          <Chart
            key={channel.channel}
            channel={channel}
            workspace={workspace}
            range={range}
            onPoint={onPoint}
          />
        ))}
      </div>
    </>
  );
}
