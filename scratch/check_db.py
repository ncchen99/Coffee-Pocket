import sys
from collections import Counter
from coffee_pocket.db import get_client

def main():
    print("Connecting to database...")
    db = get_client()

    print("Checking cafes count...")
    cafes_res = db.table("cafes").select("id", count="exact").limit(1).execute()
    total_cafes = cafes_res.count
    print(f"Total cafes: {total_cafes}")

    print("Checking reviews_raw count...")
    reviews_res = db.table("reviews_raw").select("id", count="exact").limit(1).execute()
    total_reviews = reviews_res.count
    print(f"Total reviews in reviews_raw: {total_reviews}")

    # Count reviews with signals
    print("Checking reviews with extracted_signals...")
    # Since we can't easily do a nested JSON null check in simple select count, let's query a batch of rows
    # or look at the instagram_extract/google_extract counters, but let's query processed vs non-processed.
    processed_res = db.table("reviews_raw").select("id", count="exact").not_.is_("processed_at", "null").limit(1).execute()
    print(f"Processed reviews (processed_at not null): {processed_res.count}")

    # Let's pull some reviews that have extracted signals to see the shape and distribution of signal types.
    print("Pulling a sample of reviews with extracted signals...")
    sample_res = db.table("reviews_raw").select("id", "source_id", "extracted_signals").not_.is_("extracted_signals", "null").limit(1000).execute()
    sample_data = sample_res.data
    print(f"Retrieved {len(sample_data)} sample rows with signals.")

    signal_counts = Counter()
    polarity_counts = Counter()
    for row in sample_data:
        sig_blob = row.get("extracted_signals")
        if not sig_blob:
            continue
        # Check if list (google/instagram) or dict (cafe_nomad)
        if isinstance(sig_blob, list):
            for s in sig_blob:
                sig_type = s.get("type")
                polarity = s.get("polarity")
                if sig_type:
                    signal_counts[sig_type] += 1
                    polarity_counts[(sig_type, polarity)] += 1
        elif isinstance(sig_blob, dict):
            # Cafe Nomad has dict shape inside 'signals' key
            inner = sig_blob.get("signals") or {}
            for k, v in inner.items():
                if v is not None:
                    signal_counts[f"cafe_nomad:{k}"] += 1

    print("\n--- Distribution of Signal Types in Sample ---")
    for sig_type, count in signal_counts.most_common():
        print(f"  {sig_type}: {count}")

    print("\n--- Polarity Breakdown in Sample ---")
    for (sig_type, pol), count in polarity_counts.most_common():
        print(f"  {sig_type} ({pol}): {count}")

    # Check cafe_tags distribution
    print("\nChecking cafe_tags distribution...")
    tags_res = db.table("cafe_tags").select("tag_key", "bool_value", "score_value").limit(5000).execute()
    tags_data = tags_res.data
    print(f"Total cafe_tags retrieved (up to 5000): {len(tags_data)}")

    tag_keys_counter = Counter()
    tag_bool_counter = Counter()
    for tag in tags_data:
        tag_key = tag["tag_key"]
        tag_keys_counter[tag_key] += 1
        if tag["bool_value"] is not None:
            tag_bool_counter[(tag_key, tag["bool_value"])] += 1

    print("\n--- Existing tags in cafe_tags table ---")
    for tag_key, count in tag_keys_counter.most_common():
        print(f"  {tag_key}: {count} rows")
        if (tag_key, True) in tag_bool_counter:
            print(f"    True: {tag_bool_counter[(tag_key, True)]}")
        if (tag_key, False) in tag_bool_counter:
            print(f"    False: {tag_bool_counter[(tag_key, False)]}")

if __name__ == "__main__":
    main()
