#!/usr/bin/env python3
"""
asaas_from_simple_sheet.py (v11: controle 'Emitir Boleto' S/N)
--------------------------------------------------------------
Novidade:
- Se houver a coluna "Emitir Boleto" (valores S/N), só processa/gera boleto quando for "S".
- Quando a coluna existir e não for "S", a linha é ignorada e registrada no CSV com:
  error="Ignorado: Emitir Boleto != 'S'".
- Se a coluna não existir, comportamento permanece o mesmo (compatível com versões anteriores).

Demais comportamentos (mantidos do v10):
- Se encontrar cliente por NOME e ele não tiver cpfCnpj no Asaas, atualiza (PUT) com o CPF/CNPJ da planilha.
- Busca cliente por CNPJ/CPF → Nome; e-mail só na criação/atualização (se válido).
- Valor Final já numérico.
- Padrões: descrição "Fatura <N> - Após 5 dias em atraso o título será negativado."
  Multa 2% (--fine), Juros 2% ao mês (--interest).

Colunas esperadas:
- Pessoa                (obrigatória)
- Vencimento            (obrigatória)
- Valor Final           (obrigatória)  -> já numérico
- Fatura Cliente Nº     (obrigatória)  -> externalReference
- E-mail                (opcional)     -> criação/atualização de cliente
- CNPJ                  (opcional)     -> CPF/CNPJ; só dígitos (obrigatório para emitir BOLETO)
- Emitir Boleto         (opcional)     -> "S" para emitir; outros valores ignoram a linha

.env:
  ASAAS_API_KEY=...
  ASAAS_BASE_URL=https://sandbox.asaas.com/api/v3   # produção: https://api.asaas.com/v3
"""
from __future__ import annotations

import argparse
import os
import re
import unicodedata
from dataclasses import dataclass, asdict
from typing import Any, Optional, Dict, List, Tuple

import pandas as pd
import requests
from dotenv import load_dotenv

# ---------- Base de arquivos (apenas localização) ----------
BASE_DIR = r"C:\Users\Usuario.WELLNB-24\Desktop\Faturamento"

def _abs_in_base(path_like: str) -> str:
    """Se 'path_like' não for absoluto, resolve dentro de BASE_DIR."""
    if not path_like:
        return path_like
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
    if x is None or (isinstance(x, float) and pd.isna(x)):
        return None
    s = str(x)
    if "e+" in s.lower():
        return None
    digits = re.sub(r"\D+", "", s)
    return digits if digits else None

def is_valid_email(email: Optional[str]) -> bool:
    if not email:
        return False
    email = email.strip()
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email))

def parse_date(value: Any) -> Optional[str]:
    """
    Converte datas diversas para 'YYYY-MM-DD' com regras:
      - 'YYYY-MM-DD' (ou com hora) => ISO (sem dayfirst)
      - 'DD/MM/YYYY' ou 'DD-MM-YYYY' => força DIA/MÊS (sem inversão)
      - números seriais do Excel (ex.: 45234) => converte a partir de 1899-12-30
      - fallback: tenta com dayfirst=True
    """
    import re as _re, datetime as _dt
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None

    # Já é date/datetime/Timestamp
    if isinstance(value, (pd.Timestamp, _dt.datetime, _dt.date)):
        return pd.to_datetime(value, errors="raise").strftime("%Y-%m-%d")

    s = str(value).strip()
    if not s:
        return None

    # 1) ISO iniciando por ano: YYYY-MM-DD (com ou sem hora)
    if _re.match(r"^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}:\d{2})?$", s):
        return pd.to_datetime(s, errors="raise").strftime("%Y-%m-%d")

    # 2) DD/MM/YYYY ou DD-MM-YYYY => força DIA/MÊS
    m = _re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$", s)
    if m:
        d = int(m.group(1))
        mon = int(m.group(2))
        y = int(m.group(3))
        if y < 100:  # trata anos 2 dígitos (ex.: 25 -> 2025)
            y += 2000 if y < 70 else 1900
        return _dt.date(y, mon, d).strftime("%Y-%m-%d")

    # 3) Número serial do Excel (geralmente >= 30000)
    if _re.fullmatch(r"\d{5,}", s):
        try:
            n = float(s)
            base = _dt.datetime(1899, 12, 30)  # epoch do Excel
            dt = base + _dt.timedelta(days=n)
            return dt.strftime("%Y-%m-%d")
        except Exception:
            pass

    # 4) Fallback: tenta com dayfirst=True
    return pd.to_datetime(s, dayfirst=True, errors="raise").strftime("%Y-%m-%d")

