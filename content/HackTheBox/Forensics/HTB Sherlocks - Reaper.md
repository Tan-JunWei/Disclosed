---
tags:
  - Forensics
  - beginner
  - pcap
  - Wireshark
  - EventLogs
  - LLMNR
  - NTLM
  - ActiveDirectory
modified: 2026-11-19T09:00:00+08:00
---

## Sherlock Scenario

> [!todo] Sherlock Overview
>
> Our SIEM alerted us to a suspicious logon event which needs to be looked at immediately . The alert details were that the IP Address and the Source Workstation name were a mismatch .You are provided a network capture and event logs from the surrounding time around the incident timeframe. Corelate the given evidence and report back to your SOC Manager.

The evidence was a packet capture and a Security event log. The alert hinted at what to look for: a logon that claimed to come from one workstation but arrived from a different IP address. That is what an NTLM relay looks like. The attacker tricks a victim into authenticating to them, then forwards that authentication to another machine and logs in as the victim, so the logon carries the victim's workstation name but the attacker's IP.

> [!tip] NTLM relay
>
> [[HTB Sherlocks - Noxious]] showed how LLMNR poisoning makes a victim send its NTLM authentication to the attacker. There, the captured hash was cracked offline. In a relay, the attacker never needs the password: they pass the authentication straight on to another machine and get a session there as the victim. This only works against machines that do not require SMB signing, a setting that makes each side cryptographically sign its messages so they cannot be forwarded.

## Task 1: Forela-Wkstn001's address

> What is the IP Address for Forela-Wkstn001?

Machines include their hostname when they request an address over DHCP, so I filtered for `dhcp` in Wireshark and found the request from `Forela-Wkstn001`:

![[HTB Reaper - finding IP address by referring to hostname.png]]

> [!NOTE] Answer
> `172.17.79.129`

## Task 2: Forela-Wkstn002's address

> What is the IP Address for Forela-Wkstn002?

This time I searched the packet bytes for the string `Forela-Wkstn002`:

![[HTB Reaper - finding IP address by referring to hostname using string matching.png]]

> [!NOTE] Answer
> `172.17.79.136`

## Task 3: The account whose hash was stolen

> What is the username of the account whose hash was stolen by attacker?

I converted the Security log to CSV with EvtxECmd and opened it in Timeline Explorer:

```powershell
.\EvtxECmd.exe -f 'path\to\Security.evtx' --csv "path\to\output\directory" --csvf Security_output.csv
```

Filtering for Event ID **4624** (a successful logon) surfaced a logon by `FORELA\arthur.kyle` whose `Remote Host` field read `FORELA-WKSTN002 (172.17.79.135)`. Task 2 had just shown that Forela-Wkstn002 is `172.17.79.136`, so this was exactly the mismatch the SIEM flagged.

![[HTB Reaper - finding hash-intercepted user.png]]

The event's `Payload` gives the details:

```json
{"EventData":{"Data":[{"@Name":"SubjectUserSid","#text":"S-1-0-0"},{"@Name":"SubjectUserName","#text":"-"},{"@Name":"SubjectDomainName","#text":"-"},{"@Name":"SubjectLogonId","#text":"0x0"},{"@Name":"TargetUserSid","#text":"S-1-5-21-3239415629-1862073780-2394361899-1601"},{"@Name":"TargetUserName","#text":"arthur.kyle"},{"@Name":"TargetDomainName","#text":"FORELA"},{"@Name":"TargetLogonId","#text":"0x64A799"},{"@Name":"LogonType","#text":"3"},{"@Name":"LogonProcessName","#text":"NtLmSsp "},{"@Name":"AuthenticationPackageName","#text":"NTLM"},{"@Name":"WorkstationName","#text":"FORELA-WKSTN002"},{"@Name":"LogonGuid","#text":"00000000-0000-0000-0000-000000000000"},{"@Name":"TransmittedServices","#text":"-"},{"@Name":"LmPackageName","#text":"NTLM V2"},{"@Name":"KeyLength","#text":"128"},{"@Name":"ProcessId","#text":"0x0"},{"@Name":"ProcessName","#text":"-"},{"@Name":"IpAddress","#text":"172.17.79.135"},{"@Name":"IpPort","#text":"40252"},{"@Name":"ImpersonationLevel","#text":"%%1833"},{"@Name":"RestrictedAdminMode","#text":"-"},{"@Name":"TargetOutboundUserName","#text":"-"},{"@Name":"TargetOutboundDomainName","#text":"-"},{"@Name":"VirtualAccount","#text":"%%1843"},{"@Name":"TargetLinkedLogonId","#text":"0x0"},{"@Name":"ElevatedToken","#text":"%%1843"}]}}
```

