import sys
from collections import Counter, defaultdict
from coffee_pocket.db import get_client

def main():
    print("Connecting to database...")
    db = get_client()

    print("Fetching all processed reviews from reviews_raw...")
    raw_rows = []
    limit = 1000
    offset = 0
    while True:
        rows = (
            db.table("reviews_raw")
            .select("id, cafe_id, source_id, extracted_signals")
            .not_.is_("extracted_signals", "null")
            .range(offset, offset + limit - 1)
            .execute()
            .data
        )
        raw_rows.extend(rows)
        if len(rows) < limit:
            break
        offset += limit
    print(f"Retrieved {len(raw_rows)} reviews with extracted_signals.")

    # Group by cafe and then by tag_key, counting positive and negative signals
    # Format: cafe_signals[cafe_id][tag_key] = {"positive": 0, "negative": 0}
    cafe_signals = defaultdict(lambda: defaultdict(lambda: {"positive": 0, "negative": 0}))
    
    for row in raw_rows:
        cid = row["cafe_id"]
        src = row["source_id"]
        sig_blob = row.get("extracted_signals")
        
        if src in {"google_places", "instagram"}:
            sigs = sig_blob if isinstance(sig_blob, list) else []
            for s in sigs:
                tag = s.get("type")
                polarity = s.get("polarity")
                if tag and polarity in {"positive", "negative"}:
                    cafe_signals[cid][tag][polarity] += 1
        elif src == "cafe_nomad":
            # For cafe nomad, let's map according to semantic.py logic
            inner = (sig_blob or {}).get("signals") or {}
            
            # socket
            socket = inner.get("socket_available")
            if socket is True:
                cafe_signals[cid]["socket_most"]["positive"] += 1
            elif socket is False:
                cafe_signals[cid]["socket_most"]["negative"] += 1
            elif socket == "partial":
                cafe_signals[cid]["socket_few"]["positive"] += 1
                
            # wifi
            wifi_q = inner.get("wifi_quality")
            if isinstance(wifi_q, int):
                if wifi_q >= 3:
                    cafe_signals[cid]["wifi_available"]["positive"] += 1
                elif wifi_q <= 1:
                    cafe_signals[cid]["wifi_available"]["negative"] += 1

    # Let's count for each tag:
    # 1. How many cafes have at least 1 positive signal?
    # 2. How many cafes have at least 2 positive signals?
    # 3. How many cafes currently have it active in cafe_tags (from previous query or we can compute with threshold)?
    
    tags_to_check = [
        "socket_most", "socket_few",
        "large_table_most", "large_table_few",
        "wifi_available",
        "scooter_parking_easy", "car_parking_easy",
        "has_resident_cat", "has_resident_dog",
        "reservable", "outdoor_seating"
    ]
    
    print("\n--- Potential Cafe Counts by Signal Presence ---")
    print(f"{'Tag Key':<25} | {'>=1 Pos (Cafes)':<18} | {'>=2 Pos (Cafes)':<18}")
    print("-" * 68)
    
    for tag in tags_to_check:
        count_ge1 = 0
        count_ge2 = 0
        for cid, tags in cafe_signals.items():
            pos_count = tags[tag]["positive"]
            if pos_count >= 1:
                count_ge1 += 1
            if pos_count >= 2:
                count_ge2 += 1
        print(f"{tag:<25} | {count_ge1:<18} | {count_ge2:<18}")

if __name__ == "__main__":
    main()
