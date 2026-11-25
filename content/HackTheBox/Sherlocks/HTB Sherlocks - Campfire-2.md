---
tags:
  - Forensics
  - beginner
  - EventLogs
  - ASREProasting
  - ActiveDirectory
modified: 2026-11-19T09:00:00+08:00
---

## Sherlock Scenario

> [!todo] Sherlock Overview
>
> Forela's Network is constantly under attack. The security system raised an alert about an old admin account requesting a ticket from KDC on a domain controller. Inventory shows that this user account is not used as of now so you are tasked to take a look at this. This may be an AsREP roasting attack as anyone can request any user's ticket which has preauthentication disabled.

> [!tip] AS-REP roasting
>
> When a user logs in to an Active Directory domain, the Domain Controller gives them a ticket-granting ticket (TGT), which proves who they are for the rest of the session. Normally the user must first prove they know their password, a step called Kerberos pre-authentication. If pre-authentication is disabled on an account, anyone can ask for that account's TGT. Part of the reply (the AS-REP) is encrypted with the account's password hash, so it can be cracked offline.

The only evidence this time was the Domain Controller's Security log, `SECURITY-DC.evtx`, which I converted to CSV with EvtxECmd and opened in Timeline Explorer:

```powershell
.\EvtxECmd.exe -f 'path\to\SECURITY-DC.evtx' --csv "path\to\output\directory" --csvf SECURITY-DC_output.csv
```

## Task 1: When the attack happened

> When did the ASREP Roasting attack occur, and when did the attacker request the Kerberos ticket for the vulnerable user?

TGT requests are logged as Event ID **4768** ("A Kerberos authentication ticket (TGT) was requested"), so I filtered for that ID. Two details in each event separate an AS-REP roast from a normal logon:

- `PreAuthType` reads `Logon without Pre-Authentication` instead of the usual `PA-ENC-TIMESTAMP`.
- `TicketEncryptionType` is `RC4-HMAC` instead of AES256. Roasting tools ask for RC4 because it is much faster to crack with `hashcat` or `john` than AES.

One event matched both:

![[HTB Campfire-2 - detecting asrep roasting within timeline explorer.png]]

Its `Time Created` is when the attacker requested the ticket.

> [!NOTE] Answer
> `2024-05-29 06:36:40`

## Task 2: The targeted account

> Please confirm the User Account that was targeted by the attacker.

`Payload Data1` of the same event names the account the ticket was issued for:

![[HTB Campfire-2 - detecting asreproastable user using timeline explorer.png]]

> [!NOTE] Answer
> `arthur.kyle`

## Task 3: The account's SID

> What was the SID of the account?

The account's SID is in the event's `Payload`:

![[HTB Campfire-2 - service sid of asrep roasting attack.png]]

> [!NOTE] Answer
> `S-1-5-21-3239415629-1862073780-2394361899-1601`

## Task 4: The compromised workstation

> It is crucial to identify the compromised user account and the workstation responsible for this attack. Please list the internal IP address of the compromised asset to assist our threat-hunting team.

The `Payload` also records the address the request came from:

![[HTB Campfire-2 - ip address affected in asrep roasting attack.png]]

> [!NOTE] Answer
> `172.17.79.129`

## Task 5: The account the attacker used

> We do not have any artifacts from the source machine yet. Using the same DC Security logs, can you confirm the user account used to perform the ASREP Roasting attack so we can contain the compromised account/s?

The AS-REP request itself carries no attacker identity, because no authentication is needed to make one. But whoever was on `172.17.79.129` was using some domain account, and that account would show up as soon as the machine authenticated for anything else. So I kept the IP filter and looked at the events right after the attack at `06:36:40`.

![[HTB Campfire-2 - check source IP for asrep roastable attack.png]]

The first activity from `172.17.79.129` after the attack came at `2024-05-29 06:37:49`, and the second event in the list names the account behind it in `Payload Data1`.

> [!NOTE] Answer
> `happy.grunwald`

## Timeline

| Time (UTC)          | Event                                                                     |
| ------------------- | ------------------------------------------------------------------------- |
| 2024-05-29 06:36:40 | RC4 TGT without pre-authentication issued for `arthur.kyle` (Event 4768), requested from `172.17.79.129` |
| 2024-05-29 06:37:49 | The same machine authenticates as `happy.grunwald`                        |

#### Similar

- [[HTB Sherlocks - Campfire-1]]: the first case in the series, a Kerberoasting attack
- [[HTB Sherlocks - Reaper]]: linking an attacker's IP to the accounts it used
