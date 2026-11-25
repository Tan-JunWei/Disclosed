---
tags:
  - Forensics
  - beginner
  - pcap
  - Wireshark
  - base64
modified: 2026-11-20T09:00:00+08:00
---

## Sherlock Scenario

> [!todo] Sherlock Overview
>
> We receive a log indicating a possible attack, can you gather information from the .pcap file?
>
> Log file: Desktop/ChallengeFile/webserver.em0.pcap

The only evidence was `webserver.em0.pcap`, a short capture of 65 packets between a client and a web server, which I opened in Wireshark.

> [!tip] HTTP Basic Authentication
>
> Basic Authentication sends the username and password in an `Authorization: Basic <value>` header, where the value is just `username:password` encoded in Base64. Base64 is an encoding, not encryption, so anyone who can see the traffic can read the credentials. Over plain HTTP that means anyone on the network path.

## Task 0: Number of GET requests

> How many HTTP GET requests are in pcap?

I filtered for GET requests:

```
http.request.method==GET
```

![[HTB Http Basic Auth - finding number of http get requests.png]]

> [!NOTE] Answer
> `5`

## Task 1: The server's operating system

> What is the server operating system?

Servers often announce themselves in the `Server` response header. I right-clicked one of the requests and chose `Follow > HTTP Stream` to read the whole exchange:

![[HTB Http Basic Auth - fingerprinting HTTP server using wireshark.png]]

The server identifies itself as `Apache/2.2.15 (FreeBSD) DAV/2 mod_ssl/2.2.15 OpenSSL/0.9.8n`. The operating system is in brackets.

> [!NOTE] Answer
> `FreeBSD`

## Task 2: The web server software

> What is the name and version of the web server software?

The first part of the same `Server` header:

> [!NOTE] Answer
> `Apache/2.2.15`

## Task 3: The OpenSSL version

> What is the version of OpenSSL running on the server?

The last part of the same `Server` header. Version information this detailed is useful to an attacker, who can match it against known vulnerabilities. OpenSSL 0.9.8n dates from 2010.

> [!NOTE] Answer
> `OpenSSL/0.9.8n`

## Task 4: The client's user agent

> What is the client's user-agent information?

The client's requests (shown in red in the stream view) carry a `User-Agent` header:

![[HTB Http Basic Auth - client agent in HTTP request found in wireshark.png]]

Lynx is a text-only browser that runs in a terminal. Four of the five requests used it, all from `192.168.63.20`. The fifth came from a different client, `192.168.63.50`, which identified itself as Internet Explorer 6 on Windows XP.

> [!NOTE] Answer
> `Lynx/2.8.7rel.1 libwww-FM/2.14 SSL-MM/1.4.1 OpenSSL/0.9.8n`

## Task 5: The username

> What is the username used for Basic Authentication?

The capture shows the usual Basic Authentication exchange. A request without credentials gets `401 Unauthorized`, and the browser retries with an `Authorization` header. The second request in the capture got a `200 OK` and the Apache "It works!" page, so the credentials it sent were accepted.

![[HTB Http Basic Auth - checking base64 encoded plaintext creds in http traffic.png]]

Its header read:

```
Authorization: Basic d2ViYWRtaW46VzNiNERtMW4=
```

Decoding the value:

```bash
ubuntu@DESKTOP-R1DTBOS:~$ echo "d2ViYWRtaW46VzNiNERtMW4=" | base64 -d
webadmin:W3b4Dm1n
```

The part before the colon is the username.

> [!NOTE] Answer
> `webadmin`

## Task 6: The password

> What is the user password used for Basic Authentication?

The part after the colon in the decoded header:

> [!NOTE] Answer
> `W3b4Dm1n`

#### Similar

- [[HTB Sherlocks - Port Scan Activity]]: another short packet capture investigation
- [[HTB Sherlocks - Noxious]]: credentials recovered from network traffic, this time an NTLM hash that had to be cracked
