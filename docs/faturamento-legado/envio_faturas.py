import pandas as pd
import os
import win32com.client as win32

# Caminhos fixos
caminho_planilha = r"C:\Users\Usuario.WELLNB-24\Desktop\Faturamento\Faturamento Clientes - Corporativo.xlsx"
caminho_boletos_csv = r"C:\Users\Usuario.WELLNB-24\Desktop\Faturamento\out_boletos_simples.csv"

# Subpastas do ciclo atual
subpasta_mes = "06.26"
subpasta_dia = "22.06"
caminho_docs = fr"C:\Users\Usuario.WELLNB-24\Desktop\Faturamento\{subpasta_mes}\{subpasta_dia}"

# Carrega a planilha de clientes
df = pd.read_excel(caminho_planilha)
df.columns = df.columns.str.strip().str.upper()
nomes_planilha = df['EMPRESA'].astype(str).str.strip().str.lower().tolist()

# Carrega a planilha de boletos
df_boletos = pd.read_csv(caminho_boletos_csv, encoding='latin1')
df_boletos['pessoa'] = df_boletos['pessoa'].astype(str).str.strip().str.upper()

# Inicializa o Outlook
outlook = win32.Dispatch('outlook.application')

# Lista de arquivos do dia
arquivos_na_pasta = os.listdir(caminho_docs)
arquivos_sem_empresa = []

for arquivo in arquivos_na_pasta:
    if not arquivo.lower().endswith(".pdf"):
        continue
    nome_match = any(nome in arquivo.lower() for nome in nomes_planilha)
    if not nome_match:
        arquivos_sem_empresa.append(arquivo)

# Envia os e-mails
for _, row in df.iterrows():
    nome_cliente = str(row['EMPRESA']).strip()
    nome_upper = nome_cliente.upper()
    emails = str(row['ENVIAR PARA']).strip()

    arquivos_cliente = [arq for arq in arquivos_na_pasta if nome_cliente.lower() in arq.lower()]
    fatura = next((a for a in arquivos_cliente if 'NF' not in a and 'BOLETO' not in a), None)
    nota_fiscal = next((a for a in arquivos_cliente if 'NF' in a), None)
    boleto = next((a for a in arquivos_cliente if 'BOLETO' in a), None)

    if not any([fatura, nota_fiscal, boleto]):
        print(f"[PULANDO] Cliente '{nome_cliente}' não possui arquivos na pasta do dia.")
        continue

    if not emails or emails.lower() == 'nan':
        print(f"[ERRO] Cliente '{nome_cliente}' sem e-mail. Pulando...")
        continue

    # Tenta encontrar link do boleto
    link_boleto = "[link do boleto]"
    if nome_upper in df_boletos['pessoa'].values:
        link_boleto_encontrado = df_boletos.loc[df_boletos['pessoa'] == nome_upper, 'bankSlipUrl'].values[0]
        if pd.notna(link_boleto_encontrado) and str(link_boleto_encontrado).strip() != "":
            # Transforma em hyperlink HTML
            link_boleto = f'<a href="{link_boleto_encontrado}">{link_boleto_encontrado}</a>'

    # Cria e-mail e carrega assinatura
    mail = outlook.CreateItem(0)
    mail.Display()
    assinatura = mail.HTMLBody

    corpo_mensagem = f"""
    <p>Prezados,</p>
    <p>Segue em anexo a fatura referente aos serviços prestados, juntamente com a nota fiscal.</p>
    <p>O boleto pode ser acessado através do link: {link_boleto}</p>
    <p>Caso tenham dúvidas, estamos à disposição.</p>
    """

    mail.To = emails
    mail.Subject = f"Fatura Welcome Trips – {nome_cliente}"
    mail.HTMLBody = corpo_mensagem + assinatura

    for arquivo in [fatura, nota_fiscal, boleto]:
        if arquivo:
            caminho_arquivo = os.path.join(caminho_docs, arquivo)
            mail.Attachments.Add(caminho_arquivo)
        else:
            print(f"[AVISO] Arquivo ausente para {nome_cliente}: {arquivo}")

    print(f"[OK] E-mail preparado para: {emails}")

input("Pressione Enter para sair...")
