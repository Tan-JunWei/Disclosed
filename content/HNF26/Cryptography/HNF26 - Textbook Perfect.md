---
tags:
  - Cryptography
  - medium
  - RSA
  - Hex
  - Python
modified: 2026-11-18T09:00:00+08:00
---

## Challenge Description

![[HNF26 Textbook Perfect.png]]

The challenge provided an RSA modulus `n`, a public exponent `e`, and a ciphertext `c`:

```
n = 20216923703160670895230417597163247126430845030478173707509250028669549802435428688163022356615918431724009850926560862061588051731012118109394589642354856975033007374588218342146276477995379921181301366466226037577804184086501952828241839440472490955887428126972711081010787287397028531485939936768469067652523341297857338510547189979899344595315539952711086826483509367479926196175498529897928926217597363258293739925477394075738686414549418702447976919722464716215343417759477451296245616287693015358750983732355318070067765391509961773937222968752972621136241235488913494490968209149991263959969375435259610953731

e = 3

c = 1180093938304973323420358578506755487515713915400853440202297448798288771550980896341018744834260333874448321162894762842934438401316562316807719393893
```

The small public exponent, `e = 3`, made me check whether a cube root attack would work. RSA encryption uses:

$$
c \equiv m^e \pmod n
$$

Here, `m` is the original message represented as an integer.

With `e = 3`, the message is cubed before the result is reduced modulo `n`. If $m^3 < n$, that reduction does nothing, leaving $c = m^3$. Taking the integer cube root of `c` would then recover the message directly.

> [!important] The cube root must be exact
> This direct attack works when $m^3 < n$. A rounded decimal cube root is not enough, so the recovered integer needs to satisfy $m^3 = c$.
>
> Reference: [Wikipedia - Attacks Against Plain RSA (Low Encryption Exponent)](https://en.wikipedia.org/wiki/RSA_%28cryptosystem%29#Attacks_against_plain_RSA)

I calculated the integer cube root using dCode's Cube Root Calculator:

![[HNF26 Textbook Perfect 2.png]]

```
m = 105674984594266633639361722547119975245651457292157
```

Cubing this value returns the original `c`, confirming that the attack succeeded. To turn the recovered integer into readable text, I first converted it to hexadecimal:

```
484E4632367B5253415F73316E63335F313937377D
```

Each pair of hex digits represents one ASCII byte:

![[HNF26 Textbook Perfect 3.png]]

Decoding these bytes in CyberChef revealed the flag:

![[HNF26 Textbook Perfect 4.png]]

The whole attack can also be done in Python. The integer cube root is found with a binary search, because floating-point cube roots lose precision on numbers this large:

```python
c = 1180093938304973323420358578506755487515713915400853440202297448798288771550980896341018744834260333874448321162894762842934438401316562316807719393893

def integer_cube_root(n):
    low, high = 0, 1 << (n.bit_length() // 3 + 1)
    while low < high:
        mid = (low + high) // 2
        if mid**3 < n:
            low = mid + 1
        else:
            high = mid
    return low

m = integer_cube_root(c)
assert m**3 == c  # the root is exact, so no modular reduction took place

print(m.to_bytes((m.bit_length() + 7) // 8, "big").decode())
```

> [!NOTE] Flag
> HNF26{RSA_s1nc3_1977}

#### Similar

- [[Mind your Ps and Qs]]: RSA with a weakness in the key generation instead of the exponent
