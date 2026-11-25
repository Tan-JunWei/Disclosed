---
tags:
  - Cryptography
  - easy
  - MorseCode
modified: 2026-11-18T09:00:00+08:00
---

## Challenge Description

![[HNF26 the-last-transmission.png]]

The challenge provided this Morse code message:

```
... .-.. ..- --- ... ..--.- .-. ..- --- ..--.- . ...- .- ...
```

The message was split into three groups by the `..--.-` symbol, which is Morse for an underscore. Decoding each group gave:

| Morse                  | Letter  |
| ---------------------- | ------- |
| `... .-.. ..- --- ...` | `SLUOS` |
| `.-. ..- ---`          | `RUO`   |
| `. ...- .- ...`        | `EVAS`  |

Joined by the underscores, that gave `SLUOS_RUO_EVAS`. I used the [MorseCode.World translator](https://morsecode.world/international/translator.html) for this.

![[HNF26 the-last-transmission 2.png]]

The words looked familiar, but they were backwards.

> [!note] Reverse the whole string
> Both the letters and the word order are backwards. Reversing only the individual words would leave them in the wrong order.

Reversing `SLUOS_RUO_EVAS` gave me `SAVE_OUR_SOULS`. I then added the `HNF26{}` wrapper to get the flag:

> [!NOTE] Flag
> HNF26{SAVE_OUR_SOULS}

#### Similar

- [[morse-code]]: the picoCTF Morse code challenge, where the message arrives as audio
