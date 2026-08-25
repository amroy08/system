import pandas as pd
import json
import os

def convert():
    files = [
        ('primary', '/Users/amroy/Downloads/primary data .xlsx'),
        ('secondary', '/Users/amroy/Downloads/secondary data.xlsx'),
        ('old', '/Users/amroy/Downloads/old data.xlsx')
    ]
    
    out_dir = '/Users/amroy/Desktop/system/server/data/import_temp'
    os.makedirs(out_dir, exist_ok=True)
    
    for name, path in files:
        print(f"Reading {path}...")
        df = pd.read_excel(path, header=1)
        
        # Convert all column names to string and strip whitespace
        df.columns = [str(c).strip() for c in df.columns]
        
        # Replace NaN with None so it converts to null in JSON
        df = df.astype(object).where(pd.notnull(df), None)
        
        records = df.to_dict(orient='records')
        out_path = os.path.join(out_dir, f"{name}.json")
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(records, f, indent=2, ensure_ascii=False)
        print(f"Saved {len(records)} records to {out_path}")

if __name__ == '__main__':
    convert()
