---
tags:
  - Cryptography
  - medium
  - Vigenere
  - Transposition
modified: 2026-11-18T09:00:00+08:00
---

## Challenge Description

![[HNF26 A lightkeeper of Nod-krai.png]]

The challenge provided a long block of ciphertext alongside an atmospheric story description:

> [!todo] Description
>
> Beneath a lantern at the edge of the ruins, a traveller found a note. The ink had been worked over twice: first the words were dressed in a borrowed name that repeats like footsteps on a long patrol, then the whole page was cut into columns and shuffled by the one who carries the light.
>
> The dead here have no use for spaces or punctuation. Neither does the note.

Ciphertext:

```
UWLZWIUHRIHRZYVRFSHYHSBCRIOSFYCVBKHFHSFDLBCGYCOUBYDWJXEHQBWD
YOCKJWPKWSPHXSOENYWCQSRHKVYHQJBAMQBIDLDKHIBGOBBRCYSJSKLGWLUR
WBVEHPCKFADEHRBSNTHVUTIYFWWANIJHCLGOASZWBZGOURNJDLSEIPVVMFYL
WMGSXVZTUPHRUMOEWSVGKOSEGZFETAJMUXVOKIOCUYZVUFNLLHGHDQRNHLCI
IMGEJIGKOTHFHCKKFDHWOVNOEAKVOSRYUARCSIGCYSCNJXVRFDDKEXDPKMJY
CHEESXZPDSECCOLOVOLFGOQSYLSOBEQRSKMRKXPSTYEOIZWVWVLRVMISTISS
FFWBNGARCCSBCELQKHJWGDHGZYVIEYROFFJEWPZAFLPOHBDFVELQWWMUCQVF
EQOSSFAPSHVTGCVONYACRFMWAHIGMWPCSYZVIEJUXRWNOQVVWLPSYFDWSDSR
WSUSEHLOVHANFRMVOKBVAHEBVTAWVQQXHYISEYFURFJXLZMBYDDHOBDUYFJD
OWEBOKVGRUEHYEWGGHVRKDZGSQDVKFTVVUWRSDTHGCZJEJWDWHEYVYWUAHXB
IIXOOPMAZDLSLPROXEODGOPUHGDCINCVMOJXWKIUBSPHIBDBFUZQJKPBBBPM
SFTHZXABAKLEUXBOTUZVMJUVFWQUIONSMNYHXFXWWLMUOVOBRYAGKBJJJNSY
VOVHRYWFKTLPZEWLHWPSLNCSZIURFHYBABEREOECVIZJZOSTZRZBSLMGVFZP
FHPVTCMIEAEVFSAKFQRAMYKCLNSHVCFZZHLYONGGUILTKFWWZRBLSVTQRCFP
JSWVFFRPVOASSYTBGTOVZSHRDCZPAFAWCVBABEBLBVFKGDUMRSOVHGMQVCTG
HLZXYFDWSSYPWFUAOJDERFSAVSHLSFSSDSHIGKRVWYNLMRFGKJQXRURMHABS
CYLLSZOAQBQACUGXSVJTHGHIRAOBBIHPFUNLYSWSGCDISLYEBWOJFWFIGBQZ
STHYFVMFQKWIRTYZAENYFEULZAWEGSMMARNJAYUFVLJJBQCKBTNPGZUYGXUH
USFMVTLEAKJGHVIAXZBXFAFZDEIFIFVSRMEQGIYDRTSZJOVTGIKNVTHAOVSJ
BWRSRTCIHEIDZFTMWEUMXVRDRJGCXBBIQOSJPLFEUZVVBLFEMHKFPZKDVLHF
CLSNXYBCHYQQLLRSCOHDZFBMSNVJKIVBNAAOMCJVBWLWZWRQBMHUYPSRFWHA
WVNPCMIMLCSEPEUAHPQCQBOEMEVZWXWZPLFVYNVGYOWYEGZZWYFORLWNUTGZ
UWROWPFONPSEYSVYULWAVSQCXAHECLRVIZHKDMRGCPZWHSPVZWLAQISSYCVE
IXHSPGPWDRVBXSIANPORFQSLRRFOFUSSNTSZFWLZDGGSONZNLPSFUJSAOXYC
BXHOUEWFFLVWHXR
```

