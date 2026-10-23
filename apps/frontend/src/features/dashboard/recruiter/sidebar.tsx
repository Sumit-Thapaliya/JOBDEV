'use client';

import {
  BarChart3,
  Building2,
  HelpCircle,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Settings,
  Briefcase,
  MessagesSquare,
  Users, Eye,
} from 'lucide-react';

import { cn } from '@/lib/utils';

export type RecruiterView =
  | 'overview'
  | 'jobs'
  | 'applicants'
  | 'messages'
  | 'harvested'
  | 'analytics'
  | 'company'
  | 'settings'
  | 'help';

export const NAV_ITEMS: Array<{
  id: RecruiterView;
  label: string;
  icon: typeof LayoutDashboard;
  section: 'main' | 'general';
}> = [
  { id: 'overview', label: 'Dashboard', icon: LayoutDashboard, section: 'main' },
  { id: 'jobs', label: 'Post job', icon: Briefcase, section: 'main' },
  { id: 'applicants', label: 'Applicants', icon: Users, section: 'main' },
  { id: 'messages', label: 'Messages', icon: MessagesSquare, section: 'main' },
  { id: 'harvested', label: 'Viewed candidates', icon: Eye, section: 'main' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, section: 'main' },
  { id: 'company', label: 'Company profile', icon: Building2, section: 'general' },
  { id: 'settings', label: 'Settings', icon: Settings, section: 'general' },
  { id: 'help', label: 'Help & support', icon: LifeBuoy, section: 'general' },
];

interface SidebarProps {
  active: RecruiterView;
  onSelect: (view: RecruiterView) => void;
  badges?: Partial<Record<RecruiterView, number>>;
  onLogout: () => void;
}

function NavButton({
  item,
  active,
  badge,
  onSelect,
  index,
}: {
  item: (typeof NAV_ITEMS)[number];
  active: boolean;
  badge?: number;
  onSelect: (view: RecruiterView) => void;
  index: number;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className={cn(
        'group animate-fade-in-up relative flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200',
        active
          ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25'
          : 'text-muted-foreground hover:translate-x-1 hover:bg-primary-light hover:text-primary-dark',
      )}
      style={{ animationDelay: `${80 + index * 50}ms` }}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary-foreground/80" />
      )}
      <Icon
        className={cn(
          'h-[18px] w-[18px] shrink-0 transition-transform group-hover:scale-110',
          active && 'animate-wiggle',
        )}
      />
      <span className="truncate">{item.label}</span>
      {badge ? (
        <span
          className={cn(
            'ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold',
            active ? 'bg-primary-foreground text-primary' : 'bg-primary text-primary-foreground',
          )}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export function Sidebar({
  active,
  onSelect,
  badges,
  onLogout,
}: SidebarProps) {
  const sections: Array<{ key: 'main' | 'general'; title: string }> = [
    { key: 'main', title: 'Menu' },
    { key: 'general', title: 'General' },
  ];

  let itemIndex = 0;

  const nav = (
    <>
      {sections.map((section) => (
        <div key={section.key} className="space-y-1">
          <p className="px-3.5 pb-1 pt-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
            {section.title}
          </p>
          {NAV_ITEMS.filter((item) => item.section === section.key).map(
            (item) => {
              const index = itemIndex++;
              return (
                <NavButton
                  key={item.id}
                  item={item}
                  index={index}
                  active={active === item.id}
                  badge={badges?.[item.id]}
                  onSelect={onSelect}
                />
              );
            },
          )}
        </div>
      ))}
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-card p-4 scrollbar-slim lg:flex lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] lg:self-start">
        {nav}
        <div className="mt-auto space-y-3">
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-[18px] w-[18px]" />
            Log out
          </button>
        </div>
      </aside>

      {/* Mobile horizontal nav */}
      <div className="sticky top-16 z-30 flex gap-2 overflow-x-auto border-b border-border bg-card px-4 py-2.5 scrollbar-slim lg:hidden">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-all',
                isActive
                  ? 'bg-primary text-primary-foreground shadow'
                  : 'bg-muted text-muted-foreground hover:bg-primary-light hover:text-primary-dark',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          );
        })}

      </div>
    </>
  );
}

export function HelpCard() {
  return (
    <div className="animate-fade-in-up rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-info/15 text-info">
          <HelpCircle className="h-5 w-5" />
        </span>
        <div>
          <h3 className="font-semibold">Need a hand?</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Our hiring specialists answer within one business day.
          </p>
          <a
            href="mailto:support@jobdev.app"
            className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 hover:bg-primary-hover"
          >
            Contact support
          </a>
        </div>
      </div>
    </div>
  );
}