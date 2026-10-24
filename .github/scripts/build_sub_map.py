#!/usr/bin/env python3
"""
Baixa trafos-*.geojson do release GitHub e extrai mapeamento CTMT -> SUB.
Usa curl via subprocess para garantir que redirects sejam seguidos corretamente.
"""
import json
import os
import sys
import subprocess
import concurrent.futures

token = os.environ.get('GH_TOKEN', '')
trafos_tag = os.environ.get('TRAFOS_TAG', '')
repo = 'KogaIgor0/markfield-web'

print(f'TRAFOS_TAG={trafos_tag}')
print(f'Token presente: {"sim" if token else "NAO"}')

if not token:
    print('Sem GH_TOKEN — pulando')
    sys.exit(0)

def curl_json(url):
    result = subprocess.run(
        ['curl', '-sf', '-H', f'Authorization: token {token}',
         '-H', 'Accept: application/vnd.github+json', url],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        raise Exception(f'curl falhou: {result.stderr}')
    return json.loads(result.stdout)

# Busca release de trafos
print(f'Buscando release: {trafos_tag}')
try:
    release = curl_json(
        f'https://api.github.com/repos/{repo}/releases/tags/{trafos_tag}'
    )
    print(f'Release encontrado: id={release.get("id")} tag={release.get("tag_name")}')
except Exception as e:
    print(f'Erro ao buscar release: {e}')
    sys.exit(0)

assets = [a for a in release.get('assets', []) if a['name'].startswith('trafos-')]
print(f'Assets de trafos: {len(assets)}')

if not assets:
    print('Nenhum asset — pulando')
    sys.exit(0)


def baixar_asset(asset):
    asset_id = asset['id']
    result = subprocess.run(
        ['curl', '-sfL',
         '-H', f'Authorization: token {token}',
         '-H', 'Accept: application/octet-stream',
         f'https://api.github.com/repos/{repo}/releases/assets/{asset_id}'],
        capture_output=True
    )
    if result.returncode != 0:
        return None, None
    try:
        data = json.loads(result.stdout)
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

print(f'Baixando {len(assets)} arquivos em paralelo...')
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
