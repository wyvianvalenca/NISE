# Documento de Requisitos do Sistema · NISE · v2 (rascunho)

Projeto: NISE · Grupo 7 · PDS 26.2
Versão: 0.2 (rascunho) · Data: 20/10/2026 · Status: em revisão

> Rascunho completo para revisão da equipe. Itens marcados **A validar** dependem de telas em revisão ou de confirmação. Seções com ⚠️ estão em mudança no Figma: **C4, M5 (em execução), C5 e C6 (mudança forte)**. Não comecem histórias dessas seções antes da revisão.

## Histórico de versões

| Versão | Data | Autor(a) | O que mudou |
| --- | --- | --- | --- |
| 0.1 | 07/10/2026 | Wyvian Valença | Criação do documento |
| 0.1.1 | 09/10/2026 | Felipe Lira | Introdução |
| 0.2 | 20/10/2026 | Claudinha (com Claude) | Revisão de RFs, RNFs e RNs pelo Figma e pelo doc vivo; nova numeração; rastreabilidade; registro de decisões |

---

## 0. Como ler este documento

### 0.1 Cadeia de rastreabilidade

Todo item deste documento pode ser seguido nos dois sentidos:

```
Origem  →  RF / RNF / RN  →  História de usuário  →  Sprint
```

- **Para trás** ("por que isso existe?"): uma história cita os RFs que cumpre; cada RF cita a sua origem.
- **Para frente** ("isso vai ser feito? quando?"): a seção 8 mostra, para cada RF/RNF, as histórias que o cobrem e a sprint.

Duas consequências práticas:
- Uma tela ou task que não aponta para nenhum RF é **aumento de escopo**.
- Um Must que não aponta para nenhuma história está **esquecido**.

### 0.2 Códigos de origem

A coluna **Origem** pode ter mais de um código, separados por vírgula.

| Código | O que é | Exemplo |
| --- | --- | --- |
| `F<n>` | Funcionalidade do núcleo (fechamento de 02/10 e AB1) | F1, F30 |
| `M<n>`, `C<n>`, `S<n>` | Fluxo do Figma (menina, coordenadora, apoio) | C2 |
| `Figma <tela>` | Tela do Figma "NISE · Protótipo" | Figma K03 |
| `Doc vivo §<n>` | Seção do documento vivo "contexto-nise.md" | Doc vivo §7 |
| `AB1` | Apresentação da AB1 | AB1 |
| `Dinâmica 02/10` | Dinâmica de fechamento da solução | Dinâmica 02/10 |
| `P<n>` | Decisão da dinâmica de fechamento (mantidos da v0.1) | P8 |
| `D-<nn>` | Decisão registrada na seção 12 deste documento | D-03 |
| `LGPD art. <n>` | Base legal | LGPD art. 14 |

### 0.3 Status

- **Confirmado:** a origem é estável (doc vivo, fluxo revisado no Figma ou decisão registrada).
- **A validar:** vem de um fluxo do Figma ainda "em andamento", "em revisão" ou "decisão em aberto", ou de uma nota no Figma que precisa de confirmação.

### 0.4 Numeração

`RF-F<funcionalidade>.<nn>`, `RNF-F<funcionalidade>.<nn>` (ou `RNF-G.<nn>` para requisitos gerais) e `RN-<nn>`.
Os IDs da v0.1 aparecem entre parênteses quando o item foi mantido, para facilitar a comparação.

### 0.5 Prioridade (MoSCoW)

Must (essencial), Should (importante), Could (desejável), Won't (não neste semestre).

---

## 3. Requisitos funcionais

Cada RF fica numa persona só, pela regra **"quem age"**. Uma mesma funcionalidade pode aparecer em mais de uma persona (a F4, por exemplo), mas nenhum RF se repete. Os IDs não mudam: a funcionalidade continua no ID (RF-F4.03).

### 3.1 Menina

O que a menina faz ou vê na NISE. Fluxos M1 a M6 e S1.

#### F7 · Consentimento e privacidade (M3, S1)

Segue o Figma (D-01). Pendências que não travam o desenvolvimento, mas travam o uso com dados reais: escrever os Termos de uso e a Política de privacidade e consultar o Comitê de Ética (ou instância semelhante).

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F7.01 (RF-07.01) | O sistema deve pedir a data de nascimento no cadastro e bloquear quem tem menos de 13 anos, sem guardar os dados preenchidos. | F7, M3, Figma A02c, D-01 | Menina | Must | Confirmado | Dado uma menina de 12 anos, quando informa a data, então vê "Ainda não dá pra criar sua conta", e nenhum dado dela fica no banco. |
| RF-F7.02 (RF-07.07) | O sistema deve permitir que a menina a partir de 13 anos aceite sozinha os Termos de uso e a Política de privacidade, sem etapa de responsável. | F7, Doc vivo §7, D-01 | Menina | Must | Confirmado | Dado Alana, de 15 anos, quando marca "Li e concordo", então segue para a etapa 2 de 3 sem pedir o e-mail de um responsável. |
| RF-F7.03 | O sistema deve mostrar, antes do aceite, um resumo do que é coletado e para quê, com o link para os termos completos. | Figma A04·1 | Menina | Must | Confirmado | Dado a etapa 1 de 3, quando Alana a lê, então vê "O que coletamos" e "Pra que usamos" e o link "Ler os termos completos". |
| RF-F7.04 | O sistema deve mostrar a versão do resumo conforme a origem da menina: quem veio de evento lê que a liderança daquele grupo vê o filé, as respostas e as avaliações dela; quem chegou sozinha lê que só a equipe NISE acompanha e que os grupos veem só números gerais. | Figma A04·1 (grupo e NISE), Doc vivo §7 | Menina | Must | Confirmado | Dado que Belana chegou sozinha, quando lê a etapa 1, então lê "Os grupos só veem números gerais, sem identificar você". |
| RF-F7.05 (RF-07.06) | O sistema deve registrar cada aceite com data, hora e versão do termo, sem permitir edição. | F7, LGPD | Sistema | Must | Confirmado | Dado que Alana aceitou a versão 1, quando a equipe consulta o histórico, então encontra o registro com data, hora e versão. |
| RF-F7.06 | O sistema deve perguntar, de forma opcional, se a menina quer receber oportunidades por e-mail (no máximo 2 por mês). | Figma A04·2 | Menina | Should | Confirmado | Dado a etapa 2 de 3, quando Alana toca "Não, obrigada", então conclui o cadastro e não recebe e-mails de oportunidades. |
| RF-F7.07 | O sistema deve perguntar, de forma opcional, se a menina quer ser avisada sobre questionários. | Figma A04·3 | Menina | Must | Confirmado | Dado a etapa 3 de 3, quando Alana aceita, então passa a receber os avisos da F4 por e-mail. |
| RF-F7.08 | O sistema deve permitir mudar essas preferências pelo perfil, a qualquer momento. | Figma A10, A04·2, A04·3 | Menina | Must | **A validar** | Dado que Alana aceitou os avisos, quando os desliga no perfil, então deixa de recebê-los. *A A10 ainda mostra "autorização pendente" para grupos, o que conflita com D-01. A tela está "em espera".* |
| RF-F7.09 (RF-07.09) | O sistema deve permitir que a menina peça, pelo perfil, a exclusão da conta e dos dados. | F7, LGPD art. 18 | Menina | Must | Confirmado | Dado que Ana pede a exclusão, quando confirma, então os dados identificáveis dela são apagados, ela sai do painel individual e das exportações seguintes, e o pedido fica registrado com data. |

Saíram da v0.1: TCLE do responsável, TALE e autorização separada para os grupos (antigos RF-07.02, 07.03, 07.04, 07.05, 07.08), por D-01.

#### S2 · Cadastro e entrada (M1, M2, S2)

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-S2.02 | O sistema deve pedir data de nascimento e cidade logo depois do cadastro com Google. | Figma A02b | Menina | Must | Confirmado | Dado um cadastro pelo Google, quando Alana informa a data e a cidade, então segue para os termos (A04·1). |
| RF-S2.03 | O sistema deve validar o e-mail no cadastro e mostrar como corrigi-lo. | Figma E01 | Sistema | Must | Confirmado | Dado "alana@gmail", quando Alana tenta continuar, então vê "Inclua o domínio, como nome@exemplo.com". |
| RF-S2.05 | O sistema deve guardar o que a menina já preencheu se a conexão cair no cadastro. | Figma E04 | Sistema | Should | Confirmado | Dado que a conexão caiu no passo dos termos, quando Alana volta, então vê "Seu cadastro está salvo" e continua de onde parou. |

Entrar e recuperar o acesso valem igual para menina e coordenadora e estão em 3.3 (Acesso).

