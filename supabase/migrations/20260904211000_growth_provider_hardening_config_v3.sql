-- Provider hardening defaults: English remains opt-in and unknown-cost paths fail closed.

insert into public.acq_config (key, value, value_type, description)
values
  ('growth_english_voice_enabled', 'false', 'boolean', 'Enable occasional generic-English voice experiments'),
  ('growth_english_voice_estimated_sek_per_job', null, 'number', 'Known projected SEK cost required before an English voice experiment may run'),
  ('growth_retention_cleanup_limit', '200', 'number', 'Maximum growth media rows considered by one cleanup pass')
on conflict (key) do nothing;
