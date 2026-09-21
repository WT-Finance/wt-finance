# arq <- "C:/Users/Usuario.WELLNB-24/Office 365/Welcome - Documentos/12. Dados Monde/Dashboard/VendasPorProduto.xlsx" #### PARA TESTE

library(readxl)
library(openxlsx2)
library(dplyr)
library(lubridate)

# --------------------------
# 1) Ler argumentos da linha de comando
# --------------------------
#args <- commandArgs(trailingOnly = TRUE)
#if (length(args) < 1) {
#  stop("Uso: Rscript ajusta_vendas.R CAMINHO_ARQUIVO")
#}
#arquivo <- args[1]
#
#if (!file.exists(arquivo)) {
#  stop("Arquivo não encontrado: ", arquivo)
#}

# >>> FORÇAR UM DIRETÓRIO DE TRABALHO SEGURO (IMPORTANTE)
# Crie a pasta C:/Temp uma vez, se ainda não existir
dir.create("C:/Temp", showWarnings = FALSE)
setwd("C:/Temp")

# --------------------------
# 2) Ler dados da planilha
# --------------------------

df23 <- read_excel("C:/Users/Usuario.WELLNB-24/Downloads/23.xlsx", guess_max = Inf)  # ajuste o nome da aba se necessário
df23 <- df23[-nrow(df23),]
df24 <- read_excel("C:/Users/Usuario.WELLNB-24/Downloads/24.xlsx", guess_max = Inf)  # ajuste o nome da aba se necessário
df24 <- df24[-nrow(df24),]
df2526 <- read_excel("C:/Users/Usuario.WELLNB-24/Downloads/25-26.xlsx", guess_max = Inf)  # ajuste o nome da aba se necessário
df2526 <- df2526[-nrow(df2526),]
df <- bind_rows(df23, df24, df2526)

# Se quiser ver a estrutura na depuração:
# print(head(df))
# print(tail(df))

# --------------------------
# 3) Remover a última linha (se houver mais de 1)
# --------------------------
if (is.na(df[nrow(df),2])) {
  df <- df[-nrow(df), ]
}

df <- df %>%
  mutate(
    Intermediário = NA
  )

df <- dplyr::select(df,
                    "Venda Nº",
                    "Data Venda",
                    "Data Início",
                    "Vendedor",
                    "Intermediário",
                    "Pagante",
                    "Passageiros",
                    "Setor",
                    "Produto",
                    "Contr./ Voucher",
                    "Fornecedor",
                    "Receitas",
                    "Valor Total",
                    "Situação",
                    "Operação Propria")

# levels(as.factor(df$Setor))

data_min <- min(as.Date(df$`Data Venda`), na.rm = TRUE)
data_max <- max(as.Date(df$`Data Venda`), na.rm = TRUE)
calendario <- tibble(
  data = seq.Date(from = data_min, to = data_max, by = "day")
)
calendario <- calendario %>%
  mutate(Ano = year(data))
calendario <- calendario %>%
  group_by(Ano) %>%
  arrange(data, .by_group = TRUE) %>%
  mutate(
    eh_domingo = wday(data) == 1,   # domingo = 1
    semana_aux = cumsum(eh_domingo),
    Semana = semana_aux - min(semana_aux) + 1
  ) %>%
  ungroup() %>%
  select(data, Semana)

df <- df %>%
  left_join(calendario, by = c("Data Venda" = "data"))

df <- df %>%
  mutate(
    `Setor Macro` = case_when(
      Setor == "Corporativo" ~ "Corporativo",
      Setor %in% c("Expedições", "Lazer") ~ "Lazer",
      Setor %in% c("Planejamento-WED", "Produção", "WedMe", "Weddings") ~ "Weddings",
      Setor == "Welcome" ~ "Welcome",
      TRUE ~ Setor   # fallback seguro, caso apareçam valores novos
    ),
    Mes = format(`Data Venda`, "%b")  # abreviação do mês
  )%>%
  filter(`Setor Macro` != "Welcome")


df <- df %>%
  mutate(
    `Setor Micro` = case_when(
      # 1) Produção e Planejamento-WED mantêm o próprio Setor
      Setor %in% c("Produção", "Planejamento-WED") ~ Setor,
      
      # 2) Weddings ou WedMe + Diárias de Hospedagem -> Hospedagem
      Setor %in% c("Weddings", "WedMe") &
        Produto == "Diárias de Hospedagem" ~ "Hospedagem",
      
      # 3) Weddings + produtos de extras -> Extras
      Setor == "Weddings" &
        Produto %in% c(
          "Aluguel de Carro",
          "Bagagens ou assentos",
          "Cerimonial de Casamento",
          "Ingressos",
          "Pacote de Casamento",
          "Pacote Turístico",
          "Passagem Aérea",
          "Passes de Trem",
          "Receptivo - Traslados e Passeios",
          "Seguro Viagem",
          "Transporte Rodoviario"
        ) ~ "Extras",
      
      # 4) Qualquer outro caso repete o Setor
      TRUE ~ Setor
    ),
    Contrato = if_else(Produto == "Contrato de casamento", 1, 0),
    `Taxa de Serviço` = if_else(Produto == "Taxa de Serviço", 1, 0)
  )

# --------------------------
# 4) Criar novo workbook e escrever dados como TABELA
# --------------------------
wb <- wb_workbook()
wb$add_worksheet("VendasPorProduto")

# Aqui já escrevemos e criamos a tabela de uma vez:
write_datatable(
  wb,
  sheet      = "VendasPorProduto",
  x          = df,
  start_row  = 1,
  start_col  = 1,
  col_names  = TRUE,
  table_name = "tblVendas"
)

# --------------------------
# 5) Salvar por cima do mesmo arquivo
# --------------------------
wb_save(wb, file = "C:/Users/Usuario.WELLNB-24/Office 365/Welcome - Documentos/12. Dados Monde/Dashboard/VendasPorProduto_tratada.xlsx", overwrite = TRUE)


