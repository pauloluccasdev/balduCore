'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Card, Badge } from '../../components/ui';
import {
  type Activity,
  sports,
  sources,
  formatNumber,
  formatPace,
} from './types';
export function ActivityTable({ items }: { items: Activity[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const activity = items.find((item) => item.id === selected) ?? items[0];
  return (
    <div className="activities-layout">
      <Card
        title="Histórico de atividades"
        aside={<Badge>{items.length} nesta página</Badge>}
      >
        {!items.length ? (
          <div className="empty-state">
            <h3>Nenhuma atividade disponível</h3>
            <p>
              Atividades aparecem após o processamento e exigem vínculo ativo e
              aceites válidos. Ajuste os filtros ou importe um FIT de teste no
              perfil.
            </p>
            <Link className="button" href="/alunos">
              Ver alunos
            </Link>
          </div>
        ) : (
          <div
            className="table-scroll activities-scroll"
            tabIndex={0}
            role="region"
            aria-label="Histórico de atividades"
          >
            <table>
              <thead>
                <tr>
                  <th>Aluno / atividade</th>
                  <th>Data UTC</th>
                  <th>Distância</th>
                  <th>Tempo</th>
                  <th>Ritmo</th>
                  <th>Origem / dados</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className={
                      activity?.id === item.id ? 'selected-activity' : ''
                    }
                  >
                    <td>
                      <button
                        className="activity-select"
                        aria-pressed={activity?.id === item.id}
                        onClick={() => setSelected(item.id)}
                      >
                        {item.athleteName}
                        <small>{sports[item.sport] ?? item.sport}</small>
                      </button>
                    </td>
                    <td>
                      {new Date(item.startedAt).toLocaleString('pt-BR', {
                        timeZone: 'UTC',
                      })}
                    </td>
                    <td>{formatNumber(item.distanceMeters, ' km', 1000)}</td>
                    <td>{formatNumber(item.durationSeconds, ' min', 60)}</td>
                    <td>{formatPace(item.paceSecondsPerKm)}</td>
                    <td>
                      <small>{sources[item.source] ?? item.source}</small>
                      <br />
                      <Badge>
                        {item.sampleCount ? 'Com amostras' : 'Somente resumo'}
                      </Badge>
                    </td>
                    <td>
                      <Link href={`/atividades/${item.id}`}>Detalhes →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="Resumo da atividade">
        {activity ? (
          <div className="activity-summary">
            <Badge tone="warning">Dados sintéticos</Badge>
            <h3>
              {sports[activity.sport]} · {activity.athleteName}
            </h3>
            <p className="muted small">
              {sources[activity.source]} ·{' '}
              {new Date(activity.startedAt).toLocaleString('pt-BR', {
                timeZone: 'UTC',
              })}{' '}
              UTC
            </p>
            <dl className="profile-status">
              <dt>Distância</dt>
              <dd>{formatNumber(activity.distanceMeters, ' km', 1000)}</dd>
              <dt>Duração ({activity.durationBasis})</dt>
              <dd>{formatNumber(activity.durationSeconds, ' s')}</dd>
              <dt>FC média</dt>
              <dd>{formatNumber(activity.avgHeartRateBpm, ' bpm')}</dd>
              <dt>Cadência média</dt>
              <dd>{formatNumber(activity.avgCadenceRpm, ' ciclos/min')}</dd>
              <dt>Amostras / splits</dt>
              <dd>
                {activity.sampleCount} / {activity.splitCount}
              </dd>
            </dl>
            <p className="muted small">
              Métricas ausentes aparecem como —. Gráficos e comparação de
              trechos estão disponíveis em Analisar atividade.
            </p>
            <Link
              className="button primary-button"
              href={`/atividades/${activity.id}`}
            >
              Explorar dados
            </Link>
            <Link
              className="button primary-button"
              href={`/analise-esportiva/${activity.id}`}
            >
              Analisar atividade
            </Link>
            <Link href={`/alunos/${activity.athleteId}`}>
              Perfil do aluno →
            </Link>
          </div>
        ) : (
          <p className="empty-state">
            Selecione uma atividade quando houver dados.
          </p>
        )}
      </Card>
    </div>
  );
}