#### F10 e F11 · Filé (M4)

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F10.01 (RF-10.01) | O sistema deve pedir à menina, no cadastro, os temas de interesse (um ou mais, ou "Ainda não sei, me mostra de tudo") e o momento de estudo, para todas as meninas. | F10, M1, M2, Figma A05, Doc vivo §6 | Menina | Must | Confirmado | Dado que Alana termina o cadastro, quando escolhe "Robótica" e "Ensino médio", então as escolhas ficam no perfil e o filé começa a ser tecido (E03). |
| RF-F10.02 | O sistema deve explicar o que é o filé na primeira vez, e deixar a explicação acessível depois pelo ícone "?" ao lado de "Seu filé". | Figma A06·0, A06·3 | Menina | Should | Confirmado | Dado que Alana abre o filé pela primeira vez, quando chega ao início, então vê antes a tela "Por que filé?". Depois, o "?" leva de volta a ela. |
| RF-F10.03 | O sistema deve organizar as sugestões em 5 faixas de esforço, mostrando quantas sugestões há em cada uma: Primeiros passos (até 15 min), Uma tarde (até 1 dia, sozinha), No meu ritmo (vários dias, sozinha), Rolê com a galera (até 1 dia, em grupo) e Grande desafio (em grupo, mais tempo). | Figma A06·1, decisão de 19/10 | Menina | Must | Confirmado | Dado que há 8 sugestões de "Uma tarde", quando Alana abre o início, então vê o cartão "Uma tarde" com "8 sugestões". |
| RF-F10.04 (RF-10.06) | O sistema deve mostrar as sugestões de uma faixa, uma de cada vez, com as opções "Quero fazer" (entra no filé), "Talvez depois" (vai para Ver depois) e "Não é pra mim" (com motivo opcional), também por deslize. | Figma A06·2, 2a | Menina | Must | Confirmado | Dado uma sugestão, quando Alana toca "Não é pra mim" e escolhe "Muito difícil", então a sugestão some e o motivo fica registrado. |
| RF-F10.05 | O sistema deve permitir desfazer a última escolha numa sugestão. | Figma A06·2 ("Desfazer") | Menina | Should | Confirmado | Dado que Alana colocou um curso no filé, quando toca "Desfazer", então o curso volta para as sugestões. |
| RF-F10.06 | O sistema deve mostrar "Ver depois", com filtro por faixa de esforço e as opções "Quero fazer" e "Remover". | Figma A06·2b | Menina | Must | Confirmado | Dado dois itens guardados, quando Alana filtra por "Grande desafio", então vê só o hackathon. |
| RF-F10.07 | O sistema deve mostrar o filé da menina com as atividades em andamento, as próximas e as concluídas, agrupadas por tema, cada uma como um quadradinho que fica colorido quando concluído, sem barra de progresso. | F10, Figma A06·3, Doc vivo §8 | Menina | Must | Confirmado | Dado que Alana concluiu 1 atividade de 3, quando abre o filé, então vê 1 quadradinho colorido e 2 sem cor, e nenhuma porcentagem. |
| RF-F10.08 | O sistema deve mostrar o detalhe de uma atividade (tipo, faixa, fonte, duração, custo, idade mínima, descrição e "por que pra você"), com "Continuar no site", "Marcar como concluído" e "Tirar do filé". | Figma A06·4a | Menina | Must | Confirmado | Dado um curso no filé, quando Alana toca "Marcar como concluído", então vai para a tela de conclusão (A06·5). |
| RF-F10.09 | O sistema deve, ao concluir uma atividade, pedir uma avaliação opcional de 1 a 5 e se ela quer sugestões parecidas (mais avançadas, do mesmo nível, outro tema). | Figma A06·5 | Menina | Should | Confirmado | Dado que Alana concluiu um curso, quando escolhe "Algo mais avançado" e envia, então a próxima rodada de sugestões considera essa escolha. |
| RF-F10.10 (RF-10.02) | O sistema deve permitir que a menina veja e edite os interesses e o momento de estudo no perfil. | F10, S1, Figma A10 | Menina | Must | **A validar** | Dado que Alana entrou no ensino médio, quando edita o perfil, então as próximas sugestões consideram a mudança. *A tela A10 está "em espera".* |
| RF-F10.12 | O sistema deve permitir que a menina com menos de 13 anos veja as oportunidades abertas sem criar conta. | Figma A02c | Visitante | Could | Confirmado | Dado que uma menina de 12 anos foi bloqueada no cadastro, quando toca "ver as oportunidades abertas", então vê a lista sem login. |
| RF-F30.13 (RF-30.07) | O sistema deve mostrar nas sugestões das meninas as ações abertas, com inscrições não finalizadas e data futura, conforme o alcance (RN-16). | F30, F10, Doc vivo §5 | Menina | Must | Confirmado | Dado uma oficina aberta em Maceió, quando Alana, de Maceió, abre o filé, então vê a oficina com o botão "Ir para inscrição". Uma ação fechada do mesmo grupo não aparece. |
| RF-F11.04 (RF-11.04) | O sistema deve mostrar "Por que pra você" em cada sugestão. | F11, Figma A06·2, 4a, 4b | Menina | Must | Confirmado | Dado um curso sugerido, quando Alana o vê, então lê o motivo, como "você curtiu Programação e IA". |

O histórico de ações no perfil (antigo RF-10.05) foi juntado ao RF-F2.03, em 3.3.

#### F10 · Inscrição em evento (M6)

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F10.13 | O sistema deve mostrar o detalhe de um evento (organizador, datas, cidade, prazo de inscrição com dias restantes, custo, faixa etária, pré-requisitos) e levar ao link de inscrição do grupo, avisando que os dados da NISE não são enviados. | M6, Figma A06·4b | Menina | Must | Confirmado | Dado um hackathon com inscrições até 30/10, quando Alana abre o evento em 15/10, então vê "Faltam 15 dias" e o botão "Ir para inscrição". |
| RF-F10.14 | O sistema deve perguntar, quando a menina volta do site, se ela conseguiu se inscrever, e marcar o evento como "Inscrita" no filé quando ela confirmar. | M6, Figma A09, A06·4b inscrita | Menina | Must | Confirmado | Dado que Alana voltou do site, quando responde "Sim, me inscrevi", então o evento aparece como "Inscrita" no filé. |
| RF-F10.15 | O sistema deve permitir que a menina desmarque a inscrição ("Não vou mais"). | Figma A06·4b inscrita | Menina | Should | Confirmado | Dado um evento marcado como inscrita, quando Alana toca "Não vou mais", então o evento sai do filé. |
| RF-F4.12 | O sistema deve oferecer à menina inscrita num evento um lembrete opcional por e-mail um dia antes. | D-05, Figma A06·4b inscrita, K01 | Menina | Should | Confirmado | Dado que Alana marcou "Me lembra um dia antes" no hackathon de 08/11, quando chega 07/11, então ela recebe um e-mail só. |

#### F4 · Avaliação e lembretes (M1, M5)

> ⚠️ **EM MUDANÇA.** C4 e M5 estão em execução e sujeitos a ajustes da equipe. Tudo que vem de K05, K08, A11 a A14, A17 e A18 está "a validar".

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F4.03 | O sistema deve pedir a avaliação do evento com nota de 1 a 5 e um comentário opcional, que a menina pode pular. | F4, M1, Figma A03 | Menina | Must | Confirmado | Dado que Alana abre a avaliação, quando dá nota 4 e toca "Agora não" no comentário, então a nota fica registrada sem texto. |
| RF-F4.11 (F9) | O sistema deve avisar a menina, por e-mail, das datas importantes (ENEM, IFAL, SISU, início do ano letivo), cadastradas pela equipe NISE, e mostrá-las num calendário dela junto com os questionários. | D-05, Figma A14, A14b, Doc vivo §11 | Menina | Must | **A validar** | Dado que a equipe cadastrou "ENEM · 1º dia" em 08/11, quando chega a véspera, então Alana, com avisos ativos, recebe o lembrete. *Ainda falta decidir quem cadastra as datas e se ela escolhe quais lembretes quer.* |
| RF-F4.13 | O sistema deve mostrar à menina o questionário de acompanhamento identificado pela ação e pelo grupo, com as 4 perguntas padrão (caminho de 1 a 5, se começou curso de TI, o que ajudaria agora e um comentário opcional), que ela pode deixar para depois. | F4, M5, Figma A18 | Menina | Must | **A validar** | Dado o questionário de 3 meses do Hackathon Rendeiras, quando Alana abre o link, então vê as 4 perguntas e pode tocar "Agora não". |

#### F6 · Registro de ingresso (M5)

> ⚠️ **EM MUDANÇA.** C4 e M5 estão em execução e sujeitos a ajustes da equipe. Tudo que vem de K05, K08, A11 a A14, A17 e A18 está "a validar".

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F6.01 (RF-06.01) | O sistema deve perguntar nos questionários se a menina continua interessada em computação e qual é o momento dela agora. | F6, Figma A11 | Menina | Must | **A validar** | Dado o questionário de 3 meses, quando Alana responde "Ainda estou decidindo", então a resposta entra no indicador de interesse. |
| RF-F6.02 (RF-06.01, RF-06.04) | O sistema deve permitir que a menina declare ingresso em curso técnico ou graduação, dizendo qual curso e onde, ou responda "Tô tentando entrar" ou "Ainda não". | F6, Figma A13, A17 | Menina | Must | **A validar** | Dado que Alana responde "Graduação", "Ciência da Computação" e "UFAL", quando envia, então o ingresso fica registrado com a origem "autodeclaração". |
| RF-F6.03 (RF-06.02) | O sistema deve registrar a data e a origem de cada ingresso (autodeclaração ou lista oficial confirmada pela menina). | F6, F31 | Sistema | Must | Confirmado | Dado um ingresso declarado, quando é salvo, então o registro tem a data e "autodeclaração". |
| RF-F6.04 | O sistema deve permitir que a menina registre o ingresso a qualquer momento, pelo perfil, sem esperar um questionário. | Figma A12 ("Registrar ingresso em um curso") | Menina | Should | **A validar** | Dado que Alana entrou no IFAL, quando toca "Registrar ingresso" no perfil, então registra sem esperar o questionário de 6 meses. |
| RF-F6.05 (RF-06.05) | O sistema deve permitir corrigir a declaração, guardando o valor anterior. | F6 | Menina | Should | Confirmado | Dado uma declaração errada, quando Alana a corrige, então o sistema guarda a nova e a anterior, com as datas. |

*A A13 traz "Autorizo compartilhar este marco com os grupos". Pela D-01, quem veio de evento já tem os dados vistos pelo grupo. Falta confirmar se essa caixa continua.*

#### F31 · Confirmação "sou eu"

Os planos da F31 estão em 3.3.

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F31.04 (RF-31.06, RF-31.07) | O sistema deve perguntar à menina, no app e por e-mail, se é ela quem aparece na lista, com "sou eu" e "não sou eu". Ao confirmar, registra a aprovação com a origem; o ingresso só conta quando ela confirma a matrícula. | F31, RN-21, RN-22, Figma K06 Ingressantes | Menina | Must | **A validar** | Dado um indício, quando Maria responde "sou eu" e "ainda não me matriculei", então ela consta como aprovada, e não como ingressante. |

### 3.2 Coordenadora

O que a coordenadora faz ou vê, incluindo as regras que acontecem durante a ação dela (validar a planilha, anonimizar o arquivo exportado). Fluxos C1 a C7.

#### S2 · Contas do grupo

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-S2.06 | O sistema deve permitir mais de uma conta de coordenadora por grupo, cada uma com login próprio. | Pendência da v0.1, Figma K09 (histórico com Kátia e Joana) | Coordenadora | Must | Confirmado | Dado que Kátia e Joana coordenam as Rendeiras, quando cada uma entra, então ambas veem as ações do grupo, e o histórico registra quem fez cada coisa. |

