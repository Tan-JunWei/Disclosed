---
title: HackTheBox Sherlocks
modified: 2026-11-20T09:00:00+08:00
showTags: false
---

[HackTheBox](https://www.hackthebox.com/) is a cybersecurity training platform, and Sherlocks are its defensive labs. Instead of attacking a target, you play the investigator. Each Sherlock opens with an incident scenario and hands over the evidence collected from the affected systems, such as Windows event logs, file system records or a packet capture. A series of questions then leads you through what the attacker did, how they did it and when.

Six of the Sherlocks here form a series set at Forela, a fictional company. Each one investigates a different attack on Forela's Active Directory, the Windows service that manages the accounts and logins across a company's network:

- [[HTB Sherlocks - Campfire-1|Campfire-1]]: Kerberoasting, cracking a service account's password from a Kerberos ticket
- [[HTB Sherlocks - Campfire-2|Campfire-2]]: AS-REP roasting, the same idea against accounts that skip a login check
- [[HTB Sherlocks - Noxious|Noxious]]: LLMNR poisoning, tricking a workstation into sending its credentials to the attacker
- [[HTB Sherlocks - Reaper|Reaper]]: NTLM relay, reusing those intercepted credentials to log in somewhere else
- [[HTB Sherlocks - CrownJewel-1|CrownJewel-1]] and [[HTB Sherlocks - CrownJewel-2|CrownJewel-2]]: stealing the domain's password database from a Domain Controller, once with `vssadmin` and once with `ntdsutil`

The others stand alone: [[HTB Sherlocks - BFT|BFT]] traces a phishing download through the NTFS Master File Table, and [[HTB Sherlocks - Http Basic Auth|Http Basic Auth]] and [[HTB Sherlocks - Port Scan Activity|Port Scan Activity]] are short packet capture exercises.

Each writeup answers the Sherlock's questions in order, shows where every answer came from and explains why that evidence matters. Most end with a timeline of the attack. HackTheBox does not allow writeups for active Sherlocks, so only retired ones are published here.
