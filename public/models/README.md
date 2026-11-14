# 3D body model

`body.bin` is the surface mesh for the 3D body map (`components/BodyMap3D.tsx`).

It is baked by `scripts/bake-body-model.py` from the MakeHuman base mesh (`hm08`), which MakeHuman
released under CC0 (public domain): https://github.com/makehumancommunity/makehuman

The script shapes the neutral mesh into a male and a female build, lowers the arms, and writes both
sets of positions plus the shared quad list. Joint positions used to place the skeleton, organs and
hotspots go to `lib/bodyModelJoints.ts`.
