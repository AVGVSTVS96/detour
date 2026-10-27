# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.3.4", "pillow==12.0.0"]
# ///
import io
import json
import math
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image

ZOOM = 10
WEST, SOUTH, EAST, NORTH = -124.6, 32.4, -114.0, 42.1
TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"

out = sys.argv[1]


def tile_x(lon):
    return math.floor((lon + 180) / 360 * 2**ZOOM)


def tile_y(lat):
    rad = math.radians(lat)
    return math.floor((1 - math.log(math.tan(rad) + 1 / math.cos(rad)) / math.pi) / 2 * 2**ZOOM)


x0, x1, y0, y1 = tile_x(WEST), tile_x(EAST), tile_y(NORTH), tile_y(SOUTH)
grid = np.zeros(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256), dtype=np.int16)


def fetch(xy):
    x, y = xy
    with urllib.request.urlopen(TILES.format(z=ZOOM, x=x, y=y), timeout=60) as response:
        rgb = np.asarray(Image.open(io.BytesIO(response.read())).convert("RGB"), dtype=np.float32)
    meters = rgb[:, :, 0] * 256 + rgb[:, :, 1] + rgb[:, :, 2] / 256 - 32768
    grid[(y - y0) * 256 : (y - y0 + 1) * 256, (x - x0) * 256 : (x - x0 + 1) * 256] = np.clip(meters, -500, 5000).astype(np.int16)


with ThreadPoolExecutor(16) as pool:
    list(pool.map(fetch, [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]))

grid.astype("<i2").tofile(out)
with open(out + ".json", "w") as meta:
    json.dump({"zoom": ZOOM, "x": x0 * 256, "y": y0 * 256, "width": grid.shape[1], "height": grid.shape[0]}, meta)