#### F30 · Cadastro de ações (C1)

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F30.01 (RF-30.01) | O sistema deve permitir que a coordenadora cadastre uma ação do seu grupo com nome, tipo, data, formato (presencial ou online), cidade (quando presencial), visibilidade (aberta ou fechada) e link de inscrição. | F30, C1, Figma K02 | Coordenadora | Must | Confirmado | Dado que Kátia preenche "Introdução à robótica", oficina, 24/10/2026, presencial, Maceió, aberta e o link do Forms, quando salva, então a ação aparece na lista de ações (K10) na etapa "Inscrições abertas". |
| RF-F30.02 | O sistema deve exigir o link de inscrição para ações abertas e torná-lo opcional para ações fechadas. | Figma K02 | Sistema | Must | Confirmado | Dado uma ação aberta sem link, quando Kátia tenta salvar, então vê "Obrigatório pra ações abertas" junto ao campo, e nada é salvo. |
| RF-F30.03 (RF-30.02) | O sistema deve permitir informar, de forma opcional, horário de início e fim, se dura mais de um dia, endereço, público (uma ou mais etapas escolares) e descrição de até 300 caracteres. | F30, Figma K02 mais detalhes | Coordenadora | Must | Confirmado | Dado uma ação salva só com os campos obrigatórios, quando Kátia volta e acrescenta horário e descrição, então os dados ficam salvos e as inscritas já importadas não mudam. |
| RF-F30.04 | O sistema deve permitir que, numa ação online, a coordenadora escolha o alcance: todo o estado de Alagoas ou cidades específicas. | Figma K02 online | Coordenadora | Must | Confirmado | Dado uma ação online com alcance "todo o estado", quando Belana, de Arapiraca, vê as sugestões, então a ação aparece para ela. |
| RF-F30.05 (RF-30.03) | O sistema deve validar o cadastro antes de salvar: data de fim igual ou posterior à de início, cidade escolhida da lista do IBGE (RN-17) e link iniciado por https. | F30 | Sistema | Must | Confirmado | Dado uma data de fim anterior à de início, quando Kátia tenta salvar, então vê a mensagem junto ao campo, e nada é salvo. |
| RF-F30.06 | O sistema deve mostrar, durante o cadastro, uma prévia de como a ação aparece nas sugestões das meninas, com o texto de quem vai vê-la. | Figma K02 (prévia) | Coordenadora | Should | Confirmado | Dado uma ação aberta presencial em Maceió com a tag "Robótica", quando Kátia vê a prévia, então lê "Aparece para meninas de Maceió com interesse em Robótica". |
| RF-F30.07 | O sistema deve permitir salvar a ação como rascunho e continuar o cadastro depois. | Figma K02, K10 | Coordenadora | Should | Confirmado | Dado um rascunho salvo, quando Kátia abre a lista de ações, então vê "1 rascunho" com o botão "Continuar cadastro", e o rascunho não aparece para as meninas. |
| RF-F30.08 | O sistema deve oferecer o cadastro em 3 passos no celular (básico, inscrição e detalhes), com a prévia ao final. | Figma K02 celular | Coordenadora | Must | Confirmado | Dado Kátia no celular (360 px), quando cadastra uma ação, então passa pelos passos 1 de 3 a 3 de 3 e pode salvar a partir do passo 2. |
| RF-F30.09 (RF-30.11) | O sistema deve permitir copiar os campos de uma ação anterior, exceto as datas. | Figma K02 ("Copiar de uma ação anterior") | Coordenadora | Could | Confirmado | Dado que Kátia repete a oficina de robótica, quando escolhe copiar a de outubro, então a nova ação vem preenchida e só faltam as datas. |
| RF-F30.10 (RF-30.04) | O sistema deve listar as ações do grupo por etapa (inscrições abertas, inscrições finalizadas, concluídas), com data, tipo, formato, visibilidade, contagens e a próxima tarefa de cada uma. | F30, F3, Figma K10 | Coordenadora | Must | Confirmado | Dado uma ação que aconteceu sem presença registrada, quando Kátia abre a lista, então vê "Falta marcar a presença" e o botão "Marcar presença" nessa ação. |
| RF-F30.11 (RF-30.05) | O sistema deve permitir editar uma ação. Se a data mudar, os contatos ainda não enviados são reprogramados (RN-18). | F30, F4, Figma K11 | Coordenadora | Must | Confirmado | Dado uma ação de 24/10 com avaliação ainda não enviada, quando Kátia muda a data para 31/10, então os contatos pendentes passam a contar a partir de 31/10. |
| RF-F30.12 (RF-30.06) | O sistema deve permitir excluir uma ação, com modal de confirmação, enquanto a presença não for registrada, mesmo que já tenha inscritas. Depois da presença, a ação não pode ser excluída (RN-15). | F30, nota no Figma (C2), D-12 | Coordenadora | Must | Confirmado | Dado uma ação com 23 inscritas e sem presença, quando Kátia toca "Excluir ação" e confirma no modal, então a ação e as inscrições dela somem. Dado uma ação com presença registrada, a opção não aparece. |
| RF-F30.14 (RF-30.09) | O sistema deve permitir cadastrar ações com data passada, para registrar o histórico do grupo, sem que elas apareçam nas sugestões. | F30 | Coordenadora | Should | Confirmado | Dado um minicurso de março de 2026, quando Kátia o cadastra, então pode importar a lista e marcar presença, e a ação não aparece para as meninas. |
| RF-F30.15 (RF-30.10) | O sistema deve registrar quem criou e quem alterou cada ação, e quando. | F30 | Sistema | Should | Confirmado | Dado que uma coordenadora mudou a data de uma ação, quando outra coordenadora do grupo abre o histórico, então vê quem mudou, quando e o valor anterior. |
| RF-F30.16 (RF-30.12) | O sistema deve avisar quando a coordenadora cadastrar uma ação com o mesmo nome e a mesma data de outra do grupo. | F30 | Sistema | Could | Confirmado | Dado que já existe "Oficina de robótica" em 20/11, quando Kátia cadastra outra igual, então vê um aviso e pode confirmar ou cancelar. |

A visibilidade da ação para as meninas (RF-F30.13) está em 3.1.

#### F17 · Tipos e tags (C1, C5)

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F17.01 (RF-04.1) | O sistema deve exigir um tipo para cada ação, numa lista fixa: oficina, palestra, minicurso, hackathon, visita, acolhimento, outro. | F17, Figma K02 | Coordenadora | Must | Confirmado | Quando Kátia tenta salvar uma ação sem tipo, então o sistema pede que ela escolha um. |
| RF-F17.02 (RF-04.2) | O sistema deve permitir atribuir uma ou mais tags de tema ou técnica a uma ação (ex.: Python, robótica, IA). | F17, Figma K02 | Coordenadora | Must | Confirmado | Dado uma oficina, quando Kátia adiciona "Robótica" e "Arduino", então a ação aparece com as duas. |
| RF-F17.03 (RF-04.3) | O sistema deve sugerir as tags já usadas pelo grupo enquanto a coordenadora digita, para evitar variações. | F17, Figma K02 ("Usadas pelo grupo") | Coordenadora | Should | Confirmado | Dado que a tag "Python" já existe, quando Kátia digita "pyt", então o sistema sugere "Python" em vez de criar "python". |
| RF-F17.04 (RF-04.5) | O sistema deve permitir editar ou remover as tags de uma ação, atualizando o painel. | F17 | Coordenadora | Should | Confirmado | Quando Kátia remove a tag "IA" de uma ação, então essa ação deixa de aparecer no filtro "IA". |

O filtro do painel por tipo e tag (antigo RF-04.4) passou para a F5 (RF-F5.06). A manutenção da lista de tipos (RF-F17.05) está em 3.3.

#### F1 · Importar inscritas (C2)

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F1.01 (RF-01.1) | O sistema deve permitir que a coordenadora importe um arquivo CSV ou XLSX com a lista de inscritas, a partir da página da ação. | F1, C2, Figma K03, K11 | Coordenadora | Must | Confirmado | Dado um CSV exportado do Google Forms, quando Kátia o envia na página da ação, então passa para a etapa de revisão com as linhas lidas. |
| RF-F1.02 | O sistema deve reconhecer o formato do Google Forms, do Sympla, do Even3 e do Doity e já sugerir a associação das colunas. | F1, Figma K03 ("Reconhecemos as colunas do Google Forms") | Sistema | Should | Confirmado | Dado um CSV do Google Forms, quando é carregado, então a tela mostra "formato do Google Forms" e as colunas já aparecem associadas. |
| RF-F1.03 (RF-01.2) | O sistema deve permitir associar as colunas da planilha aos campos da NISE: nome e e-mail (obrigatórios), WhatsApp, escolaridade, série e escola (opcionais), ou marcar a coluna como "Não usar". | F1, Figma K03 | Coordenadora | Must | Confirmado | Dada a coluna "Endereço de e-mail", quando Kátia a associa a "E-mail", então os valores dessa coluna são gravados como e-mail. Colunas marcadas "Não usar" não entram na NISE. |
| RF-F1.04 | O sistema deve usar a série só para inferir o nível de escolaridade da menina. | Nota no Figma (C2) | Sistema | Must | **A validar** | Dada a série "8º ano", quando a inscrita é importada, então o nível registrado é "Ensino fundamental". *A nota não diz se a série também é guardada.* |
| RF-F1.05 (RF-01.4) | O sistema deve mostrar uma revisão antes de importar, separando as linhas prontas, as que precisam de revisão (e-mail incompleto ou ausente) e as repetidas no arquivo, com o motivo de cada uma. | F1, Figma K03 Revisão | Coordenadora | Must | Confirmado | Dada uma planilha com 26 linhas, 2 com e-mail inválido e 1 repetida, quando a revisão aparece, então mostra "23 prontas · 2 pra revisar · 1 repetida". |
| RF-F1.06 | O sistema deve permitir corrigir o e-mail de uma linha na revisão, ou importá-la sem e-mail, avisando que a menina não receberá os questionários. | Figma K03 Revisão | Coordenadora | Should | Confirmado | Dado Isadora sem e-mail, quando Kátia escolhe importar mesmo assim, então vê "Sem e-mail, a menina não recebe os questionários" e a linha é importada. |
| RF-F1.07 (RF-01.5) | O sistema deve mostrar, ao fim da importação, quantas inscritas são novas, quantas já estavam na NISE e quantas ficaram de fora. | F1 | Coordenadora | Should | Confirmado | Dada uma planilha com 50 linhas, 5 já cadastradas e 2 inválidas, quando a importação termina, então o resumo mostra 43 novas, 5 existentes e 2 de fora. |
| RF-F1.08 (RF-01.6) | O sistema deve permitir importar mais de uma lista para a mesma ação sem duplicar quem já foi importada. | F1, F2 | Coordenadora | Must | Confirmado | Dado que a ação tem 30 inscritas, quando Kátia importa uma lista com essas 30 e mais 10, então a ação passa a ter 40. |
| RF-F1.09 | O sistema deve permitir adicionar uma inscrita por vez (nome e e-mail obrigatórios; WhatsApp, escolaridade, série e escola opcionais), avisando quando ela já está na NISE. | Figma K11 adicionar inscrita | Coordenadora | Must | Confirmado | Dado que Júlia já participou de "Arduino na escola", quando Kátia digita o e-mail dela, então vê "Já está na NISE" antes de adicionar. |
| RF-F1.10 | O sistema deve permitir finalizar as inscrições de uma ação, com confirmação. A ação passa para "Inscrições finalizadas" e sai das sugestões das meninas, mas continua aceitando inscritas. | Figma K11 finalizar | Coordenadora | Must | Confirmado | Dado uma ação com 23 inscritas, quando Kátia confirma "Finalizar inscrições", então a ação some do filé das meninas, e ela ainda pode adicionar uma inscrita depois. |
| RF-F1.11 | O sistema não deve criar contas para as inscritas na importação. | Figma K03 ("A importação não cria contas automaticamente") | Sistema | Must | Confirmado | Dado uma importação de 23 inscritas, quando termina, então nenhuma conta foi criada e nenhum e-mail foi enviado. |
| RF-F1.12 (RF-01.7) | O sistema deve permitir desfazer uma importação, removendo as inscrições daquele lote. | F1 | Coordenadora | Could | Confirmado | Dada uma importação na ação errada, quando Kátia a desfaz, então as inscrições do lote saem da ação, e os cadastros de quem já existia continuam. |
| RF-F1.13 | O sistema deve descartar na importação as colunas de CPF, RG, endereço completo, raça/cor, renda e deficiência. | Seção 6 da v0.1, sugestão aberta do Zé | Sistema | Must | Confirmado | Dada uma planilha com a coluna "CPF", quando Kátia tenta associá-la, então a coluna só pode ficar como "Não usar" (RN-31). |

