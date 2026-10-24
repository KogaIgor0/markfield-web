#!/usr/bin/env python3
import json, sys
d = json.load(sys.stdin)
print('useful:', d.get('useful'))
print('entradas:', len(d.get('map', {})))
items = list(d.get('map', {}).items())[:5]
print('exemplos:', items)
