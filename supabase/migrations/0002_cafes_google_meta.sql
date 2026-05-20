-- Add Google Maps metadata columns to cafes.
-- These are filled by google_scraper (place panel scrape, alongside reviews).

alter table cafes
    add column if not exists business_status      text,    -- 'operational' | 'temporarily_closed' | 'permanently_closed'
    add column if not exists google_rating        numeric(2,1),
    add column if not exists google_review_count  int,
    add column if not exists price_level          text,    -- e.g. '$200-400'
    add column if not exists menu_url             text;

create index if not exists cafes_business_status_idx on cafes (business_status);