def parse_numeric(value: Any) -> Optional[float]:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).strip())
    except Exception:
        try:
            return float(pd.to_numeric(value, errors="raise"))
        except Exception:
            return None

# ---------- Env / API ----------
_env_path = os.path.join(BASE_DIR, ".env")
if os.path.exists(_env_path):
    load_dotenv(_env_path)
else:
    load_dotenv()

ASAAS_API_KEY = os.getenv("ASAAS_API_KEY", "").strip()
ASAAS_BASE_URL = os.getenv("ASAAS_BASE_URL", "https://sandbox.asaas.com/api/v3").rstrip("/")

HEADERS = {"Content-Type": "application/json", "Accept": "application/json", "access_token": ASAAS_API_KEY}

def api_enabled() -> bool:
    return bool(ASAAS_API_KEY)

def _req(method: str, path: str, *, params=None, json_body=None) -> dict:
    url = f"{ASAAS_BASE_URL}{path}"
    resp = requests.request(method, url, headers=HEADERS, params=params, json=json_body, timeout=30)
    try:
        data = resp.json() if resp.content else {}
    except Exception:
        resp.raise_for_status()
        raise
    if not resp.ok:
        raise RuntimeError(f"Asaas API error {resp.status_code}: {data}")
    return data

# ---------- Customers ----------
def find_customer(cpfCnpj: Optional[str] = None, name: Optional[str] = None) -> Optional[dict]:
    # Prioridade: cpfCnpj -> name
    if cpfCnpj:
        r = _req("GET", "/customers", params={"cpfCnpj": cpfCnpj, "limit": 1})
        if r.get("data"):
            return r["data"][0]
    if name:
        r = _req("GET", "/customers", params={"name": name, "limit": 1})
        if r.get("data"):
            return r["data"][0]
    return None

def update_customer(customer_id: str, *, cpfCnpj: Optional[str]=None, email: Optional[str]=None) -> dict:
    payload: Dict[str, Any] = {}
    if cpfCnpj: payload["cpfCnpj"] = cpfCnpj
    if email and is_valid_email(email): payload["email"] = email.strip()
    if not payload:
        return _req("GET", f"/customers/{customer_id}")
    return _req("PUT", f"/customers/{customer_id}", json_body=payload)

def ensure_customer(name: str, email_for_create: Optional[str], cpfCnpj: Optional[str]) -> Tuple[dict, bool, bool]:
    """
    Retorna (customer_dict, created_flag, updated_flag).
    Fluxo:
      1) Procura por cpfCnpj; se achar, retorna.
      2) Procura por nome; se achar e NÃO tiver cpfCnpj e nós temos -> atualiza (PUT) e retorna (updated_flag=True).
      3) Senão cria com name + cpfCnpj + (email válido).
    """
    if cpfCnpj:
        c_by_cnpj = find_customer(cpfCnpj=cpfCnpj, name=None)
        if c_by_cnpj:
            return c_by_cnpj, False, False

    c_by_name = find_customer(cpfCnpj=None, name=name)
    if c_by_name:
        updated = False
        need_update = (cpfCnpj and not c_by_name.get("cpfCnpj"))
        need_email = (email_for_create and is_valid_email(email_for_create) and not c_by_name.get("email"))
        if need_update or need_email:
            c_by_name = update_customer(
                c_by_name["id"],
                cpfCnpj=cpfCnpj if need_update else None,
                email=email_for_create if need_email else None,
            )
            updated = True
        return c_by_name, False, updated

    payload = {"name": name}
    if cpfCnpj:
        payload["cpfCnpj"] = cpfCnpj
    if is_valid_email(email_for_create):
        payload["email"] = email_for_create.strip()
    created = _req("POST", "/customers", json_body=payload)
    return created, True, False

# ---------- Payments ----------
def find_payment_by_external_ref(external_ref: str, customer_id: Optional[str] = None) -> Optional[dict]:
    params = {"externalReference": external_ref, "limit": 1}
    if customer_id:
        params["customer"] = customer_id
    r = _req("GET", "/payments", params=params)
    if r.get("data"):
        return r["data"][0]
    return None

def create_boleto(
    customer_id: str,
    value: float,
    dueDate: str,
    description: str,
    externalReference: str,
    *,
    fine_value: float = 2.0,
    interest_value: float = 2.0,
) -> dict:
    payload = {
        "customer": customer_id,
        "billingType": "BOLETO",
        "value": float(value),
        "dueDate": dueDate,
        "description": description,
        "externalReference": externalReference,
    }
    if fine_value and fine_value > 0:
        payload["fine"] = {"value": float(fine_value)}
    if interest_value and interest_value > 0:
        payload["interest"] = {"value": float(interest_value)}
    return _req("POST", "/payments", json_body=payload)

