-- Toggle: require manual approval for late (post-9:10) clock-ins. Default on.
insert into policy_config (key, value) values ('late_manual_required', 'on')
on conflict (key) do nothing;
