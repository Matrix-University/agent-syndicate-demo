# Postfix security guide for this project's email verification server

This document is for **AI agents and engineers** touching [server/mailer.mjs](../server/mailer.mjs)
or the self-hosted Postfix relay it talks to. It defines the security risks,
hardening steps, and operational practices for that relay. It applies to
**local-first, non-cloud** deployments — no 3rd-party email API is involved.

Whenever you change `server/mailer.mjs`, `.env.example`'s `SMTP_*` vars, or
write ops docs/scripts for the mail relay, follow this guide. Postfix itself
lives outside this repo (it's OS-level infrastructure the site owner runs), so
most fixes here are configuration to hand to the owner, not code to commit —
but the "Node.js guidance" in each section applies directly to this codebase.

## 1. SMTP smuggling & spoofing

**Risk:** permissive SMTP parsing lets attackers inject forged messages that
bypass SPF/DMARC. Older Postfix versions allowed malformed line endings to
create spoofed emails.

**Postfix fixes:**

```
strict_rfc821_envelopes = yes
smtpd_discard_ehlo_keywords = chunking
smtpd_forbidden_commands = CONNECT, XCLIENT, XFORWARD
```

Always run the latest stable Postfix release.

**Node.js guidance:** never pass user-controlled input directly into email
headers. `server/mailer.mjs` only ever sends a server-generated 6-digit code
and a validated email address — keep it that way, and reject any value with a
`\r`/`\n` before it reaches `sendMail`.

## 2. Open relay misconfiguration

**Risk:** if Postfix accepts mail from the public internet and relays it
outward, attackers can send spam through the server.

**Postfix fixes:**

```
mynetworks = 127.0.0.1/32
smtpd_recipient_restrictions = permit_mynetworks, reject_unauth_destination
```

Disable public port 25 unless the owner explicitly needs it; firewall it off
otherwise (`ufw deny 25/tcp`).

**Node.js guidance:** the app should only ever talk to the relay over
`localhost` (`SMTP_HOST=127.0.0.1` or `localhost` in `.env`) unless the owner
has a reason to point at a remote relay.

## 3. Inbound SMTP attack surface

**Risk:** even a send-only setup exposes brute-force attempts, protocol
fuzzing, and spam floods if Postfix listens on port 25 for inbound mail.

**Postfix fixes:**

```
inet_interfaces = loopback-only
```

or firewall-block port 25 (`ufw deny 25`). This project never receives mail,
so inbound SMTP should be disabled entirely.

## 4. Outbound abuse if the app is compromised

**Risk:** a compromised web app can use the local Postfix instance to send
large volumes of spam.

**Postfix fixes:**

```
default_destination_rate_delay = 5s
anvil_rate_time_unit = 60s
message_size_limit = 10240000
```

**Node.js guidance:** this is already partly covered in-app —
`server/verificationStore.mjs` enforces a resend cooldown and an attempts cap
per email, and `server/requestHandler.mjs` caps request body size. Don't add an
endpoint that sends mail to an arbitrary, unvalidated recipient.

## 5. Missing SPF, DKIM, DMARC

**Risk:** without domain authentication, the sending domain can be spoofed or
flagged as spam.

**DNS/Postfix fixes:** SPF record (`v=spf1 mx -all`), DKIM signing via
OpenDKIM, and a DMARC record (`v=DMARC1; p=quarantine; rua=mailto:postmaster@yourdomain.com`).

**Node.js guidance:** the app doesn't handle DKIM — Postfix and DNS do. Just
make sure `SMTP_FROM` in `.env` uses the domain that has SPF/DKIM/DMARC set up.

## 6. Queue poisoning & local abuse

**Risk:** if the host is compromised, attackers can inject mail directly into
Postfix's queue.

**Fixes:** restrict filesystem permissions (`chmod 700 /var/spool/postfix`),
run Postfix under its own dedicated user (the default on most distros), and
monitor queue activity (`postqueue -p`).

**Node.js guidance:** never run the Node.js server (`npm start`) as root; use
systemd service isolation (a dedicated, unprivileged system user + a
hardened unit file) in production.

## 7. TLS & encryption weaknesses

**Risk:** weak TLS allows interception or downgrade attacks between the app
and the relay, or between relays.

**Postfix fixes:**

```
smtpd_tls_protocols = !SSLv2 !SSLv3 !TLSv1 !TLSv1.1
smtpd_tls_mandatory_protocols = TLSv1.2 TLSv1.3
smtpd_tls_security_level = encrypt
```

**Node.js guidance:** `server/mailer.mjs` sets `tls.rejectUnauthorized: true`
by default. If the relay uses a self-signed cert, fix the cert rather than
disabling verification — don't set `SMTP_TLS_REJECT_UNAUTHORIZED=false` in any
environment that isn't a throwaway local test.

## 8. Logging & monitoring

**Risk:** without logs, abuse or failures go unnoticed.

**Ops fixes:** monitor `/var/log/mail.log`, and run `fail2ban` with an SMTP
jail for the relay.

**Node.js guidance:** `server/mailer.mjs` logs verification-send failures
(`console.error`) so they're visible in `npm start`'s output; don't log the
verification code itself, and don't log full stack traces containing SMTP
credentials.

## 9. Application-level header injection

**Risk:** if user input reaches email headers unsanitized, attackers can
inject extra recipients or rewrite the message.

**Node.js guidance:** `server/mailer.mjs` rejects any `to`/`subject` value
containing `\r` or `\n` before calling `sendMail`, in addition to the email
format validation already done in `server/subscribeHandler.mjs`. Keep both —
validation at the API boundary and a defense-in-depth check at the mail
boundary.

## 10. Principle of least privilege

**Risk:** running Postfix or the Node.js process with elevated permissions
increases the damage a compromise can do.

**Fixes:** run the Node.js server as a non-privileged user, keep Postfix in
chroot mode (the default on many distros), and use AppArmor/SELinux profiles
where available.

## Secure Postfix configuration template

```
# Disable inbound SMTP
inet_interfaces = loopback-only

# Prevent open relay
mynetworks = 127.0.0.1/32
smtpd_recipient_restrictions = permit_mynetworks, reject_unauth_destination

# Enforce strict RFC compliance
strict_rfc821_envelopes = yes
smtpd_discard_ehlo_keywords = chunking

# TLS hardening
smtpd_tls_security_level = encrypt
smtpd_tls_protocols = !SSLv2 !SSLv3 !TLSv1 !TLSv1.1
smtpd_tls_mandatory_protocols = TLSv1.2 TLSv1.3

# Rate limiting
default_destination_rate_delay = 5s
anvil_rate_time_unit = 60s

# Message size limits
message_size_limit = 10240000
```

## Operational checklist

**Daily:** check the mail queue (`postqueue -p`), check `/var/log/mail.log`,
check `fail2ban` status.

**Weekly:** patch Postfix, review outbound mail volume.

**Monthly:** review SPF/DKIM/DMARC reports, audit firewall rules.
