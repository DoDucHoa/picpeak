# Publishing PicPeak at galerie.phoever.de: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve this PicPeak install on the public internet at `https://galerie.phoever.de` without opening a port on the office router and without breaking the company website or the company email that share the same domain.

**Architecture:** DNS for `phoever.de` moves from IONOS to Cloudflare, apex and `www` staying DNS-only so the existing landing page is untouched. A `cloudflared` container on the NAS dials outward to Cloudflare and serves `galerie.phoever.de` from the port the frontend already publishes. The application learns its own public address through one environment variable. No application code changes.

**Tech Stack:** Cloudflare DNS and Cloudflare Tunnel (Free plan), `cloudflare/cloudflared` Docker image, the existing Docker Compose stack on the NAS, Tailscale for administration.

**Spec:** `docs/superpowers/specs/2026-09-20-publish-galerie-subdomain-design.md`

## Global Constraints

- Public hostname: `galerie.phoever.de`. It must not resolve to anything until Task 3.
- The apex `phoever.de` and `www.phoever.de` keep pointing at `164.90.246.232` and stay DNS-only (grey cloud) in Cloudflare. They are never proxied.
- The eleven records in the spec's **Verified record inventory** are the complete set. Every one of them must exist in Cloudflare before the nameservers change.
- DNSSEC is off and stays off for the duration of this work.
- The NAS opens no inbound port. The office FRITZ!Box gets no port forward.
- NAS access: `ssh -i ~/.ssh/picpeak-nas phoever@picpeak-nas`. `phoever` is not in the `docker` group and `sudo` needs a password, so every Docker command is `echo "$PW" | sudo -S -p '' docker ...` with `$PW` read from `.claude/nas-credentials.env` in the main checkout. Never print the password.
- `scp` to this box fails. Stream files with `ssh ... 'cat > /path'` and verify with `md5sum` on both sides.
- Deploy directory on the NAS: `/volume1/docker/picpeak`. Compose file: `docker-compose.production.yml`.
- Secrets are recorded in `.claude/nas-profile.md` by location only, never by value.
- Anything written into this repository is English and contains no em-dash or en-dash.
- A green exit code is not a result. Every task ends by probing the running thing.

---

### Task 1: Build the Cloudflare zone and prove it matches, with IONOS still authoritative

This is the task that prevents the outage. Everything is done in Cloudflare while IONOS still answers for the domain, so a mistake here costs nothing and is visible before it can hurt.

**Files:**
- Create: `<scratchpad>/dns-compare.sh` (throwaway, not committed)

**Interfaces:**
- Consumes: the eleven records in the spec's **Verified record inventory**.
- Produces: the two Cloudflare nameserver hostnames that Task 2 enters at IONOS. They are assigned per account and look like `<name>.ns.cloudflare.com`.

- [ ] **Step 1: Add the zone (operator, in the browser)**

In the Cloudflare dashboard, signed in as `info@phoever.de`: **Add a domain**, enter `phoever.de`, choose the **Free** plan, and let the record scan finish. Do NOT click the button that continues to the nameserver change yet.

Write down the two assigned nameservers. Task 2 needs them.

- [ ] **Step 2: Correct the imported records (operator, in the browser)**

Compare what the scan found against this list and make the DNS tab match it exactly. The scan usually finds the A, MX and TXT records and misses some or all of the CNAMEs, because it has to guess names.

```text
CNAME  _dmarc                  dmarc.ionos.de                 DNS only
CNAME  _domainconnect          _domainconnect.ionos.com       DNS only
MX     @            (10)       mx00.ionos.de
MX     @            (10)       mx01.ionos.de
TXT    @                       v=spf1 include:_spf-eu.ionos.com ~all
CNAME  s1-ionos._domainkey     s1.dkim.ionos.com              DNS only
CNAME  s2-ionos._domainkey     s2.dkim.ionos.com              DNS only
CNAME  s42582890._domainkey    s42582890.dkim.ionos.com       DNS only
CNAME  autodiscover            adsredir.ionos.info            DNS only
A      @                       164.90.246.232                 DNS only
A      www                     164.90.246.232                 DNS only
```

