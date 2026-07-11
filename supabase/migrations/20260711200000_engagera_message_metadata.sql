-- Persist non-text response metadata (web-search sources, resolved time-zone
-- info) alongside each assistant message, so it survives page refresh and
-- conversation-history reloads instead of living only in transient React
-- state on the client.
alter table engagera_messages
  add column if not exists metadata jsonb;
