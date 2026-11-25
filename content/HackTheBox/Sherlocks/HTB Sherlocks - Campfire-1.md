---
tags:
  - Forensics
  - beginner
  - EventLogs
  - Prefetch
  - Kerberoasting
  - ActiveDirectory
modified: 2026-11-19T09:00:00+08:00
---

## Sherlock Scenario

> [!todo] Sherlock Overview
>
> Alonzo Spotted Weird files on his computer and informed the newly assembled SOC Team. Assessing the situation it is believed a Kerberoasting attack may have occurred in the network. It is your job to confirm the findings by analyzing the provided evidence.
>
> You are provided with:
>
> 1. Security Logs from the Domain Controller
> 2. PowerShell-Operational Logs from the affected workstation
> 3. Prefetch Files from the affected workstation

The evidence came as a `zip` file with this layout:

```
Triage/
├───Domain Controller/
|   └───SECURITY-DC.evtx
└───Workstation/
    |───Powershell-Operational.evtx
    └───2024-05-21T033012_triage_asset/
        └───C/
            └───Windows/
                └───prefetch/
```

- `SECURITY-DC.evtx` is the Domain Controller's Security log, which records authentication and Kerberos activity for the whole domain.
- `Powershell-Operational.evtx` is from the workstation and records PowerShell activity, including the script blocks that were run.
- The `prefetch` folder holds the workstation's prefetch files. Windows creates one per program to speed up its next launch, and each records the program's path, how many times it ran and when, which makes them valuable evidence of execution.

> [!tip] Kerberoasting
>
> Kerberos is the protocol Active Directory uses for logins. To use a service such as a database, a user asks the Domain Controller for a service ticket (TGS). Any domain user may request a ticket for any account that runs a service, meaning any account with a Service Principal Name (SPN). Part of that ticket is encrypted with the service account's password hash, so an attacker can request one and crack the password offline, without ever touching the service itself.

## Preparing the evidence

I converted both event logs to CSV with EvtxECmd:

```powershell
.\EvtxECmd.exe -f 'path\to\SECURITY-DC.evtx' --csv "path\to\output\directory" --csvf SECURITY-DC_output.csv
.\EvtxECmd.exe -f 'path\to\Powershell-Operational.evtx' --csv "path\to\output\directory" --csvf PowerShell_Operational_Workstation_output.csv
```

and parsed the prefetch folder with PECmd:

```powershell
.\PECmd.exe -d 'path\to\C\Windows\prefetch' --csv "path\to\output\directory" --csvf PECmd_Processed_Prefetch_Output.csv
```

All three outputs can then be opened in Timeline Explorer.

## Task 1: When the Kerberoasting happened

> Analyzing Domain Controller Security Logs, can you confirm the UTC date & time when the kerberoasting activity occurred?

Service ticket requests are logged on the Domain Controller as Event ID **4769** ("A Kerberos service ticket was requested"). I filtered `SECURITY-DC_output.csv` for that ID and looked at the `TicketEncryptionType` of each request.

Modern domains issue AES tickets by default. Kerberoasting tools deliberately ask for `0x17` (RC4-HMAC) instead, because RC4 tickets are far quicker to crack offline than AES-128 or AES-256 ones. One request stood out with exactly that encryption type:

![[HTB Campfire-1 - detecting kerberoasting using timelineexplorer.png]]

Its `Time Created` gives the time of the attack.

> [!NOTE] Answer
> `2024-05-21 03:18:09`

## Task 2: The targeted service

> What is the Service Name that was targeted?

The same event names the service the ticket was requested for:

![[HTB Campfire-1 - detecting kerberoasting using timelineexplorer.png]]

> [!NOTE] Answer
> `MSSQLService`

## Task 3: The attacking workstation

> It is really important to identify the Workstation from which this activity occurred. What is the IP Address of the workstation?

The event's `Payload` records the address the request came from:

![[HTB Campfire-1 - detecting kerberoasting attacker IP.png]]

> [!NOTE] Answer
> `172.17.79.129`

## Task 4: The enumeration script

> Now that we have identified the workstation, a triage including PowerShell logs and Prefetch files are provided to you for some deeper insights so we can understand how this activity occurred on the endpoint. What is the name of the file used to Enumerate Active directory objects and possibly find Kerberoastable accounts in the network?

Before Kerberoasting, an attacker needs to find accounts with Service Principal Names, which means enumerating Active Directory. I searched the workstation's PowerShell log for `Get-ADObject`, a cmdlet that AD enumeration scripts commonly define or call. All five hits pointed at the same script:

![[HTB Campfire-1 - powerview used to enumerate AD information.png]]

PowerView is part of PowerSploit and is one of the most common tools for mapping out a domain, including listing Kerberoastable users.

> [!NOTE] Answer
> `powerview.ps1`

## Task 5: When PowerView ran

> When was this script executed? (UTC)

The `Time Created` column of the same events shows when the script ran:

![[HTB Campfire-1 - powerview execution timestamp identified in powerview.png]]

This is under two minutes before the RC4 ticket request from Task 1, which fits enumeration followed by the attack.

> [!NOTE] Answer
> `2024-05-21 03:16:32`

## Task 6: The Kerberoasting tool

> What is the full path of the tool used to perform the actual kerberoasting attack?

The PowerShell log only covered the enumeration. Nothing in it requested service tickets, so the attack itself was run by a separate program. That is what prefetch records, so I moved on to `PECmd_Processed_Prefetch_Output.csv`.

![[HTB Campfire-1 - detecting rubeus full file path.png]]

`RUBEUS.EXE` stood out straight away. Rubeus is a well-known toolkit for abusing Kerberos, and its `kerberoast` command does exactly what was seen in Task 1. Its full path is listed in the `Files Loaded` column:

```
< --- SNIP --- >
\VOLUME{01d951602330db46-52233816}\USERS\ALONZO.SPIRE\DOWNLOADS\RUBEUS.EXE
< --- SNIP --- >
```

Rubeus was sitting in user `Alonzo.spire`'s Downloads folder.

> [!NOTE] Answer
> `C:\Users\Alonzo.spire\Downloads\Rubeus.exe`

## Task 7: When Rubeus ran

> When was the tool executed to dump credentials? (UTC)

The prefetch entry's `Last Run` time gives the moment Rubeus was executed:

![[HTB Campfire-1 - detecting rubeus execution timestamp for kerberoasting attack.png]]

This is one second before the Domain Controller logged the RC4 ticket request in Task 1.

> [!NOTE] Answer
> `2024-05-21 03:18:08`

## Timeline

| Time (UTC)          | Source            | Event                                                     |
| ------------------- | ----------------- | --------------------------------------------------------- |
| 2024-05-21 03:16:32 | PowerShell log    | `powerview.ps1` enumerates Active Directory               |
| 2024-05-21 03:18:08 | Prefetch          | `Rubeus.exe` runs from Alonzo.spire's Downloads folder    |
| 2024-05-21 03:18:09 | DC Security log   | RC4 service ticket requested for `MSSQLService` (Event 4769) |

#### Similar

- [[HTB Sherlocks - Campfire-2]]: the next case in the series, an AS-REP roasting attack
- [[HTB Sherlocks - CrownJewel-2]]: tracing an attack through Domain Controller event logs
