"""Optional offline step: scheduled TTC travel times with r5py (needs Java 21 + Toronto OSM PBF).

The web app only reads the JSON this writes; teammates do not need Java to run the app.
Usage: python precompute_travel_times.py <ttc-gtfs.zip> <toronto.osm.pbf> <neighbourhoods.json> <out.json>
"""
import datetime
import hashlib
import json
import sys

import geopandas as gpd
import r5py
from shapely.geometry import Point

DESTINATIONS = [
    {"id": "union", "name": "Union Station", "lonlat": [-79.3806, 43.6453]},
    {"id": "utsc", "name": "University of Toronto Scarborough", "lonlat": [-79.1870, 43.7845]},
    {"id": "north-york-centre", "name": "North York Centre (Mel Lastman Square)", "lonlat": [-79.4146, 43.7676]},
    {"id": "york-u", "name": "York University (Keele campus)", "lonlat": [-79.4998, 43.7743]},
    {"id": "toronto-general", "name": "Toronto General Hospital", "lonlat": [-79.3880, 43.6590]},
]
DEPARTURE = datetime.datetime(2026, 10, 21, 7, 30)  # Wednesday, regular weekday service in the feed
WINDOW = datetime.timedelta(minutes=60)
PERCENTILES = [25, 50, 75]
MAX_TIME = datetime.timedelta(minutes=150)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main(gtfs, osm, nb_path, out_path):
    nbs = json.load(open(nb_path))["neighbourhoods"]
    origins = gpd.GeoDataFrame(
        {"id": [n["id"] for n in nbs]}, geometry=[Point(*n["representativePoint"]) for n in nbs], crs=4326
    )
    dests = gpd.GeoDataFrame(
        {"id": [d["id"] for d in DESTINATIONS]}, geometry=[Point(*d["lonlat"]) for d in DESTINATIONS], crs=4326
    )
    network = r5py.TransportNetwork(osm, [gtfs])
    matrix = r5py.TravelTimeMatrix(
        network,
        origins=origins,
        destinations=dests,
        departure=DEPARTURE,
        departure_time_window=WINDOW,
        percentiles=PERCENTILES,
        max_time=MAX_TIME,
        transport_modes=[r5py.TransportMode.TRANSIT, r5py.TransportMode.WALK],
    )
    times = {d["id"]: {} for d in DESTINATIONS}
    for row in matrix.itertuples(index=False):
        vals = [getattr(row, f"travel_time_p{p}") for p in PERCENTILES]
        times[row.to_id][str(row.from_id)] = None if any(v != v for v in vals) else [int(v) for v in vals]

    json.dump(
        {
            "source": {
                "engine": f"r5py {r5py.__version__} (Conveyal R5), transit + walk",
                "gtfs": {"title": "TTC Routes and Schedules (GTFS), City of Toronto Open Data", "sha256": sha256(gtfs)},
                "osm": {"title": "OpenStreetMap Toronto extract (BBBike)", "sha256": sha256(osm), "licence": "ODbL, © OpenStreetMap contributors"},
                "departureWindow": {"start": DEPARTURE.isoformat(), "minutes": int(WINDOW.total_seconds() // 60), "timezone": "America/Toronto"},
                "percentiles": PERCENTILES,
                "maxMinutes": int(MAX_TIME.total_seconds() // 60),
                "origins": "Representative point of each City of Toronto neighbourhood (see neighbourhoods.json)",
                "generatedAt": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
                "caveats": "Scheduled service only: no live delays, disruptions or crowding. Travel time from one point per neighbourhood; addresses within it will differ.",
            },
            "destinations": DESTINATIONS,
            "minutes": times,
        },
        open(out_path, "w"),
        indent=1,
    )
    missing = sum(v is None for d in times.values() for v in d.values())
    print(f"wrote {out_path}: {len(nbs)} origins x {len(DESTINATIONS)} destinations, {missing} unreachable within {MAX_TIME}")


if __name__ == "__main__":
    main(*sys.argv[1:5])
