---
tags:
  - Cryptography
  - easy
  - Substitution
  - Atbash
  - Python
modified: 2026-11-18T09:00:00+08:00
---

## Challenge Description

![[HNF26 Moving Schools.png]]

The challenge description said the author was moving to another CTF and had found this flag there:

```
SMU26{di0mt_hxs001_yfwwb}
```

The flag started with `SMU26` instead of `HNF26`, and the text inside the braces looked scrambled too. The phrase `atbash I'm finishing 10th place` in the description gave away what to try.

Atbash reverses the alphabet, replacing `a` with `z`, `b` with `y`, and so on. Digits, braces, and underscores stay unchanged.

> [!note] Check the flag prefix
> Applying Atbash to `SMU` gives `HNF`, matching the expected flag format. That is a useful check before decoding the rest.

| Plain  | a   | b   | c   | d   | ... | x   | y   | z   |
| ------ | --- | --- | --- | --- | --- | --- | --- | --- |
| Atbash | z   | y   | x   | w   | ... | c   | b   | a   |

I used the script below to decode the full string. `str.maketrans` builds the substitution table from the two alphabets, covering both lowercase and uppercase, and `translate` leaves every other character alone:

```python
import string

flag = "SMU26{di0mt_hxs001_yfwwb}"

forward = string.ascii_lowercase + string.ascii_uppercase
backward = string.ascii_lowercase[::-1] + string.ascii_uppercase[::-1]

print(flag.translate(str.maketrans(forward, backward)))
```

Running it printed the real flag.

> [!NOTE] Flag
> HNF26{wr0ng_sch001_buddy}

#### Similar

- [[caesar]]: another simple alphabet substitution
- [[Mod 26]]: ROT13 on a provided ciphertext string
