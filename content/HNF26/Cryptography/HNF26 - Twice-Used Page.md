---
tags:
  - Cryptography
  - medium
  - XOR
  - OneTimePad
  - Python
modified: 2026-11-18T09:00:00+08:00
---

## Challenge Description

The challenge provided a file named `tapes.txt` containing two hexadecimal ciphertexts:

```
Routine tape:
F7 13 4D AF 07 CB 95 25 6B 84 05 56 C7 E2 65 21

Night tape:
EB 12 5F D5 74 F3 B1 39 73 E0 39 49 C0 86 64 0C
```

The challenge title and the two ciphertexts pointed to a classic One-Time Pad (OTP) key reuse vulnerability, often called a Two-Time Pad attack.

In a one-time pad cipher, encryption is done by XORing plaintext bytes with a random key stream:

$$
C_1 = P_1 \oplus K
$$

$$
C_2 = P_2 \oplus K
$$

When the same key $K$ is reused across two different messages, XORing the two ciphertexts together completely cancels out the key:

$$
C_1 \oplus C_2 = (P_1 \oplus K) \oplus (P_2 \oplus K) = P_1 \oplus P_2
$$

This leaves only the XOR sum of the two original plaintexts. If any portion of one plaintext is known or guessed, XORing that crib with $C_1 \oplus C_2$ reveals the corresponding characters of the second message.

> [!important] Reusing a One-Time Pad breaks secrecy
> The one-time pad provides information-theoretic security only when the key is truly random and used strictly once. Reusing the pad across multiple messages cancels the keystream, allowing plaintexts to be recovered through crib-dragging or known-plaintext analysis.
>
> Reference: [Wikipedia - Reused key attack](https://en.wikipedia.org/wiki/Stream_cipher_attacks#Reused_key_attack)

Since this was an HNF26 challenge, one of the messages was expected to be the flag starting with `HNF26{`. XORing the two ciphertexts with `HNF26{` immediately revealed `TOTHEC`:

```python
routine = bytes.fromhex("F7 13 4D AF 07 CB 95 25 6B 84 05 56 C7 E2 65 21")
night = bytes.fromhex("EB 12 5F D5 74 F3 B1 39 73 E0 39 49 C0 86 64 0C")

# Test with the known flag format
crib = bytes(a ^ b ^ c for a, b, c in zip(routine, night, b"HNF26{"))
print(crib) # b'TOTHEC'
```

`TOTHEC` reads as the start of English text, "TO THE C...", so the routine tape was a plain message and the night tape was the flag. From here I extended the guess a word at a time. Each letter guessed for the routine tape reveals the matching letter of the flag, so a wrong guess shows up straight away as gibberish in the flag. This is called crib-dragging.

Guessing `TOTHECENTER` turned the flag into `HNF26{aRL!n`, which looks like the start of "Arlington". Both tapes are 16 bytes long, so five characters were left, and the flag had to end with `}`. Completing it as `HNF26{aRL!nGT0N}` made the routine tape read `TOTHECENTERXSTOP`. Telegrams spell out `STOP` instead of using a full stop, and `X` was a common separator, so both tapes made sense at once.

With `TOTHECENTERXSTOP` as the known routine plaintext, this script recovers the whole night tape:

```python
routine = bytes.fromhex("F7 13 4D AF 07 CB 95 25 6B 84 05 56 C7 E2 65 21")
night = bytes.fromhex("EB 12 5F D5 74 F3 B1 39 73 E0 39 49 C0 86 64 0C")

known_routine = b"TOTHECENTERXSTOP"

plaintext = bytes(a ^ b ^ c for a, b, c in zip(routine, night, known_routine))
print(plaintext.decode())
```

XORing both ciphertexts cancels the key, and XORing the result with the known routine plaintext leaves the plaintext of the night tape. Running the script printed it, and it was the flag:

```bash
┌──(nepz㉿nepz)-[~/test]
└─$ python3 script.py
HNF26{aRL!nGT0N}
```

> [!NOTE] Flag
> HNF26{aRL!nGT0N}

#### Similar

- [[HNF26 - DISKLOCK]]: a repeating XOR key recovered from known plaintext
