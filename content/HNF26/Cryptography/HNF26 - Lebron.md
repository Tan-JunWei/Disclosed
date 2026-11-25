---
tags:
  - Cryptography
  - easy
  - Vigenere
  - base64
modified: 2026-11-18T09:00:00+08:00
---

## Challenge Description

![[HNF26 Lebron.png]]

The challenge provided a ciphertext string along with a basketball-themed description full of wordplay:

```
fXhubWd4cF9NdTB1XzMyX2tyYmdfdmhoX2Npdnl7NjJKUkEg
```

Reading through the description revealed several distinct clues:

- "64 to the base" hinted at Base64 encoding.
- "he love vinegar" pointed to the Vigenère cipher.
- "twentythree" referred to LeBron's jersey number, 23, giving the Vigenère key.
- "reverse" suggested that the text or flag was backwards.

I started by decoding the Base64 ciphertext:

```bash
┌──(nepz㉿nepz)-[~]
└─$ echo "fXhubWd4cF9NdTB1XzMyX2tyYmdfdmhoX2Npdnl7NjJKUkEg" | base64 -d
}xnmgxp_Mu0u_32_krbg_vhh_civy{62JRA
```

The output had braces at opposite ends, with `}` at the start and `{` near the end, confirming that the message had been reversed. However, the letters inside were still scrambled.

Following the "vinegar" and "twentythree" hints, I decrypted the string with a Vigenère cipher on dCode using the key `TWENTYTHREE`.

![[HNF26 Lebron 2.png]]

> [!note] Vigenère Cipher
> The Vigenère cipher encrypts text by shifting letters using a repeating keyword. Once the keyword is identified from the clues, recovering the underlying characters is straightforward.
>
> Reference: [Wikipedia - Vigenère Cipher](https://en.wikipedia.org/wiki/Vigen%C3%A8re_cipher)

The decryption gave:

```
}eriter_Tn0d_32_gnik_ruo_epoh{62FNH
```

Finally, I used the "reverse" clue and flipped the string using `rev` to reveal the flag:

```bash
┌──(nepz㉿nepz)-[~]
└─$ echo "}eriter_Tn0d_32_gnik_ruo_epoh{62FNH" | rev
HNF26{hope_our_king_23_d0nT_retire}
```

> [!NOTE] Flag
> HNF26{hope_our_king_23_d0nT_retire}

#### Similar

- [[Vigenere]]: Vigenère cipher with a provided key
- [[HNF26 - A lightkeeper of Nod-krai]]: Vigenère cipher whose key had to be recovered
