#!/usr/bin/env python3
"""
Baixa trafos-*.geojson do release GitHub e extrai mapeamento CTMT -> SUB.
Usado pelo workflow fix-index-json.yml para agrupar alimentadores por subestação
quando os CTMTs são numéricos (ex: Coelba).

Variáveis de ambiente:
  GH_TOKEN    - token de autenticação do GitHub
  TRAFOS_TAG  - tag do release de trafos (ex: bdgd-coelba-2024-trafos)
"""
import json
import os
import sys
import urllib.request
import concurrent.futures

token = os.environ.get('GH_TOKEN', '')
trafos_tag = os.environ.get('TRAFOS_TAG', '')
repo = 'KogaIgor0/markfield-web'
headers = {
    'Authorization': f'token {token}',
    'Accept': 'application/vnd.github+json',
}


def gh_get(url):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


print(f'Buscando release: https://api.github.com/repos/{repo}/releases/tags/{trafos_tag}')
try:
    release = gh_get(
        f'https://api.github.com/repos/{repo}/releases/tags/{trafos_tag}'
    )
    print(f'Release encontrado: id={release.get("id")} tag={release.get("tag_name")}')
except Exception as e:
    print(f'Release trafos nao encontrado: {e} — pulando')
    print(f'Token presente: {"sim" if token else "NAO"}')
    sys.exit(0)

assets = [
    a for a in release.get('assets', [])
    if a['name'].startswith('trafos-')
]
print(f'Assets de trafos: {len(assets)}')

if not assets:
    print('Nenhum asset de trafos — pulando')
    sys.exit(0)


def baixar_asset(asset):
    asset_id = asset['id']
    dl_headers = {**headers, 'Accept': 'application/octet-stream'}
    try:
        req = urllib.request.Request(
            f'https://api.github.com/repos/{repo}/releases/assets/{asset_id}',
            headers=dl_headers,
        )
        with urllib.request.urlopen(req) as r:
            data = json.loads(r.read())
        for feat in data.get('features', []):
            props = feat.get('properties', {})
            ctmt = str(props.get('CTMT', '')).strip()
            sub = str(props.get('SUB', '')).strip()
            if ctmt and sub:
                return ctmt, sub
    except Exception:
        pass
    return None, None


ctmt_sub = {}
errors = 0

with concurrent.futures.ThreadPoolExecutor(max_workers=30) as executor:
    for ctmt, sub in executor.map(baixar_asset, assets):
        if ctmt and sub:
            ctmt_sub[ctmt] = sub
        else:
            errors += 1

print(f'Mapeamento CTMT->SUB: {len(ctmt_sub)} entradas ({errors} erros/vazios)')
util = any(s and not s.lstrip('-').isdigit() for s in ctmt_sub.values())
print(f'SUB alfanumerico util: {util}')
if ctmt_sub:
    print(f'Exemplo: {list(ctmt_sub.items())[:5]}')

with open('ctmt_sub_map.json', 'w') as f:
    json.dump({'map': ctmt_sub, 'useful': util}, f)
print('ctmt_sub_map.json salvo.')
