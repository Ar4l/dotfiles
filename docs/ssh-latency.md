# Roaming latency to `rem-dev`: survey and verdict

2026-07-28. Measurements in [`../MEASUREMENTS.md`](../MEASUREMENTS.md).

## TL;DR — SOLVED

**Cause: AirDrop.** It was set to "Everyone", which keeps Apple Wireless Direct
Link (`awdl0`) discoverable. The Mac has one Wi-Fi radio, so staying discoverable
means periodically hopping off the home channel and back — stalling traffic every
~3.6s. Turning AirDrop receiving off in Control Centre fixed it outright.

Measured before/after, Mac → rem-dev, identical tests:

| Metric | Before | After | |
| --- | --- | --- | --- |
| avg latency | 30.7ms | **18.8ms** | 39% faster |
| max latency | 129.0ms | **28.3ms** | 4.6× better |
| jitter (σ) | 25.4 | **1.58** | **16× better** |
| TCP handshake p50 | 30.8ms | **27.1ms** | |
| TCP handshake max | 120.9ms | **32.5ms** | |
| TCP handshake σ | 29.7 | **2.2** | **13× better** |

Local Wi-Fi leg went from `med 4.1 / max 89.6 / σ 27.6` to
`med 3.1 / max 7.0 / σ 0.8`. The link is now as stable as rem-dev's own leg into
Cloudflare (σ 1.5).

Note `awdl0` remains `UP` — turning off *discoverability* is sufficient; the
interface itself doesn't need to be downed. The spikes will return while AirDrop
is set to "Everyone" or "Contacts Only", since both require AWDL discovery.

**Therefore: no terminal tool, transport, or infrastructure change was ever
needed for latency.** mosh, Eternal Terminal, Tailscale, Cloudflare Tunnel, the
WARP split-tunnel and IAP are all irrelevant to the problem as diagnosed. The
sections below are retained for the reasoning and for the security findings,
which stand on their own.

Still worth doing, independently of latency:
- **ssh multiplexing** — measured 7–9× on repeat connections, free.
- **IAP** (`--tunnel-through-iap`, verified working, latency-neutral) — removes
  dependence on the world-open `tcp:22` rules and the ephemeral-IP churn.
- The two security findings at the end of this document.

## Why not mosh

mosh is a good tool. It is close to the worst possible fit *here*, for six
independent reasons — the first two are hard blocks I verified directly.

1. **Blocked today.** The GCP VPC firewall in `jetbrains-grazie` has **no
   ingress rule permitting UDP from the internet**. Verified with
   `tcpdump -nUi ens4`: a TCP/22 SYN was captured as a positive control; three
   UDP probes to `:60001` captured nothing. Notably this is *not* the WARP
   workaround's fault — its prerouting rule has no protocol match, so it would
   mark mosh's UDP correctly.
