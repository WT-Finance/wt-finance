library(rvest)
library(RSelenium)
library(dplyr)
library(readxl)
library(wdman)

#Servidor
chrome_driver <- wdman::chrome(port = 4570L)

# Conectar um Remote Driver àquele servidor
remDr <- remoteDriver(browserName = "chrome", port = 4570L)
remDr$open()

#Link da página
link <- "https://web.monde.com.br/welcometrips/agency_operations?id="

#Navegar ate a página
remDr$navigate(link)

# Esperar carregar a página completamente
Sys.sleep(3)


#Lista de operações 
operacoes_interesse <- read.csv("C:/Users/Usuario.WELLNB-24/Desktop/Yan (Financeiro)/Análise Casamentos/Lista de Operações.csv")
#operacoes_interesse <- operacoes_interesse[c(66),]
operacoes_interesse <- as.data.frame(operacoes_interesse)
#operacoes_interesse[39,1] <- "W - Camila e Bruno - 02SET23"

# Normalizar lista
operacoes_interesse[,1] <- gsub("\u00A0", "", operacoes_interesse[,1])
operacoes_interesse <- sapply(operacoes_interesse, function(x) gsub("^\\s+|\\s+$", "", x))


#Data frame vazio para armazenar os dados
dados_combinados <- data.frame()


# Iterar sobre cada operação na lista
for (operacao in operacoes_interesse) {
  message("Processando operação: ", operacao)
  
  # Recarregar o dropdown antes de cada interação
  dropdown <- remDr$findElement(using = "css selector", "#id")
  dropdown$clickElement()
  Sys.sleep(1)
  
  
  opcao_xpath <- paste0("//select[@id='id']/option[normalize-space(text())='", operacao, "']")
 # message("XPath gerado: ", opcao_xpath)
  
  
  # Selecionar a opção correspondente à operação atual
  opcoes <- remDr$findElements(using = "xpath", opcao_xpath)
  
  # Verifique se encontrou exatamente uma opção
  if (length(opcoes) == 1) {
    message("Opção encontrada: ", operacao)
    opcao <- opcoes[[1]]
    opcao$clickElement()
  } else if (length(opcoes) > 1) {
    message("Mais de uma opção encontrada para: ", operacao)
    opcao <- opcoes[[1]]  # Seleciona a primeira por precaução
  } else {
    stop("Nenhuma opção encontrada para: ", operacao)
  }
  
  # Esperar carregar a nova página ou conteúdo
  Sys.sleep(5)
  
  # Extrair o conteúdo da página
  page_source <- remDr$getPageSource()[[1]]
  page <- read_html(page_source)
  
  # Extrair as tabelas
  tabela <- page %>%
    html_nodes("table") %>%
    html_table(fill = TRUE)
  
  # Adicionar uma coluna para identificar a operação e o tipo de transação
  tabela_recebimentos <- tabela[[1]] %>% mutate(Operacao = operacao, Tipo = "Entrada")
  tabela_pagamentos <- tabela[[2]] %>% mutate(Operacao = operacao, Tipo = "Saída")
  
  # Converter a coluna 'Lançamento N°' para character
  tabela_recebimentos$`Lançamento N°` <- as.character(tabela_recebimentos$`Lançamento N°`)
  tabela_pagamentos$`Lançamento N°` <- as.character(tabela_pagamentos$`Lançamento N°`)
  
  # Converter a coluna 'Venda N°' para character
  tabela_recebimentos$Venda <- as.character(tabela_recebimentos$Venda)
  tabela_pagamentos$Venda <- as.character(tabela_pagamentos$Venda)
  
  # Converter a coluna 'Valor' para texto (character) em ambas as tabelas
  tabela_recebimentos$Valor <- as.character(tabela_recebimentos$Valor)
  tabela_pagamentos$Valor <- as.character(tabela_pagamentos$Valor)
  
  # Combinar os dados com o data frame principal
  dados_combinados <- bind_rows(dados_combinados, tabela_recebimentos, tabela_pagamentos)
  
  }

 # Fechar a sessão do Selenium
remDr$close()
rD$server$stop()

# Verificar se alguma operação não foi extraída corretamente
linhas_carregando <- grepl("Carregando", dados_combinados$Valor)
dados_combinados[linhas_carregando, ]
dados_combinados <- dados_combinados[!linhas_carregando,]

#Exportar dados
write.csv(dados_combinados, "C:/Users/Usuario.WELLNB-24/Desktop/Yan (Financeiro)/Análise Casamentos/Análise de Operações 21-09.csv", row.names = FALSE)
# 38286 obs.


