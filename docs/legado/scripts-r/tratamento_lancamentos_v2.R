# =============================================================================
# tratamento_lancamentos_v2.R
# -----------------------------------------------------------------------------
# Transforma os exports "Lançamentos por Categoria" do Monde (formato bruto,
# colapsado por grupo/outline) para o formato tidy — uma linha por lançamento.
#
# NOVIDADE v2: trata os DOIS exports do modelo de fluxo de caixa numa execução:
#   1. "por movimentação"     — 15 colunas (tem a coluna Movimentação na pos. H)
#   2. "por venc. em aberto"  — 14 colunas (layout idêntico ao export antigo)
# O layout é AUTODETECTADO pelo cabeçalho (presença da coluna "Movimentação"),
# então o mesmo script também trata o export antigo, se um dia precisar.
#
# Estrutura da planilha bruta (igual nos dois, só muda a coluna extra):
#   - Linha 1: cabeçalho (desalinhado pelo recuo do outline)
#   - Linhas com "-" na col. A: cabeçalho de Grupo de Categoria   (descartar)
#   - Linhas com "-" na col. B: cabeçalho de Categoria            (descartar)
#   - Linhas de dado: Categoria e Grupo já preenchidos nas colunas próprias
#   - Última linha: total geral                                   (descartar)
#
# IMPORTANTE (regra do modelo — NÃO filtrar aqui):
#   O export de movimentação contém movimentações FUTURAS (> data-base).
#   Elas devem PERMANECER no arquivo tratado — a plataforma é quem roteia
#   (movimentação <= data-base -> realizado; > data-base -> previsto).
#
# Dependências: readxl, writexl (só)
# =============================================================================

# ==== 1. Pacotes ============================================================
.garantir_pacote <- function(pkg) {
  if (!requireNamespace(pkg, quietly = TRUE)) {
    install.packages(pkg, repos = "https://cloud.r-project.org")
  }
  suppressPackageStartupMessages(library(pkg, character.only = TRUE))
}
.garantir_pacote("readxl")
.garantir_pacote("writexl")

# ==== 2. Constantes =========================================================
# Ajuste os caminhos conforme a execução.
pasta <- "C:/Users/Usuario.WELLNB-24/Office 365/Welcome - Documentos/12. Dados Monde"

entrada_mov    <- file.path(pasta, "Lancamentos_por_Categoria_2026_(movimentação).xlsx")
saida_mov      <- file.path(pasta, "Lancamentos_por_Movimentacao_tratada.xlsx")

entrada_aberto <- file.path(pasta, "Lancamentos_por_Categoria_2026_(venc_em_aberto).xlsx")
saida_aberto   <- file.path(pasta, "Lancamentos_por_Vencimento_em_Aberto_tratada.xlsx")

