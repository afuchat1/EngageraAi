---
name: SDK agent platform upgrade
description: What changed in the SDK bump from 0.1.5 to 0.2.0 and naming quirks to remember.
---

## Rule
SDK is `@afuchat1/engagera` at `0.2.0`. Three new resource files were added.

**Why:** The Engagera platform spec requires agents, memory, and workflows resources exposed on the main client.

## New resources
- `resources/agents.ts` — `Agents` class with `list`, `get`, `create`, `update`, `delete`, `run`
- `resources/memory.ts` — `Memory_` class (the trailing underscore avoids collision with the `Memory` type)
- `resources/workflows.ts` — `Workflows` class with `list`, `create`, `run`, `delete`

## Naming collision fix
`Memory_` (the class) is exported as `MemoryResource` in `index.ts` to avoid a duplicate identifier with the `Memory` *type* also exported from the same file. The `client.ts` field is typed as `MemoryResource`.

**How to apply:** Any future rename of the memory resource class must keep this alias or rename the type — never export both under the same name.