O convite para a menina criar conta saiu da F1 (antigo RF-01.02) e foi para a F4 (RF-F4.01, em 3.3), por D-06.

#### F3 · Presença e funil (C3) · *novo*

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F3.01 | O sistema deve permitir marcar a presença das inscritas numa lista, com busca por nome ou e-mail e a opção "Marcar todas". | F3, C3, Figma K04 na lista | Coordenadora | Must | Confirmado | Dado uma ação com 23 inscritas, quando Kátia marca 14, então vê "14 de 23 marcadas como presentes". |
| RF-F3.02 | O sistema deve permitir importar a lista de presença por planilha, com a mesma revisão da importação de inscritas. | F3, Figma K04 ("Importar lista de presença"), Doc vivo §5 | Coordenadora | Should | Confirmado | Dado um CSV com 17 e-mails de inscritas, quando Kátia o importa, então as 17 ficam como presentes. |
| RF-F3.03 | O sistema deve permitir adicionar como presente uma menina que veio sem inscrição. | Figma K04 ("Veio sem inscrição?") | Coordenadora | Must | Confirmado | Dado que Lara veio sem se inscrever, quando Kátia a adiciona com nome e e-mail, então ela entra como inscrita e presente. |
| RF-F3.04 | O sistema deve permitir salvar a presença pela metade e continuar depois. | Figma K04 ("Salvar e continuar depois") | Coordenadora | Should | Confirmado | Dado 14 de 23 marcadas, quando Kátia sai e volta, então as 14 continuam marcadas. |
| RF-F3.05 | O sistema deve concluir a ação ao registrar a presença e mostrar presentes e faltantes. | F3, Figma K11 concluída | Coordenadora | Must | Confirmado | Dado 17 presentes de 23, quando Kátia registra a presença, então a ação passa a "Concluída" e mostra "17 de 23 inscritas estiveram presentes". |
| RF-F3.06 | O sistema deve permitir editar a presença depois de registrada. | Figma K04, K11 ("Editar presença") | Coordenadora | Must | Confirmado | Dado uma ação concluída, quando Kátia marca mais uma presente, então a contagem passa a 18 de 23 e o painel é atualizado. |
| RF-F3.07 | O sistema deve registrar, para cada menina e ação, a etapa do funil: inscrita, presente e concluinte. | F3, Doc vivo §6 | Sistema | Must | **A validar** | Dado que Alana estava inscrita e foi marcada presente, quando o funil é calculado, então ela conta como inscrita e presente. *O Figma não mostra como uma presente vira "concluinte".* |

#### F4 · Calendário de contatos (C4)

> ⚠️ **EM MUDANÇA.** C4 e M5 estão em execução e sujeitos a ajustes da equipe. Tudo que vem de K05, K08, A11 a A14, A17 e A18 está "a validar".

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F4.04 (RF-04.01) | O sistema deve permitir que a coordenadora aprove, uma vez por ação e logo depois do evento, o calendário de contatos: avaliação, questionário de 3 meses e de 6 meses. | F4, C4, Figma K05, K01, Doc vivo §12 | Coordenadora | Must | **A validar** | Dado uma ação concluída, quando Kátia aprova o calendário, então os contatos ficam agendados e a tarefa some da aba Tarefas. |
| RF-F4.05 | O sistema deve permitir revisar e editar a mensagem e as perguntas de cada contato antes do envio. | Figma K08, K05e | Coordenadora | Should | **A validar** | Dado o questionário de 3 meses, quando Kátia edita a mensagem, então a prévia mostra o texto novo, com o nome de cada menina trocado. |
| RF-F4.09 (RF-04.07) | O sistema deve mostrar à coordenadora o calendário com as ações do grupo e os contatos, em lista e por ano, e o detalhe de cada dia. | Figma K05b, K05c, K05d (celular e computador) | Coordenadora | Should | **A validar** | Dado o calendário em lista, quando Kátia toca em 24/10, então vê a ação e os contatos que vêm depois dela. |
| RF-F4.10 | O sistema deve mostrar as respostas de cada contato só de forma agregada, com os comentários sem nome. | Figma K05f, Doc vivo §7 | Coordenadora | Should | **A validar** | Dado 14 de 21 respostas, quando Kátia abre as respostas, então vê os totais por opção e os comentários sem nome. |

#### F5 · Painel do grupo (C5)

> ⚠️⚠️ **EM MUDANÇA FORTE.** C5 e C6 estão em revisão, com bastante mudança no Figma. Os RFs abaixo são só a versão essencial. **Não comecem histórias destes itens antes da revisão do Figma.**

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F5.01 | O sistema deve mostrar à coordenadora o que precisa dela agora: calendários a aprovar, presenças a registrar, inscrições a fechar e listas a importar. | Figma K01 Tarefas, Doc vivo §4 | Coordenadora | Must | **A validar** ⚠️ | Dado uma ação concluída sem calendário aprovado, quando Kátia abre a Visão geral, então vê "Aprove o calendário de contatos" com o botão "Aprovar calendário". |
| RF-F5.02 (RF-05.01) | O sistema deve mostrar o funil do grupo (inscritas, presentes, criaram conta, responderam 3 meses, responderam 6 meses, ingressaram), com a porcentagem de cada etapa em relação à anterior. | F5, F3, Figma K06 Funil | Coordenadora | Must | **A validar** ⚠️ | Dado 64 inscritas e 42 presentes, quando Kátia abre o funil, então vê "42 presentes · 66% da etapa anterior". |
| RF-F5.09 (RF-05.02) | O sistema deve mostrar quantas meninas voltaram a outra ação do grupo no período (cada menina conta uma vez). | F5, F2, Figma K06 ("Voltaram em 3 meses") | Coordenadora | Must | **A validar** ⚠️ | Dado que Ana foi a duas ações do grupo no período, quando Kátia abre o painel, então Ana conta uma vez como recorrente. |
| RF-F5.03 (RF-05.03) | O sistema deve mostrar a avaliação média, a quantidade de respostas e a avaliação por ação, com os comentários sem nome. | F5, Figma K06 Avaliações | Coordenadora | Must | **A validar** ⚠️ | Dado 30 avaliações de 42 presentes, quando Kátia abre Avaliações, então vê a média e "30 de 42 presentes". |
| RF-F5.04 (RF-05.03) | O sistema deve mostrar os temas de interesse das meninas com conta e a evolução do interesse declarado nos questionários. | F5, Figma K06 Interesses | Coordenadora | Should | **A validar** ⚠️ | Dado respostas de 3 meses, quando Kátia abre Interesses, então vê a porcentagem por tema. *O "antes e depois" pede uma pergunta de interesse antes da ação, que hoje não existe.* |
| RF-F5.05 (RF-05.04) | O sistema deve mostrar as meninas do grupo que ingressaram na área, com curso, instituição e a origem do registro. | F5, F6, F31, Figma K06 Ingressantes | Coordenadora | Must | **A validar** ⚠️ | Dado 3 ingressos declarados, quando Kátia abre Ingressantes, então vê as 3 com "Ela declarou na NISE". |
| RF-F5.06 (RF-05.05) | O sistema deve permitir filtrar os indicadores por período, ação, tipo e tag. | F5, F17, Figma K06 | Coordenadora | Must | **A validar** ⚠️ | Dado o filtro "Tipo: oficina", quando aplicado, então todos os números consideram só oficinas. |
| RF-F5.07 (RF-05.07) | O sistema deve mostrar a posição do grupo em relação à média da Rede NISE, sem identificar os outros grupos. | F5, Figma K06 Grupo × Rede NISE | Coordenadora | Should | **A validar** ⚠️ | Dado 14 grupos, quando Kátia abre Grupo × Rede, então vê "5º de 14" em presença, e nenhum outro grupo tem nome. |
| RF-F5.08 | O painel não mostra raça/cor nem renda. | D-04 | Sistema | Must | Confirmado | Dado o Dashboard, quando Kátia o abre, então não existe o indicador "Pretas, pardas e indígenas". |

Ficam como Could ou Won't, por estarem fora da versão essencial: "Ideias de outros grupos", "Onde mais perdemos", os temas dos comentários (que pediriam LLM), "Quem alcançamos" e as metas.

#### F16 · Comparações (C6)

> ⚠️⚠️ **EM MUDANÇA FORTE.** C5 e C6 estão em revisão, com bastante mudança no Figma. Os RFs abaixo são só a versão essencial. **Não comecem histórias destes itens antes da revisão do Figma.**

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F16.03 (RF-03.3, RF-05.06) | O sistema deve mostrar, lado a lado, os mesmos indicadores para participantes, não compareceram e chegaram sozinhas (responderam o acompanhamento, interesse declarado, voltaram a outra ação, ingresso declarado). | F16, Figma K07 | Coordenadora | Must | **A validar** ⚠️ | Dado respostas nos três grupos, quando Kátia abre Comparações, então vê o ingresso declarado de cada grupo lado a lado. |
| RF-F16.04 (RF-03.4) | O sistema deve mostrar o n de cada grupo e quantas não responderam. | F16, Figma K07 | Coordenadora | Must | **A validar** ⚠️ | Quando a comparação aparece, então cada valor mostra "19 de 32 que responderam · 10 sem resposta". |
| RF-F16.06 | O sistema deve permitir alternar entre "Meu grupo" e "Rede NISE", que soma só os grupos que compartilham. | Figma K07 | Coordenadora | Should | **A validar** ⚠️ | Dado 4 grupos que compartilham, quando Kátia escolhe "Rede NISE", então vê os totais somados e "4 grupos compartilham". *Falta definir o que é "compartilhar" (ver D-03).* |

As regras de quem entra em cada grupo de comparação estão em 3.3.

#### F24 · Exportação anonimizada (C7)