# ---------- Saída ----------
@dataclass
class RowOut:
    pessoa: str
    cpfCnpj: Optional[str]
    dueDate: Optional[str]
    value: Optional[float]
    externalReference: Optional[str]
    created: bool
    customer_created: Optional[bool]
    customer_updated: Optional[bool]
    customer_id: Optional[str]
    payment_id: Optional[str]
    status: Optional[str]
    bankSlipUrl: Optional[str]
    error: Optional[str]

# ---------- Mapeamento ----------
EXPECTED_REQUIRED = {
    "pessoa": ["pessoa"],
    "vencimento": ["vencimento"],
    "valor_final": ["valor final", "valorfinal"],
    "fatura_num": ["fatura cliente no", "fatura cliente n o", "fatura cliente n", "fatura cliente numero", "fatura cliente", "fatura"],
}
EXPECTED_OPTIONAL = {
    "email": ["email", "e mail", "e-mail"],
    "cnpj": ["cnpj", "cpf cnpj", "cpf", "documento", "documento fiscal"],
    # novo alias para o controle
    "emitir": ["emitir boleto", "emitir", "gera boleto", "gerar boleto"],
}

def map_columns(df: pd.DataFrame, debug: bool=False) -> Dict[str, str]:
    def n(s): return normalize(str(s))
    norm_map = {col: n(col) for col in df.columns}
    if debug:
        print("Cabeçalhos (original -> normalizado):")
        for c in df.columns:
            print(f"- {repr(c)} -> {repr(norm_map[c])}")
    out: Dict[str, str] = {}

    def pick_with_priority(key: str, candidates: List[str]) -> Optional[str]:
        # exato
        for cand in candidates:
            matches = [col for col, norm in norm_map.items() if norm == cand]
            if matches:
                if key == "cnpj" and len(matches) > 1:
                    def score(col):
                        s = df[col].astype(str).str.replace(r"\D", "", regex=True).str.len()
                        return int(s.isin([11, 14]).sum())
                    matches.sort(key=score, reverse=True)
                return matches[0]
        # contains
        for cand in candidates:
            matches = [col for col, norm in norm_map.items() if cand in norm]
            if matches:
                if key == "cnpj" and len(matches) > 1:
                    def score(col):
                        s = df[col].astype(str).str.replace(r"\D", "", regex=True).str.len()
                        return int(s.isin([11, 14]).sum())
                    matches.sort(key=score, reverse=True)
                return matches[0]
        return None

    # obrigatórias
    for key, cands in EXPECTED_REQUIRED.items():
        col = pick_with_priority(key, cands)
        if col: out[key] = col

    # opcionais
    for key, cands in EXPECTED_OPTIONAL.items():
        col = pick_with_priority(key, cands)
        if col: out[key] = col

    missing = [k for k in EXPECTED_REQUIRED.keys() if k not in out]
    if missing:
        raise ValueError(f"Colunas obrigatórias não encontradas: {missing}. Cabeçalhos: {list(df.columns)}")

    if debug: print("Mapeamento final:", out)
    return out

# ---------- Core ----------
DEFAULT_NOTE = "Após 5 dias em atraso o título será negativado."

