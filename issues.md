# Project Issues Log

This document tracks logic conflicts or ambiguities encountered during development. Each issue should be resolved before proceeding with conflicting implementations.

---
1. [RESOLVED] When test Arcade IPA Game, app asks to select /d/ or /ð/, however, in the case of /dʒ/, is is too easy because there will never be /ðʒ/
    - **Resolution:** Updated `IpaSorter.tsx` to use regular expressions with negative lookaheads/lookbehinds for both phoneme detection and IPA string masking. This prevents the system from incorrectly matching parts of affricate sounds (e.g., matching the 'd' in '/dʒ/') as standalone phonemes, ensuring that the generated minimal pair challenges are phonetically correct and appropriately difficult.