Two things Cloudflare does by default that must be undone:

Cloudflare sets new A and CNAME records to **Proxied** (orange cloud). Every record above is **DNS only** (grey cloud). Leaving the apex proxied would put Cloudflare in front of a web server nobody here administers, and would break its certificate renewal.

Cloudflare may add records of its own during the scan. Anything not on the list above gets deleted.

- [ ] **Step 3: Write the comparison script**

Create `<scratchpad>/dns-compare.sh`. Replace `CF_NS` with one of the nameservers from Step 1.

```bash
#!/usr/bin/env bash
# Ask the old and the new nameservers the same eleven questions and diff the answers.
set -u

OLD_NS=ns1029.ui-dns.de
CF_NS=REPLACE_ME.ns.cloudflare.com

ask() {
  # $1 = server, $2 = record type, $3 = name
  # Windows nslookup opens with a two-line header naming the server it asked,
  # which differs between the two servers by definition. Everything up to and
  # including the first blank line is that header, so drop it and compare only
  # the answer.
  nslookup -type="$2" "$3" "$1" 2>/dev/null \
    | sed '1,/^$/d' \
    | grep -v '^Non-authoritative answer:' \
    | grep -v '^[[:space:]]*$' \
    | sed 's/[[:space:]]\+/ /g' \
    | sort
}

for q in \
  "A phoever.de" \
  "A www.phoever.de" \
  "MX phoever.de" \
  "TXT phoever.de" \
  "CNAME _dmarc.phoever.de" \
  "CNAME _domainconnect.phoever.de" \
  "CNAME s1-ionos._domainkey.phoever.de" \
  "CNAME s2-ionos._domainkey.phoever.de" \
  "CNAME s42582890._domainkey.phoever.de" \
  "CNAME autodiscover.phoever.de"
do
  set -- $q
  type=$1; name=$2
  echo "=== $type $name ==="
  if diff <(ask "$OLD_NS" "$type" "$name") <(ask "$CF_NS" "$type" "$name") > /dev/null; then
    echo "MATCH"
  else
    echo "DIFFERENT:"
    diff <(ask "$OLD_NS" "$type" "$name") <(ask "$CF_NS" "$type" "$name")
  fi
done
```

- [ ] **Step 4: Run it and require a clean sheet**

Run: `bash <scratchpad>/dns-compare.sh`

Expected: `MATCH` on all ten queries. Anything else means Step 2 is not finished. Fix the record in Cloudflare and run again. Do not continue to Task 2 while a single line reads `DIFFERENT`.

> [!WARNING]
> A `DIFFERENT` on any of the three `_domainkey` queries is the one that must never be waved through. A missing DKIM record does not bounce mail, so nothing fails visibly. Outgoing mail simply starts being filed as spam by the large providers, days later, with nothing in any log to point at the cause.

- [ ] **Step 5: Confirm the zone is not signed**

Run: `curl -s "https://dns.google/resolve?name=phoever.de&type=DS&do=1"`

Expected: a response with no `"Answer"` key. If an `Answer` appears, DNSSEC has been switched on since this plan was written: STOP, and remove the DS record at the registry before going anywhere near Task 2. Changing nameservers on a signed zone whose DS record no longer matches takes the entire domain off the internet, mail included.

---

### Task 2: Cut the nameservers over and prove nothing broke

**Files:** none in the repository.

**Interfaces:**
- Consumes: the two Cloudflare nameservers from Task 1.
- Produces: Cloudflare authoritative for `phoever.de`, which Task 3 needs before it can route a hostname.

> [!CAUTION]
> This step is effectively one-way for a day. The delegation lives in the `.de` registry and its TTL is typically 24 hours, which is not ours to shorten, so a rollback issued one minute later still leaves resolvers using Cloudflare for up to a day. Task 1 Step 4 is the check that can still prevent damage. Do not start this task until it reads `MATCH` on every line.

- [ ] **Step 1: Record the current state, for the rollback**

Run: `nslookup -type=NS phoever.de 8.8.8.8`

