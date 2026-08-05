---
name: Inline source favicon injection
description: How inline favicon chips are injected into AI message text wherever a source brand name is mentioned.
---

## Rule
When an AI message has sources, small favicon chips appear INLINE in paragraph and list text (not just below in a strip) wherever a source brand name occurs.

**Why:** User complaint — favicons only appeared below the message, not inline where the source was mentioned. The inline chips make attribution immediately visible in context.

## Implementation
In `MessageContent.tsx`:
1. `buildSourceNameMap(sources)` — builds `Map<string, Source>` keyed by lowercased brand name (from `getBrandName`) and `extractSiteName`. Only names longer than 2 chars.
2. `splitWithInlineFavicons(text, sourceMap)` — splits a string on brand name occurrences (longest first), wraps matches with a `<span>` containing the text + a 3.5×3.5 favicon circle.
3. `processChildrenWithFavicons(children, sourceMap)` — walks React children: processes string nodes, wraps changed strings in `<Fragment>`, leaves existing React elements (bold, code, links) untouched.
4. `sourceNameMap` is memoized via `useMemo` in `MessageContent`; applied in the `p` and `li` component renderers.

**How to apply:** Only string children get processed — never recurse into already-rendered React elements. The `p` and `li` renderers are the right injection points; heading and other block renderers don't need it.
