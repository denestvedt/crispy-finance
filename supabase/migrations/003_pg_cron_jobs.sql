select cron.schedule(
  'daily-accruals',
  '0 0 * * *',
  $$select net.http_post(
    url := current_setting('app.edge_function_base_url') || '/run-daily-accruals',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key')),
    body := '{}'::jsonb
  )$$
);

select cron.schedule(
  'daily-income-accruals',
  '5 0 * * *',
  $$select net.http_post(
    url := current_setting('app.edge_function_base_url') || '/run-income-accruals',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key')),
    body := '{}'::jsonb
  )$$
);

select cron.schedule(
  'monthly-close-reminder',
  '0 9 28 * *',
  $$select net.http_post(
    url := current_setting('app.edge_function_base_url') || '/send-monthly-close-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key')),
    body := '{}'::jsonb
  )$$
);

select cron.schedule(
  'budget-review-reminders',
  '0 8 * * *',
  $$select net.http_post(
    url := current_setting('app.edge_function_base_url') || '/send-budget-review-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key')),
    body := '{}'::jsonb
  )$$
);
