'use client';
import { useRef } from 'react';
import {
  Activity,
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronRight,
  LayoutDashboard,
  Menu,
  Settings,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
const navigation = [
  { label: 'Dashboard', icon: LayoutDashboard, sprint: null },
  { label: 'Alunos', icon: Users, sprint: 'Sprint 02' },
  { label: 'Planejamento', icon: CalendarDays, sprint: 'MVP 2' },
  { label: 'Atividades', icon: Activity, sprint: 'Sprint 05' },
  {
    label: 'Análise Esportiva',
    icon: ChartNoAxesCombined,
    sprint: 'Sprint 06',
  },
  { label: 'Assistente IA', icon: Sparkles, sprint: 'Sprint 07' },
  { label: 'Central de Monitoramento', icon: Bell, sprint: 'Sprint 09' },
];
function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <a
        className="brand"
        href="#dashboard"
        aria-label="BalduTraining — Dashboard"
        onClick={onNavigate}
      >
        <span className="brand-emblem" aria-hidden="true">
          <Activity size={26} />
        </span>
        <span>
          <strong>
            Baldu<span>Training</span>
          </strong>
          <small>Painel do treinador</small>
        </span>
      </a>
      <nav aria-label="Navegação principal">
        <ul className="nav-list">
          {navigation.map(({ label, icon: Icon, sprint }) => (
            <li key={label}>
              {sprint ? (
                <div
                  className="nav-item future"
                  aria-disabled="true"
                  title={`${label} em desenvolvimento`}
                >
                  <Icon size={19} aria-hidden="true" />
                  <span>{label}</span>
                  <small>{sprint === 'MVP 2' ? 'MVP 2' : 'Em breve'}</small>
                </div>
              ) : (
                <a
                  className="nav-item active"
                  href="#dashboard"
                  aria-current="page"
                  onClick={onNavigate}
                >
                  <Icon size={19} aria-hidden="true" />
                  <span>{label}</span>
                  <ChevronRight
                    className="active-chevron"
                    size={15}
                    aria-hidden="true"
                  />
                </a>
              )}
            </li>
          ))}
        </ul>
      </nav>
      <div className="sidebar-footer">
        <div
          className="nav-item future"
          aria-disabled="true"
          title="Configurações em desenvolvimento"
        >
          <Settings size={19} aria-hidden="true" />
          <span>Configurações</span>
          <small>Em breve</small>
        </div>
        <p>
          BalduCore <span>•</span> Ambiente demo
        </p>
      </div>
    </>
  );
}
export function Sidebar() {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <a className="skip-link" href="#dashboard">
        Pular para o conteúdo
      </a>
      <aside className="sidebar desktop-sidebar" aria-label="Menu lateral">
        <SidebarContent />
      </aside>
      <div className="mobile-bar">
        <button
          className="button"
          aria-label="Abrir menu"
          aria-haspopup="dialog"
          onClick={() => dialog.current?.showModal()}
        >
          <Menu size={20} aria-hidden="true" />
        </button>
        <span className="mobile-brand">
          Baldu<span>Training</span>
        </span>
        <span className="badge">Demo</span>
      </div>
      <dialog
        ref={dialog}
        className="mobile-dialog"
        aria-label="Menu de navegação"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="drawer">
          <button
            className="button close-menu"
            aria-label="Fechar menu"
            onClick={() => dialog.current?.close()}
          >
            <X size={20} aria-hidden="true" />
          </button>
          <SidebarContent onNavigate={() => dialog.current?.close()} />
        </div>
      </dialog>
    </>
  );
}
