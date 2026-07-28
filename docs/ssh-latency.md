# Roaming latency to `rem-dev`: survey and verdict

2026-07-28. Measurements in [`../MEASUREMENTS.md`](../MEASUREMENTS.md).

## TL;DR

Your problem is **jitter, not latency**, and **no terminal tool fixes jitter**.

- p50 RTT is **31ms** — genuinely comfortable. Packet loss is **0%**.
- But ~15% of round-trips spike to **100–130ms** (3–4× median). That tail is what
  you feel.
- Cause: both ends run WARP, but rem-dev's *inbound* is pinned to the physical
  NIC by the workaround. So traffic exits Cloudflare's backbone and hairpins
  back into GCP over the public internet. rem-dev's own leg to Cloudflare is
  **7.7ms ±1.5**; the composite path is **30.7ms ±25.4**.
- rem-dev is already in `europe-west4-a`, same country as you. **There is no
  "move it closer" win available.** The distance is already optimal; the detour
  is the problem.

**Do this:** turn on ssh connection multiplexing (measured **7–9×** on repeat
connections, zero infra change). **Ask IT for this:** a WARP split-tunnel change
so the path stays on Cloudflare's backbone. **Don't adopt mosh or Eternal
Terminal** — reasons below, both specific to your setup rather than generic.

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

### 2. Ask IT for a WARP split-tunnel change — the only real latency win

This is the one change that attacks the actual cause. Two framings, either works:

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

### The workaround silently broke intra-VPC networking

WARP's exclude list covers `10.0.0.0/16`, but this VM is on **`10.164.0.125`**,
and table 65743 routes `10.128.0.0/9` into `CloudflareWARP`. Result:
`ping 10.164.0.1` → **100% loss**. rem-dev cannot reach its own subnet gateway or
any other VM on the internal network. GCP metadata still works only because
`169.254.0.0/16` happens to be excluded.

Fix: add the subnet (e.g. `10.164.0.0/20`) to the WARP exclude list, or extend
`sshkeep` to mark VPC-bound egress. Worth deciding deliberately rather than
leaving as an accident — right now it's a latent trap for anything multi-VM.

Also: `ip rule` 77 (`from all fwmark 0x5222 lookup 177`) is **dead**. The live
mechanism sets packet mark `0x100cf`, not `0x5222`, so rule 77 never matches.
Harmless, but it's misleading when debugging — worth deleting or documenting.

### `tcp:22` is open to the entire internet

Firewall rules `furda-ssh` and `karol` both allow `tcp:22` from `0.0.0.0/0`. A
12-second packet capture caught brute-force attempts from three unrelated IPs
(`197.220.92.185`, `51.91.96.79`, `103.179.198.19`). Options: scope those rules
to known source ranges, or move to `allow-iap-22-for-all` (IAP,
`35.235.240.0/20`) which already exists in the project. The WARP-to-WARP path in
step 2 would make public `:22` unnecessary altogether.

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
