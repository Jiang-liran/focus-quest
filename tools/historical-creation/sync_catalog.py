"""Generate the static gallery metadata from the authoritative Python catalog."""
import importlib.util
import json
import re
from pathlib import Path
BASE = Path(__file__).resolve().parent
SOURCE = BASE.parents[1] / 'outputs/focus-quest'
spec=importlib.util.spec_from_file_location('collection_catalog',SOURCE/'shop_catalog_expansion.py')
catalog=importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)
rows=[]
for row in catalog.SHOP_CATALOG_EXTRA:
    item=dict(zip(('id','slot','name','description','coins','diamonds'),row))
    meta=catalog.SHOP_ITEM_META[item['id']]
    item.update(exclusive=bool(meta.get('lotteryExclusive')),lotteryOnly=bool(meta.get('lotteryOnly')),lotteryMachine=meta.get('lotteryMachine'))
    rows.append(item)
assert len(rows)==232
path=SOURCE/'static/shop-expansion.js'
source=path.read_text()
result,count=re.subn(r'const rawEntries=\[.*?\];',lambda m:'const rawEntries='+json.dumps(rows,ensure_ascii=False,separators=(',',':'))+';',source,count=1)
assert count==1
path.write_text(result)
print('Generated',len(rows),'static records, including',sum(row['lotteryOnly'] for row in rows),'limited collections')