Expected: the four IONOS nameservers `ns1029.ui-dns.de`, `ns1030.ui-dns.org`, `ns1101.ui-dns.biz`, `ns1062.ui-dns.com`. Save that list. It is what gets typed back in if the rollback is needed.

- [ ] **Step 2: Change the nameservers (operator, in the browser)**

In the IONOS control panel: **Domains & SSL** > `phoever.de` > **Nameserver** > **Personalisierte Nameserver verwenden**. Replace the four IONOS entries with the two Cloudflare ones from Task 1, and save.

- [ ] **Step 3: Wait for the delegation to move**

Run: `nslookup -type=NS phoever.de 8.8.8.8`

Expected: the two Cloudflare nameservers. Until then, repeat. This usually takes minutes but the registry is entitled to take hours. Nothing below can be judged before this answers correctly.

- [ ] **Step 4: Re-run the comparison, now against the world**

Edit `<scratchpad>/dns-compare.sh` and set `OLD_NS=8.8.8.8`, leaving `CF_NS` as it is.

Run: `bash <scratchpad>/dns-compare.sh`

Expected: `MATCH` on all ten queries. This proves public resolvers now see what Cloudflare serves, and that it is still the same set of answers the domain had this morning.

- [ ] **Step 5: Prove the website still works**

Run:

```bash
curl -s -o /dev/null -w "apex %{http_code}\n" https://phoever.de/
curl -s -o /dev/null -w "www  %{http_code}\n" https://www.phoever.de/
echo | openssl s_client -connect phoever.de:443 -servername phoever.de 2>/dev/null | openssl x509 -noout -issuer -enddate
```

Expected: `200` for both, and an issuer of `Let's Encrypt` with `notAfter=Dec  3 ... 2026`. An unchanged certificate is the proof that Cloudflare is not intercepting the apex.

- [ ] **Step 6: Prove certificate renewal can still happen**

Run: `curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" "http://phoever.de/.well-known/acme-challenge/probe-$(date +%s)"`

Expected: a `301` to the same path on HTTPS. Let's Encrypt follows that redirect, so the renewal path is intact. A `403`, a timeout or a redirect to a different host means the landing page will silently fail to renew before 2026-12-03: record it as a defect and tell the operator, since only the owner of that host can fix it.

- [ ] **Step 7: Prove mail still works (operator, by hand)**

Send a message from an outside address to a real `@phoever.de` mailbox and confirm it arrives in the inbox, not in spam. Then send one from that mailbox to an outside address, ideally at a large provider, and confirm it arrives without a spam verdict.

This check cannot be automated from here and it cannot be skipped. It is the only evidence that the mail records survived the move.

---

### Task 3: Run the tunnel and route the hostname

**Files:**
- Create on the NAS: `/volume1/docker/cloudflared/cloudflared.env`, mode 600, root owned

**Interfaces:**
- Consumes: Cloudflare authoritative for the zone (Task 2).
- Produces: `https://galerie.phoever.de` reaching the frontend. Task 4 needs this hostname to be live before its value can be verified.

- [ ] **Step 1: Confirm the frontend is actually listening where the tunnel will look**

Run:

```bash
ssh -i ~/.ssh/picpeak-nas phoever@picpeak-nas 'ss -tlnp 2>/dev/null | grep ":3000"'
```

Expected: a listening socket on port 3000. If it is bound to `127.0.0.1` only, host networking still reaches it. If nothing is listening, the stack is down: bring it up and re-check before continuing.

- [ ] **Step 2: Create the tunnel (operator, in the browser)**

Cloudflare dashboard > **Zero Trust** > **Networks** > **Tunnels** > **Create a tunnel** > **Cloudflared**. Name it `picpeak-nas`. On the next screen, copy the token out of the sample `docker run` command; do not run that command as printed.

Then add a public hostname to the tunnel:

| Field | Value |
|---|---|
| Subdomain | `galerie` |
| Domain | `phoever.de` |
| Path | leave empty |
| Type | `HTTP` |
| URL | `127.0.0.1:3000` |

Saving this creates the `galerie` DNS record in Cloudflare automatically. Do not create it by hand as well.