O C7 está com "decisão em aberto" no Figma. A exportação do próprio grupo segue a v0.1. A exportação de toda a rede (D-03) entra como Could e "a validar com a equipe". Terceiro corte combinado, se o prazo apertar.

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F24.01 (RF-24.01) | O sistema deve permitir que a coordenadora exporte em CSV os dados das ações do seu grupo, uma linha por menina e ação. | F24, Figma K09 | Coordenadora | Must | Confirmado | Dado 3 ações com 40 inscrições, quando Kátia exporta, então recebe um CSV com 40 linhas, só das ações das Rendeiras. |
| RF-F24.02 (RF-24.02) | O sistema deve tirar do arquivo todos os identificadores diretos: nome, e-mail, telefone, escola, data de nascimento, texto livre, instituição de ingresso e ID do banco. | F24, Figma K09 A3 ("Nunca sai") | Sistema | Must | Confirmado | Dado um cadastro completo, quando o arquivo é gerado, então nenhum desses valores aparece. A varredura é automática (RNF-F24.01). |
| RF-F24.03 (RF-24.03) | O sistema deve trocar a identificação da menina por um código aleatório, igual dentro do arquivo e diferente a cada exportação. | F24, Figma K09 A3 | Sistema | Must | Confirmado | Dado que Ana foi a 2 ações, quando Kátia exporta, então as 2 linhas têm o mesmo código. Numa nova exportação, o código muda. |
| RF-F24.04 (RF-24.04) | O sistema deve generalizar: data de nascimento vira faixa etária (13, 14-15, 16-17, 18+) e datas viram mês e ano. | F24, LGPD art. 12 | Sistema | Must | Confirmado | Dado uma menina nascida em 12/03/2011, quando o arquivo é gerado, então aparece "14-15". |
| RF-F24.05 (RF-24.05) | O sistema deve exportar só respostas fechadas; texto livre nunca sai. | F24, RN-11 | Sistema | Must | Confirmado | Dado o comentário "adorei a monitora", quando o arquivo é gerado, então ele não aparece, mas a nota sim. |
| RF-F24.06 (RF-24.07) | O sistema deve permitir exportar só à coordenadora do grupo. | RN-07 | Sistema | Must | Confirmado | Dado uma conta de menina ou de curadoria, quando chama a rota de exportação, então recebe acesso negado. |
| RF-F24.07 (RF-24.08) | O sistema deve registrar cada exportação (quem, quando, filtros, linhas) e mostrar o histórico ao grupo. | RN-07, LGPD art. 37, Figma K09 A4 | Sistema | Must | Confirmado | Dado que Kátia exportou às 14h, quando o grupo abre o histórico, então vê "Kátia · hoje, 14:02 · 66 linhas". |
| RF-F24.08 (RF-24.09) | O sistema deve incluir as colunas analíticas: faixa etária, cidade, etapa escolar, tipo, tags e mês da ação, grupo de comparação, funil, nota da avaliação, interesse em 0, 3 e 6 meses, ingresso e a origem. | F24, Figma K09 A2 | Sistema | Must | Confirmado | Dado que Ana esteve presente e declarou interesse aos 3 meses, quando o arquivo é gerado, então a linha dela mostra "presente = sim" e "interesse_3m". |
| RF-F24.15 (RF-24.10) | O sistema deve informar a participação da menina em ações de outros grupos só como contagem, sem dizer qual grupo. | F24, Figma K09 A2 ("acoes_outros_grupos") | Sistema | Should | Confirmado | Dado que Ana foi a 1 ação das Rendeiras e a 2 de outro grupo, quando Kátia exporta, então a linha dela mostra "acoes_outros_grupos = 2". |
| RF-F24.09 (RF-24.11) | O sistema deve permitir filtrar por período, ação, tipo e tag, trazendo os filtros da tela Comparações. | F24, Figma K09 A1 | Coordenadora | Should | Confirmado | Dado o filtro "Oficina, 2026", quando Kátia exporta, então o arquivo tem só oficinas de 2026. |
| RF-F24.10 | O sistema deve oferecer modelos de exportação (prestação de contas, pesquisa, planejar a próxima ação, do meu jeito), que já escolhem as colunas. | Figma K09 A1, A2 | Coordenadora | Should | **A validar** | Dado o modelo "Prestação de contas", quando Kátia avança, então as colunas de funil e avaliações já vêm marcadas. |
| RF-F24.11 (RF-24.12) | O sistema deve gerar junto um dicionário de dados. | F24, Figma K09 A4 | Sistema | Should | Confirmado | Dado qualquer exportação, quando Kátia baixa, então recebe também o dicionário. |
| RF-F24.12 (RF-24.15) | O sistema deve oferecer o arquivo também em XLSX. | F24, Figma K09 A4 | Coordenadora | Could | Confirmado | Dado a mesma exportação, quando Kátia escolhe XLSX, então o conteúdo é igual ao CSV. |
| RF-F24.13 | O sistema deve permitir exportar os dados anonimizados de toda a Rede NISE (todos os grupos que compartilham), com as mesmas regras de anonimização. | D-03, Figma K09 A1 Toda a rede, reunião da equipe | Coordenadora | Could | **A validar** ⚠️ | Dado 4 grupos que compartilham, quando Kátia escolhe "Toda a rede NISE", então o arquivo traz as ações de todos, sem nome de grupo. *A equipe ainda vai discutir. Precisa definir o que é "compartilhar" e se os grupos aceitam.* |
| RF-F24.14 | O sistema deve gerar um cartão de impacto (imagem) só com números agregados de pelo menos 5 meninas. | Figma K09 Cartão de impacto | Coordenadora | Could | **A validar** | Dado que só 2 meninas ingressaram, quando Kátia gera o cartão, então esse número aparece como oculto. |

### 3.3 Sistema e curadoria

O que roda sem ninguém clicar (envios, cruzamentos, rotinas, LLM, deduplicação) e o que a equipe NISE faz nos bastidores (curadoria e listas oficiais).

#### Acesso (S2)

Vale igual para menina e coordenadora.

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-S2.01 | O sistema deve permitir criar conta e entrar com e-mail e senha ou com a conta Google. | S2, Figma A02, A15 | Menina, Coordenadora | Must | Confirmado | Dado que Alana toca "Criar conta com o Google", quando autoriza, então vai para "Só mais um passo" (A02b) com nome e e-mail já preenchidos. |
| RF-S2.04 | O sistema deve permitir recuperar o acesso por um link enviado ao e-mail da conta. | Figma A16 | Menina, Coordenadora | Must | Confirmado | Dado que Kátia esqueceu a senha, quando informa o e-mail, então recebe um link que permite criar uma nova senha. |

#### F2 · Cadastro único

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F2.01 (RF-02.1) | O sistema deve reconhecer pelo e-mail uma menina já cadastrada quando ela aparecer na lista de outro grupo. | F2 | Sistema | Must | Confirmado | Dado que Ana foi importada pelas Rendeiras, quando outro grupo importa uma lista com o mesmo e-mail, então a nova inscrição é ligada ao mesmo registro, sem duplicar. |
| RF-F2.02 (RF-02.2) | O sistema deve ligar a conta criada pela menina ao registro que veio de uma importação, quando ela usar o mesmo e-mail, inclusive pelo login com Google. | F2, Figma A02, A02b | Menina | Must | Confirmado | Dado que Alana foi importada com alana@gmail.com, quando ela cria conta com o Google usando esse e-mail, então ativa o registro existente. |
| RF-F2.03 (RF-02.3, RF-10.05) | O sistema deve reunir num único registro as participações da menina em ações de todos os grupos. | F2, F10 | Menina | Must | Confirmado | Dado que Ana foi a ações de dois grupos, quando abre o perfil, então vê as duas participações. |
| RF-F2.04 (RF-02.4) | O sistema deve mostrar à coordenadora só as participações em ações do próprio grupo. Participações em outros grupos aparecem só como número. | F2, Doc vivo §7 | Coordenadora | Must | Confirmado | Dado que Ana foi a 1 ação das Rendeiras e 2 de outro grupo, quando Kátia abre o registro dela, então vê só a ação das Rendeiras. |
| RF-F2.05 (RF-02.5) | O sistema deve sinalizar possíveis duplicadas (mesmo nome e mesma data de nascimento com e-mails diferentes) para a equipe NISE revisar. | F2, Doc vivo §13 | Administração | Should | **A validar** | Dados dois registros de "Ana Souza, 12/03/2010" com e-mails diferentes, quando o segundo é criado, então o par aparece na lista de possíveis duplicadas. *O doc vivo diz que o caso da menina de vários eventos ainda está em aberto.* |
| RF-F2.06 (RF-02.6) | O sistema deve permitir unir dois registros da mesma menina, mantendo o histórico dos dois. | F2 | Administração | Could | **A validar** | Dados dois registros confirmados como a mesma pessoa, quando são unidos, então resta um, com as participações dos dois. |

#### F4 · Envios automáticos

> ⚠️ **EM MUDANÇA.** C4 e M5 estão em execução e sujeitos a ajustes da equipe. Tudo que vem de K05, K08, A11 a A14, A17 e A18 está "a validar".

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F4.01 (RF-01.02, RF-04.02) | O sistema deve enviar o convite para criar conta por e-mail só às presentes, depois que a coordenadora registra a presença, junto com a avaliação do evento. | F4, D-06, Figma K04, K11 concluída | Sistema | Must | Confirmado | Dado 17 presentes, 12 delas com e-mail válido, quando Kátia registra a presença, então as 12 recebem o e-mail com o convite e a avaliação, e as faltantes não recebem nada. |
| RF-F4.02 | O sistema não deve enviar um novo convite a quem já tem conta. A nova participação é ligada ao cadastro dela, e ela recebe só a avaliação desse evento. | D-06, RN-29, Doc vivo §13 | Sistema | Must | **A validar** | Dado que Alana já tem conta e foi a uma ação de outro grupo, quando a presença é registrada, então ela recebe só a avaliação, e o histórico mostra as duas ações. |
| RF-F4.06 (RF-04.03, RF-04.04) | O sistema deve enviar os questionários nas datas aprovadas, por e-mail e aviso no app, só para quem aceitou os avisos (RF-F7.07), sem nova ação da coordenadora. | F4, Figma K05e, A04·3 | Sistema | Must | Confirmado | Dado um calendário aprovado, quando chega a data do questionário de 3 meses, então as meninas com aviso ativo recebem o e-mail e o aviso. |
| RF-F4.07 (RF-04.06) | O sistema deve registrar as respostas ligadas à menina, à ação e à etapa (avaliação, 3 meses, 6 meses). | F4 | Sistema | Must | Confirmado | Dado que Alana responde o questionário de 3 meses, quando envia, então a resposta fica ligada à ação e à etapa "3 meses". |
| RF-F4.08 | O sistema deve ter perguntas fechadas para interesse e ingresso (escala de 1 a 5, sim/ainda não, múltipla escolha) e só uma pergunta aberta opcional. | Figma K05e, A18, A11, pendência da v0.1 (RN-11) | Sistema | Must | **A validar** | Dado o questionário padrão, quando Kátia o revisa, então vê 3 perguntas fechadas e 1 aberta opcional. |

