select id, name, distance_m, open_now, top_tags
from cafes_search(NULL::text[], 120.205::float8, 22.991::float8, 5000, 'distance', 5, 0);
