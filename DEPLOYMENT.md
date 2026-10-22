# Production deployment: Contabo Ubuntu + Caddy

This deployment preserves TEMBY's two-origin design. `temudz.store` is the
launcher/diagnostics origin and `merchant.temudz.store` is the isolated virtual
merchant origin. Caddy is the only service that publishes ports; the Node
application ports are private to the Docker network.

TEMBY is a constrained, allowlisted HTTPS relay for `temu.com` and `kwcdn.com`,
not a general-purpose proxy. It does not bypass CAPTCHA, login checks, rate
limits, fraud systems, or any other Temu control. Confirm that your intended
use complies with Temu's terms and applicable law before making it public.

## 1. DNS and Cloudflare

In Cloudflare DNS, create these records, each pointing to the VPS's public IPv4:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `<VPS_IP>` |
| A | `merchant` | `<VPS_IP>` |

Leave both proxied (orange cloud) or both DNS-only; either works. In Cloudflare
**SSL/TLS → Overview**, choose **Full (strict)**. Do not use Flexible mode. Open
TCP 80 and 443 in Contabo's firewall/security group and Ubuntu's firewall. DNS
must resolve before Caddy can obtain certificates.

## 2. Install Docker from Docker's official Ubuntu repository

SSH from Windows PowerShell (replace the IP and user):

```powershell
ssh root@<VPS_IP>
```

On the Ubuntu VPS, follow Docker's official instructions at
[Install Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/).
The currently documented command sequence is:

```bash
apt update
apt install -y ca-certificates curl git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
printf '%s\n' "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo \"${UBUNTU_CODENAME:-$VERSION_CODENAME}\") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

Do not install the Ubuntu `docker.io` package alongside Docker's packages.

## 3. Copy the project from Windows and start it

**Do not use `scp -r .`.** It uploads `node_modules`, `.git`, and the large
historical `artifacts/` directory, none of which is needed to build the image.
That is why it can take a very long time. Prefer a Git clone on the VPS when
you have a remote repository:

```bash
git clone <YOUR_REPOSITORY_URL> /opt/temby
```

If a private Git remote is not available, cancel the recursive transfer with
`Ctrl+C` (it does not alter the local repository), then create and send a small
source archive from Windows PowerShell:

```powershell
tar --exclude=node_modules --exclude=artifacts --exclude=.git --exclude=.npm-cache --exclude=.temby --exclude=.env -czf temby-deploy.tgz .
scp .\temby-deploy.tgz root@<VPS_IP>:/tmp/
ssh root@<VPS_IP> "mkdir -p /opt/temby && tar -xzf /tmp/temby-deploy.tgz -C /opt/temby && rm /tmp/temby-deploy.tgz"
```

On the VPS:

```bash
cd /opt/temby
cp .env.example .env
nano .env                 # set a real ACME_EMAIL; retain the two HTTPS origins
chmod 600 .env
docker compose config -q
docker compose up -d --build --wait
docker compose ps
docker compose logs --tail=100 caddy
docker compose logs --tail=100 temby
docker compose exec -T temby node -e "require('node:http').get('http://127.0.0.1:3000/healthz',{headers:{host:'temudz.store'}},r=>{r.pipe(process.stdout);process.exitCode=r.statusCode===200?0:1}).on('error',e=>{console.error(e);process.exit(1)})"
```

The expected health response is `{"status":"ok"}`. The host itself cannot
connect to `127.0.0.1:3000`: that port exists only inside the Docker network by
design. Once Caddy is running, externally test `https://temudz.store/healthz`.
Browse
`https://temudz.store/`; Caddy redirects into the merchant subdomain as part of
the intentional origin separation. Never publish 3000 or 3001 in `ports:` and
never put `.env` in Git. Docker's `local` logging driver rotates each container
at 10 MB with five retained files.

## Updates and rollback

For ongoing deployment, use a Git clone at `/opt/temby`, not a source archive.
Mark the scripts executable once:

```bash
chmod 0755 scripts/deploy-update.sh scripts/rollback.sh
scripts/deploy-update.sh
```

The update script requires a clean working tree, validates Compose, builds a
new image, waits for the health check, and prints the prior commit. If the new
release proves bad, use that exact printed commit:

```bash
scripts/rollback.sh <known-good-commit>
```

Rollback refuses local source changes and does not delete volumes, so Caddy's
certificate state remains intact. Inspect a failure with `docker compose ps`
and `docker compose logs --tail=200 temby caddy`.

## Sessions: intended behavior and current limitations

Sessions are **browser-session level**, not product level. The merchant
subdomain sets an opaque, HttpOnly, `SameSite=Strict` `temby_sid`; its server
uses that identifier to select one in-memory cookie jar for Temu. Consequently,
separate browser profiles/devices get separate jars, and one user's Temu
cookies are not copied into another user's jar. The app origin and merchant
origin remain separate specifically to keep virtual merchant storage and
workers out of the launcher origin.

Cart/product data is not the authentication boundary. Browser-side companion
state is scoped to the merchant origin and is keyed/validated against the
merchant account or guest-cart identity where available. A product page can
display a cart observation, but it must never become the source of identity or
be shared merely because two users view the same product.

The current server session store is memory-only, has a one-hour sliding idle
expiry, and caps at **100 sessions**. A deploy, restart, eviction, or capacity
event loses the upstream cookie jar and may require the user to log in again.
This is not sufficient for a high-traffic launch. Do not represent this as a
Black Friday-ready session tier until capacity/load tests and a deliberately
designed resilient session strategy have passed.

The intended production session model is: one random server-side session per
browser, opaque cookie only, isolated cookie jar/storage per user, short idle
TTL, explicit logout/expiry, no tokens in logs, and no cross-account cart
fallback. Any observation that a cart, account name, address, or cookie crosses
between browsers is a stop-ship security incident: take the proxy offline,
discard in-memory sessions by restarting, and investigate before reopening.

## Production-readiness checklist

- [ ] `temudz.store` and `merchant.temudz.store` resolve to the VPS.
- [ ] Cloudflare is Full (strict), and only 80/443 are publicly open.
- [ ] `docker compose config -q` and `docker compose up -d --wait` pass.
- [ ] `docker compose ps` reports TEMBY healthy and Caddy running.
- [ ] HTTPS certificates are issued and `/healthz` works through the public hostname.
- [ ] `.env` is mode 600, excluded from Git, and contains no committed secret.
- [ ] A separate browser profile confirms no account/cart state crosses sessions.
- [ ] A restart test confirms the documented re-authentication behavior.
- [ ] You have tested `scripts/rollback.sh` against a known-good commit.
- [ ] You accept the unresolved merchant login/puzzle compatibility risks in `README.md`.

Only mark the deployment ready after every checked item has actually passed.
