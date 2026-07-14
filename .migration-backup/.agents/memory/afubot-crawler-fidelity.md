---
name: AfuBot crawler accuracy/fidelity rules
description: Why the chat edge function's URL-detection and system prompt must enforce strict "report only what was fetched" behavior, and the concrete bug class that broke it.
---

## The failure mode
A model with a system prompt that confidently says "you always fetch and read pages in real-time" will, if the
actual crawl silently fails or never triggers, still narrate a fake in-progress action (e.g. "Fetching page...")
and answer from general/training knowledge as if it were live page content. This is a real, observed failure —
not hypothetical — caused by a URL-detection bug (see below), and it's the most dangerous kind of hallucination
because it's presented with full confidence and a fake provenance claim.

**Why:** Users (and this product's stated requirement) need crawler output to be 100% traceable to what was
actually fetched — never blended with invented "plausible" facts.

## The concrete bug that caused it
The URL-detector's trailing-punctuation stripper (`text.replace(/[.,;:!?)'"]+$/, "")`) unconditionally strips a
trailing `)`, which corrupts any URL that legitimately ends in a parenthesis, e.g.
`https://en.wikipedia.org/wiki/Deno_(software)` → `..._(software` (broken link, 404s silently). This is a very
common URL shape (any Wikipedia article with a disambiguator).

**How to apply:** When stripping trailing punctuation from an auto-detected URL, only strip a trailing `)` if it
does NOT balance an unmatched `(` earlier in the same URL — walk backwards, counting open/close parens, and stop
stripping as soon as they balance.

## Structural fix beyond the one bug
Even with the parser fixed, add an explicit system-prompt rule: the model may only claim to have fetched/read a
URL when a literal marker block (e.g. `[LIVE PAGE CONTENT — fetched right now by ...]`) is present in context for
that URL — otherwise it must say the fetch failed/wasn't possible, never describe the page from memory while
pretending it's live. Apply the same "use ONLY the provided data, say plainly when something isn't in it, general
knowledge may only frame — never replace — specific facts" instruction to every place search/crawl results are
injected into the prompt (pre-search block, deep-crawl block, KB-cache block, streaming pre-search block).
