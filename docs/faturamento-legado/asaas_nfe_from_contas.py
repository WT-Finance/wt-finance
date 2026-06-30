#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
asaas_nfe_from_contas.py (v8.3 - 'Emitir NF' S/N/Avulsa + idempotente + endereço/CEP + taxes + effectiveDate + deduções=valor)
------------------------------------------------------------------------------------------------------------------------------
Novidades (v8.3):
- "Emitir NF" aceita também "Avulsa": cria NFS-e desvinculada de pagamento, usando o valor da coluna "Valor NF Avulsa".
- Para idempotência, externalReference vira "<Fatura>-AVULSA" quando for avulsa.
- Linhas ignoradas quando "Emitir NF" não for "S" nem "Avulsa".

Mantido:
- Idempotência (checa invoice existente por externalReference + customer).
- Atualiza endereço/CEP do cliente se faltando.
- Envia effectiveDate (coluna Emissão > CLI > hoje).
- Envia taxes (defaults=0) e municipalServiceCode (9.02) + municipalServiceName.
- Descrição padrão fixa; deduções = valor da nota (normal ou avulsa).
- Pode vincular pagamento (--link-payment) apenas para notas normais.

Arquivos:
  C:/Users/Usuario.WELLNB-24/Desktop/Faturamento/.env
  C:/Users/Usuario.WELLNB-24/Desktop/Faturamento/contas.xlsx