- [ ] **Step 3: Put the token on the NAS, out of the process list**

The token is a credential. Passing it as a command-line argument leaves it in shell history and in `docker inspect` output, so it goes in a file instead. Replace `PASTE_TOKEN_HERE`, then run from the local machine:

```bash
ssh -i ~/.ssh/picpeak-nas phoever@picpeak-nas \
  'mkdir -p /volume1/docker/cloudflared && cat > /volume1/docker/cloudflared/cloudflared.env' <<'EOF'
TUNNEL_TOKEN=PASTE_TOKEN_HERE
EOF
```

- [ ] **Step 4: Lock the file down**

Run:

```bash
ssh -i ~/.ssh/picpeak-nas phoever@picpeak-nas \
  'chmod 600 /volume1/docker/cloudflared/cloudflared.env && ls -l /volume1/docker/cloudflared/cloudflared.env'
```

Expected: `-rw-------`. Any group or other bit set means the token is readable by another account on the box.

- [ ] **Step 5: Start the container**

Host networking is deliberate: see the spec's Phase 2 for why attaching to the Compose network would break on the next deploy. Run, with `$PW` read from `.claude/nas-credentials.env`:

```bash
ssh -i ~/.ssh/picpeak-nas phoever@picpeak-nas \
  "echo '$PW' | sudo -S -p '' docker run -d \
     --name cloudflared \
     --restart unless-stopped \
     --network host \
     --env-file /volume1/docker/cloudflared/cloudflared.env \
     cloudflare/cloudflared:latest tunnel --no-autoupdate run"
```

- [ ] **Step 6: Verify the tunnel registered**

Run:

```bash
ssh -i ~/.ssh/picpeak-nas phoever@picpeak-nas \
  "echo '$PW' | sudo -S -p '' docker logs cloudflared 2>&1 | tail -20"
```

Expected: lines reading `Registered tunnel connection`, normally four of them. `failed to connect` or an authentication error means the token was pasted wrong: fix the file and restart the container rather than recreating the tunnel.

- [ ] **Step 7: Verify it survives a restart**

A tunnel that works until the NAS reboots is worse than one that never worked, because it fails at a moment nobody is watching.

```bash
ssh -i ~/.ssh/picpeak-nas phoever@picpeak-nas \
  "echo '$PW' | sudo -S -p '' docker restart cloudflared && sleep 15 && echo '$PW' | sudo -S -p '' docker ps --filter name=cloudflared --format '{{.Names}} {{.Status}}'"
```

Expected: `cloudflared Up ...`, not `Restarting`.

- [ ] **Step 8: Reach it from outside**

Run from the local machine:

```bash
curl -s -o /dev/null -w "%{http_code} %{ssl_verify_result}\n" https://galerie.phoever.de/
```

Expected: `200 0`. A `530` or `1033` means the tunnel is not connected. A `502` means the tunnel is connected but nothing answers on `127.0.0.1:3000`: go back to Step 1.

---

### Task 4: Tell the application its public address

**Files:**
- Modify on the NAS: `/volume1/docker/picpeak/.env`

**Interfaces:**
- Consumes: a live `https://galerie.phoever.de` (Task 3).
- Produces: every absolute URL the backend generates now points at the public hostname.

- [ ] **Step 1: Check what the value is today**

Run:

```bash
ssh -i ~/.ssh/picpeak-nas phoever@picpeak-nas \
  "echo '$PW' | sudo -S -p '' grep -c '^FRONTEND_URL=' /volume1/docker/picpeak/.env || true"
```

Expected: `0`, meaning the variable is absent. If it returns `1`, read the existing line first and replace it in Step 2 rather than appending a second one, because a later duplicate wins and the file becomes misleading to read.

- [ ] **Step 2: Add the variable**

```bash
ssh -i ~/.ssh/picpeak-nas phoever@picpeak-nas \
  "echo '$PW' | sudo -S -p '' sh -c 'printf \"FRONTEND_URL=https://galerie.phoever.de\n\" >> /volume1/docker/picpeak/.env'"
```

- [ ] **Step 3: Restart the backend so it reads the file**

