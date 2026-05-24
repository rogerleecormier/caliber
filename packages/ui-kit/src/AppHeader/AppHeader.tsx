import { useMemo } from "react";
import type { ComponentType, ReactNode } from "react";
import {
  BarChart3,
  Briefcase,
  ChevronDown,
  FileText,
  History,
  Home,
  Layers,
  LogIn,
  LogOut,
  Search,
  Shield,
  User,
  Wrench,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Header } from "../Header";
import styles from "../Header/Header.module.css";
import { getSharedAuthOrigin } from "../../../shared-utils/src/auth";

interface AppHeaderUser {
  id?: number;
  email: string;
  role: string;
}

interface AppHeaderProps {
  app: "jobs" | "tools" | "corporate";
  isDev?: boolean;
  currentPath: string;
  Link?: any;
  extraNav?: ReactNode;
  user?: AppHeaderUser | null;
  onLogout?: () => Promise<void> | void;
}

type MenuTone = "neutral" | "primary" | "indigo" | "info" | "success";

type MenuLinkItem = {
  type: "link";
  key: string;
  label: string;
  sublabel?: string;
  href: string;
  path?: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  tone?: MenuTone;
  appScope?: AppHeaderProps["app"];
};

type MenuSectionHeading = {
  type: "heading";
  key: string;
  label: string;
};

type MenuSeparator = {
  type: "separator";
  key: string;
};

type MenuDisabledItem = {
  type: "disabled";
  key: string;
  label: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
};

type MenuActionItem = {
  type: "action";
  key: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  tone?: "danger";
  onSelect: () => void | Promise<void>;
};

type MenuEntry =
  | MenuLinkItem
  | MenuSectionHeading
  | MenuSeparator
  | MenuDisabledItem
  | MenuActionItem;

function getAppOrigin(app: AppHeaderProps["app"], currentPath: string): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  if (app === "corporate") return "https://spearyx.com";
  if (app === "tools") return "https://tools.spearyx.com";
  if (currentPath.startsWith("/login") || currentPath.startsWith("/analyze")) {
    return "https://jobs.spearyx.com";
  }
  return "https://jobs.spearyx.com";
}

function normalizePath(path: string) {
  return path.endsWith("/") && path !== "/" ? path.slice(0, -1) : path;
}

function isActivePath(currentPath: string, targetPath: string) {
  const current = normalizePath(currentPath);
  const target = normalizePath(targetPath);
  if (target === "/") return current === "/";
  return current === target || current.startsWith(`${target}/`);
}

const toneClasses: Record<MenuTone, { badge: string; icon: string }> = {
  neutral: {
    badge: "bg-slate-100",
    icon: "text-slate-600",
  },
  primary: {
    badge: "bg-primary-50",
    icon: "text-primary-600",
  },
  indigo: {
    badge: "bg-indigo-50",
    icon: "text-indigo-600",
  },
  info: {
    badge: "bg-info-50",
    icon: "text-info-600",
  },
  success: {
    badge: "bg-success-50",
    icon: "text-success-600",
  },
};