"""
from __future__ import annotations

import argparse
import os
import re
import unicodedata
from dataclasses import dataclass, asdict
from typing import Any, Optional, Dict, List, Tuple
import datetime as dt

import pandas as pd
import requests
from dotenv import load_dotenv

# ---------- Base ----------
BASE_DIR = r"C:\Users\Usuario.WELLNB-24\Desktop\Faturamento"
DEFAULT_SERVICE_DESC   = "Nota fiscal referente às despesas de viagem. Nota Fiscal emitida conforme Portaria 06/2008."
DEFAULT_MUNICIPAL_CODE = "9.02"
DEFAULT_MUNICIPAL_NAME = "Serviços diversos"

def _abs_in_base(path_like: str) -> str:
    return path_like if os.path.isabs(path_like) else os.path.join(BASE_DIR, path_like)

# ---------- Helpers ----------
def normalize(s: str) -> str:
    s = s.replace("º", "o").replace("°", "o")
    s = s.replace("\u00a0", " ").replace("\u202f", " ")
    s = s.replace("\u200b", "").replace("\u200c", "").replace("\u200d", "")
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().strip()
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def only_digits(x: Any) -> Optional[str]:
    if x is None or (isinstance(x, float) and pd.isna(x)): return None
    s = str(x).strip()
    if not s: return None
    from decimal import Decimal, InvalidOperation
    if re.match(r"^[0-9]+(\.[0-9]+)?e\+\d+$", s, flags=re.IGNORECASE):
        try: s = format(Decimal(s), "f")
        except InvalidOperation: pass
    digits = re.sub(r"\D+", "", s)
    if not digits: return None
    if len(digits) > 14 and digits.endswith("0"):
        trimmed = digits.rstrip("0")
        if len(trimmed) in (11, 14): digits = trimmed
    if len(digits) > 14: digits = digits[-14:]
    return digits or None

def is_valid_email(email: Optional[str]) -> bool:
    return bool(email and re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email.strip()))

def parse_numeric(value: Any) -> Optional[float]:
    if value is None or (isinstance(value, float) and pd.isna(value)): return None
    if isinstance(value, (int, float)): return float(value)
    try: return float(str(value).strip())
    except Exception:
        try: return float(pd.to_numeric(value, errors="raise"))
        except Exception: return None

def clean_payload(d: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for k, v in d.items():
        if v is None: continue
        if isinstance(v, str):
            vv = v.strip()
            if vv == "" or vv.lower() in {"null", "none", "n/a", "na", "-", "--"}: continue
            out[k] = vv
        else:
            out[k] = v
    return out

def parse_date(value: Any) -> Optional[str]:
    """Converte entrada de data para 'YYYY-MM-DD'."""
    if value is None or (isinstance(value, float) and pd.isna(value)): return None
    if isinstance(value, (pd.Timestamp, dt.datetime, dt.date)):
        try: return pd.to_datetime(value, errors="raise").strftime("%Y-%m-%d")
        except Exception: return None
    s = str(value).strip()
    if not s: return None
    if re.match(r"^\d{4}-\d{2}-\d{2}([ T]\d{2}(:\d{2})?)?$", s):
        try: return pd.to_datetime(s, errors="raise").strftime("%Y-%m-%d")
        except Exception: return None
    m = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$", s)
    if m:
        d = int(m.group(1)); mon = int(m.group(2)); y = int(m.group(3))
        if y < 100: y += 2000 if y < 70 else 1900
        try: return dt.date(y, mon, d).strftime("%Y-%m-%d")
        except Exception: return None
    if re.fullmatch(r"\d{5,}", s):
        try:
            n = float(s); base = dt.datetime(1899, 12, 30)
            return (base + dt.timedelta(days=n)).strftime("%Y-%m-%d")
        except Exception: pass
    try: return pd.to_datetime(s, dayfirst=True, errors="raise").strftime("%Y-%m-%d")
    except Exception: return None

def sanitize_address(street, number, complement, district, cep, city, state) -> Dict[str, Any]:
    def nz(v):
        if v is None: return None
        s = str(v).strip()
        return s if s and s.lower() not in {"nan", "none"} else None
    def clean_cep(c):
        if c is None: return None
        d = re.sub(r"\D+", "", str(c))
        return d if len(d) == 8 else None
    return clean_payload({
        "address": nz(street),
        "addressNumber": nz(number),
        "complement": nz(complement),
        "province": nz(district),
        "postalCode": clean_cep(cep),
        "city": nz(city),
        "state": nz(state),
    })

# ---------- Env / API ----------
_env_path = os.path.join(BASE_DIR, ".env")
load_dotenv(_env_path) if os.path.exists(_env_path) else load_dotenv()

ASAAS_API_KEY  = os.getenv("ASAAS_API_KEY", "").strip()
ASAAS_BASE_URL = os.getenv("ASAAS_BASE_URL", "https://api-sandbox.asaas.com/v3").rstrip("/")
ASAAS_MUNICIPAL_SERVICE_CODE = (os.getenv("ASAAS_MUNICIPAL_SERVICE_CODE", DEFAULT_MUNICIPAL_CODE) or DEFAULT_MUNICIPAL_CODE).strip()
ASAAS_MUNICIPAL_SERVICE_NAME = (os.getenv("ASAAS_MUNICIPAL_SERVICE_NAME", DEFAULT_MUNICIPAL_NAME) or DEFAULT_MUNICIPAL_NAME).strip()

HEADERS = {"Content-Type": "application/json", "Accept": "application/json", "access_token": ASAAS_API_KEY}
def api_enabled() -> bool: return bool(ASAAS_API_KEY)

def _req(method: str, path: str, *, params=None, json_body=None) -> dict:
    url = f"{ASAAS_BASE_URL}{path}"
    r = requests.request(method, url, headers=HEADERS, params=params, json=json_body, timeout=30)
    try: data = r.json() if r.content else {}
    except Exception:
        r.raise_for_status(); raise
    if not r.ok:
        raise RuntimeError(f"Asaas API error {r.status_code}: {data}")
    return data

# ---------- Customers / Payments ----------
def find_customer(cpfCnpj: Optional[str] = None, name: Optional[str] = None) -> Optional[dict]:
    if cpfCnpj:
        r = _req("GET", "/customers", params={"cpfCnpj": cpfCnpj, "limit": 1})
        if r.get("data"): return r["data"][0]
    if name:
        r = _req("GET", "/customers", params={"name": name, "limit": 1})
        if r.get("data"): return r["data"][0]
    return None

def update_customer(customer_id: str, *, cpfCnpj: Optional[str]=None, email: Optional[str]=None,
                    address: Optional[Dict[str, Any]]=None) -> dict:
    payload: Dict[str, Any] = {}
    if cpfCnpj: payload["cpfCnpj"] = cpfCnpj
    if email and is_valid_email(email): payload["email"] = email.strip()
    if address: payload.update(address)
    if not payload: return _req("GET", f"/customers/{customer_id}")
    return _req("PUT", f"/customers/{customer_id}", json_body=payload)

def ensure_customer(name: str, email_for_create: Optional[str], cpfCnpj: Optional[str]) -> Tuple[dict, bool, bool]:
    if cpfCnpj:
        c_by_cnpj = find_customer(cpfCnpj=cpfCnpj, name=None)
        if c_by_cnpj: return c_by_cnpj, False, False
    c_by_name = find_customer(cpfCnpj=None, name=name)
    if c_by_name:
        updated = False
        need_update = (cpfCnpj and not c_by_name.get("cpfCnpj"))
        need_email  = (email_for_create and is_valid_email(email_for_create) and not c_by_name.get("email"))
        if need_update or need_email:
            c_by_name = update_customer(c_by_name["id"],
                                        cpfCnpj=cpfCnpj if need_update else None,
                                        email=email_for_create if need_email else None)
            updated = True
        return c_by_name, False, updated
    payload = clean_payload({"name": name, "cpfCnpj": cpfCnpj, "email": email_for_create})
    created = _req("POST", "/customers", json_body=payload)
    return created, True, False

def find_payment_by_external_ref(external_ref: str, customer_id: Optional[str] = None) -> Optional[dict]:
    params = {"externalReference": external_ref, "limit": 1}
    if customer_id: params["customer"] = customer_id
    r = _req("GET", "/payments", params=params)
    if r.get("data"): return r["data"][0]
    return None

# ---------- Invoices ----------
def find_invoice_by_external_ref(external_ref: str, customer_id: Optional[str] = None) -> Optional[dict]:
    params = {"externalReference": str(external_ref), "limit": 1}
    if customer_id:
        params["customer"] = customer_id
    r = _req("GET", "/invoices", params=params)
    data = r.get("data") or []
    return data[0] if data else None

def create_invoice(
    *,
    customer_id: str,
    value: float,
    description: str,
    externalReference: str,
    municipalServiceCode: str,
    municipalServiceName: str,
    effectiveDate: str,
    taxes: Dict[str, Any],
    payment_id: Optional[str] = None,
) -> dict:
    payload = {
        "customer": customer_id if not payment_id else None,
        "payment": payment_id,
        "serviceDescription": description,
        "value": float(value),
        "externalReference": str(externalReference),
        "municipalServiceCode": str(municipalServiceCode),
        "municipalServiceName": municipalServiceName,
        "effectiveDate": effectiveDate,
        "deductions": float(value),  # deduções = valor da nota
        "taxes": taxes,
    }
    payload = clean_payload(payload)
    return _req("POST", "/invoices", json_body=payload)

def authorize_invoice(invoice_id: str) -> dict:
    return _req("POST", f"/invoices/{invoice_id}/authorize")

# ---------- Saída ----------
@dataclass
class RowOut:
    pessoa: str
    cpfCnpj: Optional[str]
    value: Optional[float]
    externalReference: Optional[str]
    municipalServiceCode: Optional[str]
    municipalServiceName: Optional[str]
    serviceDescription: Optional[str]
    effectiveDate: Optional[str]
    taxes: Optional[str]
    customer_id: Optional[str]
    invoice_id: Optional[str]
    payment_id: Optional[str]
    address_updated: Optional[bool]
    created: bool
    authorized: Optional[bool]
    status: Optional[str]
    pdfUrl: Optional[str]
    xmlUrl: Optional[str]
    error: Optional[str]

# ---------- Mapeamento ----------
EXPECTED_REQUIRED = {
    "pessoa": ["pessoa"],
    "valor_final": ["valor final", "valorfinal"],
    "fatura_num": ["fatura cliente no", "fatura cliente n o", "fatura cliente n",
                   "fatura cliente numero", "fatura cliente", "fatura"],
}
EXPECTED_OPTIONAL = {
    "email": ["email", "e mail", "e-mail"],
    "cnpj": ["cnpj", "cpf cnpj", "cpf", "documento", "documento fiscal"],
    "cpf_col": ["cpf"],
    "emissao": ["emissao", "emiss o", "emiss ao", "data de emissao", "data emissao",
                "emissão", "data de emissão"],
    # endereço
    "cidade": ["cidade"],
    "uf": ["uf", "estado"],
    "endereco": ["endereco", "endereço", "logradouro", "rua"],
    "numero": ["numero", "número"],
    "complemento": ["complemento"],
    "bairro": ["bairro", "provincia", "província"],
    "cep": ["cep", "codigo postal", "código postal", "postal code", "postalcode"],
    # controles de emissão
    "emitir_nf": ["emitir nf", "emitir nota", "emitir nfe", "emitir nfs e", "gerar nf", "gera nf"],
    "valor_nf_avulsa": ["valor nf avulsa", "valor nf", "valor nota", "valor nfs e", "valor nfe", "valor nf av"]
}

def map_columns(df: pd.DataFrame, debug: bool=False) -> Dict[str, str]:
    def n(s): return normalize(str(s))
    norm_map = {col: n(col) for col in df.columns}
    if debug:
        print("Cabeçalhos (original -> normalizado):")
        for c in df.columns:
            print(f"- {repr(c)} -> {repr(norm_map[c])}")
    out: Dict[str, str] = {}

    def pick(key: str, candidates: List[str]) -> Optional[str]:
        # exato
        for cand in candidates:
            m = [col for col, norm in norm_map.items() if norm == cand]
            if m:
                if key in ("cnpj","cpf_col") and len(m) > 1:
                    def score(col):
                        s = df[col].astype(str).str.replace(r"\D", "", regex=True).str.len()
                        return int(s.isin([11,14]).sum())
                    m.sort(key=score, reverse=True)
                return m[0]
        # contains
        for cand in candidates:
            m = [col for col, norm in norm_map.items() if cand in norm]
            if m:
                if key in ("cnpj","cpf_col") and len(m) > 1:
                    def score(col):
                        s = df[col].astype(str).str.replace(r"\D", "", regex=True).str.len()
                        return int(s.isin([11,14]).sum())
                    m.sort(key=score, reverse=True)
                return m[0]
        return None

    # obrigatórias
    for key, cands in EXPECTED_REQUIRED.items():
        col = pick(key, cands)
        if col: out[key] = col

    # opcionais
    for key, cands in EXPECTED_OPTIONAL.items():
        col = pick(key, cands)
        if col: out[key] = col

    missing = [k for k in EXPECTED_REQUIRED if k not in out]
    if missing:
        raise ValueError(f"Colunas obrigatórias não encontradas: {missing}. Cabeçalhos: {list(df.columns)}")
    if debug: print("Mapeamento final:", out)
    return out

# ---------- Core ----------
def process(input_path: str, sheet: Optional[str], out_csv: str,
            authorize: bool, link_payment: bool,
            municipal_code_cli: Optional[str], municipal_name_cli: Optional[str],
            default_desc_cli: Optional[str], cli_effective: Optional[str],
            iss: float, pis: float, cofins: float, csll: float, inss: float, ir: float, retain_iss: bool,
            debug: bool=False) -> str:

    input_path = _abs_in_base(input_path)
    out_csv    = _abs_in_base(out_csv)
    os.makedirs(os.path.dirname(out_csv), exist_ok=True)

    mcode = (municipal_code_cli or ASAAS_MUNICIPAL_SERVICE_CODE or DEFAULT_MUNICIPAL_CODE).strip()
    mname = (municipal_name_cli or ASAAS_MUNICIPAL_SERVICE_NAME or DEFAULT_MUNICIPAL_NAME).strip()
    desc  = default_desc_cli or DEFAULT_SERVICE_DESC

    # leitura
    if input_path.lower().endswith(".csv"):
        df = pd.read_csv(input_path, dtype=str, sep=None, engine="python")
    else:
        df = pd.read_excel(input_path, sheet_name=sheet, dtype=str)
    colmap = map_columns(df, debug=debug)
    df[colmap["valor_final"]] = pd.to_numeric(df[colmap["valor_final"]], errors="coerce")

    results: List[RowOut] = []
    for _, row in df.iterrows():
        # ----- Controle "Emitir NF" -----
        emitir_flag = None
        emitir_ok = True
        mode_avulsa = False
        if "emitir_nf" in colmap and pd.notna(row.get(colmap["emitir_nf"], None)):
            raw_flag = str(row[colmap["emitir_nf"]]).strip()
            flag_norm = normalize(raw_flag)
            if flag_norm.startswith("s"):          # "s", "sim"...
                emitir_ok = True
                mode_avulsa = False
            elif "avulsa" in flag_norm:            # "avulsa"
                emitir_ok = True
                mode_avulsa = True
            else:
                emitir_ok = False

        pessoa = (row[colmap["pessoa"]] or "").strip() if pd.notna(row[colmap["pessoa"]]) else ""
        value_plan  = parse_numeric(row[colmap["valor_final"]])
        extref_base = (row[colmap["fatura_num"]] or "").strip() if pd.notna(row[colmap["fatura_num"]]) else None

        # valor da nota (normal = valor_final; avulsa = valor_nf_avulsa)
        value_for_invoice = value_plan
        if mode_avulsa:
            if "valor_nf_avulsa" not in colmap:
                # sem coluna de valor avulsa -> erro
                value_for_invoice = None
            else:
                value_for_invoice = parse_numeric(row[colmap["valor_nf_avulsa"]])

        # e-mail pode ajudar a completar cadastro; não é obrigatório na NFS-e
        email_for_create = str(row[colmap["email"]]).strip() if "email" in colmap and pd.notna(row[colmap["email"]]) else None

        # Documento: CNPJ; se vazio, fallback para CPF (se houver)
        doc = None
        if "cnpj" in colmap and pd.notna(row[colmap["cnpj"]]): doc = only_digits(row[colmap["cnpj"]])
        if (not doc) and ("cpf_col" in colmap) and pd.notna(row[colmap["cpf_col"]]): doc = only_digits(row[colmap["cpf_col"]])

        # effectiveDate: CLI > coluna Emissão > hoje
        eff = None
        if cli_effective: eff = parse_date(cli_effective)
        if (not eff) and ("emissao" in colmap) and pd.notna(row.get(colmap["emissao"], None)):
            eff = parse_date(row[colmap["emissao"]])
        if not eff: eff = dt.date.today().strftime("%Y-%m-%d")

        # taxes (sempre envia)
        taxes = {
            "retainIss": bool(retain_iss),
            "iss": float(iss), "pis": float(pis), "cofins": float(cofins),
            "csll": float(csll), "inss": float(inss), "ir": float(ir),
        }

        # endereço da planilha (para atualizar o cliente se necessário)
        addr = sanitize_address(
            street=row[colmap["endereco"]] if "endereco" in colmap else None,
            number=row[colmap["numero"]] if "numero" in colmap else None,
            complement=row[colmap["complemento"]] if "complemento" in colmap else None,
            district=row[colmap["bairro"]] if "bairro" in colmap else None,
            cep=row[colmap["cep"]] if "cep" in colmap else None,
            city=row[colmap["cidade"]] if "cidade" in colmap else None,
            state=row[colmap["uf"]] if "uf" in colmap else None,
        )

        rout = RowOut(
            pessoa=pessoa, cpfCnpj=doc, value=value_for_invoice, externalReference=None,
            municipalServiceCode=mcode, municipalServiceName=mname,
            serviceDescription=DEFAULT_SERVICE_DESC if not default_desc_cli else default_desc_cli,
            effectiveDate=eff, taxes=str(taxes),
            customer_id=None, invoice_id=None, payment_id=None, address_updated=None,
            created=False, authorized=None, status=None, pdfUrl=None, xmlUrl=None, error=None
        )

        # Se controle disser para NÃO emitir, registra e segue
        if not emitir_ok:
            rout.error = "Ignorado: Emitir NF != 'S' e != 'Avulsa'"
            results.append(rout)
            continue

        # externalReference (idempotência)
        if not extref_base:
            rout.error = "Fatura Cliente Nº ausente"
            results.append(rout); continue
        extref = extref_base if not mode_avulsa else f"{extref_base}-AVULSA"
        rout.externalReference = extref

        # validações
        if not pessoa: rout.error = "Pessoa vazia"
        if value_for_invoice is None:
            msg = "Valor NF Avulsa ausente/não numérico" if mode_avulsa else "Valor Final ausente/não numérico"
            rout.error = (rout.error + " | " if rout.error else "") + msg
        if not doc: rout.error = (rout.error + " | " if rout.error else "") + "CPF/CNPJ obrigatório"
        if not eff: rout.error = (rout.error + " | " if rout.error else "") + "effectiveDate ausente"
        if rout.error:
            results.append(rout); continue

        try:
            if not api_enabled(): raise RuntimeError("ASAAS_API_KEY ausente. Configure seu .env.")

            # garante cliente
            cust, _, _ = ensure_customer(name=pessoa, email_for_create=email_for_create, cpfCnpj=doc)
            rout.customer_id = cust.get("id")

            # se endereço do cliente estiver faltando/CEP inválido, atualiza com dados da planilha
            def needs_address_update(cust: dict, addr: Dict[str, Any]) -> Dict[str, Any]:
                out = {}
                cep_ok = cust.get("postalCode") and re.fullmatch(r"\d{8}", str(cust["postalCode"]))
                if not cep_ok and addr.get("postalCode"): out["postalCode"] = addr["postalCode"]
                for k in ("address","addressNumber","province","city","state"):
                    if (not cust.get(k)) and addr.get(k):
                        out[k] = addr[k]
                if (not cust.get("complement")) and addr.get("complement"):
                    out["complement"] = addr["complement"]
                return out

            addr_update = needs_address_update(cust, addr)
            if addr_update:
                cust = update_customer(cust["id"], address=addr_update)
                rout.address_updated = True
            else:
                rout.address_updated = False

            # vincular pagamento?
            pay_id = None
            if (not mode_avulsa) and link_payment and extref_base:
                p = find_payment_by_external_ref(extref_base, customer_id=rout.customer_id)
                if p: pay_id = p.get("id")
            rout.payment_id = pay_id  # ficará None no modo avulsa

            # ---------- TRAVA DE DUPLICAÇÃO ----------
            existing = find_invoice_by_external_ref(extref, customer_id=rout.customer_id)
            if existing:
                existing_status = (existing.get("status") or "").upper()
                if existing_status in ("PENDING", "IN_PROCESS", "AUTHORIZED", "CANCEL_REQUESTED"):
                    rout.invoice_id = existing.get("id")
                    rout.status     = existing_status
                    rout.pdfUrl     = existing.get("pdfUrl")
                    rout.xmlUrl     = existing.get("xmlUrl")
                    rout.error      = "Já existia (não emitida novamente)"
                    results.append(rout)
                    continue

            # cria NFS-e (deduções = valor da nota)
            inv = create_invoice(
                customer_id=rout.customer_id,
                value=float(value_for_invoice),
                description=(DEFAULT_SERVICE_DESC if not default_desc_cli else default_desc_cli),
                externalReference=extref,
                municipalServiceCode=mcode,
                municipalServiceName=mname,
                effectiveDate=eff,
                taxes=taxes,
                payment_id=pay_id,  # None se avulsa
            )
            rout.created    = True
            rout.invoice_id = inv.get("id")
            rout.status     = inv.get("status")
            rout.pdfUrl     = inv.get("pdfUrl")
            rout.xmlUrl     = inv.get("xmlUrl")

            # autoriza
            if authorize and rout.invoice_id:
                auth = authorize_invoice(rout.invoice_id)
                rout.status = auth.get("status", rout.status)
                rout.pdfUrl = auth.get("pdfUrl", rout.pdfUrl)
                rout.xmlUrl = auth.get("xmlUrl", rout.xmlUrl)
                rout.authorized = True

        except Exception as e:
            rout.error = str(e)

        results.append(rout)

    # CSV de saída
    import csv
    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=list(asdict(results[0]).keys()) if results else [
                "pessoa","cpfCnpj","value","externalReference",
                "municipalServiceCode","municipalServiceName","serviceDescription","effectiveDate","taxes",
                "customer_id","invoice_id","payment_id","address_updated",
                "created","authorized","status","pdfUrl","xmlUrl","error"
            ],
        )
        writer.writeheader()
        for r in results:
            writer.writerow(asdict(r))

    return out_csv

def main():
    p = argparse.ArgumentParser(description="NFS-e Asaas a partir de 'contas.xlsx' (normal ou avulsa; idempotente).")
    p.add_argument("--input", required=False, default="contas.xlsx", help="Caminho do arquivo .xlsx ou .csv (default: contas.xlsx)")
    p.add_argument("--sheet", help="Nome da aba (se Excel)")
    p.add_argument("--out", default="out_notas_fiscais.csv", help="CSV de saída")
    p.add_argument("--authorize", action="store_true", help="Autoriza a NFS-e após criar")
    p.add_argument("--link-payment", action="store_true", help="Vincula a NFS-e ao pagamento (apenas notas normais)")

    # Serviço municipal / descrição / data
    p.add_argument("--municipal-code", help="municipalServiceCode (override do .env)", default=None)
    p.add_argument("--municipal-name", help="municipalServiceName (override do .env)", default=None)
    p.add_argument("--default-desc", help="Descrição padrão (override da fixa)", default=None)
    p.add_argument("--effective", help="Data de emissão fixa (YYYY-MM-DD) para todas as notas", default=None)

    # Impostos (defaults = 0) + retenção de ISS
    p.add_argument("--iss", type=float, default=0.0, help="Alíquota ISS (%)")
    p.add_argument("--pis", type=float, default=0.0, help="Alíquota PIS (%)")
    p.add_argument("--cofins", type=float, default=0.0, help="Alíquota COFINS (%)")
    p.add_argument("--csll", type=float, default=0.0, help="Alíquota CSLL (%)")
    p.add_argument("--inss", type=float, default=0.0, help="Alíquota INSS (%)")
    p.add_argument("--ir", type=float, default=0.0, help="Alíquota IR (%)")
    p.add_argument("--retain-iss", action="store_true", help="Se presente, reter ISS na fonte")

    p.add_argument("--debug", action="store_true", help="Mostra mapeamento de colunas")
    args = p.parse_args()

    out = process(
        input_path=args.input,
        sheet=args.sheet,
        out_csv=args.out,
        authorize=args.authorize,
        link_payment=args.link_payment,
        municipal_code_cli=args.municipal_code,
        municipal_name_cli=args.municipal_name,
        default_desc_cli=args.default_desc,
        cli_effective=args.effective,
        iss=args.iss, pis=args.pis, cofins=args.cofins, csll=args.csll, inss=args.inss, ir=args.ir,
        retain_iss=args.retain_iss,
        debug=args.debug,
    )
    print(f"OK. Resultado em: {out}")

if __name__ == "__main__":
    main()
