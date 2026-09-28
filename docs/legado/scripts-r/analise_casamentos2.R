library(dplyr)
library(readxl)
library(stringr)
library(lubridate)
library(openxlsx2)
library(purrr)

#-----------------------------
# Função robusta para moeda BR
#-----------------------------
parse_valor_br <- function(x) {
  x <- as.character(x)
  x <- str_replace_all(x, "\\s", "")
  x <- str_replace_all(x, "R\\$", "")
  x <- str_replace_all(x, "\\.", "")
  x <- str_replace_all(x, ",", ".")
  suppressWarnings(as.numeric(x))
}

#-----------------------------
# 1) Ler CSV base
#-----------------------------
dados <- read.csv("C:/Users/Usuario.WELLNB-24/Desktop/Yan (Financeiro)/Análise Casamentos/Análise de Operações 21-09.csv",
                  stringsAsFactors = FALSE,
                  fileEncoding = "UTF-8-BOM")

dados <- dados %>%
  mutate(
    `Lançamento.N.` = as.character(`Lançamento.N.`),
    Venda      = as.character(Venda),
    Operacao        = str_squish(as.character(Operacao)),
    Tipo            = str_squish(as.character(Tipo)),
    Valor           = parse_valor_br(Valor)
  )

# Padroniza Tipo (evita variações)
dados <- dados %>%
  mutate(
    Tipo = case_when(
      str_to_lower(Tipo) %in% c("entrada", "recebimento") ~ "Entrada",
      str_to_lower(Tipo) %in% c("saída", "saida", "pagamento") ~ "Saída",
      TRUE ~ Tipo
    )
  )

#-----------------------------
# 2) Ler XLSX Monde (2021-2027) e combinar
#-----------------------------
arquivos <- c(
  "C:/Users/Usuario.WELLNB-24/Desktop/Yan (Financeiro)/Análise Casamentos/2021.xlsx",
  "C:/Users/Usuario.WELLNB-24/Desktop/Yan (Financeiro)/Análise Casamentos/2022.xlsx",
  "C:/Users/Usuario.WELLNB-24/Desktop/Yan (Financeiro)/Análise Casamentos/2023.xlsx",
  "C:/Users/Usuario.WELLNB-24/Desktop/Yan (Financeiro)/Análise Casamentos/2024.xlsx",
  "C:/Users/Usuario.WELLNB-24/Desktop/Yan (Financeiro)/Análise Casamentos/2025.xlsx",
  "C:/Users/Usuario.WELLNB-24/Desktop/Yan (Financeiro)/Análise Casamentos/2026.xlsx",
  "C:/Users/Usuario.WELLNB-24/Desktop/Yan (Financeiro)/Análise Casamentos/2027.xlsx",
  "C:/Users/Usuario.WELLNB-24/Desktop/Yan (Financeiro)/Análise Casamentos/2028.xlsx"
)

corrigir_liquidacao <- function(x) {
  if (inherits(x, "Date")) {
    return(x)
  }
  
  if (is.numeric(x)) {
    return(as.Date(x, origin = "1899-12-30"))
  }
  
  return(as.Date(x))
}

dados_combinados <- map_dfr(arquivos, function(arq) {
  read_xlsx(arq) %>%
    mutate(
      `Conta (Previsão)` = as.character(`Conta (Previsão)`),
      Conferido = as.character(Conferido),
      Liquidação = corrigir_liquidacao(Liquidação)
    )
})

# Garante que a 1ª coluna chama "Lançamento.N."
names(dados_combinados)[1] <- "Lançamento.N."

dados_combinados_unicos <- dados_combinados %>%
  transmute(
    `Lançamento.N.` = as.character(`Lançamento.N.`),
    Vencimento = Vencimento
  ) %>%
  distinct(`Lançamento.N.`, .keep_all = TRUE)

#-----------------------------
# 3) Join -> final
#-----------------------------
final <- left_join(dados, dados_combinados_unicos, by = "Lançamento.N.") %>%
  select(`Lançamento.N.`, Venda, Pessoa, Descrição,
         Liquidação, Vencimento, Valor, Tipo, Operacao)