- `LogonType` is `3`, a network logon: the account authenticated over the network rather than at the keyboard.
- `AuthenticationPackageName` is `NTLM` (NTLMv2), which is what a relay forwards.
- `WorkstationName` claims `FORELA-WKSTN002`, but `IpAddress` is `172.17.79.135`.

The packet capture backs this up. Filtering for SMB traffic to and from that unknown address showed it taking part in `arthur.kyle`'s NTLM authentication as a machine in the middle:

```
smb2 && ip.addr==172.17.79.135
```

![[HTB Reaper - intercepting NTLM hash of target user.png]]

> [!NOTE] Answer
> `arthur.kyle`

## Task 4: The attacker's device

> What is the IP Address of Unknown Device used by the attacker to intercept credentials?

The same capture shows the unknown device's address in the IPv4 header, and it matches the `IpAddress` in the logon event:

> [!NOTE] Answer
> `172.17.79.135`

## Task 5: The share the victim navigated to

> What was the fileshare navigated by the victim user account?

The victim was the real Forela-Wkstn002 at `172.17.79.136`, so I filtered for its SMB traffic:

```
smb2 && ip.addr==172.17.79.136
```

![[HTB Reaper - identify file share access by remote machine.png]]

The tree connect requests show Forela-Wkstn002 asking DC01 over and over for a share called `Trip`. DC01 rejects every one with `STATUS_BAD_NETWORK_NAME`, because no such share exists.

> [!NOTE] Answer
> `\\DC01\Trip`

## Task 6: The source port

> What is the source port used to logon to target workstation using the compromised account?

The `IpPort` value in the logon event's `Payload` from Task 3:

```json
{"@Name":"IpPort","#text":"40252"}
```

> [!NOTE] Answer
> `40252`

## Task 7: The logon ID

> What is the Logon ID for the malicious session?

Also in the `Payload`, as `TargetLogonId`. This ID ties together every later event from the same session, which is how the rest of the attacker's activity on the machine could be traced.

```json
{"@Name":"TargetLogonId","#text":"0x64A799"}
```

> [!NOTE] Answer
> `0x64A799`

## Task 8: The mismatched name and address

> The detection was based on the mismatch of hostname and the assigned IP Address. What is the workstation name and the source IP Address from which the malicious logon occur?

From the same event, the claimed workstation name and the real source address:

> [!NOTE] Answer
> `FORELA-WKSTN002, 172.17.79.135`

## Task 9: When the malicious logon happened

> At what UTC time did the the malicious logon happen?

The event's `Time Created`:

![[HTB Reaper - identifying the UTC time during suspicious logon of arthur kyle accout.png]]

> [!NOTE] Answer
> `2024-07-31 04:55:16`

## Task 10: The share used during authentication

> What is the share Name accessed as part of the authentication process by the malicious tool used by the attacker?

I looked at the Security events around the malicious logon. In the same second, from the same address and port (`172.17.79.135:40252`), was Event ID **5140**, which Windows logs the first time a session accesses a network share:

![[HTB Reaper - identifying fileshare accessed as part of authentication tool.png]]

`IPC$` is the inter-process communication share. Relay tools such as `ntlmrelayx` connect to it as soon as the relayed logon succeeds, because it gives access to named pipes for remote administration.

> [!NOTE] Answer
> `\\*\IPC$`

## Timeline

| Time (UTC)          | Event                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------- |
| Before 04:55:16     | `arthur.kyle`'s NTLM authentication from Forela-Wkstn002 is intercepted by `172.17.79.135` |
| 2024-07-31 04:55:16 | The relayed authentication logs in as `arthur.kyle` (logon ID `0x64A799`, source port `40252`), claiming to be FORELA-WKSTN002 |
| 2024-07-31 04:55:16 | The same connection opens `\\*\IPC$` (Event 5140)                                     |
| 2024-07-31 04:55:28 | Forela-Wkstn002 repeatedly requests `\\DC01\Trip`, which DC01 rejects                  |

#### Similar

- [[HTB Sherlocks - Noxious]]: the same LLMNR poisoning, with the hash cracked instead of relayed
- [[HTB Sherlocks - Campfire-2]]: tracking an attacker's IP through Domain Controller logs