The description highlighted two distinct stages of encryption:

1. A repeating keyword substitution cipher ("dressed in a borrowed name that repeats like footsteps on a long patrol").
2. A columnar transposition applied on top ("the whole page was cut into columns and shuffled by the one who carries the light").

Because the columnar transposition was applied last, it had to be decrypted first.

## Reversing the columnar transposition

The phrase "shuffled by the one who carries the light" and the challenge title "A lightkeeper of Nod-krai" prompted a quick search into Genshin Impact lore for Nod-Krai lightkeepers.

![[HNF26 A lightkeeper of Nod-krai 2.png]]

The main lightkeeper character in Nod-Krai is Flins (Kyryll Chudomirovich Flins), the guardian of the lighthouse and cemetery. This pointed to `FLINS` as the transposition key.

I loaded the ciphertext into Boxentriq's Columnar Transposition tool, set the mode to Decrypt, and entered `FLINS` as the key.

![[HNF26 A lightkeeper of Nod-krai 3.png]]

Reversing the transposition produced an intermediate text:

```
UZKVRWJEBJLEXAGZJDBCWWPEXIDKBBUWMLBHHJBIREYVQIYCFOHVHKSRYEGJZWEDPYUSULVAXMFRHZREFXPSUSBDOZHISVVYIEHVHXCGBSOCMLBOOQFCPLVERMOCMIAVTHOZOGKSDLHFFLFLPYSGZZCLOXKVPQYDBRSFVKOYDLHXLWHFESSFHOOSCSDBYLFGEPSDOQWNLPRFXBUSUYCHKABGGMOCYDRJHCCKDYOIXEQUNPRQBCSFLYVTSLDMYARWOEVSJJOSCXXIHOEWZLHHKWSDQIVFZBUWSFWBVSBDSLDMYPRSSOHVHNCIMIVKBIGJJDSKKWBTRIPFIVVKUSWBWZSYNSQFNAPJFLAHKWMOXPBRMSBNFCOBGGJEBAKVNPRJBYMCQWWSCXLCFSRWQTBUZSHCRWRZEMRHXLHQKAQABVBKBMYAHSHHKJCUQLWYYJEGLPBUDLSAXHSRMBGZFQOZOWBTYAHIUVQADZIBWLVEQVDMYANKJRCPHUOUCIVFGMBFFXIGWJSMOQEVLBUWJCBIPTSROZHECNAGPYSFHESMLIUJNPRASYOAHKHHOPLXBBQGFDBCWXFIQLWVHBUWEPORLLFEWMQUMBUWNEVOWLVEVMYZHOUSWPBCWXCRQSWKYVGZFAFCPAGEDLDKQIFEBOSVHJSLYRJSYNBJFEVSNABGNSPWYTYSOOHVHJWVOVFYUVTWETHGFGIRCIZYYVGZFWOBWWFNQYWKYZFATASONLCTRIPRHLJZFYWHEMFNCWWVULLAMTGHHFGOWIQZAPGKUSSMWWZLWIRWNPROBCCTWZSSYPGZYZFOIZAOUUVENRRINPNFEYSJHJFEDYUEYLBXUSSARLVEBWZYIENAUPROWLVEQEWVOVGAMEVSVFCWMSYVLMQLIPACWZSRXMJYNAGZFJHSODAEXSWYCVTSULZZDFRTRSVVUZRLIPBWJZHSSJHRLUBKUMSQDMGECMOVHKREFLBGWZOTCSPVNPVFHPZGHAGWKPNZHOVFUSSTRYPECMGVGMVXZZIOUWFEKHLEABUATEVSQAVAFIJFHMSMSEVSUABTYXKVLCVFTEVOQAAEKRWKIIAVJXOMQGHCYQHSUKXVPYCHIGZLYAPVNIXWUSSZDFHEBRNVYXVLCFFBLFUAXHZRFSGZFZIHHJDADLXENQYLIPROZFONNMIRHGBFFLGYVQCUDSSIIDRLILHMRMTOERGKBQFEFDGOJWUIFIWYYUGZFDSKRJRSOBDTNTLOSTHSWZSFVEJZHTBOFCQOVWKRKTLKCVGZFFGIDDPRKGHJUNGWSEVSOWHTOVVYHNNFEAZOFWONERGVLAPGSPKVHJSVOVBFOARWUSSKRJRSDSSYYZRAUTGTOABSCXRGQIYCTDHCSOVEBIVKIXGZFDHCSTZOYHVFUSRVTECDUMWNCWWFJZREFXPSULVADMVRFTXWFAHVHDWGRXDCCDR
```

