---
tags:
  - OSINT
  - beginner
  - Geography
modified: 2026-11-18T09:00:00+08:00
---

## Challenge Description

![[HNF26 Under the Walkway.png]]

This was an OSINT challenge providing an image file named `wow.jpeg`. The challenge description gave the following scenario:

> [!todo] Description
>
> This photo was found on a suspect's phone, taken under a covered walkway. Which famous shopping street in Tokyo is this?
>
> Flag format: HNF{street_name}

I opened `wow.jpeg` to inspect the scene for street signs, shop names, and other geographic markers.

![[HNF26 Under the Walkway 2.jpeg]]

The photo showed a covered shopping arcade lined with Japanese storefronts. Looking closely at the signage revealed several helpful clues:

- A hanging shop sign reading `かっぱ橋装飾` (Kappabashi Sōshoku).
- A notice hanging from the ceiling at the top left, a pandemic-era reminder to keep your distance and wear a mask, signed `かっぱ橋道具街` (Kappabashi Dōgugai).
- Black lettering running down the wall beside the lanterns, which appears to spell `かっぱ橋` again.
- Red paper lanterns (`赤提灯`) advertising `酒処` (a drinking spot).

The same name, `かっぱ橋`, appears on three separate signs, which made it unlikely to be a coincidence.

To confirm the street name and its exact Romanization, I ran the photo through Google Lens.

![[HNF26 Under the Walkway 3.png]]

> [!note] Geolocation via commercial signage
> This photo carries no GPS EXIF data, so the location has to come from what is visible in the frame. Shop signage, notices and street furniture are strong anchor points, and Japanese shopping arcades (shōtengai) often put the street's name on them.

Google Lens matched the storefront to Kappabashi-dori (Kappabashi Kitchenware Street, also written Kappabashi Dougu Street) in Taito City, Tokyo.

Using the street name `kappabashi` within the requested `HNF{street_name}` format gave the flag:

> [!NOTE] Flag
> HNF{kappabashi}
