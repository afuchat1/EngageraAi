---
name: react-markdown strips data: image URIs by default
description: Why AI-generated base64 images render as a blank/missing <img> in react-markdown v10+ and how to fix it.
---

`react-markdown` v10's default URL sanitizer (`defaultUrlTransform`) only
allows `http(s)`, `irc(s)`, `mailto`, and `xmpp` protocols
(`safeProtocol = /^(https?|ircs?|mailto|xmpp)$/i` in
`node_modules/react-markdown/lib/index.js`). Any other protocol — including
`data:` — is silently sanitized away, so `![alt](data:image/jpeg;base64,...)`
renders an `<img>` with an empty `src`. There's no error, no console warning;
the image block just never displays.

**Fix:** pass a custom `urlTransform` prop to `<ReactMarkdown>` that allows
`data:image/*` explicitly and defers everything else to
`defaultUrlTransform` (also exported by the package):
```
urlTransform={(url) => (/^data:image\//i.test(url) ? url : defaultUrlTransform(url))}
```

**Why this matters generally:** any chat/AI app that embeds base64 images via
markdown through react-markdown needs this override — it's not specific to
one project's image-generation feature.