Saiu: WhatsApp (antigo RF-04.05), por custo.

#### F11 · Recomendação e curadoria

A própria equipe monta a curadoria (D-13).

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F11.01 (RF-11.01) | O sistema deve sugerir apenas itens das duas fontes do filé: ações cadastradas pelos grupos (F30) e itens da curadoria da equipe NISE. | F11, Doc vivo §6 | Sistema | Must | Confirmado | Dado que a base tem 50 itens, quando o filé de Ana é montado, então todos os itens sugeridos existem na base, nenhum inventado pela LLM. |
| RF-F11.02 (RF-11.03) | O sistema deve montar as sugestões por regras (temas, momento de estudo, cidade e faixa de esforço) quando a LLM não estiver disponível. | F11, Doc vivo §6 ("O filé funciona sem a LLM") | Sistema | Must | Confirmado | Dado que a LLM não respondeu, quando Ana abre o filé, então vê sugestões por regras, sem mensagem de erro. |
| RF-F11.03 (RF-11.02) | O sistema deve enviar à LLM apenas temas, momento de estudo, cidade, tags das ações de que a menina participou e as escolhas no filé, nunca nome, e-mail, telefone ou data de nascimento. | F11, LGPD | Sistema | Must | Confirmado | Dado um perfil completo, quando o sistema pede sugestões à LLM, então a requisição não tem nenhum identificador. |
| RF-F11.05 | O sistema deve usar as escolhas da menina ("Não é pra mim" com motivo, "Quero fazer", avaliação e "sugestões parecidas") nas próximas sugestões. | Figma A06·2a, A06·5 | Sistema | Should | Confirmado | Dado que Alana dispensou dois cursos como "Muito difícil", quando novas sugestões são montadas, então itens do mesmo nível ficam por último. |
| RF-F11.07 (RF-11.06) | O sistema deve esconder das sugestões os itens vencidos. | F11 | Sistema | Must | Confirmado | Dado um evento que aconteceu ontem, quando o filé é montado hoje, então ele não aparece. |
| RF-F11.06 (RF-11.05) | O sistema deve permitir que a curadoria cadastre, edite e desative itens, com tipo, faixa de esforço, tags, cidade, link, idade mínima, custo e validade. | F11, Doc vivo §6 | Curadoria | Must | **A validar** | Dado que a curadoria cadastra um curso com a tag "Robótica", quando salva, então o curso pode ser sugerido. *A própria equipe monta a curadoria (D-13). A tela ainda não existe no Figma; a montagem inicial da base entra como task da história do filé.* |

#### F16 · Regras de comparação

> ⚠️⚠️ **EM MUDANÇA FORTE.** C5 e C6 estão em revisão, com bastante mudança no Figma. Os RFs abaixo são só a versão essencial. **Não comecem histórias destes itens antes da revisão do Figma.**

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F16.01 (RF-03.1) | O sistema deve classificar como "não compareceram" as inscritas sem presença registrada. | F16, F3 | Sistema | Must | **A validar** ⚠️ | Dado 40 inscritas e 28 presentes, quando a presença é registrada, então as outras 12 entram em "não compareceram". |
| RF-F16.02 (RF-03.2) | O sistema deve incluir em "chegaram sozinhas" as meninas com conta que não foram a nenhuma ação, sempre de forma anonimizada e agregada. | F16, Doc vivo §6, §7 | Sistema | Must | **A validar** ⚠️ | Dado 4 meninas que chegaram sozinhas, quando a comparação é calculada, então elas aparecem só como totais. |
| RF-F16.05 (RF-03.5) | O sistema deve esconder o valor quando um grupo tiver menos de 5 pessoas. | F16, Figma K07 | Sistema | Must | **A validar** ⚠️ | Dado 4 meninas em "chegaram sozinhas", quando a comparação aparece, então o valor mostra "Dados insuficientes". |
| RF-F16.07 (RF-03.6) | O sistema deve passar uma menina de "chegaram sozinhas" para participante a partir da primeira presença, mantendo o histórico. | F16, F2 | Sistema | Must | **A validar** ⚠️ | Dado Belana em "chegaram sozinhas", quando é marcada presente numa oficina, então passa a contar como participante dali em diante. |

#### F31 · Ingresso por listas oficiais

Pedido de um dos professores e principal argumento de inovação da NISE (D-02): a autodeclaração sozinha os grupos já conseguem fazer com um Google Forms. A F31 tem três planos, construídos de baixo para cima, para que cada um reaproveite o anterior:

- **Plano A, busca automática (o objetivo):** o sistema consulta sozinho o relatório público do Sisu/UFAL (COPEVE) e cruza os nomes (RF-F31.07 a 31.09).
- **Plano B, importação manual:** a curadoria importa a lista oficial em CSV, e o cruzamento continua automático (RF-F31.01 a 31.06). É a base do Plano A, por isso é construído primeiro.
- **Plano C, autodeclaração:** a F6, que existe de qualquer jeito.

Gatilho: se o Plano B não estiver pronto no fim da Sprint 4, a F31 sai e fica o Plano C. Se o B estiver pronto e sobrar tempo, o A entra na Sprint 5. **Toda a F31 está "a validar"** até a conversa com o Comitê de Ética. A confirmação da menina (RF-F31.04) está em 3.1.

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F31.01 (RF-31.03) | O sistema deve permitir que a curadoria importe em CSV (nome, curso, campus) uma lista oficial de aprovados ou convocados, informando instituição, processo seletivo, chamada, data e link oficial. | F31, D-02 | Curadoria | Must | **A validar** | Dado o CSV de uma chamada do IFAL, quando a curadoria importa, então vê quantas linhas leu e quantas são de cursos-alvo antes de confirmar. |
| RF-F31.02 (RF-31.04) | O sistema deve considerar só as linhas de cursos-alvo (computação e TI). | F31, RN-25 | Sistema | Must | **A validar** | Dado uma lista com Medicina e Ciência da Computação, quando o cruzamento roda, então só Ciência da Computação é comparada. |
| RF-F31.03 (RF-31.05) | O sistema deve comparar o nome completo normalizado (sem acentos, sem diferença de maiúsculas e espaços extras). Só o nome completo igual gera indício. | F31, RN-20 | Sistema | Must | **A validar** | Dado "MARIA EDUARDA SANTOS" na lista, quando o cruzamento roda, então gera indício para Maria Eduarda Santos. "Maria Santos" não gera. |
| RF-F31.05 (RF-31.08) | O sistema deve descartar a lista ao fim do cruzamento, guardando só os metadados (fonte, chamada, data, link, número de linhas e de indícios). | F31, RN-23 | Sistema | Must | **A validar** | Dado uma lista de 500 linhas e 3 indícios, quando o cruzamento termina, então nenhuma das outras 497 linhas fica no sistema. |
| RF-F31.06 (RF-31.09) | O sistema deve apagar o indício quando a menina responder "não sou eu", ou depois de 30 dias sem resposta. | F31, RN-21 | Sistema | Must | **A validar** | Dado um indício sem resposta há 30 dias, quando a rotina diária roda, então ele é apagado. |
| RF-F31.07 (RF-31.14) | O sistema deve consultar periodicamente o relatório de acompanhamento do Sisu/UFAL publicado pela COPEVE, nos cursos-alvo, e passar as linhas pelo mesmo cruzamento do Plano B. | F31, D-02, Figma K06 Ingressantes | Sistema | Should | **A validar** | Dado o relatório da edição configurada, quando a rodada roda, então o sistema consulta os 6 cursos-alvo (006, 007, 026, 027, 073 e 089) e gera indícios só pelas regras da RF-F31.03. |
| RF-F31.08 (RF-31.15) | O sistema deve permitir que a curadoria configure o endereço do relatório de cada edição e rode a busca na hora ("Buscar agora"). | F31, Figma K06 Ingressantes | Curadoria | Should | **A validar** | Dado a edição 2026 configurada, quando a curadoria toca "Buscar agora", então a rodada roda e mostra a data da última busca. |
| RF-F31.09 (RF-31.07) | O sistema deve registrar como ingresso, com origem "relatório da UFAL, confirmado pela menina", quem estiver com "Matrícula Institucional realizada" e confirmar que é ela. | F31, RN-22 | Menina | Should | **A validar** | Dado o status "Matrícula Institucional realizada" para Maria, quando ela responde "sou eu", então consta como ingressante. |

Saíram para Won't: a leitura de PDF (RF-31.13), os avisos de prazo de matrícula (RF-31.10) e o histórico da curadoria (RF-31.12). O consentimento separado para a busca (antigos RF-31.01, 31.02) **depende do Comitê de Ética**: com D-01, ele fica nos Termos de uso ou volta como opção separada.

#### F17 · Administração

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F17.05 (RF-04.6) | O sistema deve permitir que a equipe NISE mantenha a lista de tipos de ação. | F17 | Administração | Won't | Confirmado | — (a lista fica fixa neste semestre) |

---

## 4. Regras de negócio

Políticas que valem para várias telas. Os RFs apontam para elas pelo ID.