function MenuIconBadge({
  tone = "neutral",
  children,
}: {
  tone?: MenuTone;
  children: ReactNode;
}) {
  return (
    <span
      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${toneClasses[tone].badge}`}
    >
      {children}
    </span>
  );
}

function MenuLinkRow({
  label,
  sublabel,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  sublabel?: string;
  icon: MenuLinkItem["icon"];
  tone?: MenuTone;
}) {
  return (
    <span className="flex items-center gap-3 rounded-xl px-3 py-2.5">
      <MenuIconBadge tone={tone}>
        <Icon size={14} className={toneClasses[tone].icon} />
      </MenuIconBadge>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold leading-tight text-slate-900">
          {label}
        </span>
        {sublabel ? (
          <span className="mt-0.5 block truncate text-xs leading-tight text-slate-500">
            {sublabel}
          </span>
        ) : null}
      </span>
    </span>
  );
}

function MenuDisabledRow({
  label,
  icon: Icon = FileText,
}: {
  label: string;
  icon?: MenuDisabledItem["icon"];
}) {
  return (
    <span className="flex items-center gap-3 rounded-xl">
      <MenuIconBadge tone="neutral">
        <Icon size={14} className="text-slate-400" />
      </MenuIconBadge>
      <span className="text-sm text-slate-400">{label}</span>
    </span>
  );
}

function MenuSimpleRow({
  label,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  tone?: MenuTone;
}) {
  return (
    <span className="flex items-center gap-3 rounded-xl px-3 py-2.5">
      <MenuIconBadge tone={tone}>
        <Icon size={14} className={toneClasses[tone].icon} />
      </MenuIconBadge>
      <span className="text-sm font-medium text-slate-900">{label}</span>
    </span>
  );
}

function SharedMenuLink({
  item,
  app,
  currentPath,
  Link,
}: {
  item: MenuLinkItem;
  app: AppHeaderProps["app"];
  currentPath: string;
  Link?: AppHeaderProps["Link"];
}) {
  const active =
    item.appScope === app &&
    typeof item.path === "string" &&
    isActivePath(currentPath, item.path);

  const itemClass = [
    "spx-menu-item",
    active ? "spx-menu-item-active" : "spx-menu-item-inactive",
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <MenuLinkRow
      label={item.label}
      sublabel={item.sublabel}
      icon={item.icon}
      tone={item.tone}
    />
  );

  const canUseLink = Boolean(Link && item.appScope === app && item.path);

  return (
    <DropdownMenuItem asChild className={itemClass}>
      {canUseLink ? (
        <Link to={item.path} className="block">
          {content}
        </Link>
      ) : (
        <a href={item.href} className="block">
          {content}
        </a>
      )}
    </DropdownMenuItem>
  );
}

function SharedActionMenu({
  label,
  icon: Icon,
  tone = "neutral",
  onSelect,
}: {
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  tone?: MenuTone;
  onSelect: MenuActionItem["onSelect"];
}) {
  return (
    <DropdownMenuItem className="spx-menu-item" onClick={() => void onSelect()}>
      <MenuSimpleRow label={label} icon={Icon} tone={tone} />
    </DropdownMenuItem>
  );
}

function SharedDropdownMenu({
  label,
  icon: Icon,
  active = false,
  panelClass,
  align = "start",
  entries,
}: {
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  active?: boolean;
  panelClass: string;
  align?: "start" | "end" | "center";
  entries: ReactNode[];
}) {
  const triggerClass = [
    "spx-nav-trigger",
    active ? "spx-nav-trigger-active" : "spx-nav-trigger-idle",
  ].join(" ");

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button className={triggerClass}>
          <Icon size={14} />
          {label}
          <ChevronDown size={12} className="opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        sideOffset={8}
        className={["spx-menu-panel", panelClass].join(" ")}
      >
        {entries}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppHeader({
  app,
  isDev = false,
  currentPath,
  Link,
  extraNav,
  user,
  onLogout,
}: AppHeaderProps) {
  const isOnTools = app === "tools";
  const isOnJobs = app === "jobs";
  const sharedOrigin =
    typeof window === "undefined"
      ? getSharedAuthOrigin()
      : getSharedAuthOrigin(window.location.href);
  const appOrigin = getAppOrigin(app, currentPath);
  const resolvedUser = user ?? null;
  const canAccessLinkedInSearch = app === "jobs" && resolvedUser?.role === "admin";

  const loginHref = useMemo(() => {
    if (app === "corporate") return "/login";

    const returnTo =
      typeof window !== "undefined"
        ? window.location.href
        : `${appOrigin}${currentPath || "/"}`;
    const params = new URLSearchParams({ redirect: returnTo });
    return `https://spearyx.com/login?${params.toString()}`;
  }, [app, appOrigin, currentPath]);

  async function handleSharedLogout() {
    if (onLogout) {
      await onLogout();
      return;
    }
    if (typeof window === "undefined") return;
    await fetch(`${sharedOrigin}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
      mode: "cors",
    }).catch(() => undefined);
    window.location.reload();
  }

  // Tools entries retired

  const jobsEntries: MenuEntry[] = [
    {
      type: "link",
      key: "jobs-home",
      label: "Jobs Home",
      sublabel: "Overview & getting started",
      href: "https://jobs.spearyx.com",
      path: "/",
      icon: Home,
      tone: "neutral",
      appScope: "jobs",
    },
    { type: "separator", key: "jobs-separator-1" },
    { type: "heading", key: "jobs-heading-1", label: "Job Tools" },
    {
      type: "link",
      key: "job-listings",
      label: "Job Listings",
      sublabel: "AI-curated tech jobs",
      href: "https://jobs.spearyx.com/jobs",
      path: "/jobs",
      icon: Briefcase,
      tone: "primary",
      appScope: "jobs",
    },
    {
      type: "link",
      key: "analyze-job",
      label: "Analyze Job",
      sublabel: "Match scoring & resume strategy",
      href: "https://jobs.spearyx.com/analyze",
      path: "/analyze",
      icon: Search,
      tone: "indigo",
      appScope: "jobs",
    },
    {
      type: "link",
      key: "history",
      label: "History",
      sublabel: "Past analyses & documents",
      href: "https://jobs.spearyx.com/history",
      path: "/history",
      icon: History,
      tone: "info",
      appScope: "jobs",
    },
    {
      type: "link",
      key: "dashboard",
      label: "Search Insights",
      sublabel: "Match trends & activity",
      href: "https://jobs.spearyx.com/dashboard",
      path: "/dashboard",
      icon: BarChart3,
      tone: "success",
      appScope: "jobs",
    },
  ];

  const userEntries: MenuEntry[] = [
    {
      type: "link",
      key: "profile",
      label: "My Profile",
      href: `${sharedOrigin}/profile`,
      path: "/profile",
      icon: User,
      tone: "primary",
      appScope: "jobs",
    },
    ...(canAccessLinkedInSearch
      ? [
          {
            type: "link",
            key: "linkedin-hub",
            label: "Agent Dashboard",
            sublabel: "AI job pipeline & agents",
            href: "https://jobs.spearyx.com/linkedin-hub",
            path: "/linkedin-hub",
            icon: Briefcase,
            tone: "indigo",
            appScope: "jobs",
          } as MenuEntry,
        ]
      : []),
    ...(resolvedUser?.role === "admin"
      ? [
          { type: "separator", key: "user-separator-admin" },
          {
            type: "link",
            key: "admin",
            label: "Admin",
            href: app === "jobs" ? "/admin" : `${sharedOrigin}/admin`,
            path: "/admin",
            icon: Shield,
            tone: "primary",
            appScope: "jobs",
          },
        ]
      : []),
    { type: "separator", key: "user-separator-logout" },
    {
      type: "action",
      key: "sign-out",
      label: "Sign Out",
      icon: LogOut,
      onSelect: handleSharedLogout,
    },
  ];

  const devEntries: MenuEntry[] = [
    {
      type: "link",
      key: "cards",
      label: "Card Library",
      href: "https://spearyx.com/cards",
      icon: Layers,
      tone: "primary",
    },
    {
      type: "link",
      key: "typography",
      label: "Typography",
      href: "https://spearyx.com/typography",
      icon: Layers,
      tone: "primary",
    },
  ];

  function renderMenuEntries(entries: MenuEntry[]) {
    return entries.map((entry) => {
      if (entry.type === "separator") {
        return <DropdownMenuSeparator key={entry.key} className="spx-menu-separator" />;
      }

      if (entry.type === "heading") {
        return (
          <DropdownMenuLabel key={entry.key} className="spx-menu-heading">
            {entry.label}
          </DropdownMenuLabel>
        );
      }

      if (entry.type === "disabled") {
        return (
          <DropdownMenuItem key={entry.key} disabled className="spx-menu-item-disabled">
            <MenuDisabledRow label={entry.label} icon={entry.icon} />
          </DropdownMenuItem>
        );
      }

      if (entry.type === "action") {
        return (
          <SharedActionMenu
            key={entry.key}
            label={entry.label}
            icon={entry.icon}
            onSelect={entry.onSelect}
          />
        );
      }

      return (
        <SharedMenuLink
          key={entry.key}
          item={entry}
          app={app}
          currentPath={currentPath}
          Link={Link}
        />
      );
    });
  }

  const logo = (
    <a href="/" className="inline-flex items-center group">
      <img
        src="/images/spearyx-logo.svg"
        alt="Caliber"
        className="h-7 w-auto transition-opacity duration-200 group-hover:opacity-75"
      />
    </a>
  );

  const label = "Agent";

  return (
    <Header logo={logo} label={label}>
      <SharedDropdownMenu
        label="Jobs"
        icon={Briefcase}
        active={isOnJobs}
        panelClass={styles.menuPanelJobs}
        entries={renderMenuEntries(jobsEntries)}
      />

      {isDev ? (
        <SharedDropdownMenu
          label="Dev"
          icon={Layers}
          panelClass={styles.menuPanelDev}
          align="end"
          entries={renderMenuEntries(devEntries)}
        />
      ) : null}

      {resolvedUser ? (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button className={`spx-nav-trigger spx-nav-trigger-idle ${styles.triggerUserMenu}`}>
              <User size={14} className="shrink-0" />
              <span className="truncate text-sm">{resolvedUser.email}</span>
              <ChevronDown size={12} className="shrink-0 opacity-50" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className={`spx-menu-panel ${styles.menuPanelUser}`}
          >
            {renderMenuEntries(userEntries)}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <a href={loginHref} className="spx-nav-trigger spx-nav-trigger-idle">
          <LogIn size={14} />
          Sign In
        </a>
      )}

      {extraNav}
    </Header>
  );
}
