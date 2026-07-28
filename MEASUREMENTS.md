# rem-dev latency: measured facts (2026-07-28)

Raw measurements taken from the Mac (NL, home Wi-Fi) against `rem-dev`.
Kept as the evidence base for `docs/ssh-latency-report.md`.

## Topology

| Fact | Value |
| --- | --- |
| rem-dev zone | `europe-west4-a` (Netherlands) |
| rem-dev project | `jetbrains-grazie` |
| rem-dev public IP | `34.6.249.84` (inbound, direct on `ens4`) |
| rem-dev internal IP | `10.164.0.125` |
| rem-dev WARP virtual IP | `100.96.12.184/32` |
| Both ends | Cloudflare WARP, org `jetbrains`, account `8b6ef35…`, colo **AMS** |
| WARP mode | `WarpWithDnsOverHttps`, protocol **MASQUE** (HTTP/3), Always On, switch locked |

Client egress as seen by rem-dev: `104.28.185.239` (Cloudflare WARP egress pool).

## Latency budget

| Leg | min | avg | max | stddev |
| --- | --- | --- | --- | --- |
| Mac → home gateway (first mile) | 2.5 | 5.9 | 9.9 | 2.7 |
| Mac → Cloudflare edge (`1.1.1.1`, via WARP) | 12.3 | 17.9 | 35.6 | 8.1 |
| **Mac → rem-dev (ICMP, 60 pkts)** | **16.6** | **30.7** | **129.0** | **25.4** |
| **Mac → rem-dev:22 (TCP handshake, 20 samples)** | **25.7** | **43.3** | **120.9** | **29.7** |
| rem-dev → Cloudflare edge (via WARP) | 6.6 | 7.7 | 13.2 | 1.5 |
| rem-dev → cloudflare.com:443 (TCP, via WARP) | 13.0 | 14.4 | 15.7 | ~1.0 |

Packet loss Mac → rem-dev: **0/60 (0.0%)**.

TCP handshake samples (ms), showing the tail:
`42.4 37.3 120.9 30.6 30.7 26.6 38.9 26.8 27.7 27.4 108.9 30.9 29.1 30.8 34.7 30.7 25.7 30.3 103.5 32.2`
→ p50 ≈ 31ms, but ~15% of samples land at 100–130ms.

**Diagnosis: no packet loss, no bandwidth problem — the pain is jitter / tail
latency.** Median ~30ms is comfortable; the ~1-in-7 spike to 3–4× median is what
makes a TUI feel unresponsive.

Note rem-dev's own leg into Cloudflare is fast *and* stable (7.7ms ±1.5). The
instability is in the Cloudflare-egress → public-internet → GCP segment.

## ssh connection reuse

No `ControlMaster`/`ServerAliveInterval` configured anywhere (`~/.ssh/config` is
not dotfiles-managed).

| | per-connection wall time |
| --- | --- |
| fresh connection | 0.75 / 0.70 / 0.79 s |
| multiplexed (`ControlPersist`) | 0.23 / 0.07 / 0.10 / 0.14 / 0.08 s |

≈ **7–9× faster** for repeat connections. Free; no infra change.

## The WARP workaround on rem-dev

`nft list table inet sshkeep`:

```
chain prerouting { type filter hook prerouting priority mangle;
    iifname "ens4" ct state new ct mark set 0x00005222 }
chain output { type route hook output priority mangle;
    ct mark 0x00005222 meta mark set 0x000100cf }
```

Mechanism:
1. Any **inbound-initiated** connection arriving on the physical NIC gets
   conntrack mark `0x5222`.
2. Replies on that connection get *packet* fwmark `0x100cf` — the mark WARP uses
   for its own tunnel traffic.
3. `ip rule` 76 is `not from all fwmark 0x100cf lookup 65743`, so the `0x100cf`
   mark makes replies **skip** the WARP routing table, fall through to `main`,
   and egress `ens4`. Routing stays symmetric → ssh is not bricked.
4. `table inet cloudflare-warp` has `policy drop` on input *and* output; the
   first rule in each is `ct mark 0x00005222 accept`, so WARP's own kill-switch
   doesn't drop the inbound session or its replies.

Verified directly: tcpdump on `ens4` shows the SYN arriving from the Cloudflare
egress IP **and the SYN-ACK leaving on `ens4`** (not on `CloudflareWARP`).

`type route hook output` matters — it forces a route re-lookup after the mark is
set. Without it the mark would be applied too late to change routing.

Properties that constrain the solution space:
- **Protocol-agnostic** — the prerouting rule has no `tcp`/`udp` match, so UDP
  and ICMP are marked identically to TCP.
- **Inbound-initiated only** — `ct state new` + `iifname ens4`. Anything the VM
  *dials out* (reverse tunnel, tailscaled, cloudflared) rides inside WARP.
- `ip rule` 77 (`from all fwmark 0x5222 lookup 177`, table 177 = default via
  `10.164.0.1`) appears to be a redundant second path; the live mechanism is the
  `0x100cf` mark. Harmless but dead.

### Side effect: intra-VPC traffic from rem-dev is broken

WARP's exclude list covers `10.0.0.0/16`, but the VM sits on `10.164.0.125`, and
table 65743 routes `10.128.0.0/9` into `CloudflareWARP`. Confirmed:
`ping 10.164.0.1` → **100% loss**. So rem-dev cannot reach its own subnet
gateway or other VMs on the internal network. (`169.254.169.254` still works —
`169.254.0.0/16` *is* excluded, which is why GCP metadata resolves.)

## GCP firewall: only tcp:22 is reachable

`gcloud compute firewall-rules list --project=jetbrains-grazie` — **no ingress
rule allows UDP from the internet.** UDP is permitted only from internal ranges
(`10.128.0.0/9`, `192.168.0.0/16`, GKE node tags).

Open to `0.0.0.0/0`: `tcp:22` (rules `furda-ssh`, `karol`), `tcp:80`, `tcp:443`,
`tcp:8081`, `tcp:8000`, `tcp:5000`, `icmp`.

Verified empirically with unbuffered `tcpdump -nUi ens4`:
- positive control — a new TCP/22 SYN was captured ✅
- 3 × UDP probes to `60001` — **zero packets captured** ❌

(First attempt at this test used buffered tcpdump and captured nothing *even for
the control*; the result above is the corrected run.)

→ **mosh cannot work today.** Not because of the WARP workaround — the nft rules
would handle its UDP correctly — but because the VPC firewall drops inbound UDP.

Aside: the capture also caught SSH brute-force scans from
`197.220.92.185`, `51.91.96.79`, `103.179.198.19` within ~12s, because `tcp:22`
is open to the world.

## WARP-to-WARP is blocked by org policy

Both devices are in the same Zero Trust org, so reaching rem-dev at
`100.96.12.184` would keep traffic on Cloudflare's backbone end-to-end — no
inbound firewall rule, no public exposure.

It does not route. The split-tunnel exclude list contains
`100.96.0.0/11 (RECOMMENDED FOR EGRESS POLICIES)`, which **contains**
`100.96.12.184`, so the Mac sends it outside the tunnel:

```
route -n get 100.96.12.184 → gateway: 192.168.2.254, interface: en0
ping  → 100% loss ;  TCP/22 → timed out
```

Every one of these settings is marked `(network policy)` and
`Allow Mode Switch: false` — changing them is a corporate Zero Trust change, not
self-serve.