| ID | Regra | Origem | RFs afetados |
| --- | --- | --- | --- |
| RN-01 | A liderança do grupo que convidou a menina vê os dados individuais dela (filé, respostas e avaliações) ligados às ações desse grupo. Outros grupos veem só números agregados. | Doc vivo §7, Figma A04·1, D-01 | RF-F2.04, RF-F7.04, RF-F5.05 |
| RN-02 | Os questionários de acompanhamento saem 3 e 6 meses depois do evento, nas datas do calendário aprovado pela coordenadora. *A validar (C4).* | F4 | RF-F4.04, RF-F4.06 |
| RN-03 | Menores de 13 anos não criam conta, e os dados preenchidos não são guardados. A partir dos 13, a menina aceita os termos sozinha. | D-01, Doc vivo §7, Figma A02c | RF-F7.01, RF-F7.02 |
| RN-04 | Quem chegou sozinha aparece para os grupos sempre de forma anonimizada e agregada. Os grupos não sabem o nome dela nem o que ela tem no filé. | Doc vivo §7, Figma A04·1 (NISE) | RF-F7.04, RF-F16.02 |
| RN-06 | Um valor agregado com menos de 5 meninas não é mostrado. Aparece como "dados insuficientes". | Figma K07, K09 | RF-F16.05, RF-F24.14 |
| RN-07 | Só a coordenadora do grupo exporta dados. A exportação é sempre anonimizada, e cada uma fica registrada. Por padrão, inclui só o próprio grupo; toda a rede é a validar (D-03). | F24, LGPD, D-03 | RF-F24.06, RF-F24.07, RF-F24.13 |
| RN-08 | Não existe exportação com dados identificáveis. | F24, LGPD art. 14 | RF-F24.01 a RF-F24.05 |
| RN-09 | O código da menina no arquivo é aleatório e não pode vir de dado pessoal (hash de e-mail é proibido). | F24 | RF-F24.03 |
| RN-11 | Texto livre nunca é exportado. | F24 | RF-F24.05, RF-F4.08 |
| RN-12 | Quem pediu exclusão sai das exportações seguintes. Arquivos já baixados não podem ser recolhidos. | F7, LGPD art. 18 | RF-F7.09 |
| RN-13 | Todo campo do banco é classificado como identificador direto, quase-identificador, analítico ou texto livre. Campo sem classificação não é exportado. | LGPD art. 46 | RF-F24.02 |
| RN-20 | O nome da menina só é comparado com listas oficiais se isso estiver previsto nos termos ou num consentimento próprio. *Depende do Comitê de Ética.* | F31, D-02 | RF-F31.03 |
| RN-21 | Um nome encontrado numa lista oficial é só indício. Não conta como aprovação nem ingresso e não aparece para os grupos até a menina confirmar. Sem resposta em 30 dias, é apagado. | F31 | RF-F31.04, RF-F31.06 |
| RN-22 | Ingresso é a matrícula declarada ou confirmada pela menina. Convocação sem matrícula é aprovação. | F31, F6 | RF-F31.04, RF-F6.03 |
| RN-23 | A lista oficial é usada só para o cruzamento. Linhas de quem não é usuária são descartadas, e modalidade de concorrência, nota e inscrição no ENEM nunca são guardadas. | F31, LGPD art. 11 | RF-F31.05 |
| RN-24 | Só a curadoria importa listas oficiais, e ela vê só contagens, nunca quais meninas foram encontradas. | F31 | RF-F31.01 |
| RN-25 | Entram só listas oficiais da UFAL, do IFAL ou da COPEVE, e só as linhas de cursos-alvo. | F31 | RF-F31.01, RF-F31.02 |
| RN-29 *(nova)* | Cada menina recebe um único convite para criar conta. Novas participações são ligadas ao cadastro existente pelo e-mail. *A validar com a equipe (deduplicação, D-06).* | D-06, F2 | RF-F4.01, RF-F4.02, RF-F2.01 |
| RN-30 *(nova)* | A menina só recebe e-mails de questionários, lembretes e oportunidades se tiver aceitado cada tipo, e pode desligar a qualquer momento. | Figma A04·2, A04·3, A10 | RF-F7.06 a RF-F7.08, RF-F4.06, RF-F4.11 |
| RN-31 *(nova)* | Raça/cor, renda e deficiência não são coletadas nem mostradas. | D-04, seção 6 da v0.1 | RF-F1.13, RF-F5.08 |
| RN-14 | Cada ação pertence a um único grupo. Só as coordenadoras desse grupo criam, editam, finalizam ou excluem a ação. | F30, P8 | RF-F30.01, RF-F30.11, RF-F30.12, RF-F1.10 |
| RN-15 | Uma ação pode ser excluída, com confirmação, até a presença ser registrada; como a importação não cria contas, nada se perde além das inscrições daquela ação. Depois da presença, não pode ser excluída. | F30, nota no Figma (C2), D-12 | RF-F30.12 |
| RN-16 | Só aparecem nas sugestões as ações abertas, com data futura, não canceladas e com inscrições não finalizadas. Ações presenciais aparecem para meninas da mesma cidade; ações online, conforme o alcance escolhido (estado ou cidades). Ações fechadas nunca aparecem. | F30, F10, Figma K02 | RF-F30.04, RF-F30.13, RF-F1.10 |
| RN-17 | A cidade vem da lista oficial do IBGE; texto livre não é aceito. | F30, F10, F24 | RF-F30.01, RF-F30.05 |
| RN-18 | Mudar a data de uma ação reprograma os contatos ainda não enviados. Contatos já enviados não mudam. | F30, F4 | RF-F30.11 |
| RN-19 | A inscrição nas ações acontece fora da NISE (Forms, Sympla, Doity, Even3 e outras); a NISE guarda só o link e não envia dados da menina. Eventos dos grupos entram pela F30; a curadoria registra apenas itens externos. | P6, Figma A06·4b | RF-F30.02, RF-F10.13, RF-F11.06 |
| RN-27 *(nova)* | A importação de inscritas nunca cria contas nem envia mensagens. | Figma K03 | RF-F1.11 |
| RN-28 *(nova)* | O filé não tem barra de progresso nem comparação entre meninas. Concluir pinta o quadradinho; avaliar é sempre opcional. | Doc vivo §8 e §11 | RF-F10.07, RF-F10.09 |
| RN-05 | As sugestões usam só itens das duas fontes do filé, e a LLM nunca recebe dados que identifiquem a menina. | F11 | RF-F11.01, RF-F11.03 |

---

## 5. Requisitos não funcionais

Cada RNF tem um número, um limite ou um teste. As 6 linhas-modelo vazias da v0.1 foram removidas, e os RNFs da busca automática (robô) saíram com a D-02.

| ID | Categoria | Requisito | Como medir | Prior. | Origem |
| --- | --- | --- | --- | --- | --- |
| RNF-G.01 (RNF-04-06.01) | Compatibilidade | Todas as telas funcionam nas larguras de 360 px e 1366 px sem perda de campos ou ações. | Percorrer cada fluxo nas duas larguras. | Must | Doc vivo §3, Figma (versões de celular) |
| RNF-G.02 (RNF-04-06.02) | Acessibilidade | Todos os fluxos funcionam só com teclado, com rótulos nos campos, foco visível, alvos de pelo menos 44 px e informações que não dependem só de cor. | Percorrer os fluxos só com teclado e conferir rótulos, foco e alvos. | Must | Figma "Leia primeiro" |
| RNF-G.03 | Segurança | Permissões são verificadas no servidor. Uma coordenadora nunca acessa ações ou meninas de outro grupo, nem por requisição direta. | Chamar as rotas com contas de dois grupos. Todas as tentativas cruzadas são negadas. | Must | RN-14, Doc vivo §7 |
| RNF-F1.01 (RNF-01) | Usabilidade | Uma coordenadora sem treinamento importa uma lista em até 5 minutos. | Teste com as coordenadoras dos dois grupos interessados. | Must | Doc vivo §4 (esforço mínimo) |
| RNF-F30.01 (RNF-30.02) | Usabilidade | Uma coordenadora sem treinamento cadastra uma ação, só com os campos obrigatórios, em até 2 minutos pelo celular. | Teste com as coordenadoras, em 360 px. | Must | Figma K02 ("Leva uns 2 minutos") |
| RNF-F30.02 (RNF-30.03) | Confiabilidade | Mudar a data ou cancelar uma ação e atualizar os contatos pendentes acontecem na mesma operação. | Simular uma falha no meio e verificar que tudo ou nada foi aplicado. | Must | RN-15, RN-18 |
| RNF-F30.03 (RNF-30.04) | Desempenho | Uma ação aberta nova aparece nas sugestões em até 1 minuto; uma ação finalizada ou cancelada some em até 1 minuto. | Medir em ambiente de teste. | Should | RN-16 |
| RNF-F10.01 (RNF-10.01) | Desempenho | O filé carrega em até 3 segundos em 95% dos acessos, numa conexão 4G. | Navegador limitado a 4G, 20 acessos. | Should | Doc vivo §3 (Alana usa o celular) |
| RNF-F11.01 (RNF-11.01) | Confiabilidade | Se a LLM não responder em até 10 segundos, o filé mostra as sugestões por regras, sem erro. | Simular a LLM fora do ar. | Must | RF-F11.02 |
| RNF-F11.02 (RNF-11.02) | Segurança | As requisições à LLM não contêm identificadores. | Inspecionar as requisições em ambiente de teste com dados fictícios. | Must | RF-F11.03 |
| RNF-G.04 | Custo | A hospedagem e a LLM usam apenas planos gratuitos ou créditos acadêmicos. | Conferir a fatura do mês: R$ 0. | Must | Restrição 2.3 |
| RNF-F7.01 (RNF-07.01) | Segurança | Um registro de aceite não pode ser editado nem apagado. Uma mudança só acontece com um novo registro. | Tentar alterar um aceite pela interface e por requisição direta: negado, histórico intacto. | Must | RF-F7.05 |
| RNF-F7.02 (RNF-07.02) | Usabilidade | O resumo "Como usamos seus dados" é compreensível para uma estudante de 8º ano. | Teste com 3 meninas: as 3 explicam com as próprias palavras quem vê os dados delas. | Must | Figma A04·1 |
| RNF-F4.01 (RNF-04.01) | Confiabilidade | Nunca há envio duplicado para a mesma menina, ação, etapa e canal. | Rodar o mesmo agendamento 3 vezes, inclusive em paralelo: um envio só por combinação. | Must | F4 |
| RNF-F4.02 (RNF-04.02) | Confiabilidade | Uma falha no serviço de e-mail não apaga o agendamento nem impede os demais envios. | Simular o serviço fora do ar e reprocessar depois, sem duplicar os concluídos. | Must | F4 |
| RNF-F4.03 (RNF-04.03) | Segurança | Uma menina não consegue ver nem alterar respostas de outra. | Tentar pela interface e por requisição direta: negado. | Must | F4, F6 |
| RNF-F5.01 (RNF-05.01) | Segurança | As consultas do painel e das comparações aplicam as permissões do grupo no servidor (RN-01, RN-04). | Consultar com coordenadoras de dois grupos: nenhum dado individual de outro grupo aparece. | Must | F5, F16 |
| RNF-F5.02 (RNF-05.02) | Confiabilidade | Os indicadores batem com os registros e distinguem "não respondeu" de "respondeu não". | Base de teste com resultados conhecidos: todos os totais e denominadores conferem. | Must | F5, F16 |
| RNF-F5.03 (RNF-05.03) | Desempenho | O painel carrega em até 3 s em 95% das consultas, com 1.000 inscrições e 10 acessos simultâneos. | Teste de carga. | Should | F5 |
| RNF-F6.01 (RNF-06.01) | Integridade | Salvar uma declaração de ingresso é atômico: ou fica um registro completo, ou nenhum. | Interromper o salvamento e repetir o envio. | Must | F6 |
| RNF-F24.01 (RNF-24.01) | Segurança | Nenhum identificador direto aparece no arquivo exportado. | Teste automatizado com base sintética que procura nomes, e-mails e telefones no arquivo: zero ocorrências. | Must | F24 |
| RNF-F24.02 (RNF-24.02) | Segurança | 100% das exportações ficam no histórico, guardado por pelo menos 12 meses. | Fazer 10 exportações e conferir 10 registros. | Must | F24 |
| RNF-F24.03 (RNF-24.03) | Segurança | O link de download exige sessão e expira em 15 minutos, e o arquivo é apagado do servidor em até 24 h. | Abrir o link sem sessão e depois de 15 minutos. | Should | Figma K09 A4 |
| RNF-F24.04 (RNF-24.04) | Compatibilidade | O CSV abre com acentos corretos no Excel e no Google Sheets (UTF-8 com BOM, separador ";"). | Abrir nos dois um arquivo com "São José da Tapera". | Must | Figma K09 A4 |
| RNF-F24.05 (RNF-24.08) | Manutenibilidade | 100% dos campos do banco têm classificação de privacidade (RN-13). Campo novo sem classificação faz o teste falhar. | Teste automatizado no CI. | Should | RN-13 |
| RNF-F31.01 (RNF-31.01) | Segurança | Nenhum dado de terceiros da lista oficial fica no banco, nos logs ou em disco depois do cruzamento. | Cruzar uma lista sintética de 500 linhas com 3 correspondências e procurar os outros 497 nomes: zero ocorrências. | Must | RN-23 |
| RNF-F31.02 (RNF-31.02) | Segurança | Só a própria menina vê os indícios dela. | Chamar as rotas de indícios com contas de curadoria e de coordenadora: negado. | Must | RN-21, RN-24 |
| RNF-F31.03 (RNF-31.03) | Confiabilidade | O cruzamento segue a RF-F31.03 sem exceções. | Base de teste com acentos, maiúsculas, espaços e homônimos parciais: 100% conforme a regra. | Must | RF-F31.03 |
| RNF-F31.04 (RNF-31.06) | Confiabilidade | Se o formato do relatório mudar ou a página não responder, a rodada para sem gravar nada, e a curadoria recebe um aviso. | Rodar contra uma cópia de teste com uma coluna renomeada e com o servidor fora do ar. | Should (Plano A) | RF-F31.07 |
| RNF-F31.05 (RNF-31.07) | Compatibilidade com a fonte | O robô faz no máximo uma requisição a cada 2 segundos e se identifica. | Conferir no log o intervalo e o agente. | Should (Plano A) | RF-F31.07 |

