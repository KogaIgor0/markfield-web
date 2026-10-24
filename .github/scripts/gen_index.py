#!/usr/bin/env python3
"""
Gera index.json a partir de assets_raw.json e ctmt_sub_map.json (opcional).

Variáveis de ambiente:
  INPUT_DIST_ID  - id da distribuidora (ex: coelba_2024)
"""
import json
import os
import re
import sys
from collections import defaultdict

dist_id = os.environ.get('INPUT_DIST_ID', '')
clean_id = re.sub(r'_[0-9]+$', '', dist_id)
print(f'dist_id={dist_id} clean_id={clean_id}')

with open('assets_raw.json') as f:
    data = json.load(f)

assets = data.get('assets', [])
print(f'assets: {len(assets)}')
if not assets:
    print('ERROR: no assets')
    sys.exit(1)

ctmts = []
for a in assets:
    m = re.match(r'^linhas-(.+)\.geojson$', a['name'])
    if m:
        ctmts.append(m.group(1))

print(f'ctmts: {len(ctmts)}')
if not ctmts:
    print('ERROR: no ctmts')
    sys.exit(1)

# Tenta usar mapeamento CTMT->SUB dos trafos (quando disponivel e util)
ctmt_sub = {}
use_sub = False
if os.path.exists('ctmt_sub_map.json'):
    with open('ctmt_sub_map.json') as f:
        sub_data = json.load(f)
    use_sub = sub_data.get('useful', False)
    if use_sub:
        ctmt_sub = sub_data.get('map', {})
        print(f'Usando SUB dos trafos para agrupamento ({len(ctmt_sub)} mapeamentos)')
    else:
        print('SUB nao util — usando agrupamento por prefixo')
else:
    print('ctmt_sub_map.json nao encontrado — usando agrupamento por prefixo')

index = defaultdict(list)
sem_sub = 0
for ctmt in sorted(ctmts):
    if use_sub and ctmt in ctmt_sub:
        sub = ctmt_sub[ctmt]
    elif '_' in ctmt:
        sub = ctmt.split('_')[0]
    else:
        m2 = re.match(r'^[A-Z]+', ctmt)
        sub = m2.group() if m2 else ctmt
        if use_sub:
            sem_sub += 1

    index[sub].append(ctmt)

if sem_sub:
    print(f'Aviso: {sem_sub} CTMTs sem mapeamento SUB — usou prefixo')

result = {'distribuidora': clean_id, 'alimentadores': dict(index)}
with open('index.json', 'w') as f:
    json.dump(result, f)

total = sum(len(v) for v in index.values())
print(f'OK: {total} ctmts em {len(index)} subestacoes')