# -----------------------------
# 4) Datas (Liquidação e Vencimento)
# -----------------------------
final <- final %>%
  mutate(
    # Liquidação no CSV vem como "" ou "dd/mm/yyyy"
    Liquidação = na_if(Liquidação, ""),
    Liquidação = dmy(Liquidação),          # <<< alteração necessária
    
    # Vencimento já veio Date do Monde (feito acima), mas garante:
    Vencimento = as.Date(Vencimento),
    
    # Data_Final sem ifelse (evita conversão indevida)
    Data_Final = coalesce(Liquidação, Vencimento),
    Mes_Ano    = format(Data_Final, "%Y-%m")
  )

# Diagnóstico (opcional): registros sem data final
linhas_na <- final %>% filter(is.na(Data_Final))
print(linhas_na)

# -----------------------------
# 5) Status futuro x realizado
# -----------------------------
data_atual <- Sys.Date()

final <- final %>%
  mutate(
    Status = case_when(
      Tipo == "Entrada" & Data_Final > data_atual ~ "A Receber Futuro",
      Tipo == "Saída"   & Data_Final > data_atual ~ "A Pagar Futuro",
      TRUE ~ Tipo
    ),
    Status = factor(Status, levels = c("Entrada", "Saída", "A Receber Futuro", "A Pagar Futuro"))
  )

# -----------------------------
# 6) Agrupar por mês e status
# -----------------------------
dados_agrupados <- final %>%
  filter(!is.na(Mes_Ano)) %>%
  group_by(Mes_Ano, Status) %>%
  summarise(Valor_Total = sum(Valor, na.rm = TRUE), .groups = "drop") %>%
  mutate(Mes_Ano_Data = as.Date(paste0(Mes_Ano, "-01")))

# -----------------------------
# 7) Tabela resumo por operação
# -----------------------------
tabela_resumo <- final %>%
  group_by(Operacao) %>%
  summarise(
    Recebido = sum(Valor[Status == "Entrada" & !is.na(Liquidação)], na.rm = TRUE),
    Pago     = sum(Valor[Status == "Saída"   & !is.na(Liquidação)], na.rm = TRUE),
    `A Receber` = sum(Valor[Status == "A Receber Futuro" & is.na(Liquidação)], na.rm = TRUE),
    `A Pagar`   = sum(Valor[Status == "A Pagar Futuro"   & is.na(Liquidação)], na.rm = TRUE),
    `Receita Total` = Recebido + `A Receber`,
    `Custo Total`   = Pago + `A Pagar`,
    Margem = `Receita Total` - `Custo Total`,
    `%` = ifelse(`Receita Total` > 0, (Margem / `Receita Total`) * 100, NA_real_),
    NCG = `A Pagar` - `A Receber`,
    .groups = "drop"
  )

# -----------------------------
# 8) Exportar
# -----------------------------
write.csv(tabela_resumo, "C:/Users/Usuario.WELLNB-24/Desktop/Yan (Financeiro)/Análise Casamentos/Consolidado Casamentos.csv", row.names = FALSE)
write.csv(final, "C:/Users/Usuario.WELLNB-24/Desktop/Yan (Financeiro)/Análise Casamentos/Lançamentos por Operação.csv", row.names = FALSE)

# ============================================================
# Exportar para Excel (como Tabela do Excel) para usar no Power BI
# ============================================================

# Se não tiver o pacote, instale uma vez:
# install.packages("openxlsx")

wb <- wb_workbook()
wb$add_worksheet("Lancamentos")
wb$add_worksheet("Resumo")

# Aba 1: Lançamentos por Operação (final)
write_datatable(
  wb, 
  sheet      = "Lancamentos",
  x = final,
  start_row  = 1,
  start_col  = 1,
  col_names  = TRUE,
  table_name = "Lancamentos"
)

# Aba 2: Consolidado (tabela_resumo)
write_datatable(
  wb, 
  sheet      = "Resumo",
  x = tabela_resumo,
  start_row  = 1,
  start_col  = 1,
  col_names  = TRUE,
  table_name = "Resumo"
)

# Salvar (overwrite=TRUE para substituir sem erro)
wb_save(wb, file = "C:/Users/Usuario.WELLNB-24/Desktop/Yan (Financeiro)/Análise Casamentos/Consolidado_Casamentos.xlsx", overwrite = TRUE)