`env_file` is read when the container is created, not on restart, so the container has to be recreated.

```bash
ssh -i ~/.ssh/picpeak-nas phoever@picpeak-nas \
  "echo '$PW' | sudo -S -p '' docker compose -f /volume1/docker/picpeak/docker-compose.production.yml up -d --force-recreate backend"
```

- [ ] **Step 4: Verify the value reached the process**

```bash
ssh -i ~/.ssh/picpeak-nas phoever@picpeak-nas \
  "echo '$PW' | sudo -S -p '' docker exec picpeak-backend printenv FRONTEND_URL"
```

Expected: `https://galerie.phoever.de`. An empty result means the variable is in the file but not in the container, which would mean `env_file` is not doing what the spec says: stop and re-read `docker-compose.production.yml` before working around it.

- [ ] **Step 5: Verify the application agrees**

Sign in at `https://galerie.phoever.de/admin`, open Settings, and find the Site URL field.

Expected: it shows `https://galerie.phoever.de` and is read-only. Read-only is the proof that the environment variable is winning the resolution in `backend/src/utils/frontendUrl.js`, rather than the field merely having been edited at some point.

- [ ] **Step 6: Verify a generated link**

Create a throwaway event in the admin interface and copy its share link.

Expected: the link starts `https://galerie.phoever.de/gallery/`. A link containing `localhost` or `192.168.` means the value is not being used where it matters; a link over plain `http` means the proxy headers are not reaching the backend. Either one is a defect to fix before customers receive a link.

- [ ] **Step 7: Delete the throwaway event**

Remove the test event through the admin interface, along with any photo uploaded into it.

A test event left behind carries a live public link that anyone holding it can open, and it makes the first real customer the second row in the table rather than the first.

---

### Task 5: Harden the install before customers arrive

Until Task 3 this box answered only to callers inside the house. Two things that were fine under that assumption stop being fine now.

**Files:**
- Modify: `.claude/nas-credentials.env` in the main checkout (not in git)

- [ ] **Step 1: Rotate the admin password**

`PICPEAK_ADMIN_PASSWORD` in `.claude/nas-credentials.env` was chosen for a machine reachable only from the office LAN and over Tailscale. It has now been published to the internet behind nothing but a login form.

Change it in the admin interface to a fresh long random value, then update `.claude/nas-credentials.env` to match. Do not print the old or the new value into the transcript.

- [ ] **Step 2: Verify the old password no longer works**

Sign out and attempt a sign-in with the old password.

Expected: rejected. A rotation nobody checked is a rotation that may not have saved.

- [ ] **Step 3: Confirm the rate limit is actually in the request path**

```bash
for i in $(seq 1 12); do
  curl -s -o /dev/null -w "%{http_code} " -X POST https://galerie.phoever.de/api/auth/admin/login \
    -H 'Content-Type: application/json' \
    -d '{"username":"nobody","password":"wrong"}'
done
echo
```

Expected: the first few answers are `401`, and later ones become `429`. If all twelve are `401`, the limiter is not seeing these requests: the likely cause is that it keys on a client address that is now always Cloudflare's, so every visitor shares one bucket or none does. Fix that before treating the login form as protected.

- [ ] **Step 4: Turn on Cloudflare's own bot protection (operator, in the browser)**

Cloudflare dashboard > `phoever.de` > **Security** > **Bots** > enable **Bot Fight Mode**.

This costs nothing on the Free plan and absorbs the background noise of automated scanners before it reaches the office line, which matters here because every request that gets through consumes office bandwidth.

---

### Task 6: Put a backup on a schedule

**Files:** none in the repository.

The install has been empty, so having no scheduled backup cost nothing. From Task 3 onwards the box holds photographs belonging to other people, on an array with no redundancy: `/proc/mdstat` shows a single-member mirror, so one disk failure loses everything.

- [ ] **Step 1: Confirm the backup destination is a real mount**

```bash
ssh -i ~/.ssh/picpeak-nas phoever@picpeak-nas \
  "echo '$PW' | sudo -S -p '' docker exec picpeak-backend sh -c 'touch /backup/.probe && ls -la /backup/.probe && rm /backup/.probe'"
```

