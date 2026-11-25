---
tags:
  - Forensics
  - medium
  - Netcat
  - Binary
  - Python
modified: 2026-11-18T09:00:00+08:00
---

## Challenge Description

![[HNF26 Custodians Cadence.png]]

The challenge hosted a network service on port 2323 with the following description:

> [!todo] Description
>
> The custodian of retro-01 still logs in at odd hours. The machine is long gone, but the feed is live.
>
> Connect to the service, capture one full CYCLE_START ... CYCLE_END block, and figure out what the custodian is hiding in the timing.
>
> The obvious strings are not the flag.
>
> Connect: `nc 10.10.10.12 2323`

## Examining the log stream

I connected to the service with netcat to inspect the feed:

```bash
┌──(nepz㉿nepz)-[~]
└─$ nc 10.10.10.12 2323
retro-01 live custodian log
Legend:
    Timestamps: T+<planned monotonic ms>
    Event 0xE7 = CUSTODIAN_LOGIN
Capture one CYCLE_START ... CYCLE_END block.

[T+000000000000] node=retro-01 pid=0019 evt=0x00 user=custodian msg="CYCLE_START"
[T+000000000022] node=cache-05 pid=8073 evt=0x2B user=kube_svc4882 msg="auth ok user=web_root2968 src=10.119.5.225:80 method=ticket"
[T+000000000027] node=gw-02 pid=5768 evt=0xD2 user=ops_admin0105 msg="fs sync inode=f746329dfd bytes=452981"
[T+000000000056] node=retro-01 pid=3370 evt=0x3C user=mon_guest6633 msg="session open sess_ddb2e40eda66 by net_node6449 tty=pts/16"
[T+000000000111] node=app-03 pid=9384 evt=0xC8 user=ops_node3396 msg="net reset 10.88.208.129:9090 -> 10.154.48.183:8080 proto=udp"
...
[T+000000001000] node=app-03 pid=1717 evt=0xE7 user=custodian msg="custodian login"
[T+000000001104] node=cache-05 pid=3338 evt=0xE7 user=custodian msg="custodian login"
[T+000000001225] node=retro-01 pid=5896 evt=0xE7 user=custodian msg="session opened"
...
[T+000000031914] node=retro-01 pid=0019 evt=0x00 user=custodian msg="CYCLE_END"
```

The service streamed a continuous loop of mock system events bounded by `CYCLE_START` and `CYCLE_END` markers. Each line conformed to a standard structure:

```
[T+<timestamp>] node=<node> pid=<pid> evt=<event_code> user=<user> msg="<message>"
```

The header provided two critical pointers:

- The timestamps indicate planned monotonic milliseconds from the cycle start.
- Event code `0xE7` denotes `CUSTODIAN_LOGIN`.

## Covert timing channel analysis

The challenge prompt contained two key phrases:

- "hiding in the timing" pointed to information encoded in inter-arrival times rather than the text of the log messages.
- "still logs in at odd hours" hinted at odd and even parity.

Most events belonged to automated background accounts. To isolate the signal, I filtered only for events meeting the custodian login criteria:

- `user=custodian`
- `evt=0xE7`

| Field            | Example value      | Relevant | Reason                          |
| ---------------- | ------------------ | -------- | ------------------------------- |
| `[T+1000]`       | `1000`             | Yes      | Monotonic millisecond timestamp |
| `node=app-03`    | `app-03`           | No       | Machine host name               |
| `pid=1717`       | `1717`             | No       | Process ID                      |
| `evt=0xE7`       | `0xE7`             | Yes      | Custodian login event filter    |
| `user=custodian` | `custodian`        | Yes      | Target user filter              |
| `msg="..."`      | `"session opened"` | No       | Event description text          |

For each consecutive pair of custodian login timestamps, I computed the time interval:

$$
\Delta T_i = T_{i+1} - T_i
$$

Here, $T_i$ represents the timestamp of the current custodian event, and $T_{i+1}$ represents the timestamp of the subsequent one.

Every calculated gap fell between roughly 100 ms and 141 ms. Testing the parity of each interval aligned with the "odd hours" hint:

- Even values ($\Delta T \pmod 2 = 0$) represent binary `0`.
- Odd values ($\Delta T \pmod 2 = 1$) represent binary `1`.

The resulting sequence of bits is chunked into 8-bit bytes and converted into ASCII characters to recover the flag.

> [!note] Covert Timing Channels
> Covert timing channels transmit hidden data by altering the time intervals between legitimate system events rather than modifying the data payloads. Parity modulation (mapping odd and even delays to bits) allows data to pass unnoticed through standard logging infrastructure.
>
> Reference: [Wikipedia - Covert Channel](https://en.wikipedia.org/wiki/Covert_channel)

## Writing the solver

I wrote a Python script to connect to the live service, record one full cycle from `CYCLE_START` to `CYCLE_END`, calculate the inter-arrival intervals for `0xE7` custodian events, and decode the resulting bitstream into ASCII characters:

```python
import re
import socket
import sys

PAT = re.compile(r'\[T\+(\d+)\] node=(\S+) pid=(\d+) evt=(0x[0-9A-F]+) user=(\S+) msg="(.*)"')

def capture_cycle(host, port):
    with socket.create_connection((host, port), timeout=60) as sock:
        stream = sock.makefile("rb")
        lines = []
        started = False

        for raw in stream:
            line = raw.decode("latin-1").rstrip("\r\n")
            if 'msg="CYCLE_START"' in line:
                started = True
                lines = []
            if started:
                lines.append(line)
                if 'msg="CYCLE_END"' in line:
                    return lines

    raise RuntimeError("Connection closed before CYCLE_END")

def decode_cycle(lines):
    timestamps = []
    for line in lines:
        match = PAT.match(line)
        if match:
            evt = match.group(4)
            user = match.group(5)
            if user == "custodian" and evt == "0xE7":
                timestamps.append(int(match.group(1)))

    # Compute intervals between consecutive events
    deltas = [b - a for a, b in zip(timestamps, timestamps[1:])]

    # Map interval parity to binary bits
    bits = "".join(str(delta & 1) for delta in deltas)

    # Convert 8-bit binary chunks into ASCII
    chars = [chr(int(bits[i:i + 8], 2)) for i in range(0, len(bits) - 7, 8)]
    return "".join(chars)

if __name__ == "__main__":
    host = sys.argv[1] if len(sys.argv) > 1 else "10.10.10.12"
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 2323

    print(f"Connecting to {host}:{port}...")
    lines = capture_cycle(host, port)
    flag = decode_cycle(lines)
    print("Flag:", flag)
```

Running the script against the target service extracted the bits and printed the flag:

```bash
┌──(nepz㉿nepz)-[~]
└─$ python3 solve.py 10.10.10.12 2323
Connecting to 10.10.10.12:2323...
Flag: HNF26{cust0m_l0g5_t3ll_t4l3s}
```

> [!NOTE] Flag
> HNF26{cust0m_l0g5_t3ll_t4l3s}
