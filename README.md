# iDomainX Manager

A self-hosted website manager. You write content in the admin panel; it builds a fast static site and publishes it to Cloudflare Pages. No GitHub required.

---

## 1. Deploy on Coolify (5 steps)

1. In Coolify, create a new resource and choose **Dockerfile** based deployment. Point it at this repository (or upload this folder).
2. Add a **persistent volume**: mount it at `/data`. Everything (database, images, backups, snapshots) lives there, so your content survives restarts and updates.
3. Set the **port** to `3000`.
4. Add the environment variables from the table below. The app will refuse to start without `SESSION_SECRET` and `ADMIN_PASSWORD`.
5. Attach your domain (for example `admin.idomainx.com`) and deploy.

## 2. Set up Cloudflare Pages Direct Upload

1. In the Cloudflare dashboard, create a **Pages project** (for example `idomainx`). Note the project name.
2. Go to **My Profile > API Tokens** and create a token with the **Cloudflare Pages: Edit** permission. Also copy your **Account ID** (shown on the Cloudflare dashboard home page).
3. Put those values into the environment variables in Coolify (see table).
4. In the admin panel, open **Publish**, review the changes, and press **Confirm and publish**. Your site is now live on `https://<project>.pages.dev` — attach your custom domain in the Cloudflare Pages settings.

## 3. Environment variables

| Variable | Required | What it is |
|---|---|---|
| `ADMIN_PASSWORD` | Yes | The password to sign in to the admin panel. |
| `SESSION_SECRET` | Yes | A long random string used to secure your login session. |
| `CLOUDFLARE_API_TOKEN` | Yes (to publish) | Cloudflare API token with Pages edit permission. |
| `CLOUDFLARE_ACCOUNT_ID` | Recommended | Your Cloudflare account ID. |
| `CF_PAGES_PROJECT` | Yes (to publish) | The Cloudflare Pages project name. |
| `CF_PAGES_BRANCH` | No | Branch to deploy (default `main`). |
| `GITHUB_TOKEN` | No | Only if you enable the optional GitHub mirror. |
| `GITHUB_OWNER` / `GITHUB_REPO` | No | Repo for the optional GitHub mirror. |
| `UMAMI_URL` | No | Your self-hosted Umami address, e.g. `https://stats.idomainx.com`. |
| `UMAMI_USERNAME` / `UMAMI_PASSWORD` | No | Umami login for the analytics tab. |
| `UMAMI_WEBSITE_ID` | No | Default website to show first. |
| `PORT` | No | Defaults to `3000`. |
| `DATA_DIR` | No | Defaults to `/data`. |

## 4. Daily use

- **Content** — create entries from templates (Blog Post, Domain For Sale, Domain Collection, Tool Page and more). Each entry has a live preview, an SEO checklist and a shareable draft preview link.
- **Pages** — paste standalone HTML (an about page, `ads.txt`, `llms.txt`, anything).
- **Publish** — review exactly which files are new, changed or deleted before anything goes live. Every publish is snapshotted so you can download or roll back to any previous version.
- **Backups** — one-click zip backups; automatic daily backups can be configured in Settings.

## 5. Local development

```bash
npm install
ADMIN_PASSWORD=admin SESSION_SECRET=dev NODE_ENV=development DATA_DIR=./data node server.js
```

Then open `http://localhost:3000`.