Expected: the file is created and listed. Then confirm it was visible from the host side, which is what proves it is the bind mount and not the container's own writable layer:

```bash
ssh -i ~/.ssh/picpeak-nas phoever@picpeak-nas 'ls -la /volume1/docker/picpeak/backups/'
```

- [ ] **Step 2: Enable the scheduled backup (operator, in the browser)**

In the admin interface, Settings > Backup: turn on the schedule, daily, at a time when nobody is uploading. Leave the destination at its default under `/backup`.

- [ ] **Step 3: Run one on demand and prove a file lands**

Trigger a backup from the same screen, then:

```bash
ssh -i ~/.ssh/picpeak-nas phoever@picpeak-nas \
  'ls -la --time-style=+%F_%H:%M /volume1/docker/picpeak/backups/ | tail -5'
```

Expected: a file dated within the last few minutes, with a non-zero size. "The button turned green" is not evidence.

> [!IMPORTANT]
> This puts a copy on the same disk as the original, which protects against a bad deploy and not against the disk failing. Copying backups off the box is still open, and it is recorded as `TODO` in `.claude/nas-profile.md`. Say so plainly rather than letting a scheduled backup read as solved.

---

### Task 7: Record what now exists

**Files:**
- Modify: `.claude/nas-profile.md`, the Publishing section
- Modify: `docs/superpowers/plans/2026-09-20-publish-galerie-subdomain.md` (tick the boxes)

- [ ] **Step 1: Fill in the Publishing section**

Replace the four `TODO` rows with what was actually built:

```markdown
| Key | Value |
|---|---|
| Access method | Cloudflare Tunnel, free plan |
| Public hostname | `galerie.phoever.de` |
| Tunnel name | `picpeak-nas`, managed from the Cloudflare dashboard |
| `cloudflared` runs as | Standalone container `cloudflared`, host networking, `restart: unless-stopped`, token in `/volume1/docker/cloudflared/cloudflared.env` mode 600 |
```

Also correct the section's opening sentence, which currently says the install is not published.

- [ ] **Step 2: Record why host networking was chosen**

Add a note under that table, so the next person does not "tidy it up" into the Compose network and break the tunnel on the following deploy:

```markdown
> [!WARNING]
> `cloudflared` uses host networking and targets `127.0.0.1:3000` on purpose. Attaching
> it to the stack's Compose network instead would bind it to a network that a deploy can
> recreate, and the tunnel would then answer 502 after every update while the application
> itself stayed healthy.
```

- [ ] **Step 3: Note what is still open**

The external backup target and the Tailscale key expiry remain `TODO` in that file. Leave them as `TODO`. Do not let this work's completion make unrelated gaps look closed.

- [ ] **Step 4: Commit**

`.claude/` is excluded from git in this repository, so `nas-profile.md` is not committed. Only the plan's ticked boxes are.

```bash
git add docs/superpowers/plans/2026-09-20-publish-galerie-subdomain.md
git commit -m "docs(ops): mark the galerie.phoever.de publication plan complete"
```

---

## Final verification

Run every check from mobile data with office Wi-Fi switched off. On the office network the LAN route answers whether or not the tunnel works, so a pass there proves nothing.

| Check | Passes when |
|---|---|
| Public reachability | `https://galerie.phoever.de` loads with a valid certificate |
| Admin sign-in | `/admin` accepts the rotated password and rejects the old one |
| Customer path | A share link opens as an anonymous visitor sees it |
| Download | A photo downloads whole, and the allowance shown afterwards matches the server's count |
| Generated links | A system email carries `https://galerie.phoever.de` |
| Landing page | `https://phoever.de` and `https://www.phoever.de` load unchanged, same certificate issuer |
| Renewal path | `http://phoever.de/.well-known/acme-challenge/x` still answers |
| Mail | Inbound and outbound mail on `@phoever.de` both still work |
| Deploy safety | After one full `docker compose down && up -d`, `https://galerie.phoever.de` still answers 200 |

The last row is the one most likely to be skipped and the one this design was specifically shaped to pass. Run it.
