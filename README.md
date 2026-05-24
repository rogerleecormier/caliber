# Caliber Monorepo

Welcome to **Caliber**, a consolidated high-precision, high-curation job search agent application. Caliber deploys automated search agents in the background to scan LinkedIn and public job boards (Greenhouse, Lever, Workable), scores matches against your master resume using LLMs, and generates tailored, zero-hallucination ATS resumes and cover letters.

---

## 📂 Project Structure

This monorepo is managed using `pnpm` workspaces:

* **`apps/jobs`**: The main Caliber web application. Built with TanStack Start, Drizzle ORM, SQLite/D1, Cloudflare Workers AI, and Puppeteer.
* **`apps/corporate`**: The corporate landing page.
* **`packages/ui-kit`**: Shared UI component library styled with glassmorphism highlights.
* **`packages/shared-config`**: Shared build and style configurations.
* **`packages/shared-utils`**: Shared helper libraries (such as authentication and database connection utils).

---

## 🛠️ Technology Stack

* **Frontend & Server Routes**: [TanStack Start](https://tanstack.com/router/v1/docs/start/overview) (React 19, server functions, and file-based routing)
* **Database**: [Drizzle ORM](https://orm.drizzle.team/) with SQLite / Cloudflare D1
* **AI & Inference**: Cloudflare Workers AI (Llama 3.3) for ATS compatibility grading, semantic skill expansion, and document tailoring
* **Scraping**: Puppeteer (via `@cloudflare/puppeteer`) for automated LinkedIn indexing, combined with public ATS scrapers (Greenhouse, Lever, Workable)

---

## 🚀 Getting Started

### 1. Prerequisites
Ensure you have `pnpm` installed:
```bash
corepack enable pnpm
# or
npm install -g pnpm
```

### 2. Install Dependencies
Install all package dependencies at the monorepo root:
```bash
pnpm install
```

### 3. Database Migrations
Verify and apply local D1 migrations to set up your Drizzle SQLite database schema:
```bash
# Generate migrations if schema.ts changes
pnpm --filter @spearyx/jobs db:generate

# Apply migrations to your local development database
pnpm --filter @spearyx/jobs db:migrate:local
```

### 4. Run Development Servers
Start the dev servers for both the corporate page and the main jobs app in parallel:
```bash
pnpm dev
```
* **Corporate landing page** runs on: `http://localhost:3000`
* **Caliber Dashboard** runs on: `http://localhost:3003`

### 5. Build Verification
Verify everything compiles and builds clean for production:
```bash
pnpm build
```

---

## 🤖 How the Agents Work

1. **Agent Setup**: You configure search keywords, location filters, target sources (LinkedIn, Greenhouse, Lever, Workable), and a custom interval frequency (1, 2, 4, 8, 12, or 24 hours).
2. **Cron Background Runner**: An hourly worker checks which agents are due. It then crawls active sources concurrently:
   - Scrapes LinkedIn using a headless Puppeteer browser.
   - Queries public ATS scrapers (Greenhouse, Lever, Workable) cached in the local database.
3. **AI Resume Matching**: Matches are run through the Workers AI Llama model, which grades listings against your master resume to compute ATS, Career, and Outlook scores, and flags "Unicorn" opportunities where your transferable skills make you a strong fit.
4. **Maintenance & Pruning**: The background maintenance task runs daily to prune old jobs. All jobs, caches, and agent matches that are **30 days or older** are automatically deleted from the database.

---

## 🌐 Deploying

### Workspaces Deployment
The workers are deployed as separate Cloudflare Workers. Run the monorepo deploy script to push them:
```bash
pnpm deploy:workers
```

This deploys the ATS scraper worker and the company discovery worker under their respective configurations.
