# Canada Express Entry Draws API

A public, read-only Hono API on Cloudflare Workers for bilingual IRCC draw history and CRS pool snapshots. Datasets are bundled at build time; refreshing JSON files requires a deployment before the live API changes.

## Development

Use Node.js 22.12 or newer and npm. The committed `package-lock.json` is the dependency source of truth.

```sh
npm ci
npm run dev
npm run check
```

Commands:

- `npm test`: API, cache, and importer regression tests with Node's built-in test runner.
- `npm run validate:data`: schema, unique round identifiers, bilingual consistency, and pool-to-draw checks.
- `npm run update:data`: download and validate official English/French feeds, apply corrections, retain history, and backfill pool snapshots.
- `npm run build`: generate `dist/worker.js`.
- `npm exec wrangler -- deploy --dry-run`: check Worker packaging without publishing.
- `npm run deploy`: build and publish to the Cloudflare account you authenticate with Wrangler.

Local development uses the URL printed by Wrangler. Deployment uses the Worker name in `wrangler.toml`; use your own deployed URL for production requests.

## API

| Method | Path | Response |
| --- | --- | --- |
| GET | `/` | Version, routes and language information |
| GET | `/api/draws` | `{ draws, pagination }`, newest round first |
| GET | `/api/draws/latest` | `{ draw }`, most recent draw on or before today in UTC; `{}` when absent |
| GET | `/api/categories` | `{ categories }`, ordered by frequency |
| GET | `/api/pool` | `{ pool }`, latest available pool snapshot |
| GET | `/api/pool/progress` | `{ pool: { current, previous } }`, latest two available snapshots |
| GET | `/api/stats` | Cache size, timings and serialized data sizes for the current Worker isolate |

`/api/draws` accepts:

| Parameter | Default | Accepted values |
| --- | --- | --- |
| `lang` | `en` | `en` or `fr` |
| `year` | All years | Exactly four digits |
| `category` | All categories | Case-insensitive category label or English code; 1–200 characters |
| `page` | `1` | Positive integer, maximum 90071992547409 |
| `limit` | `50` | Integer from 1 to 100 |

`lang` also applies to latest-draw and category endpoints. English category codes work with French data, for example `/api/draws?lang=fr&category=PNP`. Returned category labels stay in the selected language. Unknown filters return an empty array. Invalid query values return HTTP 400:

```json
{ "error": { "code": "INVALID_QUERY", "message": "lang must be en or fr" } }
```

Unknown routes return JSON with HTTP 404; unexpected failures return a generic HTTP 500. Successful responses retain the existing `draws`, `draw`, `categories`, and `pool` envelopes. Pagination includes `page`, `limit`, `totalDraws`, `totalPages`, `hasNext`, and `hasPrev`.

Draws contain numeric `drawNumber`, ISO `date`, numeric `invitationsIssued` and `minimumCRS`, nullable `category`, and string `year`. IRCC's historical rounds 91a and 91b share numeric `drawNumber: 91` and have an additional `roundId` field; use `roundId ?? String(drawNumber)` as a unique identifier. Pool snapshots use the same identifiers and retain formatted string counts in `ranges`. A pool snapshot's `drawDate` identifies its associated round, not the date the candidate counts were measured. Missing source snapshots are skipped rather than fabricated.

CORS allows public GET/HEAD access without credentials. JSON responses include `nosniff`. Successful responses can be cached by clients for 60 seconds; errors and stats use `no-store`. `X-Cache-Hit` reports the application cache on draws/latest endpoints; `X-Response-Time` measures handler time. Monitoring values are per isolate and reset on restart; serialized sizes are not heap measurements.

## Data updates

Sources: [English IRCC feed](https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json) and [French IRCC feed](https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_fr.json).

The updater checks HTTP status, limits downloads to 10 MB, times out after 15 seconds per attempt, and retries transient failures up to three times. Invalid dates, counts, duplicate identifiers, or mismatched bilingual snapshots fail the command with a nonzero exit code before writing. Existing malformed files also fail instead of being replaced with empty history.

All outputs are validated before writing. Each changed file is replaced atomically; replacement of the three files is sequential, not a filesystem transaction. CI validates their consistency before committing. Source corrections replace old values, unseen categories keep their source name, and unchanged updates do not rewrite files.

## GitHub Actions and deployment

- Pull requests and pushes to `main` run data validation, regression tests, the bundle build, a production dependency audit, and Wrangler packaging checks.
- The data workflow runs every 30 minutes from 12:00 through 23:30 UTC on weekdays and can be started manually. It checks all three datasets, commits changed files only after checks pass, and pushes to `main`.
- Set repository variable `CLOUDFLARE_ACCOUNT_ID` and repository secret `CLOUDFLARE_API_TOKEN` to enable deployments. Scope the token to Workers deployment in your account.
- Code pushes to `main` deploy after checks pass. The data workflow deploys explicitly after its bot commit, because commits using `GITHUB_TOKEN` do not trigger push workflows.
- Without the account variable, deployment is skipped. Repository branch protection must permit the data bot's direct push, or adapt the workflow to your pull request process.

Secrets belong in GitHub/Cloudflare settings or ignored local `.dev.vars` files. Never commit tokens. Data updates and code deployments share a concurrency group and check out the latest `main` when they start, preventing competing workflow deployments.

Miniflare's Undici dependency is overridden to a patched compatible 7.x release. Recheck the override when upgrading Wrangler and remove it once Miniflare includes the patched version.

## License

MIT — see [LICENSE](LICENSE).