---

## 7. Fora do escopo

Lista completa (Doc vivo §10), mais os itens rebaixados nesta revisão.

| Item | Situação | Motivo | Origem |
| --- | --- | --- | --- |
| WhatsApp como canal de contato (antigo RF-04.05) | Won't | Custo | Doc vivo §10 |
| F8 Página do próximo passo | Depois | Fechamento | Doc vivo §10 |
| F12 Gamificação completa | Depois | A gamificação leve do filé fica (RN-28) | Doc vivo §10, §11 |
| F13 Mentoria | Depois | Depende de mentoras disponíveis | Doc vivo §10 |
| F14 Comunidade online | Depois | Fechamento | Doc vivo §10 |
| F19 Observatório Meninas Digitais | Depois | Fechamento | Doc vivo §10 |
| F20 Sugestão de eventos para os grupos | Depois | Fechamento | Doc vivo §10 |
| F21 Histórias de sucesso | Depois | Fechamento | Doc vivo §10 |
| F25 Relatórios | Depois | Fechamento | Doc vivo §10 |
| F27 e F29 Testes psicométricos | Depois | Aguardam o professor | Doc vivo §10 |
| F15, F18, F22, F23, F26, F28 | Não entra | Fechamento | Doc vivo §10 |
| Lista de tipos de ação editável (RF-F17.05) | Won't | Lista fixa basta neste semestre | Esta revisão |
| Generalizar município com menos de 5 meninas na exportação (antigo RF-24.13) | Won't | Adiado, segundo nota no Figma | Figma K09 (nota) |
| Tema escuro | Won't | "Fora do escopo agora" no Figma | Figma |
| TCLE do responsável, TALE e autorização separada para os grupos (antigos RF-07.02 a 07.05, 07.08) | Removido | Consentimento segue o Figma | D-01 |
| Leitura de PDF das listas (antigo RF-31.13) | Won't | F31 em três planos | D-02 |
| Avisos de prazo de matrícula e histórico da curadoria (antigos RF-31.10, 31.12) | Won't | F31 simplificada | D-02 |
| Raça/cor, renda e metas de "Quem alcançamos" no painel | Removido | Dado não coletado | D-04 |
| "Ideias de outros grupos", "Onde mais perdemos" e temas de comentários por LLM | Won't | Fora da versão essencial do painel | Esta revisão |
| Exportação de toda a rede (RF-F24.13) e cartão de impacto (RF-F24.14) | Could | A equipe vai discutir | D-03 |

---

## 8. Priorização e rastreabilidade

**[Etapa 3]** Será preenchida depois das decisões e da estimativa de esforço pela equipe. Formato:

| ID | Funcionalidade | Origem | Prioridade | Esforço (P/M/G) | Histórias | Sprint | Responsável |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RF-F30.01 | F30 | F30, C1, Figma K02 | Must | — | — | Sprint 1 | — |

Sprints: 0 (20 a 23/10), 1 (26 a 30/10), 2 (02 a 06/11), 3 (09 a 13/11), 4 (16 a 20/11), 5 (23 a 27/11), 6 (30/11 a 04/12, sem funcionalidade nova).

---

## 9. Definição de Pronto

Um requisito (RF ou RNF) só está pronto quando cumpre todos os critérios abaixo. Se um critério não se aplicar, isso é registrado no PR, com o motivo. Um item que não cumpre todos volta para a sprint e não conta como entregue.

**Funcionamento**
- Todos os critérios de aceite (Dado / Quando / Então) passam.
- O fluxo completo foi percorrido no ambiente de demonstração, não só na máquina de quem desenvolveu.
- Requisitos que dependem de outros foram testados junto com eles.
- Erros previsíveis (arquivo em formato errado, campo obrigatório vazio, falha no envio de mensagem) mostram uma mensagem clara e não quebram o sistema.

**Qualidade do código e testes**
- O PR foi revisado e aprovado por outra pessoa da equipe antes de entrar na branch principal.
- Cada critério de aceite do back-end tem um teste automatizado. Os testes podem ser gerados por agente, e quem revisa confere se cada critério tem o seu teste.
- Os fluxos com risco têm testes de integração (API com banco de teste, sem simular cliques): importação, permissões e exportação.
- Testes de ponta a ponta, que simulam cliques, ficam fora. O front-end é coberto por uma passada manual de visual, textos e celular, registrada como checklist no PR.
- Os testes passam no CI do PR, e nenhum teste existente quebrou.
- Não há senhas, chaves de API ou tokens no repositório.

**Dados e privacidade**
- Nenhum dado pessoal (nome, e-mail, telefone, data de nascimento) aparece em logs ou mensagens de erro.
- As permissões são verificadas no servidor (RNF-G.03).
- Os testes usam só dados fictícios.
- Quando o requisito envolve a LLM, só os dados mínimos são enviados (RF-F11.03).

**Interface**
- Funciona em 360 px e 1366 px (RNF-G.01).
- Funciona só pelo teclado, com rótulos e sem depender de cor (RNF-G.02).
- Os textos para as meninas usam linguagem simples e acolhedora, e o espaço dela é sempre "o filé", no masculino.

**Entrega**
- A seção 8 foi atualizada com o status do requisito.
- Decisões tomadas durante o desenvolvimento foram registradas na seção 12.
- O requisito foi mostrado na demo da sprint (sexta-feira).
- Telas usadas pelos grupos foram mostradas a uma coordenadora parceira numa das validações agrupadas (Sprints 2 e 4).
- O código está na branch principal e publicado no ambiente de demonstração.

---

## 12. Registro de decisões

| ID | Data | Quem decidiu | Decisão | Itens afetados |
| --- | --- | --- | --- | --- |
| D-01 | 20/10/2026 | Claudinha | O consentimento segue o Figma: bloqueio para menores de 13 e aceite único a partir dos 13. Pendências: escrever os Termos de uso e a Política de privacidade e consultar o Comitê de Ética (ou semelhante). | F7, RN-01, RN-03, RN-04 |
| D-02 | 20/10/2026 | Claudinha | A F31 é essencial (pedido de um professor e principal inovação). A busca automática é o objetivo (Plano A), a importação manual é o Plano B e a autodeclaração é o Plano C. *A ordem de construção (B antes de A) e o gatilho (fim da Sprint 4) são proposta do Claude, a confirmar.* | F31, F6 |
| D-03 | 20/10/2026 | Claudinha | Exportar os dados de toda a NISE foi levantado na última reunião e será considerado. Entra como Could, a explorar e discutir com a equipe. A exportação do próprio grupo continua Must. | F24, F16, RN-07 |
| D-04 | 20/10/2026 | Claudinha | Raça/cor sai do painel, que ainda está em ajustes. | F5, RN-31 |
| D-05 | 20/10/2026 | Claudinha | Os lembretes (F9) entram como parte da F4. | F4, RN-30 |
| D-06 | 20/10/2026 | Claudinha | O convite vai só depois da presença, por e-mail. Falta analisar a deduplicação da menina que vai a eventos de dois grupos. | F1, F4, RN-29 |
| D-11 | 20/10/2026 | Claudinha | Um convite por menina. Se ela já tem conta, o segundo grupo só liga a participação e envia a avaliação. A equipe ainda valida a deduplicação. | RN-29, RF-F4.02 |
| D-12 | 20/10/2026 | Claudinha | A ação pode ser excluída até a presença, mesmo com inscritas, com modal de confirmação. | RF-F30.12, RN-15 |
| D-13 | 20/10/2026 | Claudinha | A própria equipe monta a curadoria do filé. Isso entra como task da história correspondente. | RF-F11.06 |
| D-14 | 20/10/2026 | Claudinha | A seção 3 é dividida por persona (Menina, Coordenadora, Sistema e curadoria), com cada RF numa só, pela regra "quem age". Não existe "base comum". | Seção 3 |
| D-07 | 20/10/2026 | Claudinha | Os fluxos do Figma viram épicos; cada história é um objetivo da usuária e cita os RFs que cumpre. | Histórias, seção 8 |
| D-08 | 20/10/2026 | Claudinha *(a confirmar)* | Sprints semanais de segunda a sexta: Sprint 0 de 20 a 23/10, Sprints 1 a 5 de funcionalidade, Sprint 6 de estabilização. | Seção 8 |
| D-09 | 20/10/2026 | Claudinha | Testes automatizados no back-end para todo critério de aceite, gerados por agente e conferidos na revisão; poucos ou nenhum teste de tela. | Seção 9 |
| D-10 | 20/10/2026 | Claudinha | Itens do Figma em revisão entram como estão, marcados "a validar". | Coluna Status |
