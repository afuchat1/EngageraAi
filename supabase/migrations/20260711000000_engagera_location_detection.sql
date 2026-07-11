-- Adds IP-based location detection columns so the AI can default the clock
-- widget / "what time is it" answers to the user's own timezone instead of
-- always falling back to UTC, and so we only need to geolocate + notify once
-- per guest session (IP-based, no browser geolocation permission needed).

alter table if exists public.engagera_guest_sessions
  add column if not exists detected_country  text,
  add column if not exists detected_timezone text,
  add column if not exists detected_label    text,
  add column if not exists location_notified boolean not null default false;
