library(readxl)
library(dplyr)
library(stringr)
library(writexl)

# 1) Ler as planilhas
# Troque os nomes/abas pelos seus arquivos reais
setwd("C:\\Users\\Usuario.WELLNB-24\\Desktop\\Faturamento")
base1 <- read_excel("faturamento.xlsx")          # tem a coluna Pessoa
base1 <- base1[-nrow(base1), -1 ]
base2 <- read_excel("pessoas.xlsx")         # tem colunas Nome e CNPJ

# 2) Padronizar nomes de colunas e tipos
base2 <- base2 %>%
  rename(Pessoa = Nome) %>%                # renomeia Nome -> Pessoa (como você disse que fará)
  mutate(
    Pessoa = as.character(Pessoa),
    CNPJ   = as.character(CNPJ)            # garante que CNPJ não perca zeros à esquerda
  )

base1 <- base1 %>%
  mutate(Pessoa = as.character(Pessoa))

# 4) Juntar
resultado <- base1 %>%
  left_join(base2, by = "Pessoa")   # traz CNPJ para a planilha 1
resultado <- resultado %>%
  select(
    Emissão,
    Pessoa,
    Vencimento,
    `Valor Final`,
    `Fatura Cliente Nº`,
    `E-mail`,
    Cidade,
    UF,
    `Razão Social`,
    Endereço,
    Número,
    Complemento,
    Bairro,
    CEP,
    CPF,
    CNPJ,
    `Inscrição Estadual`,
    `Inscrição Municipal`
  ) %>%
  mutate(`Emitir Boleto`= "S",
         `Emitir NF`="S",
         `Valor NF Avulsa`=NA)



# 5) Salvar
write_xlsx(resultado, "contas.xlsx")
