# /// script
# requires-python = ">=3.12"
# dependencies = ["osmium==4.3.1"]
# ///
import json
import sys

import osmium

ROADS = {"trunk", "primary", "secondary", "tertiary", "unclassified"}
UNPAVED = {"unpaved", "gravel", "dirt", "ground", "compacted", "fine_gravel", "sand", "grass", "earth", "mud", "rock", "pebblestone"}
PLACES = {"city", "town", "village"}

source, roads_out, places_out, scenery_out = sys.argv[1:5]

with open(roads_out, "w") as roads, open(places_out, "w") as places, open(scenery_out, "w") as scenery:
    processor = osmium.FileProcessor(source).with_locations().with_filter(osmium.filter.KeyFilter("highway", "place", "tourism", "natural"))
    for obj in processor:
        if obj.is_node():
            if obj.tags.get("tourism") == "viewpoint":
                scenery.write(json.dumps(["viewpoint", obj.tags.get("name", ""), [[round(obj.location.lon, 5), round(obj.location.lat, 5)]]]) + "\n")
            if obj.tags.get("place") in PLACES and "name" in obj.tags:
                places.write(json.dumps([obj.tags["name"], obj.tags["place"], round(obj.location.lon, 5), round(obj.location.lat, 5)]) + "\n")
            continue
        if not obj.is_way():
            continue
        tags = obj.tags
        if tags.get("natural") == "coastline":
            scenery.write(json.dumps(["coast", "", [[round(n.lon, 5), round(n.lat, 5)] for n in obj.nodes if n.location.valid()]]) + "\n")
            continue
        highway = tags.get("highway")
        if highway not in ROADS or tags.get("surface") in UNPAVED or tags.get("access") in {"private", "no"} or tags.get("area") == "yes":
            continue
        nodes = [n for n in obj.nodes if n.location.valid()]
        if len(nodes) < 2:
            continue
        if tags.get("oneway") == "-1":
            nodes.reverse()
        coords = [[round(n.lon, 6), round(n.lat, 6)] for n in nodes]
        roads.write(json.dumps({
            "id": obj.id,
            "name": tags.get("name", ""),
            "ref": tags.get("ref", ""),
            "highway": highway,
            "surface": tags.get("surface", ""),
            "tracktype": tags.get("tracktype", ""),
            "smoothness": tags.get("smoothness", ""),
            "oneway": tags.get("oneway", "") in {"yes", "-1"},
            "nodes": [nodes[0].ref, nodes[-1].ref],
            "coords": coords,
        }) + "\n")
