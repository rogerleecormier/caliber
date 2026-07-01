import { useMemo } from "react";
import type { ComponentType, ReactNode } from "react";
import {
  BarChart3,
  Briefcase,
  ChevronDown,
  FileText,
  Layers,
  LogIn,
  LogOut,
  Shield,
  User,
  Search,
  Activity,
  Bot,
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
  id?: string;
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
  onAnalyzeClick?: () => void;
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

function getAppOrigin(_app: AppHeaderProps["app"], _currentPath: string): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "https://caliber.rcormier.dev";
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
    <span className="flex items-center gap-3 rounded-xl px-3 py-2.5 overflow-hidden">
      <MenuIconBadge tone={tone}>
        <Icon size={14} className={toneClasses[tone].icon} />
      </MenuIconBadge>
      <span className="min-w-0 flex-1">
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
    <span className="flex items-center gap-3 rounded-xl overflow-hidden">
      <MenuIconBadge tone="neutral">
        <Icon size={14} className="text-slate-400" />
      </MenuIconBadge>
      <span className="text-sm text-slate-400 truncate">{label}</span>
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
    <span className="flex items-center gap-3 rounded-xl px-3 py-2.5 overflow-hidden">
      <MenuIconBadge tone={tone}>
        <Icon size={14} className={toneClasses[tone].icon} />
      </MenuIconBadge>
      <span className="text-sm font-medium text-slate-900 truncate">{label}</span>
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
        className={["spx-menu-panel", panelClass, "pr-4"].join(" ")}
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
  onAnalyzeClick,
}: AppHeaderProps) {
  const sharedOrigin =
    typeof window === "undefined"
      ? getSharedAuthOrigin()
      : getSharedAuthOrigin(window.location.href);
  const appOrigin = getAppOrigin(app, currentPath);
  const resolvedUser = user ?? null;
  const loginHref = "/login";

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

  const navEntries: MenuEntry[] = [
    {
      type: "link",
      key: "all-jobs",
      label: "All Jobs",
      sublabel: "Agent searches & tracking",
      href: "https://caliber.rcormier.dev/jobs",
      path: "/jobs",
      icon: Briefcase,
      tone: "primary",
      appScope: "jobs",
    },
  ];

  const adminEntries: MenuEntry[] = [
    {
      type: "link",
      key: "admin-settings",
      label: "Admin Settings",
      sublabel: "System configuration",
      href: app === "jobs" ? "/admin-settings" : `${sharedOrigin}/admin-settings`,
      path: "/admin-settings",
      icon: Shield,
      tone: "primary",
      appScope: "jobs",
    },
    {
      type: "link",
      key: "agents-admin",
      label: "Agents Admin",
      sublabel: "Discovery, crawler & catalog health",
      href: `${appOrigin}/agents-admin`,
      path: "/agents-admin",
      icon: Bot,
      tone: "primary",
      appScope: "jobs",
    },
  ];

  const userMenuEntries: MenuEntry[] = [
    {
      type: "link",
      key: "my-jobs",
      label: "My Jobs",
      sublabel: "Saved & favorited jobs",
      href: `${appOrigin}/my-jobs`,
      path: "/my-jobs",
      icon: Briefcase,
      tone: "primary",
      appScope: "jobs",
    },
    {
      type: "link",
      key: "my-insights",
      label: "My Insights",
      sublabel: "Match trends & activity",
      href: `${appOrigin}/insights`,
      path: "/insights",
      icon: BarChart3,
      tone: "success",
      appScope: "jobs",
    },
    {
      type: "link",
      key: "my-agents",
      label: "My Agents",
      sublabel: "Search agents",
      href: `${appOrigin}/my-agents`,
      path: "/my-agents",
      icon: Bot,
      tone: "primary",
      appScope: "jobs",
    },
    {
      type: "link",
      key: "my-activity",
      label: "My Activity",
      sublabel: "Audit logs",
      href: `${appOrigin}/audit-logs`,
      path: "/audit-logs",
      icon: Activity,
      tone: "primary",
      appScope: "jobs",
    },
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
  ];

  const mobileNavLinks = useMemo(() => {
    return navEntries.filter(
      (entry): entry is MenuLinkItem => entry.type === "link" && entry.appScope === "jobs"
    );
  }, [navEntries]);

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
        src="/images/caliber-logo.svg"
        alt="Caliber"
        className="h-7 w-auto transition-opacity duration-200 group-hover:opacity-75"
      />
    </a>
  );

  const searchBoxElement = onAnalyzeClick ? (
    <button
      onClick={onAnalyzeClick}
      className="hidden md:flex items-center gap-2 rounded-lg bg-indigo-600 border border-indigo-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
    >
      <Search size={14} className="shrink-0" />
      Analyze a Job
    </button>
  ) : undefined;

  return (
    <>
      <Header logo={logo} searchBox={searchBoxElement}>
        <div className="hidden md:flex items-center gap-1">
          {navEntries.map((entry) => {
            if (entry.type !== "link") return null;
            const Icon = entry.icon;
            const active =
              entry.appScope === "jobs" &&
              typeof entry.path === "string" &&
              isActivePath(currentPath, entry.path);
            const itemClass = [
              "spx-nav-trigger",
              active ? "spx-nav-trigger-active" : "spx-nav-trigger-idle",
            ].join(" ");
            const canUseLink = Boolean(Link && entry.appScope === "jobs" && entry.path);

            return (
              <div key={entry.key}>
                {canUseLink ? (
                  <Link to={entry.path} className={itemClass}>
                    <Icon size={14} />
                    {entry.label}
                  </Link>
                ) : (
                  <a href={entry.href} className={itemClass}>
                    <Icon size={14} />
                    {entry.label}
                  </a>
                )}
              </div>
            );
          })}
        </div>

        {resolvedUser ? (
          <>
            {resolvedUser.role === "admin" ? (
              <SharedDropdownMenu
                label="Admin"
                icon={Shield}
                panelClass={styles.menuPanelDev}
                align="end"
                entries={renderMenuEntries(adminEntries)}
              />
            ) : null}

            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button className={`spx-nav-trigger spx-nav-trigger-idle ${styles.triggerUserMenu}`}>
                  <User size={14} className="shrink-0" />
                  <ChevronDown size={12} className="shrink-0 opacity-50" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={8}
                className={`spx-menu-panel ${styles.menuPanelUser} pr-4`}
              >
                {renderMenuEntries(userMenuEntries)}
                <DropdownMenuSeparator className="spx-menu-separator" />
                <SharedActionMenu
                  label="Sign Out"
                  icon={LogOut}
                  onSelect={handleSharedLogout}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <a href={loginHref} className="spx-nav-trigger spx-nav-trigger-idle">
            <LogIn size={14} />
            Sign In
          </a>
        )}

        {extraNav}
      </Header>

      {app === "jobs" && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200/80 bg-white/88 backdrop-blur-xl px-3 pb-[calc(env(safe-area-inset-bottom,16px)+12px)] pt-2 md:hidden shadow-[0_-4px_24px_rgba(15,23,42,0.06)]">
          <div className="mx-auto flex max-w-md items-center justify-between gap-2">
            {mobileNavLinks.map((item) => {
              const Icon = item.icon;
              const active =
                item.appScope === app &&
                typeof item.path === "string" &&
                isActivePath(currentPath, item.path);

              const linkContent = (
                <div
                  className={`flex flex-col items-center text-center gap-0.5 py-2 px-3 w-full transition-all duration-300 rounded-lg ${
                    active
                      ? "text-primary-600 bg-primary-50"
                      : "text-slate-500 active:bg-slate-100/50"
                  }`}
                >
                  <Icon size={20} className={active ? "scale-110" : ""} />
                  <span
                    className={`text-[11px] font-semibold tracking-tight transition-colors duration-300 ${
                      active ? "text-primary-700" : "text-slate-500"
                    }`}
                  >
                    {item.label}
                  </span>
                </div>
              );

              const canUseLink = Boolean(Link && item.appScope === app && item.path);

              if (canUseLink) {
                return (
                  <Link
                    key={item.key}
                    to={item.path}
                    className="flex-1 flex justify-center outline-none select-none"
                  >
                    {linkContent}
                  </Link>
                );
              }
              return (
                <a
                  key={item.key}
                  href={item.href}
                  className="flex-1 flex justify-center outline-none select-none"
                >
                  {linkContent}
                </a>
              );
            })}
            <div className="flex-1 flex justify-center">
              {resolvedUser ? (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button className="flex flex-col items-center text-center gap-0.5 py-2 px-3 w-full rounded-lg text-slate-500 active:bg-slate-100/50 outline-none select-none">
                      <User size={20} />
                      <span className="text-[11px] font-semibold tracking-tight text-slate-500">
                        Profile
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    sideOffset={8}
                    className={`spx-menu-panel ${styles.menuPanelUser} pr-4`}
                  >
                    {renderMenuEntries(userMenuEntries)}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <a
                  href={loginHref}
                  className="flex flex-col items-center text-center gap-0.5 py-2 px-3 w-full rounded-lg text-slate-500 active:bg-slate-100/50 outline-none select-none"
                >
                  <LogIn size={20} />
                  <span className="text-[11px] font-semibold tracking-tight">Sign In</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}

    </>
  );
}
