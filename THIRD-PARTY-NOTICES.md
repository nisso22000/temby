# Optional network filtering

The three explicit optional URL patterns were selected from the EasyPrivacy rules previously reviewed for this project: https://easylist.to/easylist/easyprivacy.txt.

Ghostery and its eleven installed packages were removed in v38. There is no general adblock parser, full-list mode, cosmetic filtering, list downloader, or startup list download. The optional rules are coded explicitly in src/network-filter.ts and mirrored in the browser worker, with parity checks in tests. Filtering is off by default while merchant compatibility is investigated.
