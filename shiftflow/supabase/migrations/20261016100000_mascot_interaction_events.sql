alter table public.mascot_events
  drop constraint if exists mascot_events_event_type_check;

alter table public.mascot_events
  add constraint mascot_events_event_type_check
  check (event_type in ('view', 'tap', 'hint_view', 'hint_tap', 'status_open', 'item_use', 'emote_use'));
