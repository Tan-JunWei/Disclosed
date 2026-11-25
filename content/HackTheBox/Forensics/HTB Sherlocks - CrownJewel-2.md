---
tags:
  - Forensics
  - beginner
  - EventLogs
  - NTDS
  - ActiveDirectory
modified: 2026-11-19T09:00:00+08:00
---

## Sherlock Scenario

> [!todo] Sherlock Overview
>
> Forela's Domain environment is pure chaos. Just got another alert from the Domain controller of NTDS.dit database being exfiltrated. Just one day prior you responded to an alert on the same domain controller where an attacker dumped NTDS.dit via vssadmin utility. However, you managed to delete the dumped files kick the attacker out of the DC, and restore a clean snapshot. Now they again managed to access DC with a domain admin account with their persistent access in the environment. This time they are abusing ntdsutil to dump the database. Help Forela in these chaotic times!!

This is the sequel to [[HTB Sherlocks - CrownJewel-1]]. The goal is the same, a copy of `NTDS.dit`, but this time the attacker used `ntdsutil`, the built-in Active Directory maintenance tool. Its "install from media" feature (`ntdsutil "ac i ntds" "ifm" "create full <folder>"`) exists to seed new Domain Controllers, and it writes out a complete, consistent copy of the database and the registry hives. It still takes a shadow copy under the hood, and the database engine logs every step, which is what this investigation follows.

The evidence came as a `zip` file:

```
Artifacts/
├───SYSTEM.evtx
├───SECURITY.evtx
└───APPLICATION.evtx
```

I converted all three logs to CSV with EvtxECmd and opened them in Timeline Explorer:

```powershell
.\EvtxECmd.exe -f 'path\to\SYSTEM.evtx' --csv "path\to\output\directory" --csvf SYSTEM_output.csv
.\EvtxECmd.exe -f 'path\to\SECURITY.evtx' --csv "path\to\output\directory" --csvf SECURITY_output.csv
.\EvtxECmd.exe -f 'path\to\APPLICATION.evtx' --csv "path\to\output\directory" --csvf APPLICATION_output.csv
```

## Task 1: When the shadow copy service started

> When utilizing ntdsutil.exe to dump NTDS on disk, it simultaneously employs the Microsoft Shadow Copy Service. What is the most recent timestamp at which this service entered the running state, signifying the possible initiation of the NTDS dumping process?

As in CrownJewel-1, service starts are Event ID **7036** in the System log. I filtered `SYSTEM_output.csv` for that ID and the text `Microsoft Shadow Copy Service`, then took the most recent `running` event:

![[HTB CrownJewel-2 - identifying Microsoft Shadow Copy Service execution timestamp.png]]

> [!NOTE] Answer
> `2024-05-15 05:39:55`

## Task 2: Where the database was dumped

> Identify the full path of the dumped NTDS file.

There was no `$MFT` this time, but the Application log records what the database engine does. I searched `APPLICATION_output.csv` for `.dit`:

![[HTB CrownJewel-2 - identifying new file location of ntds dit file.png]]

The `Map Description` reads "The database engine created a new database", and `Payload Data1` gives the new file's path. The `Active Directory` subfolder is the layout `ntdsutil ifm` always produces.

> [!NOTE] Answer
> `C:\Windows\Temp\dump_tmp\Active Directory\ntds.dit`

## Task 3: When the dump was created

> When was the database dump created on the disk?

The `Time Created` of the same event, one second after the shadow copy service started:

> [!NOTE] Answer
> `2024-05-15 05:39:56`

## Task 4: When the dump was complete

> When was the newly dumped database considered complete and ready for use?

Once the copy is finished, the database engine detaches it (ESENT Event ID **327**, "The database engine detached a database"). After that the file is closed and consistent, ready to be taken away and cracked.

![[HTB CrownJewel-2 - ntds database engine detached.png]]

> [!NOTE] Answer
> `2024-05-15 05:39:58`

## Task 5: The event source

> Event logs use event sources to track events coming from different sources. Which event source provides database status data like creation and detachment?

The `Provider` column of these events names the source:

![[HTB CrownJewel-2 - ntds dit event source provider.png]]

> [!tip] ESENT
>
> ESENT (the Extensible Storage Engine) is the database engine built into Windows. Active Directory stores `ntds.dit` in it, so its events in the Application log show when an AD database is created, attached or detached, which is exactly the trail an `ntdsutil` dump leaves behind.

> [!NOTE] Answer
> `ESENT`

## Task 6: The groups ntdsutil checked

> When ntdsutil.exe is used to dump the database, it enumerates certain user groups to validate the privileges of the account being used. Which two groups are enumerated by the ntdsutil.exe process? Give the groups in alphabetical order joined by comma space.

Group enumeration is Event ID **4799** in the Security log. I filtered for it and searched for `ntdsutil.exe` in the caller process:

![[HTB CrownJewel-2 - ntdsutil exe enumerating local groups.png]]

These are the same two groups the shadow copy service checked in CrownJewel-1, which makes sense, since only members of these groups may take a backup of the Domain Controller.

> [!NOTE] Answer
> `Administrators, Backup Operators`

## Task 7: When the malicious session started

> Now you are tasked to find the Login Time for the malicious Session. Using the Logon ID, find the Time when the user logon session started.

The obvious event for a logon, 4624 ("An account was successfully logged on"), returned nothing for that day. On a Domain Controller, though, a domain logon also shows up in Kerberos events:

- **4768**: a Kerberos ticket-granting ticket (TGT) was requested, the first step of a domain logon
- **4769**: a Kerberos service ticket was requested to access a specific service

Filtering for 4768 on `2024-05-15` left three events. Two were the Domain Controller's own machine account `DC01$`. The third was a TGT for `FORELA\Administrator`, the domain admin account the scenario says the attacker came back with, a few minutes before the dump:

![[HTB CrownJewel-2 - malicious logon by attacker after ntds dump.png]]

> [!NOTE] Answer
> `2024-05-15 05:36:31`

## Timeline

| Time (UTC)          | Source           | Event                                                       |
| ------------------- | ---------------- | ----------------------------------------------------------- |
| 2024-05-15 05:36:31 | Security log     | TGT requested for `FORELA\Administrator` (Event 4768)       |
| 2024-05-15 05:39:55 | System log       | Microsoft Shadow Copy Service starts (Event 7036)           |
| 2024-05-15 05:39:56 | Application log  | ESENT creates `C:\Windows\Temp\dump_tmp\Active Directory\ntds.dit` |
| 2024-05-15 05:39:58 | Application log  | ESENT detaches the database: the dump is complete (Event 327) |

#### Similar

- [[HTB Sherlocks - CrownJewel-1]]: the first dump, done with `vssadmin` and traced through the MFT
- [[HTB Sherlocks - Campfire-1]]: Kerberos events on a Domain Controller