2. **The path MTU is exactly 1280, and mosh's default MTU is also 1280.** Probed
   with DF: 1252+28=1280 OK, 1272+28=1300 FAIL. This is precisely
   [mosh#299](https://github.com/mobile-shell/mosh/issues/299) — "Support smaller
   MTU when PMTUD is not available (e.g. some VPNs)", **open since 2012-07-16**,
   still on the 1.5.0 milestone, `--mtu` flag never implemented. Fragment loss
   costs the whole datagram. You would be running mosh directly into its
   best-known VPN failure mode.
3. **Its one well-measured win doesn't apply.** mosh's 30–50× advantage is on
   *lossy* links (16.8s → 0.33s at 29% loss). You have 0% loss.
   [mosh#222](https://github.com/mobile-shell/mosh/issues/222) measured mosh
   *slower* than ssh at ~30ms RTT with no loss — your exact profile.
4. **It makes Claude Code worse, per a filed report.**
   [claude-code#22408](https://github.com/anthropics/claude-code/issues/22408)
   (2026-02-01) describes this setup at ~100ms latency: *"Also tried: tmux
   (causes screen corruption), mosh (even worse)."* mosh syncs a screen
   *snapshot* at a variable frame rate; a full-redraw alternate-screen TUI is the
   pathological case. Multiple HN reports agree — ncurses apps become *"a
   distorted mess until the round-trip … got back the real render."*
5. **It regresses two things you deliberately built.** mosh has never
   transmitted OSC 52 ([#637](https://github.com/mobile-shell/mosh/issues/637),
   open since 2015-06-17) → breaks `fbd8953` *"forward OSC 52 so nested remote
   copies reach the local clipboard"*. OSC 8 support was merged Nov–Dec 2025 and
   is **not in 1.4.0**, which is what every distro ships → breaks `c5be295`
   *"forward OSC 8 hyperlinks through nested sessions"*.
6. **Its persistence value is already covered.** Your tmux session has been up
   since Jul 10 with `tmux-resurrect`/`continuum` configured. This is
   craftkiller's argument verbatim: *"If I'm already launching a tmux session,
   then I don't need mosh's ability to recover from broken connections because I
   can re-attach to tmux."*

Also relevant if you ever reconsider: no port forwarding
([#337](https://github.com/mobile-shell/mosh/issues/337), open since 2012, >$1000
community bounty, keithw declined and pointed at ET), no agent forwarding, and
roaming is **client-side only** — a server IP change is
[#212](https://github.com/mobile-shell/mosh/issues/212), open since 2012. That
last one matters given rem-dev has an ephemeral IP.

Fairness note: mosh is **not abandoned**, contrary to widely-repeated 2025 claims
of "no commit in 2.5 years." Zero commits in 2024, but 3 in 2025 and 17 in 2026,
with maintainers actively triaging as of today. It just hasn't released since
1.4.0 (2022-10-27). Homebrew ships it at *revision 40* — a fair proxy for the
downstream patching burden.

## Why not Eternal Terminal

ET is genuinely maintained (**v7.0.0, 2026-07-07** — the biggest release in a
decade) and its native scrollback plus `tmux -CC` is a real differentiator over
mosh. But:

- **It does nothing for latency.** There is not one latency claim in ET's
  documentation — no local echo, no prediction. It is a resumable TCP byte-stream
  proxy; every keystroke still costs a full RTT. "For the busy and impatient"
  refers to *reconnect* speed. So it does not address your actual problem.
- **It needs TCP/2022 ingress** — another firewall change in the shared
  corporate project, i.e. the same cost as unblocking mosh, for a feature you
  don't need.
- **Exposing 2022 is a poor idea here.** Three CVEs from a SUSE security review
  (CVE-2022-48257, CVE-2022-48258, CVE-2023-23558 — the last with *no upstream
  fix* at time of writing), on top of three from Aug 2022. And
  [ET#120](https://github.com/MisterTea/EternalTerminal/issues/120) is a
  cautionary tale: a corporate port scanner touching 2022 was enough to stall the
  whole `etserver` accept loop and inject multi-minute lag. Given `tcp:22` on
  this VM is already being brute-forced (below), that risk is not theoretical.
- What you'd actually be buying — native scrollback without a multiplexer — is
  now available one layer down and with **no network daemon**: `zmx`
  (v0.7.0, 2026-07-23) or `shpool` (v0.11.0, 2026-06-12). If the tmux scrollback
  ergonomics bother you, look there instead.

## Why not Tailscale or Cloudflare Tunnel

Both would be actively counterproductive, and both would run *outbound* from
rem-dev — which the workaround does **not** protect (it only marks
inbound-initiated connections), so they'd ride inside WARP as a double tunnel.

- **Tailscale.** Hole-punching from behind WARP's NAT will likely fail, dropping
  you to a DERP relay. Tailscale's own blog (2026-01-26) measured DERP at
  **441–478ms with noticeable jitter** vs a **280–320ms** plain-internet baseline
  on the same route — the relay was ~150ms *worse* than no VPN. It would also
  contend with the fwmark scheme for routing control. (Amusingly, WARP's exclude
  list already covers most of `100.64.0.0/10`, but leaves a `100.80.0.0/16` hole
  — fragile either way.)
- **Cloudflare Tunnel.** Cloudflare's own Argo 2.0 benchmark is **39% TTFB
  improvement but only 5% end-to-end latency**. For an interactive shell,
  steady-state RTT is the whole game and TTFB is irrelevant, so 5% is the honest
  ceiling. Meanwhile the one quantified community measurement I could verify
  reports **50ms proxied vs 500–1500ms through a Tunnel**, unresolved. Argo's TCP
  acceleration is Spectrum, a different product. Treat cloudflared-for-SSH as a
  zero-trust decision, never a performance one.

## What to actually do

### 1. ssh multiplexing + keepalives — free, measured, do it now

Fresh connection **0.70–0.79s** → multiplexed **0.07–0.23s**. Nothing is
configured today, and `~/.ssh/config` isn't even dotfiles-managed.

```
Host *
  ControlMaster auto
  ControlPath ~/.ssh/cm-%C
  ControlPersist 10m
  ServerAliveInterval 20
  ServerAliveCountMax 6
```

Honest scope: this removes *extra* round trips (handshakes), not the fundamental
one. It does **nothing** for keystroke latency. It is a large win for everything
that shells out repeatedly — `git` over ssh, `scp`, editor remotes, and agents
opening connections in a loop. Because setup cost is RTT-dominated, the win
*scales with* your latency.

Two gotchas: server `MaxSessions` caps you at 10 multiplexed channels, and
OpenSSH 10.0 changed `scp`/`sftp` to pass `ControlMaster no` (they reuse an
existing master but no longer create one). `ServerAliveCountMax 6` is
deliberately generous — set it tight and a jitter spike will kill the session,
which is the opposite of what you want here.

### 2. WARP split-tunnel — CORRECTED: not a latency fix

**This section originally claimed the WARP hairpin was the cause of the jitter.
That was wrong.** It was inferred from one-way leg measurements before I isolated
the Wi-Fi, and a 10-packet gateway sample that happened to catch a quiet window
(σ 2.7, max 9.9 — the 120-packet run gave σ 20.4, max 89.7).

Two later results falsify it. First, IAP and the direct public-IP path have
nearly identical jitter (σ 37 vs 43) despite diverging completely after
Cloudflare — so the jitter is upstream of the divergence. Second, the
three-target comparison in the TL;DR puts essentially all of σ at hop one.

The split-tunnel change is still worth doing for **security and routing
hygiene** — it removes public exposure and shortens the path by ~5–14ms of
*median* — but it will not fix what you actually notice. Keep the priority order
in the TL;DR. Two framings, either works:

- **Preferred — WARP-to-WARP.** Both machines are in the same `jetbrains` Zero
  Trust org; rem-dev holds WARP IP `100.96.12.184`. Reaching it that way keeps
  traffic on Cloudflare's backbone end-to-end, needs **no inbound firewall rule**,
  and removes rem-dev's public exposure entirely. It doesn't route today because
  the split-tunnel exclude list contains `100.96.0.0/11`, which *contains* that
  address — so your Mac sends it out `en0` to the public internet (100% loss,
  TCP timeout, confirmed).
- **Simpler — exclude the host.** Add `34.6.249.84` to the client-side WARP
  exclude list so ssh skips the tunnel outbound.

Expected gain, extrapolating from the measured legs: Mac→CF is 17.9ms ±8.1 and
rem-dev→CF is 7.7ms ±1.5, so a backbone-only path lands near **~25ms with ~10ms
jitter** vs today's **30.7ms ±25.4** — a modest median improvement but roughly a
**2.5× jitter reduction**, which is the part you actually notice.

Caveat: this is an extrapolation from one-way legs, not an end-to-end
measurement, and I can't test it without the policy change. Everything is marked
`(network policy)` with `Allow Mode Switch: false`, so it needs whoever owns the
Zero Trust config.

### 3. Accept ~30ms, and don't reach for a terminal tool

At p50 31ms with zero loss, plain ssh + tmux is the right stack. The category of
tool that would help — predictive local echo — helps *typing at a shell prompt*,
which is not what you do on this box. You run long-lived Claude Code TUIs, where
every such tool is neutral at best and corrupting at worst.

If a specific pain is *editing* over the link, the answer is not a transport —
it's keeping the buffer local (Zed's `ssh://`, VS Code Remote-SSH, or
`remote-ssh.nvim`; note JetBrains Gateway measured clearly worse than VS Code
above 100ms, though that data is from late 2023). Neovim has a
[GSoC 2026 proposal](https://github.com/neovim/neovim/discussions/38564) for
exactly this split — worth watching.

## Two unrelated problems found while investigating

### 1. The workaround silently broke intra-VPC networking

**The mechanism.** WARP's split-tunnel exclude list contains `10.0.0.0/16` — a
sensible default for a laptop on a home LAN, and useless here. This VM sits at
`10.164.0.125/20` (subnet `10.164.0.0/20`), which is *not* inside `10.0.0.0/16`.
Meanwhile WARP's routing table 65743 installs `10.128.0.0/9 dev CloudflareWARP`,
which *does* cover `10.164.x`. So every packet to the VM's own subnet gets
tunnelled to Cloudflare, which will not route RFC1918 space, and is dropped.

`ip route get` shows it unambiguously — note the source address rewrite to the
WARP virtual IP:

```
10.164.0.1     -> dev CloudflareWARP table 65743 src 100.96.12.184   # subnet gateway
10.164.0.2     -> dev CloudflareWARP table 65743 src 100.96.12.184   # GCP internal DNS
10.128.0.5     -> dev CloudflareWARP table 65743 src 100.96.12.184   # a colleague's VM
199.36.153.8   -> dev CloudflareWARP table 65743 src 100.96.12.184   # Private Google Access
34.6.249.84    -> dev CloudflareWARP table 65743 src 100.96.12.184   # its OWN public IP
169.254.169.254 -> via 10.164.0.1 dev ens4 src 10.164.0.125          # metadata: OK
```

**What actually breaks, tested:**

| | |
| --- | --- |
| `ping 10.164.0.1` (subnet gateway) | **100% loss** |
| `https://199.36.153.8` (Private Google Access) | **timeout** |
| Any other VM by internal `10.x` IP | **unreachable** |
| Reaching itself via `34.6.249.84` | **unreachable** |

**What still works, and why the failure is sneaky.** I initially assumed DNS
would break too. It doesn't. `systemd-resolved` is pointed at
`169.254.169.254`, and `169.254.0.0/16` *is* in the exclude list — so the
metadata server stays reachable, which means:

- GCP internal DNS resolution works (`c.jetbrains-grazie.internal` and friends)
- service-account tokens work (`/service-accounts/default/token` → HTTP 200)
- `gcloud`/`gsutil` against *public* endpoints work (they egress via WARP)

That combination is the worst case for debugging. An internal hostname
**resolves correctly** to a `10.x` address, and then the connection black-holes.
It presents as "that VM is down" rather than "my routing is wrong." You will
lose an hour to this the first time it bites.

**Why it hasn't bitten yet:** the box is a single-VM workload — Claude Code,
tmux, and a loopback-bound `llama-server`. Nothing currently reaches sideways.
The `jetbrains-grazie` project has dozens of VMs in `europe-west4` on
`10.164.x`, though, so the moment you want to talk to one — or use Private
Google Access, or mount an internal NFS/Filestore share, or hit an internal load
balancer — it will fail confusingly.

**Fix.** Add the subnet to WARP's exclude list, which is the same class of change
as the existing `10.0.0.0/16` entry:

```
10.164.0.0/20          # or 10.128.0.0/9 to cover every GCP internal range
199.36.153.8/30        # private.googleapis.com, if you want Private Google Access
```

Doing it in the exclude list is preferable to extending `sshkeep`, because
`sshkeep`'s mark is driven by `ct state new` on *inbound* connections — it
structurally cannot help traffic the VM originates. If the exclude list is
org-managed and you can't edit it, the alternative is a `main`-table route added
above WARP's, or a second nft rule marking VPC-destined egress with `0x100cf`.

**Also, `ip rule` 77 is dead code.** `from all fwmark 0x5222 lookup 177` (table
177 = `default via 10.164.0.1 dev ens4 onlink`) can never match: the live
mechanism sets *packet* mark `0x100cf`, while `0x5222` is only ever a
**conntrack** mark. `ip rule` matches on the packet mark. It looks like an
earlier attempt that was superseded and left behind. Harmless, but it will
mislead the next person who debugs this — delete it or comment it.

### 2. `tcp:22` is open to the entire internet — but the risk is narrower than it looks

**Confirmed exposure.** Three firewall rules allow `tcp:22` from `0.0.0.0/0`
with **no target tags**, which in GCP means they apply to *every* VM in the
`default` network — rem-dev included:

```
furda-ssh                  -> tcp:22     from 0.0.0.0/0
karol                      -> tcp:22     from 0.0.0.0/0
allow-22-elena-kartysheva  -> tcp:22     from 0.0.0.0/0   (mixed in with 3 specific IPs)
vllm-default               -> tcp:8000   from 0.0.0.0/0
default-allow-icmp         -> icmp       from 0.0.0.0/0
```

None of these are yours. `allow-22-elena-kartysheva` is the telling one — it
lists `31.153.33.0/24` and `31.153.33.236` *alongside* `0.0.0.0/0`, which is the
signature of someone adding a specific IP and then widening it to unblock
themselves. The net effect is that three people's convenience rules keep port 22
open on every VM in the project.

**The attack volume is real.** In the last 24 hours:

- **4,949** failed authentication attempts
- **86** distinct source IPs
- usernames tried: `admin` (124), `user`, `sol`, `solana`, `ftpuser`, `postgres`
  — commodity botnets plus crypto-wallet-hunting

**But the actual risk is low, and I want to be precise rather than alarming.**
Effective `sshd -T` config:

```
passwordauthentication      no
kbdinteractiveauthentication no
permitrootlogin             prohibit-password
pubkeyauthentication        yes
permitemptypasswords        no
```

Key-only auth means **the brute force cannot succeed**. It is guessing passwords
against a server that does not accept passwords. I also checked 7 days of
successful logins: exactly one key fingerprint, ~115 sessions — consistent with
just you. **No evidence of compromise.**

So this is noise, not a breach in progress. What it actually costs you:

1. **Log churn** — ~5k journal entries/day burying anything real.
2. **A standing bet on sshd being flawless.** Key-only auth protects against
   guessing, not against a pre-auth RCE. `regreSSHion` (CVE-2024-6387, 2024) was
   exactly that. Internet-facing `:22` means you patch on the internet's
   schedule.
3. **A one-flag blast radius.** The day anyone sets `PasswordAuthentication yes`
   to debug something, 86 botnets are already knocking.
4. **`vllm-default` opening `tcp:8000` on every VM is the sharper edge.** rem-dev
   has nothing on 8000 today (I checked — the only internet-facing listener is
   sshd; `llama-server` is correctly bound to `127.0.0.1:8033`). But inference
   servers habitually bind `0.0.0.0:8000` with no auth by default. If you ever
   start vLLM here without `--host 127.0.0.1`, it is instantly world-readable.
   Given you already run a local model, treat this as a live foot-gun.

**Options, cheapest first.** You can't delete other people's rules unilaterally,
but you don't have to:

- **`fail2ban`** — 10 minutes, kills the log noise, no coordination needed.
- **Bind sshd to the WARP interface** once WARP-to-WARP works (step 2 above),
  then public `:22` becomes unnecessary entirely. This is the clean end state:
  it also makes the `sshkeep` workaround redundant, since there'd be no inbound
  public connection to protect.
- **Switch to IAP** — `allow-iap-22-for-all` (`35.235.240.0/20`) already exists
  in the project, so `gcloud compute ssh --tunnel-through-iap` works today with
  no new rule. Note this would route ssh through Google's edge instead of
  Cloudflare's, which is an untested latency path — worth measuring before
  committing.
- **Raise the untagged-rule problem with whoever owns the project.** The correct
  fix is target tags on those three rules, which benefits everyone's VMs, not
  just yours.

## Credit where due: the workaround is well built

`nft table inet sshkeep` is a correct and fairly elegant solution:

```
prerouting: iifname "ens4" ct state new       ct mark  set 0x5222
output:     ct mark 0x5222                    meta mark set 0x100cf   # type route hook
```

It borrows WARP's *own* tunnel mark (`0x100cf`), which `ip rule` 76 excludes from
the WARP table (`not from all fwmark 0x100cf lookup 65743`), so replies fall
through to `main` and egress `ens4` — routing stays symmetric. The
`ct mark`→`meta mark` split is what makes it survive across packets, and
`type route hook output` is essential: it forces a route re-lookup after the mark
is set. It also pokes the two holes needed in WARP's own `policy drop` firewall.

Verified working: tcpdump shows the SYN arriving from the Cloudflare egress IP
**and the SYN-ACK leaving on `ens4`**, not on `CloudflareWARP`.

Its one real limitation is scope, not correctness: `ct state new` +
`iifname ens4` means only *inbound-initiated* connections are protected. That's
why every outbound-dialing option in this survey (Tailscale, cloudflared, reverse
tunnels) lands inside WARP.

## Method note

The first UDP reachability test produced a false negative — buffered `tcpdump`
captured nothing *even for the TCP control*. The result in this report is from
the corrected run with `-U`. Worth mentioning because the wrong version would
have supported the same conclusion for the wrong reason.

Not tested end-to-end: whether mosh works once UDP ingress is permitted. That
needs a firewall rule in a shared corporate project, which I did not create. The
nft rules are protocol-agnostic so the workaround should handle it — but the
1280-MTU collision in point 2 above means I'd expect it to be unreliable anyway.
