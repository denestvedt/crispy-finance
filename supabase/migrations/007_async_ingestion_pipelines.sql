-- Async ingestion queues for Plaid webhooks and document parsing.
create table if not exists plaid_webhook_ingest (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  webhook_event_id text not null,
  plaid_item_id text,
  transaction_ids text[] not null default '{}',
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'processed', 'retryable', 'dead_letter')),
  attempt_count int not null default 0,
  last_error text,
  next_retry_at timestamptz,
  processed_at timestamptz,
  dead_lettered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (webhook_event_id)
);

create table if not exists document_parse_ingest (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  document_parse_id text not null,
  document_upload_id uuid references document_uploads(id) on delete set null,
  payload jsonb not null,
  status text not null default 'pending' check (status in (
    'pending',
    'processing',
    'upload_recorded',
    'parse_job_created',
    'review_artifacts_ready',
    'posting_confirmed',
    'retryable',
    'dead_letter'
  )),
  attempt_count int not null default 0,
  last_error text,
  next_retry_at timestamptz,
  parse_job_id uuid,
  review_artifacts jsonb,
  posting_journal_entry_id uuid references journal_entries(id),
  dead_lettered_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_parse_id)
);

create table if not exists ingestion_latency_metrics (
  id bigserial primary key,
  pipeline text not null check (pipeline in ('plaid_webhook', 'document_parse')),
  ingest_record_id uuid not null,
  latency_ms bigint not null check (latency_ms >= 0),
  created_at timestamptz not null default now()
);

create table if not exists ingestion_failure_metrics (
  id bigserial primary key,
  pipeline text not null check (pipeline in ('plaid_webhook', 'document_parse')),
  ingest_record_id uuid not null,
  attempt_count int not null,
  is_dead_letter boolean not null default false,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_plaid_ingest_status_next_retry
  on plaid_webhook_ingest (status, next_retry_at, created_at);

create index if not exists idx_document_parse_ingest_status_next_retry
  on document_parse_ingest (status, next_retry_at, created_at);

create index if not exists idx_ingestion_latency_metrics_pipeline_created
  on ingestion_latency_metrics (pipeline, created_at desc);

create index if not exists idx_ingestion_failure_metrics_pipeline_created
  on ingestion_failure_metrics (pipeline, created_at desc);

create or replace function set_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_plaid_webhook_ingest_set_updated_at
  before update on plaid_webhook_ingest
  for each row execute function set_updated_at_column();

create trigger trg_document_parse_ingest_set_updated_at
  before update on document_parse_ingest
  for each row execute function set_updated_at_column();