def process(input_path: str, sheet: Optional[str], emit: bool, out_csv: str, fine_value: float, interest_value: float, debug: bool=False) -> str:
    # Resolve caminhos dentro da pasta de Faturamento (apenas localização)
    input_path = _abs_in_base(input_path)
    out_csv = _abs_in_base(out_csv)
    os.makedirs(os.path.dirname(out_csv), exist_ok=True)

    # leitura forçando texto
    if input_path.lower().endswith(".csv"):
        df = pd.read_csv(input_path, dtype=str, sep=None, engine="python")
    else:
        df = pd.read_excel(input_path, sheet_name=sheet, dtype=str)
    colmap = map_columns(df, debug=debug)

    # apenas valor vira numérico
    df[colmap["valor_final"]] = pd.to_numeric(df[colmap["valor_final"]], errors="coerce")

    results: List[RowOut] = []
    for _, row in df.iterrows():
        # Controle "Emitir Boleto"
        emitir_ok = True
        if "emitir" in colmap and pd.notna(row.get(colmap["emitir"], None)):
            flag = str(row[colmap["emitir"]]).strip().upper()
            emitir_ok = flag.startswith("S")  # aceita "S", "SIM", etc.

        pessoa = (row[colmap["pessoa"]] or "").strip() if pd.notna(row[colmap["pessoa"]]) else ""
        due = parse_date(row[colmap["vencimento"]])
        value = parse_numeric(row[colmap["valor_final"]])
        extref = (row[colmap["fatura_num"]] or "").strip() if pd.notna(row[colmap["fatura_num"]]) else None

        cnpj = None
        if "cnpj" in colmap:
            cnpj = only_digits(row[colmap["cnpj"]])
        email_for_create = None
        if "email" in colmap and pd.notna(row[colmap["email"]]):
            email_for_create = str(row[colmap["email"]]).strip()

        rout = RowOut(
            pessoa=pessoa,
            cpfCnpj=cnpj,
            dueDate=due,
            value=value,
            externalReference=extref,
            created=False,
            customer_created=None,
            customer_updated=None,
            customer_id=None,
            payment_id=None,
            status=None,
            bankSlipUrl=None,
            error=None,
        )

        # Se controle "Emitir Boleto" disser para NÃO emitir, registra e segue para próxima linha
        if not emitir_ok:
            rout.error = "Ignorado: Emitir Boleto != 'S'"
            results.append(rout)
            continue

        # validações locais
        if not pessoa:
            rout.error = "Pessoa vazia"
        if not due:
            rout.error = (rout.error + " | " if rout.error else "") + "Vencimento inválido"
        if value is None:
            rout.error = (rout.error + " | " if rout.error else "") + "Valor Final ausente/não numérico"
        if not extref:
            rout.error = (rout.error + " | " if rout.error else "") + "Fatura Cliente Nº ausente"
        if not cnpj:
            rout.error = (rout.error + " | " if rout.error else "") + "CPF/CNPJ obrigatório para emissão no Asaas"

        if rout.error:
            results.append(rout); continue

        description = f"Fatura {extref} - {DEFAULT_NOTE}"

        if not emit:
            results.append(rout); continue

        try:
            if not api_enabled():
                raise RuntimeError("ASAAS_API_KEY ausente. Configure seu .env.")

            # garante cliente com cpfCnpj no Asaas (atualiza se necessário)
            cust, was_created, was_updated = ensure_customer(name=pessoa, email_for_create=email_for_create, cpfCnpj=cnpj)
            rout.customer_id = cust.get("id")
            rout.customer_created = was_created
            rout.customer_updated = was_updated

            # evita duplicidade por externalReference
            existing = find_payment_by_external_ref(extref, customer_id=rout.customer_id)
            if existing:
                rout.payment_id = existing.get("id")
                rout.status = existing.get("status")
                rout.bankSlipUrl = existing.get("bankSlipUrl")
                rout.error = "Já existia (não emitido novamente)"
            else:
                pay = create_boleto(
                    customer_id=rout.customer_id,
                    value=value,
                    dueDate=due,
                    description=description,
                    externalReference=extref,
                    fine_value=fine_value,
                    interest_value=interest_value,
                )
                rout.created = True
                rout.payment_id = pay.get("id")
                rout.status = pay.get("status")
                rout.bankSlipUrl = pay.get("bankSlipUrl")
        except Exception as e:
            rout.error = str(e)

        results.append(rout)

    # CSV de saída
    import csv
    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=list(asdict(results[0]).keys()) if results else [
                "pessoa","cpfCnpj","dueDate","value","externalReference","created","customer_created","customer_updated","customer_id","payment_id","status","bankSlipUrl","error"
            ],
        )
        writer.writeheader()
        for r in results:
            writer.writerow(asdict(r))

    return out_csv

def main():
    p = argparse.ArgumentParser(description="Ler planilha simples (Valor Final numérico) e emitir boletos no Asaas (opcional).")
    p.add_argument("--input", required=True, help="Caminho do arquivo .xlsx ou .csv (ex.: 'contas.xlsx' dentro da pasta de Faturamento)")
    p.add_argument("--sheet", help="Nome da aba (se Excel)")
    p.add_argument("--emit", action="store_true", help="Se presente, cria os boletos no Asaas; caso contrário, dry-run")
    p.add_argument("--out", default="out_boletos_simples.csv", help="Arquivo CSV de saída (ex.: 'out_boletos_simples.csv' na pasta de Faturamento)")
    p.add_argument("--fine", type=float, default=2.0, help="Multa percentual (default: 2.0)")
    p.add_argument("--interest", type=float, default=2.0, help="Juros percentual ao mês (default: 2.0)")
    p.add_argument("--debug", action="store_true", help="Mostra cabeçalhos normalizados e mapeamento de colunas")
    args = p.parse_args()
    out = process(args.input, args.sheet, args.emit, args.out, args.fine, args.interest, debug=args.debug)
    print(f"OK. Resultado em: {out}")

if __name__ == "__main__":
    main()
