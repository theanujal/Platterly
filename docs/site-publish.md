# Publishing the marketing site from Ops

How a text change made in Ops (Website) reaches platterly.in. Contract: `docs/ops-contract.md` section 26.

| Step | What happens |
|---|---|
| 1 | Staff edit the notice bar, contact details, What's new, blog or legal pages in Ops. Nothing public changes. |
| 2 | Staff press **Publish** (Website, Publish tab). Ops signs a request to the deploy hook on the web server. |
| 3 | The hook runs `git pull --ff-only`, `npm ci` and `npm run build` in `apps/site`. The build fetches the text from Ops first. |
| 4 | The build is copied to `releases/<timestamp>` and the `current` symlink moves to it. Nginx serves `current`, so the switch is instant. The last 5 releases are kept. |
| 5 | The hook tells Ops *Published* or the error. Ops shows it under Recent publishes. |

## One-time setup on the Hostinger VPS

| Item | Setting |
|---|---|
| Shared secret | `openssl rand -hex 24`. The same value is `SITE_SECRET` in Ops' environment and in the hook's. |
| Hook environment | `SITE_SECRET`, `OPS_CONTENT_URL=https://ops.platterly.in/api/site/content`, `OPS_RESULT_URL=https://ops.platterly.in/api/site/publish-result`, `SITE_REPO_DIR` (a checkout of the repository on `main`), `SITE_WEB_ROOT=/var/www/platterly-site`. Optional `SITE_HOOK_PORT` (default 3300). |
| Run it | `node scripts/site-deploy-hook.mjs` under systemd or pm2, so it restarts on its own. It listens on 127.0.0.1 only. |
| Nginx, site | `root /var/www/platterly-site/current;` for platterly.in (the site uses trailing slashes: `try_files $uri $uri/ =404;`). |
| Nginx, hook | A TLS-only `location = /deploy` (for example on a private host name) that proxies to `http://127.0.0.1:3300`. Ops' `SITE_DEPLOY_HOOK_URL` is its public address. The hook rejects anything without a valid signature, but keep the address unlisted. |
| Ops environment | `SITE_SECRET`, `SITE_DEPLOY_HOOK_URL`. Without both, Publish is switched off and `/api/site/*` answers 404. |
| First content | In `apps/ops`: `npm run ops:import-site`, then `npm run ops:import-site -- --apply`. Run before the first Publish, or the blog and legal pages would come out empty. |

## Checks and rollback

| Situation | What to do |
|---|---|
| Try the hook without switching the site | Start it with `DEPLOY_DRY_RUN=1`: it builds from Ops but skips the pull and the switch, and reports *Dry run: built, not switched.* |
| A publish failed | The old site stays live (the symlink only moves after a good build). Read the message under Recent publishes and the hook's log. |
| Bad text went live | Fix it in Ops and Publish again, or point `current` back at an earlier folder in `releases/`. |
| Ops is down at build time | The build stops with *Platterly Ops refused or could not be reached*; the live site is untouched. |

Not covered: the site's code (home and Catering page copy, design) still deploys from `main` through the same hook, so pressing Publish also ships any code that was pushed since the last build.
