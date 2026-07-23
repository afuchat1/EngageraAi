---
name: Reasoning and AfuBot boundary
description: Product boundary between private advanced reasoning, ordinary chat, and the optional AfuBot web crawler.
---

Ordinary Engagera chat must not browse the web by default. AfuBot is a separate, explicit opt-in capability exposed through its standalone SDK resource or an explicit chat request flag.

**Why:** Users and API customers need predictable chat behavior, independent control over live-web access, and no accidental coupling to a crawler layer.

**How to apply:** Keep chat requests crawl-free unless AfuBot is explicitly enabled. Route the branded reasoning model through a private high-effort reasoning pipeline and return only the final answer; never return hidden notes, provider names, routing details, or tool traces.