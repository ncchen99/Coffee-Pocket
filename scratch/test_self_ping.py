import asyncio
import json
import logging
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import FastAPI
from services.api.main import app, active_jobs

# Set up logging to console
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s"
)

async def run_test():
    print("=== Starting integration test for FastAPI Self-Ping ===")
    
    # We will mock the database client and the places detail API to bypass external dependencies
    # and just focus on testing our endpoint and the self-ping logic.
    mock_db = patch("services.api.main.get_client")
    mock_places = patch("services.api.main._places_headers", return_value={"X-Goog-Api-Key": "test"})
    mock_stream = patch("services.api.main.run_pipeline_stream")
    
    # Mock Places details API response
    async def mock_get(*args, **kwargs):
        class MockResponse:
            status_code = 200
            def raise_for_status(self):
                pass
            def json(self):
                return {
                    "id": "test_place_id",
                    "displayName": {"text": "Test Cafe"},
                    "formattedAddress": "123 Test St",
                    "location": {"latitude": 22.99, "longitude": 120.2},
                    "googleMapsUri": "https://maps.google.com"
                }
        return MockResponse()
        
    async def mock_pipeline_stream(*args, **kwargs):
        print("[test-pipeline] Simulating pipeline stages (3 seconds)...")
        yield {"type": "pipeline_start"}
        await asyncio.sleep(1)
        yield {"type": "stage_done", "stage": "pinyin"}
        await asyncio.sleep(1)
        yield {"type": "stage_done", "stage": "scrape"}
        await asyncio.sleep(1)
        yield {"type": "pipeline_done"}

    with mock_db as m_db, mock_places, mock_stream as m_stream:
        # Mock supabase execution
        m_db.return_value.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
        m_db.return_value.table.return_value.insert.return_value.execute.return_value.data = [{"id": "test-cafe-uuid"}]
        m_stream.side_effect = mock_pipeline_stream
        
        # Patch httpx.AsyncClient.get inside main.py details call
        with patch.object(httpx.AsyncClient, "get", side_effect=mock_get):
            # We use AsyncClient to call our endpoint
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as ac:
                print("Sending POST request to /cafes...")
                # Start reading the stream response
                async with ac.stream("POST", "/cafes", json={"place_id": "test_place_id"}) as response:
                    print(f"Response status code: {response.status_code}")
                    assert response.status_code == 200
                    
                    # Read the streamed lines in real-time
                    async for line in response.aiter_lines():
                        if line:
                            print(f"[Stream Recv] {line}")
                            
    # Give the self-ping loop a fraction of a second to clean up and print final log
    await asyncio.sleep(0.5)
    print("=== Test finished successfully! ===")

if __name__ == "__main__":
    asyncio.run(run_test())
