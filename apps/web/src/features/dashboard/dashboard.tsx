'use client';
import { useState } from 'react';
import {
  ArrowUpRight,
  ChevronRight,
  CircleAlert,
  Clock3,
  PlugZap,
} from 'lucide-react';
import { Sidebar } from '../../components/sidebar';
import { ThemeToggle } from '../../components/theme-toggle';
import { Badge, Card, MetricCard } from '../../components/ui';
import { activitiesForPeriod, athletes, formatDistance } from './demo-data';
export function Dashboard() {
  const [period, setPeriod] = useState(30);
  const activities = activitiesForPeriod(period);
  const attention = activities.filter((activity) => activity.attention);
  const sports = ['Corrida', 'Ciclismo', 'Natação'];
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content" id="dashboard" tabIndex={-1}>
        <header className="page-header">
          <div>
            <p className="eyebrow">VISÃO GERAL</p>
            <h1>Dashboard</h1>
            <p className="subtitle">
              Seus alunos, atividades e pontos de atenção em um só lugar.
            </p>
          </div>
          <div className="header-actions">
            <div
              className="period-switch"
              role="group"
              aria-label="Período das atividades"
            >
              {[7, 30, 90].map((days) => (
                <button
                  key={days}
                  onClick={() => setPeriod(days)}
                  aria-pressed={period === days}
                >
                  {days} dias
                </button>
              ))}
            </div>
            <ThemeToggle />
            <span
              className="coach-avatar"
              aria-label="Perfil demonstrativo, sem sessão autenticada"
            >
              TR
            </span>
          </div>
        </header>
        <div className="demo-banner" role="note">
          <PlugZap size={18} aria-hidden="true" />
          <div>
            <strong>Ambiente demonstrativo</strong>
            <span>
              Garmin não está integrada. Todos os alunos, conexões, atividades e
              insights abaixo são sintéticos.
            </span>
          </div>
          <Badge tone="warning">Sem sincronização ativa</Badge>
        </div>
        <div className="metrics-grid">
          <MetricCard
            label="Total de alunos"
            description="alunos demonstrativos"
          >
            {athletes.length}
          </MetricCard>
          <MetricCard
            label="Conectados à Garmin"
            description="Estados simulados · nenhuma conexão real"
          >
            2 <small>de {athletes.length}</small>
          </MetricCard>
          <MetricCard
            label="Atividades recentes"
            description={`últimos ${period} dias da demonstração`}
          >
            {activities.length}
          </MetricCard>
          <MetricCard label="Volume por modalidade">
            <dl className="sport-volumes">
              {sports.map((sport) => (
                <div key={sport}>
                  <dt>{sport}</dt>
                  <dd>
                    {formatDistance(
                      activities
                        .filter((activity) => activity.sport === sport)
                        .reduce((sum, activity) => sum + activity.distance, 0),
                      sport,
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </MetricCard>
          <MetricCard
            label="Merecem atenção"
            description="eventos detectados não indicam problema"
          >
            <span className="text-accent">{attention.length}</span>
          </MetricCard>
        </div>
        <div className="dashboard-grid">
          <Card
            title="Atividades que merecem atenção"
            aside={<Badge tone="danger">{attention.length} eventos</Badge>}
            className="attention-card"
          >
            <div className="attention-list">
              {attention.map((activity) => (
                <article key={activity.id}>
                  <div>
                    <h3>
                      {activity.athlete} <span>· {activity.name}</span>
                    </h3>
                    <p>
                      {activity.date.split('-').reverse().join('/')} ·{' '}
                      {activity.attention}
                    </p>
                  </div>
                  <button
                    className="button"
                    disabled
                    title="Análise esportiva em desenvolvimento"
                  >
                    Analisar <ArrowUpRight size={14} aria-hidden="true" />
                  </button>
                </article>
              ))}
            </div>
            <p className="section-footnote">
              <CircleAlert size={14} aria-hidden="true" /> Eventos ilustrativos.
              As causas precisam de avaliação do treinador.
            </p>
          </Card>
          <Card
            title="Insights relevantes"
            aside={
              <span className="muted small">Exemplo · prova de 30 km</span>
            }
          >
            <div className="insight-list">
              {[
                {
                  km: 'KM 1–10',
                  title: 'Consistência de ritmo',
                  text: 'Exemplo de fato observado: ritmo relativamente estável.',
                },
                {
                  km: 'KM 11–12',
                  title: 'Desaceleração',
                  text: 'Evento ilustrativo. A causa não é confirmada pelos dados.',
                },
                {
                  km: 'KM 26',
                  title: 'Alteração relevante',
                  text: 'Exemplo de trecho a investigar com o treinador.',
                },
              ].map((insight) => (
                <article key={insight.km}>
                  <span className="segment-chip">{insight.km}</span>
                  <div>
                    <h3>{insight.title}</h3>
                    <p>{insight.text}</p>
                  </div>
                  <ChevronRight size={15} aria-hidden="true" />
                </article>
              ))}
            </div>
            <p className="section-footnote">
              Conteúdo sintético fixo · não gerado por IA.
            </p>
          </Card>
          <Card
            title="Atividades recentes"
            aside={<span className="muted small">últimos {period} dias</span>}
            className="activities-card"
          >
            <div
              className="table-scroll"
              role="region"
              aria-label="Atividades demonstrativas recentes"
              tabIndex={0}
            >
              <table>
                <caption className="sr-only">
                  Atividades sintéticas no período selecionado
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Aluno</th>
                    <th scope="col">Atividade</th>
                    <th scope="col">Data</th>
                    <th scope="col">Distância</th>
                    <th scope="col">Status simulado</th>
                  </tr>
                </thead>
                <tbody>
                  {activities.map((activity) => (
                    <tr key={activity.id}>
                      <td>{activity.athlete}</td>
                      <td>
                        <strong>{activity.name}</strong>
                      </td>
                      <td>{activity.date.split('-').reverse().join('/')}</td>
                      <td>
                        {formatDistance(activity.distance, activity.sport)}
                      </td>
                      <td>
                        <span
                          className={`status-dot ${activity.status === 'Analisada' ? 'status-success' : 'status-warning'}`}
                        />
                        {activity.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="section-footnote">
              Referência temporal da demonstração: 15/11/2026 ·{' '}
              {activities.length} atividades
            </p>
          </Card>
          <Card title="Resumo do planejamento" aside={<Badge>MVP 2</Badge>}>
            <div className="empty-state">
              <span className="empty-icon">
                <Clock3 size={22} aria-hidden="true" />
              </span>
              <h3>O próximo passo do acompanhamento</h3>
              <p>
                Prescrição de treinos estruturados e envio ao ecossistema Garmin
                estão previstos para o MVP 2, sujeitos ao acesso oficial.
              </p>
            </div>
            <button className="button" disabled>
              Criar treino · em breve
            </button>
          </Card>
        </div>
        <Card
          title="Alunos e status"
          aside={
            <span className="muted small">
              Vínculo e Garmin são estados independentes · simulação
            </span>
          }
          className="athletes-card"
        >
          <div className="athlete-grid">
            {athletes.map((athlete) => (
              <article className="athlete-tile" key={athlete.name}>
                <h3>{athlete.name}</h3>
                <p>
                  Vínculo: <span>Ativo (demo)</span>
                </p>
                <p>
                  Garmin:{' '}
                  <span className={`tone-${athlete.tone}`}>
                    {athlete.status}
                  </span>
                </p>
              </article>
            ))}
          </div>
        </Card>
        <footer className="page-footer">
          <span>
            BalduTraining <span aria-hidden="true">/</span> BalduCore
          </span>
          <span>Ambiente demonstrativo · Dados sintéticos</span>
        </footer>
      </main>
    </div>
  );
}