# ==== 3. Função de limpeza (autodetecta o layout) ===========================
limpar_lancamentos <- function(entrada, aba = 1, verbose = TRUE) {

  if (!file.exists(entrada)) {
    stop("Arquivo de entrada não encontrado: ", entrada)
  }

  # --- 3a. Autodetecção: o cabeçalho (linha 1) tem a coluna "Movimentação"? ---
  cabecalho <- readxl::read_excel(entrada, sheet = aba, col_names = FALSE,
                                  n_max = 1, col_types = "text")
  tem_movimentacao <- any(grepl("moviment", tolower(unlist(cabecalho)), fixed = FALSE),
                          na.rm = TRUE)

  # --- 3b. Especificação das colunas físicas conforme o layout ---
  if (tem_movimentacao) {
    # 15 colunas: A,B outline · C Número · D Venda Nº · E Emissão · F Vencimento
    #             G Liquidação · H MOVIMENTAÇÃO · I Pessoa · J Descrição
    #             K Descrição Categoria · L Valor · M Categoria · N Grupo · O Conta
    tipos <- c("text","text","text","text","date","date","date","date",
               "text","text","text","numeric","text","text","text")
    nomes <- c("_outline_grupo","_outline_categoria","Numero","Venda_Numero",
               "Emissao","Vencimento","Liquidacao","Movimentacao",
               "Pessoa","Descricao","Descricao_Categoria","Valor",
               "Categoria","Grupo_de_Categoria","Conta")
  } else {
    # 14 colunas: layout clássico (sem Movimentação)
    tipos <- c("text","text","text","text","date","date","date",
               "text","text","text","numeric","text","text","text")
    nomes <- c("_outline_grupo","_outline_categoria","Numero","Venda_Numero",
               "Emissao","Vencimento","Liquidacao",
               "Pessoa","Descricao","Descricao_Categoria","Valor",
               "Categoria","Grupo_de_Categoria","Conta")
  }

  bruto <- readxl::read_excel(entrada, sheet = aba, col_names = FALSE,
                              col_types = tipos, skip = 1)
  names(bruto) <- nomes
  total_lido <- nrow(bruto)

  # --- 3c. Filtra apenas linhas de dado ---
  # Uma linha é dado se tem Número, Categoria e Grupo preenchidos. Isso descarta
  # os cabeçalhos de Grupo/Categoria (outline), a linha de total e linhas vazias.
  dados <- bruto[
    !is.na(bruto$Numero) & nzchar(trimws(bruto$Numero)) &
    !is.na(bruto$Categoria) & !is.na(bruto$Grupo_de_Categoria),
  ]

  dados[["_outline_grupo"]]     <- NULL
  dados[["_outline_categoria"]] <- NULL

  # --- 3d. Reordena (Movimentação, quando existir, fica após Liquidação) ---
  ordem <- c("Grupo_de_Categoria","Categoria","Numero","Venda_Numero",
             "Emissao","Vencimento","Liquidacao",
             if (tem_movimentacao) "Movimentacao",
             "Pessoa","Descricao","Descricao_Categoria","Valor","Conta")
  dados <- dados[, ordem]

  # --- 3e. Datas para classe Date ---
  for (col in intersect(c("Emissao","Vencimento","Liquidacao","Movimentacao"),
                        names(dados))) {
    dados[[col]] <- as.Date(dados[[col]])
  }

  # --- 3f. Cabeçalhos finais amigáveis (sem dplyr — base R) ---
  de_para <- c(Grupo_de_Categoria   = "Grupo de Categoria",
               Numero               = "Número",
               Venda_Numero         = "Venda Nº",
               Emissao              = "Emissão",
               Liquidacao           = "Liquidação",
               Movimentacao         = "Movimentação",
               Descricao            = "Descrição",
               Descricao_Categoria  = "Descrição Categoria")
  idx <- match(names(de_para), names(dados))
  names(dados)[idx[!is.na(idx)]] <- de_para[!is.na(idx)]

  if (verbose) {
    message(sprintf("Layout detectado: %s",
                    if (tem_movimentacao) "COM Movimentação (15 col)" else "sem Movimentação (14 col)"))
    message(sprintf("Linhas lidas: %d | dados: %d | descartadas (outline/total): %d",
                    total_lido, nrow(dados), total_lido - nrow(dados)))
    message(sprintf("Grupos: %d | Categorias: %d | Σ Valor: %s",
                    length(unique(dados[["Grupo de Categoria"]])),
                    length(unique(dados$Categoria)),
                    format(sum(dados$Valor, na.rm = TRUE),
                           big.mark = ".", decimal.mark = ",", nsmall = 2)))
    if (tem_movimentacao) {
      message(sprintf("Movimentação: %s a %s (futuras PRESERVADAS — a plataforma roteia)",
                      min(dados[["Movimentação"]], na.rm = TRUE),
                      max(dados[["Movimentação"]], na.rm = TRUE)))
    }
    message(sprintf("Vencimento: %s a %s",
                    min(dados$Vencimento, na.rm = TRUE),
                    max(dados$Vencimento, na.rm = TRUE)))
  }

  return(dados)
}

# ==== 4. Exportador =========================================================
exportar <- function(dados, saida) {
  if (tolower(tools::file_ext(saida)) == "csv") {
    write.csv2(dados, saida, row.names = FALSE, fileEncoding = "UTF-8")
  } else {
    writexl::write_xlsx(dados, saida)
  }
  message("Arquivo salvo em: ", normalizePath(saida))
}

# ==== 5. Rodar os DOIS tratamentos ==========================================
message("\n--- 1/2: Lançamentos por MOVIMENTAÇÃO ---")
lancamentos_mov <- limpar_lancamentos(entrada_mov)
exportar(lancamentos_mov, saida_mov)

message("\n--- 2/2: Lançamentos por VENCIMENTO EM ABERTO ---")
lancamentos_aberto <- limpar_lancamentos(entrada_aberto)
exportar(lancamentos_aberto, saida_aberto)
