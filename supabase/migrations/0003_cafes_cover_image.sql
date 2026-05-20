-- Add R2-hosted cover image URL to cafes.
-- google_scraper uploads each cafe's hero photo to R2 as WebP and stores
-- the resulting public URL here. The photos jsonb is kept for richer future
-- multi-photo arrays, but the cover is queryable directly.

alter table cafes
    add column if not exists cover_image_url text;
