-- Autonomous growth intelligence defaults. Unknown paid-call costs remain fail-closed.

insert into public.acq_config (key, value, value_type, description)
values
  ('growth_render_shadow_mode', 'true', 'boolean', 'Keep v3 intelligence-selected render jobs hidden from founder READY until rollout acceptance'),
  ('growth_gemini_estimated_sek_per_call', null, 'number', 'Known projected SEK cost required before Gemini growth calls may run; null means deterministic fallback'),
  ('growth_voice_estimated_sek_per_job', null, 'number', 'Known projected SEK voice/render cost used by the daily render selector; worker authorization remains authoritative'),
  ('growth_v3_quality_floor', '72', 'number', 'Minimum content quality score allowed into v3 allocation/render policy'),
  ('growth_v3_allocation_slots', '6', 'number', 'Number of quality-approved candidates considered by the 70/20/10 allocator'),
  ('growth_founder_scripts_per_day', '2', 'number', 'Maximum optional founder-recorded script ideas generated per day'),
  ('growth_v3_min_learning_sample', '12', 'number', 'Minimum attributed qualified visits before daily brief describes evidence as more than low-sample directional signal')
on conflict (key) do nothing;