## Breaking the Vigenère cipher

With the transposition layer undone, I submitted the intermediate ciphertext to dCode's Cipher Identifier.

![[HNF26 A lightkeeper of Nod-krai 4.png]]

The analysis strongly suggested a Vigenère cipher. This matched the description hint regarding words dressed in a borrowed name that repeats like footsteps on patrol.

Since the key was still unknown, I used InventiveHQ's Vigenère cryptanalysis tool to determine the key length via Index of Coincidence and Kasiski examination.

![[HNF26 A lightkeeper of Nod-krai 5.png]]

The probable key length chart displayed a prominent spike at key length 16.

Switching to the Key Recovery tab for key length 16, the column frequency analysis recovered the key: `BLOODSOAKEDRUINS`.

![[HNF26 A lightkeeper of Nod-krai 6.png]]

> [!note] Polyalphabetic cryptanalysis
> Vigenère ciphers can be solved without the key by identifying the key length using Index of Coincidence, then treating each column as an independent monoalphabetic substitution cipher solved through standard English letter frequency analysis.
>
> Reference: [Wikipedia - Vigenère Cipher Cryptanalysis](https://en.wikipedia.org/wiki/Vigen%C3%A8re_cipher#Cryptanalysis)

Decrypting the text with the key `BLOODSOAKEDRUINS` revealed the complete note:

```
TOWHOEVERFINDSTHISNOTEBENEATHTHELANTERNIHAVEWALKEDTHESEROADSFORLONGERTHANICANREMEMBERANDEVERYNIGHTTHEFOGROLLSDOWNFROMTHEHILLSANDSWALLOWSTHEOLDSTONESWHOLETHEVILLAGERSSAYTHEGROUNDHEREWASSOAKEDSODEEPLYINBLOODTHATNOTHINGWILLEVERGROWAGAINANDTHEYARERIGHTIHAVESEENTHEGRASSTURNGREYATTHEEDGESOFTHERUINSANDIHAVEHEARDTHEVOICESTHATRISEWHENTHEMOONISTHINTHEYDONOTSCREAMTHEYONLYASKOVERANDOVERWHETHERANYONEISSTILLKEEPINGWATCHSOIKEEPWATCHICARRYTHELIGHTTHROUGHTHEBROKENGATEANDPASTTHEFALLENTOWERANDICOUNTTHEGRAVESASIGOBECAUSESOMEONEMUSTREMEMBERTHEIRNUMBEREVENIFNOONEREMEMBERSTHEIRNAMESTHELIGHTDOESNOTFRIGHTENTHEDEADITREMINDSTHEMTHATTHELIVINGHAVENOTFORGOTTENTHEPROMISETHATWASMADEHERELONGBEFORETHEKINGDOMFELLANDTHERIVERCHANGEDITSCOURSEWHENTHELANTERNGUTTERSISPEAKTOTHEMANDWHENITBURNSSTEADYILISTENSOMENIGHTSTHEYTELLMEOFTHEWAROFTHESOLDIERSWHOMARCHEDNORTHANDNEVERRETURNEDOFTHEMOTHERSWHOWAITEDATTHEGATEUNTILTHESNOWCOVEREDTHEMOTHERNIGHTSTHEYTELLMENOTHINGATALLANDTHOSEARETHENIGHTSIFEARMOSTBECAUSESILENCEMEANSTHATSOMETHINGELSEISWALKINGINTHEFOGBESIDEMEIFYOUAREREADINGTHISTHENIHAVEGONEFURTHERINTOTHERUINSTHANIMEANTTOANDIMAYNOTCOMEBACKDONOTFOLLOWMETAKETHELANTERNKEEPITBURNINGANDWALKTHEOUTERPATHUNTILTHEDAWNANDIFANYONEASKSYOUTOPROVETHATYOUFOUNDTHISMESSAGEGIVETHEMTHESEWORDSEXACTLYWRITETHEFLAGINLOWERCASEWRAPITINTHEUSUALBRACESAFTERTHELETTERSHNFANDPLACEANUNDERSCOREWHEREVERYOUSEETHEWORDSTOPHEREITISFLINSSTOPWALKSSTOPWHERESTOPTHESTOPBLOODSOAKEDSTOPRUINSSTOPREMEMBERTHATISALLKEEPTHELIGHTALIVE
```

The concluding lines contained the instructions for formatting the flag:

```
WRITE THE FLAG IN LOWERCASE WRAP IT IN THE USUAL BRACES AFTER THE LETTERS HNF AND PLACE AN UNDERSCORE WHEREVER YOU SEE THE WORD STOP HERE IT IS FLINS STOP WALKS STOP WHERE STOP THE STOP BLOODSOAKED STOP RUINS STOP REMEMBER THAT IS ALL KEEP THE LIGHT ALIVE
```

Although the note says to wrap the flag after the letters `HNF`, the challenge card asks for the usual `HNF26{...}` format. Replacing each `STOP` with an underscore, converting to lowercase, and wrapping the result in `HNF26{...}` gave `HNF26{flins_walks_where_the_bloodsoaked_ruins_remember}`.

## Reproducing it offline

Every step above used an online tool. The same two layers can be undone in a short Python script, which also confirms the keys. It reads the ciphertext from `cipher.txt`:

```python
import math
from pathlib import Path

ciphertext = "".join(Path("cipher.txt").read_text().split())


def undo_columnar(text, key):
    rows = math.ceil(len(text) / len(key))
    # a column is read out in alphabetical order of its key letter
    order = sorted(range(len(key)), key=lambda i: (key[i], i))
    # when the text does not fill the grid, the last columns are one letter short
    filled = len(text) % len(key) or len(key)
    columns, pos = {}, 0
    for col in order:
        size = rows if col < filled else rows - 1
        columns[col] = text[pos:pos + size]
        pos += size
    return "".join(
        columns[col][row]
        for row in range(rows)
        for col in range(len(key))
        if row < len(columns[col])
    )


def undo_vigenere(text, key):
    return "".join(
        chr((ord(c) - ord(key[i % len(key)])) % 26 + ord("A"))
        for i, c in enumerate(text)
    )


intermediate = undo_columnar(ciphertext, "FLINS")
note = undo_vigenere(intermediate, "BLOODSOAKEDRUINS")
print(note)
```

Running it prints the note from before, ending with the formatting instructions.

> [!NOTE] Flag
> HNF26{flins_walks_where_the_bloodsoaked_ruins_remember}

#### Similar

- [[Vigenere]]: Vigenère cipher with a provided key
- [[la cifra de]]: Vigenère cipher without a provided key, solved with an automated tool
- [[rail-fence]]: another transposition cipher
