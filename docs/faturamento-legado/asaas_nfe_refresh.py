#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
asaas_nfe_refresh.py (v3.2 - filename: Fatura [extRef] - [pessoa] - NF [number])
--------------------------------------------------------------------------------
Atualiza links/status das NFS-e já solicitadas no Asaas e (opcional) baixa PDF/XML.

Novidades:
- Nome do arquivo baixado segue: "Fatura [externalReference] - [pessoa] - NF [number].ext"
  * Se 'number' não existir, usa 'invoice_id' como fallback: "NF [invoice_id]".
- Mantém colunas extras: number, rpsNumber, verificationCode.

Uso típico:
  python asaas_nfe_refresh.py --csv out_notas_fiscais.csv ^
      --only-missing --download-pdf --download-xml ^
      --dest "C:\\Users\\Usuario.WELLNB-24\\Desktop\\Faturamento\\09.25\\16.09"

Requisitos:
  pip install pandas requests python-dotenv
.env:
  ASAAS_API_KEY=...
  ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3   # produção: https://api-sandbox.asaas.com/v3
"""

from __future__ import annotations
import argparse, os, re, shutil, time
from typing import Optional
import pandas as pd
import requests
from dotenv import load_dotenv

# --- Config base ---
BASE_DIR = r"C:\Users\Usuario.WELLNB-24\Desktop\Faturamento"
DEFAULT_CSV = "out_notas_fiscais.csv"
DEFAULT_DOWNLOAD_SUBFOLDER = "notas"

def _abs(path_like: str) -> str:
    return path_like if os.path.isabs(path_like) else os.path.join(BASE_DIR, path_like)

# --- ENV / API ---
_env_path = os.path.join(BASE_DIR, ".env")
load_dotenv(_env_path) if os.path.exists(_env_path) else load_dotenv()

ASAAS_API_KEY  = os.getenv("ASAAS_API_KEY", "").strip()
ASAAS_BASE_URL = os.getenv("ASAAS_BASE_URL", "https://api-sandbox.asaas.com/v3").rstrip("/")

HEADERS = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "access_token": ASAAS_API_KEY,
}

def _req(method: str, path: str, *, params=None, timeout=30) -> dict:
    url = f"{ASAAS_BASE_URL}{path}"
    r = requests.request(method, url, headers=HEADERS, params=params, timeout=timeout)
    try:
        data = r.json() if r.content else {}
    except Exception:
        r.raise_for_status()
        raise
    if not r.ok:
        raise RuntimeError(f"Asaas API error {r.status_code}: {data}")
    return data

# --- API helpers ---
def get_invoice_by_id(invoice_id: str) -> dict:
    return _req("GET", f"/invoices/{invoice_id}")

def find_invoice_by_external_ref(external_ref: str, customer_id: Optional[str] = None) -> Optional[dict]:
    params = {"externalReference": str(external_ref), "limit": 1}
    if customer_id:
        params["customer"] = customer_id
    data = _req("GET", "/invoices", params=params)
    arr = data.get("data") or []
    return arr[0] if arr else None

# --- IO helpers ---
INVALID_FS_CHARS = r'<>:"/\|?*'
def safe_name(s: str, replace_with: str = "_") -> str:
    if s is None:
        return ""
    out = str(s)
    for ch in INVALID_FS_CHARS:
        out = out.replace(ch, replace_with)
    out = re.sub(r"\s+", " ", out).strip()
    return out

def ensure_cols(df: pd.DataFrame, cols) -> pd.DataFrame:
    for c in cols:
        if c not in df.columns:
            df[c] = None
    return df

def to_str(x) -> str:
    return "" if x is None or (isinstance(x, float) and pd.isna(x)) else str(x)

def download_file(url: str, dest_path: str, *, overwrite: bool=False):
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    if (not overwrite) and os.path.exists(dest_path):
        return
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    with open(dest_path, "wb") as f:
        f.write(r.content)

def build_filename(extref: str, pessoa: str, number: Optional[str], invoice_id: Optional[str], ext: str) -> str:
    """
    Monta "Fatura [externalReference] - [pessoa] - NF [number].ext"
    Se 'number' não existir, usa invoice_id como fallback.
    Limita tamanho para evitar problemas no Windows.
    """
    extref_s = safe_name(extref or "semRef")
    pessoa_s = safe_name(pessoa or "Cliente")
    nf_part  = safe_name(number or invoice_id or "semNumero")
    # Limita o tamanho total do nome do arquivo (sem caminho) para ~140 chars
    base = f"Fatura {extref_s} - {pessoa_s} - NF {nf_part}"
    base = base[:140]
    return f"{base}.{ext.lstrip('.')}"

# --- Core ---
def refresh(csv_path: str, *, only_missing: bool, download_pdf: bool, download_xml: bool,
            max_rows: Optional[int], dest_dir: Optional[str], overwrite: bool) -> str:
    if not ASAAS_API_KEY:
        raise SystemExit("Faltou ASAAS_API_KEY no .env")

    csv_path = _abs(csv_path)
    if not os.path.exists(csv_path):
        raise SystemExit(f"CSV não encontrado: {csv_path}")

    save_dir = _abs(dest_dir) if dest_dir else _abs(DEFAULT_DOWNLOAD_SUBFOLDER)

    df = pd.read_csv(csv_path, dtype=str)
    df = ensure_cols(df, [
        "invoice_id","externalReference","customer_id",
        "status","pdfUrl","xmlUrl","danfeUrl",
        "number","rpsNumber","verificationCode",
        "error","pessoa"
    ])

    processed = 0
    updated = 0
    errors = 0

    for idx, row in df.iterrows():
        if max_rows and processed >= max_rows:
            break
        inv_id = to_str(row.get("invoice_id")).strip()
        extref = to_str(row.get("externalReference")).strip()
        custid = to_str(row.get("customer_id")).strip()
        status = to_str(row.get("status")).strip().upper()
        pdf    = to_str(row.get("pdfUrl")).strip()
        xml    = to_str(row.get("xmlUrl")).strip()

        # se --only-missing, pula linhas já autorizadas com PDF
        if only_missing and pdf and status == "AUTHORIZED":
            continue

        processed += 1
        print(f"- Linha {idx+1}: pessoa={row.get('pessoa')} extRef={extref or '-'} inv={inv_id or '-'} status={status or '-'}")

        try:
            inv = None
            if inv_id:
                inv = get_invoice_by_id(inv_id)
            if not inv and extref:
                inv = find_invoice_by_external_ref(extref, customer_id=custid or None)
                if inv and not inv_id:
                    df.at[idx, "invoice_id"] = inv.get("id")
                    inv_id = inv.get("id") or inv_id

            if not inv:
                continue

            new_status = inv.get("status") or status
            new_pdf    = inv.get("pdfUrl") or pdf
            new_xml    = inv.get("xmlUrl") or xml
            new_danfe  = inv.get("danfeUrl") or row.get("danfeUrl")
            new_number = inv.get("number") or row.get("number")
            new_rps    = inv.get("rpsNumber") or row.get("rpsNumber")
            new_code   = inv.get("verificationCode") or row.get("verificationCode")

            changed = False
            for col, newv in (
                ("status", new_status),
                ("pdfUrl", new_pdf),
                ("xmlUrl", new_xml),
                ("danfeUrl", new_danfe),
                ("number", new_number),
                ("rpsNumber", new_rps),
                ("verificationCode", new_code),
            ):
                if to_str(row.get(col)).strip() != to_str(newv).strip():
                    df.at[idx, col] = newv
                    changed = True

            # download opcional com nome personalizado
            pessoa_val = to_str(row.get("pessoa")).strip()
            if download_pdf and new_pdf:
                try:
                    fname = build_filename(extref, pessoa_val, new_number, inv_id, ".pdf")
                    dest = os.path.join(save_dir, fname)
                    download_file(new_pdf, dest, overwrite=overwrite)
                except Exception as e:
                    df.at[idx, "error"] = f"Falha ao baixar PDF: {e}"
                    changed = True
            if download_xml and new_xml:
                try:
                    fname = build_filename(extref, pessoa_val, new_number, inv_id, ".xml")
                    dest = os.path.join(save_dir, fname)
                    download_file(new_xml, dest, overwrite=overwrite)
                except Exception as e:
                    df.at[idx, "error"] = f"Falha ao baixar XML: {e}"
                    changed = True

            if changed:
                updated += 1

        except Exception as e:
            df.at[idx, "error"] = str(e)
            errors += 1

        time.sleep(0.15)

    bak_path = csv_path + ".bak"
    shutil.copyfile(csv_path, bak_path)
    df.to_csv(csv_path, index=False, encoding="utf-8")
    print(f"\nResumo: processadas={processed}, atualizadas={updated}, erros={errors}")
    print(f"Backup criado em: {bak_path}")
    print(f"Downloads em: {save_dir}")
    return csv_path

def main():
    ap = argparse.ArgumentParser(description="Atualiza links/status das NFS-e no CSV e baixa PDF/XML para uma pasta.")
    ap.add_argument("--csv", default=DEFAULT_CSV, help="Arquivo CSV de saída do emissor (default: out_notas_fiscais.csv)")
    ap.add_argument("--only-missing", action="store_true", help="Processa apenas linhas sem PDF ou não-autorizadas")
    ap.add_argument("--download-pdf", action="store_true", help="Baixa o PDF quando disponível")
    ap.add_argument("--download-xml", action="store_true", help="Baixa o XML quando disponível")
    ap.add_argument("--dest", default=None, help=r"Pasta de destino (ex.: C:\...\09.25\16.09). Se ausente, usa 'notas\'")
    ap.add_argument("--overwrite", action="store_true", help="Se presente, sobrescreve arquivos existentes")
    ap.add_argument("--max-rows", type=int, default=None, help="Limita a quantidade de linhas processadas nesta execução")
    args = ap.parse_args()

    refresh(
        csv_path=args.csv,
        only_missing=args.only_missing,
        download_pdf=args.download_pdf,
        download_xml=args.download_xml,
        max_rows=args.max_rows,
        dest_dir=args.dest,
        overwrite=args.overwrite,
    )

if __name__ == "__main__":
    main()
