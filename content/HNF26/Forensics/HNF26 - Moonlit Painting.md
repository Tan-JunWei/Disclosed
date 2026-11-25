---
tags:
  - Forensics
  - easy
  - Steganography
  - metadata
  - zip
  - base64
modified: 2026-11-18T09:00:00+08:00
---

## Challenge Description

![[HNF26 Moonlit Painting.png]]

The challenge provided an image file named `moonlit_painting.png` along with the following prompt:

> [!todo] Description
>
> A kuuhenki on Hiisi Island painted the view from Silvermoon Hall and swore the picture holds more than moonlight. The Frostmoon Scions only see a pretty night sky. Look closer, and don't believe the first thing that tells you it's a flag.
>
> Flag format: HNF26{...}

![[HNF26 Moonlit Painting 2.png]]

The description cautioned not to believe the first thing that claims to be a flag, warning that a decoy or fake flag might be present.

## Inspecting metadata

I started by checking the file metadata with ExifTool:

```bash
┌──(nepz㉿nepz)-[/mnt/c/Users/Admin/Downloads]
└─$ exiftool moonlit_painting.png
ExifTool Version Number         : 12.76
File Name                       : moonlit_painting.png
Directory                       : .
File Size                       : 56 kB
File Type                       : PNG
Image Width                     : 1024
Image Height                    : 640
Title                           : Silvermoon Hall, Hiisi Island
Author                          : a kuuhenki painter
Comment                         : SE5GMjZ7czFsdjNybTAwbl9oNGw=
PNG Warning                     : HNF26{n0t_th1s_0n3_l1ttl3_d0v3}
Warning                         : [minor] Trailer data after PNG IEND chunk
```

The output revealed three important details:

- `PNG Warning` contained `HNF26{n0t_th1s_0n3_l1ttl3_d0v3}`. This was the fake flag warned about in the prompt.
- `Comment` contained a Base64-encoded string: `SE5GMjZ7czFsdjNybTAwbl9oNGw=`.
- ExifTool reported trailer data located after the PNG `IEND` chunk.

I decoded the Base64 comment string:

```bash
┌──(nepz㉿nepz)-[/mnt/c/Users/Admin/Downloads]
└─$ echo "SE5GMjZ7czFsdjNybTAwbl9oNGw=" | base64 -d
HNF26{s1lv3rm00n_h4l
```

The decoded text gave `HNF26{s1lv3rm00n_h4l`, which appeared to be the first part of the real flag.

## Extracting the trailer data

The ExifTool warning about trailer data after `IEND` pointed to an appended file. In a standard PNG file, `IEND` signifies the formal end of the image stream. Any data placed after this chunk is disregarded by image viewers.

I inspected the end of the file with `xxd`:

```bash
┌──(nepz㉿nepz)-[/mnt/c/Users/Admin/Downloads]
└─$ xxd moonlit_painting.png | tail -n 25
0000db70: c70c afd0 6e3d 0000 0000 4945 4e44 ae42  ....n=....IEND.B
0000db80: 6082 504b 0304 1400 0000 0800 af5e 675d  `.PK.........^g]
0000db90: 0896 6424 4f00 0000 5500 0000 1400 0000  ..d$O...U.......
0000dba0: 6d6f 6f6e 6368 616e 7465 725f 6e6f 7465  moonchanter_note
0000dbb0: 2e74 7874 05c1 310e 8020 0c05 d0dd 53fc  .txt..1.. ....S.
...
0000dc30: 006d 6f6f 6e63 6861 6e74 6572 5f6e 6f74  .moonchanter_not
0000dc40: 652e 7478 7450 4b05 0600 0000 0001 0001  e.txtPK.........
```

Immediately following the `IEND` chunk (`49 45 4E 44 ae 42 60 82`), the bytes start with `50 4B 03 04` (`PK\x03\x04`), which is the magic header for a ZIP archive. The dump also showed an archived text file named `moonchanter_note.txt`. (Only the relevant lines are shown here. The rest of the output is the ZIP's directory records.)

> [!important] Trailer data in PNG files
> Valid PNG files end at the IEND chunk. Because compliant decoders stop reading there, extra data appended to the file does not alter the displayed image, making it a reliable way to hide files or archives.
>
> Reference: [HackTricks - Steganography Tricks](https://hacktricks.wiki/en/forensics/basic-forensic-methodology/stego-tricks.html)

I ran `unzip` directly on the PNG image:

```bash
┌──(nepz㉿nepz)-[/mnt/c/Users/Admin/Downloads]
└─$ unzip moonlit_painting.png
Archive:  moonlit_painting.png
warning [moonlit_painting.png]:  56194 extra bytes at beginning or within zipfile
  (attempting to process anyway)
  inflating: moonchanter_note.txt

┌──(nepz㉿nepz)-[/mnt/c/Users/Admin/Downloads]
└─$ cat moonchanter_note.txt
The painting is only half the story.
The rest of what you seek: l_k33ps_4ll_s3cr3ts}
```

The extracted note explained that the painting held only half the story and provided the rest of the string: `l_k33ps_4ll_s3cr3ts}`.

Concatenating both fragments yielded the full flag:

> [!NOTE] Flag
> HNF26{s1lv3rm00n_h4ll_k33ps_4ll_s3cr3ts}

#### Similar

- [[So Meta]]: flag hidden in file metadata
- [[information]]: flag hidden in image metadata, base64-encoded
- [[hideme]]: files embedded in a PNG and extracted with `binwalk`
