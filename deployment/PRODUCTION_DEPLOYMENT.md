# KVM 2 production deployment

## Server baseline

Use Ubuntu 24.04 LTS. Create an unprivileged `mvhs` service account, require SSH keys, disable root/password SSH login, enable automatic security updates, install Fail2ban, and allow only SSH, HTTP and HTTPS through UFW.

Install Node.js LTS, Nginx, Certbot and MongoDB Database Tools. Application releases live under `/opt/mvhs/releases`; `/opt/mvhs/current` is the active release symlink. Runtime state is restricted to `/var/lib/mvhs`.

## Release procedure

1. Upload a clean release without `.env`, `node_modules`, local JSON data, local uploads or backups.
2. Run `npm ci --omit=dev` in `server` and `npm ci && npm run build` in `client`.
3. Create `/var/lib/mvhs/data`, owned by `mvhs:mvhs` with mode `0700`. Copy `deployment/server.env.example` to `/etc/mvhs/server.env`, replace every placeholder, then set owner `root:mvhs` and mode `0640`.
4. Run `npm run security:remediate-credentials` to preview shared legacy accounts. Rotate the administrator with `ADMIN_NEW_PASSWORD='...' npm run security:rotate-admin`, then run `npm run security:remediate-credentials -- --execute`. Legacy parent/student accounts are disabled until an administrator assigns a unique password; production refuses unverified active credentials.
5. Validate the source migration locally with `npm run migrate:mongo:dry-run`.
6. During the approved maintenance window, run `npm run migrate:mongo`, followed by `npm run migrate:mongo:verify`.
7. Run `npm run migrate:uploads` after configuring the private object-storage bucket. The command never deletes local files.
8. Run `NODE_ENV=production npm run production:check`. Do not start the public service until configuration, database credentials, SMTP and a recent verified off-site backup all pass.
9. Install `deployment/systemd/mvhs-api.service`, reload systemd, enable and start `mvhs-api`.
10. Render the Nginx template with an environment-approved domain, obtain the certificate through Certbot, test Nginx configuration, and reload it.
11. Verify `/api/health`, login/logout, permissions, fee receipt creation, private document retrieval, email health and backup health.

## Required production configuration

Production startup deliberately fails unless HTTPS `APP_URL`, restricted CORS, a strong JWT secret, MongoDB, private S3-compatible document storage, reachable SMTP and an independent off-site backup bucket are configured. Documents and backups must use different buckets.

## Rollback

Keep the previous release directory. A code rollback changes `/opt/mvhs/current` back to the previous release and restarts `mvhs-api`. Do not roll back the database blindly; restore database data only through the tested staging restore procedure and an approved incident runbook.

To recover an off-site snapshot, run `npm run backup:fetch-offsite -- --backup-id=<id> --destination=<empty-recovery-directory>`. The command refuses an existing target and checksum-verifies every downloaded object. Restore the downloaded Mongo archive with `npm run restore:staging -- --backup-directory=<downloaded-directory> --target-db=<name-containing-staging-or-drill>` before approving any production restore.

## Monitoring

Monitor HTTP health, process restarts, CPU, memory, disk usage, TLS expiry, email failures, backup age and off-site replication status. Alert before disk usage reaches 80% and whenever a scheduled backup or email batch fails.
