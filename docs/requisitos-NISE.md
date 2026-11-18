# Documento de Requisitos do Sistema · NISE · v2 (rascunho)

Projeto: NISE · Grupo 7 · PDS 26.2
Versão: 0.2 (rascunho) · Data: 20/10/2026 · Status: em revisão

> Rascunho completo para revisão da equipe. Itens marcados **A validar** dependem de telas em revisão ou de confirmação. Seções com ⚠️ estão em mudança no Figma: **C4, M5 (em execução) e C5 (mudança forte)**. Não comecem histórias dessas seções antes da revisão.

## Histórico de versões

| Versão | Data | Autor(a) | O que mudou |
| --- | --- | --- | --- |
| 0.1 | 07/10/2026 | Wyvian Valença | Criação do documento |
| 0.1.1 | 09/10/2026 | Felipe Lira | Introdução |
| 0.2 | 20/10/2026 | Wyvian Valença | Revisão de RFs, RNFs e RNs pelo Figma e pelo doc vivo; nova numeração; rastreabilidade; registro de decisões |
| 0.3 | 03/11/2026 | Wyvian Valença | Alinhamento com as histórias do épico 1: sem opt-out nos questionários, lembretes sempre enviados, E2E com Playwright, fim do login Microsoft, deduplicação, regra do convite e novas decisões D-15 a D-24 |
| 0.4 | 16/11/2026 | Wyvian Valença | Validação das funcionalidades contra o Protótipo Enxuto do Figma (#154): perfil, cadastro, filé, inscrição em evento, C1 e C2 validados; M7 (F31) sem o Plano B, só com a busca na COPEVE (D-48); C3 a C7 em andamento. O detalhe das mudanças está no PR |

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
- Uma tela do Figma que não aponta para nenhum RF, RN ou RNF precisa virar um deles ou sair do escopo. Enquanto isso, é **aumento de escopo**.
- Um Must que não aponta para nenhuma história está **esquecido**.

Onde cada coisa mora: o que a menina ou o sistema faz é RF; a política que vale para várias telas é RN; a qualidade que se pode medir é RNF. O detalhe que só afeta uma tela fica nos critérios de aceite da história.

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

Segue o Figma (D-01). Pendências que não travam o desenvolvimento, mas travam o uso com dados reais: escrever os Termos de uso e a Política de privacidade e consultar o Comitê de Ética (ou instância semelhante). Para a F31, ver D-49.

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F7.01 (RF-07.01) | O sistema deve pedir a data de nascimento no cadastro e bloquear por 24 horas quem tem menos de 13 anos, sem guardar os dados preenchidos. O bloqueio é marcado só no aparelho. | F7, M3, Figma A02, A02b, A02c, D-01, D-25 | Menina | Must | Confirmado | Dado uma menina de 12 anos, quando informa a data, então vê "Ainda não dá pra criar sua conta", sem botões e sem a idade mínima na tela, e nenhum dado dela fica no banco. Quando tenta de novo no mesmo aparelho em menos de 24 h, então continua vendo essa tela. |
| RF-F7.02 (RF-07.07) | O sistema deve permitir que a menina a partir de 13 anos aceite sozinha os Termos de uso e a Política de privacidade. | F7, Doc vivo §7, D-01 | Menina | Must | Confirmado | Dado Alana, de 15 anos, quando marca "Li e concordo", então segue para a etapa 2 de 3. |
| RF-F7.03 | O sistema deve mostrar, antes do aceite, um resumo do que é coletado e para quê, com o link para os termos completos. | Figma A04·1 | Menina | Must | Confirmado | Dado a etapa 1 de 3, quando Alana a lê, então vê "O que coletamos" e "Pra que usamos" e o link "Ler os termos completos". |
| RF-F7.04 | O sistema deve mostrar a versão do resumo conforme a origem da menina: quem veio de evento lê que a liderança daquele grupo vê o filé, as respostas e as avaliações dela; quem chegou sozinha lê que os grupos cadastrados só vêem os números agregados. | Figma A04·1 (grupo e NISE), Doc vivo §7 | Menina | Must | Confirmado | Dado que Belana chegou sozinha, quando lê a etapa 1, então lê "Os grupos de incentivo cadastrados na NISE só veem números gerais, sem identificar você". |
| RF-F7.05 (RF-07.06) | O sistema deve registrar cada aceite com data, hora e versão do termo, sem permitir edição. | F7, LGPD | Sistema | Must | Confirmado | Dado que Alana aceitou a versão 1, quando a equipe consulta o histórico, então encontra o registro com data, hora e versão. |
| RF-F7.06 | O sistema deve perguntar, se a menina quer receber oportunidades por e-mail (no máximo 2 por mês). | Figma A04·2 | Menina | Should | Confirmado | Dado a etapa 2 de 3, quando Alana toca "Não, obrigada", então segue para a etapa 3 de 3 e não recebe e-mails de oportunidades. |
| RF-F7.07 | O sistema deve informar que a menina será avisada por e-mail sobre a avaliação do evento e sobre os questionários de 3, 6, 12 e 18 meses, sem opção de recusar, e que responder é sempre opcional. | Figma A04·3, D-15 | Menina | Must | Confirmado | Dado a etapa 3 de 3, quando Alana lê "depois de 3, 6, 12 e 18 meses" e segue, então passa a receber os avisos da F4 por e-mail, e a tela não oferece como recusá-los. *Os prazos contam da criação da conta, não do evento (Figma, quadro "Fluxos atuais"). A F4 será revisada à parte.* |
| RF-F7.08 | O sistema deve permitir mudar pelo perfil, a qualquer momento, a preferência de oportunidades por e-mail definida na RF-F7.06. Questionários e lembretes de datas importantes aparecem no perfil só como informação, sem interruptor. | Figma A10, A04·2, D-15, D-16, D-26 | Menina | Must | Confirmado | Dado que Alana aceitou as oportunidades por e-mail, quando as desliga no perfil, então deixa de recebê-las. No perfil, questionários e lembretes de datas importantes não têm como ser desligados. |
| RF-F7.09 (RF-07.09) | O sistema deve permitir que a menina peça, pelo perfil, a exclusão da conta e dos dados. | F7, LGPD art. 18 | Menina | Must | Confirmado | Dado que Ana pede a exclusão, quando confirma, então os dados identificáveis dela são apagados, ela sai do painel individual e das exportações seguintes, e o pedido fica registrado com data. A confirmação acontece num modal "Excluir conta". |
| RF-F7.10 | O sistema deve informar, numa tela logo depois do aviso de questionários (RF-F7.07), que a menina receberá por e-mail os lembretes das datas importantes (RF-F4.11a), sem opção de recusar. | D-16, Figma (tela nova, a desenhar) | Menina | Must | **A validar** | Dado que Alana viu o aviso de questionários, quando segue, então vê o aviso dos lembretes de datas importantes e, ao continuar, conclui o cadastro. *A tela ainda não existe no Figma. A numeração das etapas ("de 3") muda com ela. O A10 Perfil já mostra os lembretes como "Sempre chegam no seu e-mail", sem interruptor (D-26).* |
| RF-F7.11 | O sistema deve mostrar no perfil o cartão "Seu grupo", com a origem da menina (convite de um grupo ou "chegou sozinha") e quem vê os dados dela, conforme a RN-01 e a RN-04. | Figma A10 (Seu grupo), RN-01, RN-04, D-27 | Menina | Should | **A validar** | Dado que Alana chegou pelo convite das Rendeiras, quando abre o perfil, então lê "Você chegou pelo convite delas" e que a liderança do grupo vê o filé, as respostas e as avaliações dela, e que outros grupos só veem números gerais. *O Figma só mostra a versão de quem veio por convite; falta a de quem chegou sozinha.* |
| RF-F7.12 | O sistema deve permitir que a menina releia, pelo perfil, os Termos de uso e a Política de privacidade. | Figma A10 (Termos e privacidade), D-27 | Menina | Must | Confirmado | Dado que Alana abre o perfil, quando toca "Termos de uso" ou "Política de privacidade", então lê o documento completo da versão que aceitou. |

#### S2 · Cadastro e entrada (M1, M2, S2)

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-S2.02 | O sistema deve pedir data de nascimento e cidade logo depois do cadastro com Google, com a opção de usar outra conta. | Figma A02b | Menina | Must | Confirmado | Dado um cadastro pelo Google, quando Alana informa a data e a cidade, então segue para os termos (A04·1). Quando toca "Usar outra conta", então escolhe outra conta do Google. |
| RF-S2.03 | O sistema deve validar o e-mail no cadastro e mostrar como corrigi-lo. | Figma A02 (a E01 saiu do protótipo enxuto) | Sistema | Must | Confirmado | Dado "alana@gmail", quando Alana tenta continuar, então vê "Inclua o domínio, como nome@exemplo.com". *A mensagem vem da E01 antiga e ainda não está desenhada no A02: o texto é proposta até alguém desenhar o erro.* |
| RF-S2.05 | O sistema deve guardar o que a menina já preencheu se a conexão cair no cadastro. | Figma E04 (no cadastro, sem barra e sem avatar) | Sistema | Should | Confirmado | Dado que a conexão caiu no passo dos termos, quando Alana volta, então vê "O que você já fez continua salvo" e continua de onde parou. |
| RF-S2.07 | O sistema deve mostrar, a quem abre o link ou o QR code do grupo, o nome do grupo antes do cadastro. O link não dá acesso a dados (RN-32). | Figma A01b, RN-32, D-22, D-34 | Menina | Must | **A validar** | Dado o link do convite das Rendeiras, quando Alana o abre, então vê "Convite · Rendeiras" e o nome do grupo, e pode criar a conta. Dado um código que a equipe trocou, então vê "Esse link não vale mais" (E07). *O texto da E07 no Figma diz que links de convite têm prazo e só funcionam uma vez, o que não vale para o link do grupo. O texto precisa mudar.* |
| RF-S2.11 | O sistema deve mostrar a tela de boas-vindas a quem chega à NISE sem link de convite, com as opções de criar conta e de entrar. | Figma A01, RN-32 | Menina | Must | Confirmado | Dado que Belana abriu a NISE sem link de convite, quando a tela carrega, então vê o nome completo da NISE e o botão "Criar conta", e pode tocar "Entrar" no topo. |

Entrar e recuperar o acesso valem igual para menina e coordenadora e estão em 3.3 (Acesso).

#### Estados gerais (E03 a E06)

Telas e regras da nota "Estados da Alana" (30/10) do Figma. Ficam fora do protótipo navegável (sem links), mas valem como requisito (D-30). A E08 (sugestão que saiu do ar) e a V01 (Ver depois vazio) serão analisadas com o filé (F10 e F11).

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-S2.12 | O sistema deve levar a menina de volta à tela de entrar quando a sessão dela terminar, avisando que ela precisa entrar de novo. | Figma A15, nota "Estados da Alana" (30/10), D-30 | Menina | Should | Confirmado | Dado que a sessão de Alana terminou, quando ela abre qualquer tela, então vai para a tela de entrar (A15), com a linha "Sua sessão terminou, entre de novo". *Só existe como nota no Figma, sem tela.* |
| RF-S2.13 | O sistema deve avisar, quando uma tela não carregar, que o que a menina já fez continua salvo, e levá-la de volta ao filé. Quem está no cadastro vê a tela sem a barra inferior e sem o avatar. | Figma E04, nota "Estados da Alana" (30/10), D-30 | Menina | Should | Confirmado | Dado que a conexão falhou ao abrir o filé, quando a tela não carrega, então Alana vê "Não deu pra carregar" e "O que você já fez continua salvo", com o botão "Voltar pro seu filé". |
| RF-S2.14 | O sistema deve mostrar, quando a menina ficar sem internet, uma faixa no topo da tela e manter visível o que já tinha carregado. | Figma E05, D-30 | Menina | Should | Confirmado | Dado que Alana está no filé e perde a conexão, então vê a faixa "Você está sem internet. Mostrando o que já tinha carregado." e o filé continua na tela. |
| RF-S2.15 | O sistema deve avisar no próprio formulário quando um envio falhar, mantendo as respostas preenchidas. Vale para a avaliação do evento (A03), o registro de ingresso (A17), o questionário (A18) e a confirmação de inscrição (A09). | Figma E06, nota "Estados da Alana" (30/10), D-30 | Menina | Should | Confirmado | Dado que Alana deu nota 4 e a conexão caiu ao enviar, quando toca em enviar, então vê "Não deu pra enviar" e "Sua nota e seu comentário continuam aqui. Confira a internet e tente de novo.", e a nota continua marcada. |
| RF-S2.16 | O sistema deve mostrar cartões cinza enquanto as listas carregam (Descobrir, Sugestões, Ver depois e Agenda) e, se o filé demorar cerca de 10 segundos, trocar o texto para "Tá levando um pouquinho mais…". | Figma E03, nota "Estados da Alana" (30/10), RNF-F11.01, D-30 | Menina | Should | Confirmado | Dado que Alana abre Descobrir numa conexão lenta, quando a lista ainda não chegou, então vê cartões cinza. Depois de cerca de 10 s sem resposta, então lê "Tá levando um pouquinho mais…". Se a sugestão por IA falhar, então vê a curadoria da equipe, sem mensagem de erro (RF-F11.02). |

#### F10 e F11 · Filé (M4)

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F10.01 (RF-10.01) | O sistema deve pedir à menina, no cadastro, os temas de interesse (um ou mais, ou "Ainda não sei, me mostra de tudo") e a escolaridade, para todas as meninas, sem opção de pular. | F10, M1, M2, Figma A05, D-19, Doc vivo §6 | Menina | Must | Confirmado | Dado que Alana termina o cadastro, quando escolhe "Robótica" e "Ensino médio", então as escolhas ficam no perfil e o filé começa a ser tecido (E03). |
| RF-F10.02 | O sistema deve explicar o que é o filé na primeira vez, e deixar a explicação acessível depois pelo ícone "?" ao lado de "Seu filé". | Figma A06·0, A06·3 | Menina | Should | Confirmado | Dado que Alana escolheu os interesses, quando termina, então vê antes a tela "Por que filé?" e, ao tocar "Começar meu filé", chega a Descobrir. Depois, o "?" ao lado de "Seu filé" leva de volta a ela. |
| RF-F10.03 | O sistema deve organizar as sugestões em 5 faixas de esforço, mostrando quantas sugestões há em cada uma: Primeiros passos (até 15 min), Uma tarde (até 1 dia, sozinha), No meu ritmo (vários dias, sozinha), Rolê com a galera (até 1 dia, em grupo) e Grande desafio (em grupo, mais tempo). | Figma A06·1, decisão de 19/10 | Menina | Must | Confirmado | Dado que há 8 sugestões de "Uma tarde", quando Alana abre Descobrir, então vê o cartão "Uma tarde" com "8 sugestões". Dado que não há sugestões de "Rolê com a galera", então o cartão mostra "0 sugestões" e "Por enquanto, nada marcado.", e não abre. |
| RF-F10.04 (RF-10.06) | O sistema deve mostrar as sugestões de uma faixa, uma de cada vez, com as opções "Quero fazer" (entra no filé), "Talvez depois" (vai para Ver depois) e "Não é pra mim" (com motivo opcional). | Figma A06·2, 2a | Menina | Must | Confirmado | Dado uma sugestão, quando Alana toca "Não é pra mim" e escolhe "Muito difícil", então a sugestão some e o motivo fica registrado. |
| RF-F10.05 | O sistema deve permitir desfazer a última escolha numa sugestão. | Figma A06·2 ("Desfazer") | Menina | Should | Confirmado | Dado que Alana colocou um curso no filé, quando toca "Desfazer", então o curso volta para as sugestões. O aviso com "Desfazer" aparece depois de "Quero fazer", "Talvez depois" e "Não é pra mim" (D-36). Dado que Alana dispensou um curso com um motivo, quando toca "Desfazer", então o curso volta e o motivo guardado é apagado. |
| RF-F10.06 | O sistema deve mostrar "Ver depois", com filtro por faixa de esforço e as opções "Quero fazer" e "Remover". | Figma A06·2b | Menina | Must | Confirmado | Dado dois itens guardados, quando Alana filtra por "Grande desafio", então vê só o hackathon. |
| RF-F10.07 | O sistema deve mostrar o filé da menina em três seções, as atividades em andamento, as próximas e as concluídas, cada uma como um quadradinho na cor do seu tema, que fica colorido quando concluído. | F10, Figma A06·3, Doc vivo §8 | Menina | Must | Confirmado | Dado que Alana concluiu 1 atividade de 3, quando abre o filé, então vê 1 quadradinho colorido e 2 sem cor, e nenhuma porcentagem. |
| RF-F10.08 | O sistema deve mostrar o detalhe de uma atividade (tipo, faixa, fonte, duração, custo, idade mínima, descrição e "por que pra você"), com botões que seguem a situação dela: abrir o site, marcar como iniciada ou como concluída e tirar do filé. | Figma A06·4a | Menina | Must | Confirmado | Dado um curso em "Próximas aventuras", quando Alana toca "Marcar como iniciada", então ele passa para "Em andamento". Dado um curso em andamento, quando ela toca "Marcar como concluída", então vai para a tela de conclusão (A06·5). Dado um curso concluído, então só vê "Ver no site do curso". Os botões do site são "Ir pro site do curso" (próxima aventura) e "Continuar no site do curso" (em andamento). |
| RF-F10.09 | O sistema deve, ao concluir uma atividade, pedir uma avaliação opcional de 1 a 5 e se ela quer sugestões parecidas (mais avançadas, do mesmo nível, outro tema). | Figma A06·5 | Menina | Must | Confirmado | Dado que Alana concluiu um curso, quando escolhe "Algo mais avançado" e envia, então a próxima rodada de sugestões considera essa escolha. As opções são "Algo mais avançado", "Mais do mesmo nível", "Outro tema" e "Por enquanto, tá bom", que não muda nada. Ao tocar "Enviar", ela volta ao filé e vê "Valeu! Sua resposta foi enviada."; ao tocar "Pular", volta ao filé sem guardar nada. |
| RF-F10.10 (RF-10.02) | O sistema deve permitir que a menina veja e edite os interesses e a escolaridade no perfil. | F10, S1, Figma A10 | Menina | Must | Confirmado | Dado que Alana entrou no ensino médio, quando edita o perfil, então as próximas sugestões consideram a mudança. |
| RF-F30.13 (RF-30.07) | O sistema deve mostrar nas sugestões das meninas as ações abertas, com inscrições abertas e data futura, conforme o formato e a cidade (RN-16). | F30, F10, Doc vivo §5 | Menina | Must | Confirmado | Dado uma oficina aberta em Maceió, quando Alana, de Maceió, abre o filé, então vê a oficina com o botão "Ir para inscrição". Uma ação fechada do mesmo grupo não aparece. |
| RF-F11.04 (RF-11.04) | O sistema deve mostrar "Por que pra você" em cada sugestão. | F11, Figma A06·2, 4a, 4b | Menina | Could | Confirmado | Dado um curso sugerido, quando Alana o vê, então lê o motivo, como "você curtiu Programação e IA". |
| RF-F10.16 | O sistema deve mostrar à menina, nas telas principais, uma barra inferior com Filé, Descobrir, Ver depois e Agenda, destacando a aba em que ela está, e o acesso ao perfil pelo avatar no topo. | Figma "NISE/Barra inferior · v2", A06·1, A06·3, D-35 | Menina | Must | Confirmado | Dado que Alana está em Descobrir, quando olha a barra inferior, então vê Filé, Descobrir, Ver depois e Agenda, com Descobrir destacada. Quando toca o avatar, então abre o perfil. |
| RF-F10.17 | O sistema deve avisar, quando a menina decidir a última sugestão de uma faixa, que ela viu todas as de lá, e oferecer escolher outra categoria ou ver o que guardou para depois. | Figma A06·2 (acabaram), D-35 | Menina | Should | Confirmado | Dado que Alana decidiu a última sugestão de "Uma tarde", quando a próxima iria aparecer, então vê "Você viu todas as sugestões de Uma tarde" e "Por enquanto, é isso por aqui", com os botões "Escolher outra categoria" e "Ver o que salvei pra depois". |
| RF-F10.18 | O sistema deve mostrar, em Ver depois sem itens, que ainda não há nada guardado e como guardar. | Figma V01, D-35 | Menina | Should | Confirmado | Dado que Alana não guardou nada, quando abre Ver depois, então vê "Nada guardado por enquanto", a explicação de que "Talvez depois" guarda a sugestão ali e o botão "Ver sugestões". |
| RF-F10.19 | O sistema deve mostrar, no Seu filé sem atividades, que o filé está só começando e como ele ganha forma. | Figma A06·3 (vazio), D-35 | Menina | Should | Confirmado | Dado que Alana ainda não tem atividades, quando abre o Seu filé, então vê "Seu filé tá só começando", a explicação de que cada atividade vira um quadradinho e o link "Descobrir mais sugestões →". O desenho mostra só o quadradinho "Seu começo" e os vazios, e as seções de atividades não aparecem. |
| RF-F10.20 | O sistema deve avisar a menina, quando ela abrir uma sugestão de evento que já não aceita inscrições, que a sugestão saiu do ar, e deixar de sugeri-la em Descobrir. | Figma E08, RN-16, RN-36, D-37 | Menina | Should | Confirmado | Dado que as inscrições do "Hackathon Meninas na Tecnologia" fecharam depois de Alana ver a sugestão, quando ela a abre, então vê "Essa sugestão saiu do ar" e "Voltar pro seu filé", e o hackathon não volta a ser sugerido em Descobrir. *O texto da E08 no Figma diz que a sugestão sai também do filé; precisa mudar (RN-36).* |
| RF-F10.21 | O sistema deve tirar do Ver depois os itens que já não aceitam inscrições. | Figma E08, RN-36, D-37 | Menina | Should | Confirmado | Dado que Alana guardou o hackathon em Ver depois, quando as inscrições fecham, então ele deixa de aparecer na lista. |
| RF-F10.22 | O sistema deve mover cada atividade da menina por três situações, em ordem (próxima aventura, em andamento e concluída), só pelos botões que ela toca. Abrir o site da atividade não muda a situação. | Figma A06·3, A06·4a, RN-28 | Menina | Must | Confirmado | Dado um curso em "Próximas aventuras", quando Alana abre o site dele, então ele continua em "Próximas aventuras". Quando ela toca "Marcar como iniciada", então ele passa para "Em andamento". Um curso em "Próximas aventuras" não vai direto para "Concluídos". |

#### F10 · Inscrição em evento (M6)

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F10.13 | O sistema deve mostrar o detalhe de um evento (**diferente de atividade**) (organizador, datas, cidade, prazo de inscrição com dias restantes, custo, faixa etária, pré-requisitos) e levar ao link de inscrição do grupo, avisando que os dados da NISE não são enviados. | M6, Figma A06·4b | Menina | Must | Confirmado | Dado um hackathon com inscrições até 30/10, quando Alana abre o evento em 15/10, então vê "Faltam 15 dias" e o botão "Ir para inscrição". |
| RF-F10.14 | O sistema deve perguntar, quando a menina volta do site, se ela conseguiu se inscrever, e marcar o evento como "Inscrita" no filé quando ela confirmar. | M6, Figma A09, A06·4b inscrita | Menina | Must | Confirmado | Dado que Alana voltou do site, quando responde "Sim, me inscrevi", então o evento aparece como "Inscrita" no filé, em "Em andamento". Quando ela toca "Já me inscrevi" no detalhe do evento, o resultado é o mesmo. Quando toca "Ainda não", então o evento continua em "Próximas aventuras". |
| RF-F10.15 | O sistema deve permitir que a menina tire um evento do filé e, se já marcou que se inscreveu, desfaça essa marca. | Figma A06·4b inscrita, D-39 | Menina | Must | Confirmado | Dado um evento marcado como inscrita, quando Alana toca "Desfazer" no aviso "Você tá inscrita!", então o evento volta para "Próximas aventuras". Quando toca "Tirar do filé", então o evento sai do filé. |
| RF-F4.12 | O sistema deve oferecer à menina inscrita num evento um lembrete opcional por e-mail um dia antes. | D-05, Figma A06·4b inscrita, K01 | Menina | Should | Confirmado | Dado que Alana marcou "Me lembra um dia antes" no hackathon de 08/11, quando chega 07/11, então ela recebe um e-mail só. |
| RF-F10.23 | O sistema deve perguntar, depois da data de um evento de fora da NISE em que a menina se inscreveu, se ela foi: se foi, o evento fica concluído; se não foi, sai do filé. | Figma A06·4b (você foi? · evento de fora), RN-19, D-39 | Menina | Must | Confirmado | Dado que Alana se inscreveu num hackathon de fora que aconteceu em 8 e 9 de novembro, quando abre o evento, então vê "O evento acabou · Conta pra gente se você foi". Quando toca "Fui!", então o evento fica concluído e colorido no filé, e ela vai à avaliação (A06·5). Quando toca "Não deu", então o evento sai do filé. |
| RF-F10.24 | O sistema deve mostrar, depois da data de um evento de um grupo da NISE em que a menina se inscreveu, que está esperando a lista de presença, e concluir o evento quando a coordenadora marcar a presença dela ou tirá-lo do filé se ela faltou. | Figma A06·4b (depois do evento · grupo NISE), RF-F3.05, D-39 | Menina | Must | Confirmado | Dado um evento das Rendeiras que já aconteceu, quando Alana abre o evento, então vê "Esperando a lista de presença" e nenhum botão. Quando Kátia a marca como presente, então o evento fica concluído ("Você foi") e colorido no filé. Quando Kátia registra a presença sem marcá-la, então o evento sai do filé dela. |
| RF-F10.25 | O sistema deve tirar do filé o evento cuja data passou e que a menina não marcou como inscrita. | D-39 | Menina | Should | **A validar** | Dado um evento em "Próximas aventuras" cuja data passou e que Alana nunca marcou como inscrita, quando ela abre o filé, então ele não aparece. *Se for de um grupo da NISE e a coordenadora a marcar como presente depois (RF-F3.03), a ideia é ele voltar como concluído; falta confirmar.* |

#### F4 · Avaliação e lembretes (M1, M5)


| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F4.03a | O sistema deve pedir a avaliação do evento com nota de 1 a 5 e um comentário opcional. | F4, M1, Figma A03 | Menina | Must | Confirmado | Dado que Alana abre a avaliação, quando dá nota 4, então a avaliação fica registrada. |
| RF-F4.03b | A menina deve poder pular a avaliação do evento, que fica pendente. | F4, M1, Figma A03, D-20 | Menina | Must | Confirmado | Dado que Alana abre a avaliação, toca "Agora não", então a avaliação não é registrada e continua pendente, e ela pode abri-la de novo pela agenda (RF-F4.11b) ou pelo link do e-mail. |
| RF-F4.11a (F9) | O sistema deve avisar a menina, por e-mail, das datas importantes (ENEM, IFAL, SISU, início do ano letivo), cadastradas pela equipe NISE. | D-05, Figma A14, A14b, Doc vivo §11 | Menina | Must | Confirmado | Dado que a equipe cadastrou "ENEM · 1º dia" em 08/11, quando chega a véspera, então Alana recebe o lembrete, como todas as meninas com conta (D-16).|
| RF-F4.11b (F9) | O sistema deve mostrar as datas importantes num calendário dela junto com os questionários. | D-05, Figma A14, A14b, Doc vivo §11 | Menina | Should | Confirmado | Dado que a equipe cadastrou "ENEM · 1º dia" em 08/11, então o evento aparece no calendário para a menina. |
| RF-F4.13 | O sistema deve mostrar à menina o questionário de acompanhamento identificado pela ação e pelo grupo, com as 4 perguntas padrão (caminho de 1 a 5, se começou curso de TI, o que ajudaria agora e um comentário opcional), que ela pode pular. | F4, M5, Figma A18 | Menina | Must | Confirmado | Dado o questionário de 3 meses do Hackathon Rendeiras, quando Alana abre o link, então vê as 4 perguntas e responde ou pula. |

#### F6 · Registro de ingresso (M5)

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F6.02 (RF-06.01, RF-06.04) | O sistema deve permitir que a menina declare ingresso em curso técnico ou graduação, dizendo qual curso e onde, ou responda "Tô tentando entrar" ou "Ainda não". | F6, Figma A17 | Menina | Must | Confirmado | Dado que Alana responde "Graduação", "Ciência da Computação" e "UFAL", quando envia, então o ingresso fica registrado com a origem "autodeclaração". |
| RF-F6.03 (RF-06.02) | O sistema deve registrar a data e a origem de cada ingresso (autodeclaração ou lista oficial confirmada pela menina). | F6, F31 | Sistema | Must | Confirmado | Dado um ingresso declarado, quando é salvo, então o registro tem a data e "autodeclaração". |
| RF-F6.04 | O sistema deve permitir que a menina registre o ingresso a qualquer momento, pelo perfil, sem esperar um questionário. | reuniao (21/10/26) | Menina | Should | Confirmado | Dado que Alana entrou no IFAL, quando toca "Registrar ingresso" no perfil, então registra sem esperar o questionário de 6 meses. |
| RF-F6.05 (RF-06.05) | O sistema deve permitir corrigir a declaração, guardando o valor anterior. | F6 | Menina | Should | Confirmado | Dado uma declaração errada, quando Alana a corrige, então o sistema guarda a nova e a anterior, com as datas. |


#### F31 · Confirmação "sou eu" (M7)

A busca automática que gera os indícios está em 3.3.

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F31.04 (RF-31.06, RF-31.07) | O sistema deve perguntar à menina, na tela "É você na lista?", com o card da lista oficial, se é ela quem aparece ("Sou eu" ou "Não sou eu") e se já se matriculou ("Já me matriculei" ou "Ainda não"). "Sou eu" e "Ainda não" registram a aprovação, com a origem da lista. "Sou eu" e "Já me matriculei" registram o ingresso, com a origem "relatório da UFAL, confirmado pela menina" (RF-F6.03). "Não sou eu" apaga o indício (RF-F31.06). "Agora não" volta à agenda, e o item continua lá. Só a menina confirma (RN-21). | F31, Figma M7 (A19), RN-21, RN-22, D-48 | Menina | Must | **A validar** | Dado um indício, quando Maria responde "Sou eu" e "Ainda não", então ela consta como aprovada, e não como ingressante. Quando responde "Sou eu" e "Já me matriculei", então o ingresso fica registrado com a data e a origem. Quando responde "Não sou eu", então o indício é apagado. *O Figma da M7 diz que a coordenadora também pode confirmar o indício na tela de Ingressantes. Ela só vê que existe um indício (RF-F5.10); quem confirma é a menina (RN-21, D-48).* |
| RF-F31.10 | O sistema deve mostrar, no topo de "Pra responder" da agenda ("Sua agenda"), o item "Achamos seu nome numa lista de aprovados!" enquanto houver um indício sem resposta, e o item abre a tela "É você na lista?" (RF-F31.04). A faixa "Tem umas perguntinhas pra você", do Seu filé, também leva à agenda. | F31, Figma M7 (agenda com aprovação para confirmar), D-48 | Menina | Must | **A validar** | Dado um indício para Maria, quando ela abre a agenda, então vê o item no topo de "Pra responder". Dado que ela respondeu, ou que o indício foi apagado (RF-F31.06), então o item some. |
| RF-F31.11 | O sistema deve avisar por e-mail a menina que aceitou receber e-mails de oportunidades que achamos o nome dela numa lista de aprovados, sem citar a lista nem o curso, com um link para o app. O e-mail só avisa: a resposta é dada no app (RF-F31.04). Quem não aceitou não recebe o e-mail e vê o aviso só na agenda. | F31, RN-30, D-48, D-50 | Menina | Should | **A validar** | Dado um indício novo para Maria, que aceitou e-mails de oportunidades, quando ele é gerado, então ela recebe um e-mail curto com o link para a agenda, e o e-mail não traz o nome da lista nem o curso. Dada Alana, que não aceitou, então ela não recebe o e-mail e vê o item na agenda. *Falta o texto do e-mail no Figma.* |

### 3.2 Coordenadora

O que a coordenadora faz ou vê, incluindo as regras que acontecem durante a ação dela (validar a planilha, anonimizar o arquivo exportado). Fluxos C1 a C7.

#### S2 · Contas do grupo

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-S2.06 | O sistema deve permitir mais de uma conta de coordenadora por grupo, cada uma com login próprio. | Pendência da v0.1, Figma K09 (histórico com Kátia e Joana) | Coordenadora | Won't | Confirmado | Dado que Kátia e Joana coordenam as Rendeiras, quando cada uma entra, então ambas veem as ações do grupo, e o histórico registra quem fez cada coisa. |
| RF-S2.18 | O sistema deve permitir que um grupo que não recebeu convite peça acesso à NISE por um formulário próprio, com nome do grupo, redes sociais, descrição, data de criação, objetivo, instituição de ensino (se houver), e-mail oficial, ações recentes e quem está respondendo. | Conversa da equipe (20/10), D-32 | Visitante | Should | **A validar** | Dado que o grupo "Meninas do Sertão" não recebeu convite, quando a pessoa que o lidera preenche e envia o formulário, então vê que o pedido foi recebido e que a equipe vai avaliá-lo, e ainda não consegue criar conta. *Falta tela no Figma.* |
| RF-S2.19 | O sistema deve permitir que a coordenadora crie a conta pelo convite exclusivo que recebeu no e-mail oficial do grupo, ligando a conta ao grupo. O convite só funciona uma vez e só para o e-mail a que foi enviado. | Conversa da equipe (20/10), RN-35, D-32 | Coordenadora | Must | **A validar** | Dado que Kátia recebeu o convite no e-mail oficial das Rendeiras, quando abre o link e cria a conta, então a conta fica ligada às Rendeiras e o mesmo link não funciona de novo. *Falta tela no Figma: criar a conta e entrar no grupo.* |

#### F30 · Cadastro de ações (C1)

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F30.01 (RF-30.01) | O sistema deve permitir que a coordenadora cadastre uma ação do seu grupo com nome, tipo, data, formato (presencial ou online), cidade (quando presencial), visibilidade (aberta ou fechada) e link de inscrição. | F30, C1, Figma K02 | Coordenadora | Must | Confirmado | Dado que Kátia preenche "Introdução à robótica", oficina, 24/10/2026, presencial, Maceió, aberta e o link do Forms, quando salva, então vê "Ação salva. Já aparece nas sugestões das meninas de Maceió." e a ação aparece na lista de ações (K10) em "Aguardando inscrições". |
| RF-F30.02 | O sistema deve exigir o link de inscrição para ações abertas e torná-lo opcional para ações fechadas. | Figma K02 | Sistema | Must | Confirmado | Dado uma ação aberta sem link, quando Kátia tenta salvar, então vê "Obrigatório pra ações abertas" junto ao campo, e nada é salvo. |
| RF-F30.03 (RF-30.02) | O sistema deve permitir informar, de forma opcional, horário de início e fim, data de fim (quando a ação dura mais de um dia), endereço, público (uma ou mais etapas escolares) e descrição de até 300 caracteres. | F30, Figma K02 mais detalhes | Coordenadora | Must | Confirmado | Dado uma ação salva só com os campos obrigatórios, quando Kátia volta e acrescenta horário e descrição, então os dados ficam salvos e as inscritas já importadas não mudam. |
| RF-F30.05 (RF-30.03) | O sistema deve validar o cadastro antes de salvar: data de fim igual ou posterior à de início, cidade escolhida da lista do IBGE (RN-17) e link iniciado por https. | F30 | Sistema | Must | Confirmado | Dado uma data de fim anterior à de início, quando Kátia tenta salvar, então vê a mensagem junto ao campo, e nada é salvo. |
| RF-F30.06 | O sistema deve mostrar, durante o cadastro, uma prévia de como a ação aparece nas sugestões das meninas, com o texto de quem vai vê-la. | Figma K02 (prévia) | Coordenadora | Should | Confirmado | Dado uma ação aberta presencial em Maceió com a tag "Robótica", quando Kátia vê a prévia, então lê "Aparece para meninas de Maceió com interesse em Robótica". |
| RF-F30.10 (RF-30.04) | O sistema deve listar as ações do grupo agrupadas por situação (aguardando inscrições, aguardando evento, aguardando presença e concluídas), com data, tipo, formato, visibilidade, contagens e o botão da próxima tarefa de cada uma, com filtro por situação e busca por nome. | F30, F3, Figma K10, RN-37 | Coordenadora | Must | Confirmado | Dado uma ação que aconteceu sem presença registrada, quando Kátia abre a lista, então vê "Aconteceu em 09/10. Falta marcar a presença." e o botão "Marcar presença" nessa ação. Dado 10 ações, quando ela abre Ações, então vê "Todas 10" e a contagem de cada situação, e pode filtrar por situação ou buscar pelo nome. |
| RF-F30.11 (RF-30.05) | O sistema deve permitir editar uma ação, no mesmo formulário do cadastro já preenchido, pelo menu "…" da lista. Se a data mudar, o lembrete de evento ainda não enviado é reprogramado (RN-18). | F30, F4, Figma K10 (menu …), K02 | Coordenadora | Must | Confirmado | Dado que Kátia toca "…" numa ação da lista, então vê "Editar" e "Excluir ação". Dado uma ação de 24/10 com inscritas que marcaram "Me lembra um dia antes" (RF-F4.12), quando Kátia muda a data para 31/10, então o lembrete passa a sair em 30/10. |
| RF-F30.12 (RF-30.06) | O sistema deve permitir excluir uma ação, com modal de confirmação, enquanto a presença não for registrada, mesmo que já tenha inscritas. Depois da presença, a ação não pode ser excluída (RN-15). | F30, nota no Figma (C2), Figma K10, K11, D-12, D-47 | Coordenadora | Must | Confirmado | Dado uma ação com 23 inscritas e sem presença, quando Kátia toca "Excluir ação" no menu "…" da lista (K10) ou no botão "Excluir ação" do cabeçalho da página da ação (K11) e confirma no modal, então a ação e as inscrições dela somem, e a ação sai do filé das meninas que a tinham (RN-36). Dado uma ação com presença registrada, a opção não aparece. *O Figma (K11 aguardando evento e com inscrições fechadas) ainda mostra um menu "…" no lugar do botão "Excluir ação".* |
| RF-F30.14 (RF-30.09) | O sistema deve permitir cadastrar ações com data passada, para registrar o histórico do grupo, sem que elas apareçam nas sugestões. | F30 | Coordenadora | Should | Confirmado | Dado um minicurso de março de 2026, quando Kátia o cadastra, então pode importar a lista e marcar presença, e a ação não aparece para as meninas. |
| RF-F30.15 (RF-30.10) | O sistema deve registrar quem criou e quem alterou cada ação, e quando. | F30 | Sistema | Could | Confirmado | Dado que uma coordenadora mudou a data de uma ação, quando outra coordenadora do grupo abre o histórico, então vê quem mudou, quando e o valor anterior. |
| RF-F30.16 (RF-30.12) | O sistema deve avisar quando a coordenadora cadastrar uma ação com o mesmo nome e a mesma data de outra do mesmo grupo. | F30 | Sistema | Could | Confirmado | Dado que já existe "Oficina de robótica" em 20/11, quando Kátia cadastra outra igual, então vê um aviso e pode confirmar ou cancelar. |
| RF-F30.17 | O sistema deve mostrar à coordenadora, no topo das telas, o menu Ações, Funil, Ingressantes, Relatórios e Exportar, com o nome do grupo e o avatar. | Figma K10, K02 (menu superior) | Coordenadora | Must | Confirmado | Dado que Kátia entrou, quando abre qualquer tela, então vê o menu com a aba atual destacada, "Rendeiras do Código" e o avatar "K". *A tela da aba "Relatórios" será conferida na revisão da F16.* |


#### F17 · Tipos e tags (C1, C5)

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F17.01 (RF-04.1) | O sistema deve exigir um tipo para cada ação, numa lista fixa: oficina, palestra, minicurso, hackathon, visita, acolhimento, outro. | F17, Figma K02 | Coordenadora | Must | Confirmado | Quando Kátia tenta salvar uma ação sem tipo, então o sistema pede que ela escolha um. |
| RF-F17.02 (RF-04.2) | O sistema deve permitir atribuir uma ou mais tags a uma ação, escolhidas entre os 8 temas da tela de interesses da menina (Programação, Robótica, Inteligência artificial, Dados, Cibersegurança, Jogos, Sites e apps, Design e criação). | F17, Figma K02, A05, D-44 | Coordenadora | Must | Confirmado | Dado uma oficina, quando Kátia escolhe "Robótica" e "Jogos", então a ação aparece com as duas tags. *O Figma (K02) ainda mostra um campo livre e "Usadas pelo grupo".* |
| RF-F17.04 (RF-04.5) | O sistema deve permitir editar ou remover as tags de uma ação, atualizando o painel. | F17 | Coordenadora | Must | Confirmado | Quando Kátia remove a tag "Inteligência artificial" de uma ação, então essa ação deixa de aparecer no filtro "Inteligência artificial". |
| RF-F17.06 | O sistema deve sugerir a ação às meninas que escolheram, na tela de interesses, um dos temas das tags da ação. Uma ação sem tags só aparece para quem escolheu "Ainda não sei, me mostra de tudo". | Figma K02, A05, D-44 | Sistema | Must | Confirmado | Dado uma oficina com as tags "Robótica" e "Jogos", quando Alana, que escolheu Robótica, vê as sugestões, então a oficina aparece para ela. Dado uma ação sem tags, então ela só aparece para quem escolheu "Ainda não sei, me mostra de tudo". |
| RF-F17.07 | O sistema deve permitir acrescentar tags mais específicas (ex.: Arduino, Python) e ligá-las aos temas da menina, por um mapa fixo mantido pela equipe ou por sugestão automática da LLM, só com o texto da tag. | D-44 | Coordenadora | Could | **A validar** | Dada a tag "Arduino" ligada ao tema Robótica, quando Kátia a escolhe, então a ação é sugerida a quem escolheu Robótica. *Como ligar a tag ao tema (mapa fixo ou LLM) ainda não foi decidido.* |


#### F1 · Importar inscritas (C2)

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F1.01 (RF-01.1) | O sistema deve permitir que a coordenadora importe um arquivo CSV ou XLSX com a lista de inscritas, a partir da página da ação. | F1, C2, Figma K11, drawer Importar inscritas | Coordenadora | Must | Confirmado | Dado um CSV exportado do Google Forms, quando Kátia o envia na página da ação, então passa para a etapa de revisão com as linhas lidas. |
| RF-F1.02 | O sistema deve sugerir a associação das colunas, procurando no cabeçalho da planilha nomes iguais ou parecidos com os campos da NISE, sem reconhecer o formato de nenhuma plataforma. A coordenadora confere e ajusta. | F1, Figma drawer Importar inscritas · 1 Planilha ("Confira as colunas"), D-47 | Sistema | Should | Confirmado | Dada uma planilha com as colunas "Nome completo", "Endereço de e-mail" e "Telefone para contato", quando é carregada, então elas já vêm associadas a Nome, E-mail e WhatsApp, e Kátia pode trocar qualquer uma. *O Figma ainda diz "Reconhecemos as colunas do Google Forms" e "formato do Google Forms".* |
| RF-F1.03 (RF-01.2) | O sistema deve permitir associar as colunas da planilha aos campos da NISE: nome e e-mail (obrigatórios), WhatsApp, escolaridade e série (opcionais), ou marcar a coluna como "Não usar". | F1, Figma drawer Importar inscritas · 1 Planilha | Coordenadora | Must | Confirmado | Dada a coluna "Endereço de e-mail", quando Kátia a associa a "E-mail", então os valores dessa coluna são gravados como e-mail. Colunas marcadas "Não usar" não entram na NISE. |
| RF-F1.04 | O sistema deve guardar o nível de escolaridade da inscrita nas mesmas etapas do cadastro da menina (Ensino fundamental, Ensino médio, Curso técnico, Graduação, Já me formei) e usar a série só para inferir esse nível. | Nota no Figma (C2), RF-F10.01, D-47 | Sistema | Must | Confirmado | Dada a série "8º ano", quando a inscrita é importada, então o nível registrado é "Ensino fundamental". *O Figma (K11 e drawers) ainda mostra "Fundamental incompleto" e "Médio completo".* |
| RF-F1.05 (RF-01.4) | O sistema deve mostrar uma revisão antes de importar, separando as linhas prontas, as que precisam de revisão (e-mail incompleto ou ausente) e as repetidas no arquivo, com o motivo de cada uma. | F1, Figma drawer Importar inscritas · 2 Revisão | Coordenadora | Must | Confirmado | Dada uma planilha com 26 linhas, 2 com e-mail inválido e 1 repetida, quando a revisão aparece, então mostra "23 prontas · 2 pra revisar · 1 repetida". As 2 que precisam de revisão aparecem com o motivo ("E-mail incompleto" ou "Sem e-mail") e um campo para corrigir o e-mail. A repetida aparece com a frase "Beatriz Nascimento aparece 2 vezes com o mesmo e-mail. Ela entra uma vez só". As 23 prontas ficam numa lista recolhida, com nome, e-mail e nível de escolaridade, que Kátia pode abrir. O botão diz "Importar 23 inscritas", e as 2 em revisão entram quando ela as corrige. |
| RF-F1.06 | O sistema deve permitir corrigir o e-mail de uma linha na revisão, ou descartá-la. | Figma drawer Importar inscritas · 2 Revisão | Coordenadora | Must | Confirmado | Dado Isadora sem e-mail, quando Kátia escolhe "Não importar", então a inscrição é ignorada no sistema. Uma linha que continua sem e-mail válido não entra na importação. |
| RF-F1.07 (RF-01.5) | O sistema deve mostrar, na revisão, quantas linhas estão prontas, quantas precisam de revisão e quantas são repetidas, e o botão de importar com o número de inscritas que vão entrar. Na reimportação, mostra quantas já estavam na ação e quantas são novas, e importa só as novas. Depois de importar, a ação passa para "Aguardando evento" e quem acabou de entrar aparece na lista com o chip "Nova". | F1, Figma drawer Importar inscritas · 2 Revisão, K11, nota no Figma (Reimportar inscritas), D-47 | Coordenadora | Should | Confirmado | Dada uma planilha com 26 linhas, 2 sem e-mail válido e 1 repetida, quando Kátia importa as 23 prontas, então o botão diz "Importar 23 inscritas", a ação passa para "Aguardando evento" e as 23 aparecem na lista com o chip "Nova". Dado que a ação já tem 20 inscritas, quando Kátia importa uma planilha com essas 20 e mais 3, então a revisão mostra "20 já estavam · 3 novas" e o botão diz "Importar 3 novas". |
| RF-F1.08 (RF-01.6) | O sistema deve permitir importar mais de uma lista para a mesma ação sem duplicar quem já está nela: a revisão compara pelo e-mail, mostra quantas já estavam e quantas são novas, e importa só as novas. Quem não aparece na nova planilha continua na ação. | F1, F2, nota no Figma (Reimportar inscritas) | Coordenadora | Must | Confirmado | Dado que a ação tem 30 inscritas, quando Kátia importa uma lista com essas 30 e mais 10, então a revisão mostra "30 já estavam · 10 novas", o botão diz "Importar 10 novas" e a ação passa a ter 40. |
| RF-F1.09 | O sistema deve permitir adicionar uma inscrita por vez (nome e e-mail obrigatórios; WhatsApp, escolaridade e série opcionais) e continuar adicionando outra em seguida. | Figma drawer Adicionar inscrita | Coordenadora | Must | Confirmado | Dado que Kátia preenche nome e e-mail de Júlia, quando confirma, então Júlia entra na lista de inscritas da ação, e o formulário pode ficar aberto para a próxima. |
| RF-F1.10 | O sistema deve permitir fechar as inscrições de uma ação, com confirmação. A ação deixa de ser sugerida às meninas, mas a coordenadora continua podendo adicionar inscritas manualmente. A situação da ação não muda (RN-37). | Figma K11 fechar inscrições, modal Fechar inscrições | Coordenadora | Must | Confirmado | Dado uma ação com 23 inscritas, quando Kátia confirma "Fechar inscrições", então a ação deixa de ser sugerida às meninas e continua no filé de quem já a tinha (RN-36), e ela ainda pode adicionar uma inscrita depois. |
| RF-F1.13 | O sistema deve permitir reabrir as inscrições de uma ação que a coordenadora fechou, com confirmação, até o dia do evento. A ação volta a ser sugerida às meninas, e a situação da ação não muda (RN-37). | Figma K11 inscrições fechadas, modal Reabrir inscrições, D-47 | Coordenadora | Should | Confirmado | Dado uma ação com inscrições fechadas por Kátia, quando ela confirma "Reabrir inscrições", então a ação volta às sugestões das meninas. Dado que o dia do evento chegou, o botão "Reabrir inscrições" não aparece. |
| RF-F1.14 | O sistema deve mostrar, na página da ação, o card "Inscritas" com a contagem, o link do formulário, uma busca por nome ou e-mail e a lista das inscritas, com uma coluna para cada campo que tem dado registrado nelas (nome e e-mail sempre; WhatsApp, nível de escolaridade e série quando foram associados na importação ou preenchidos ao adicionar), com "Ver todas as N", e as ações "Importar planilha" e "Adicionar inscrita". | Figma K11, D-47 | Coordenadora | Must | Confirmado | Dado uma ação com 23 inscritas, importadas com as colunas Nome, E-mail e Nível de escolaridade, quando Kátia abre a ação, então vê "Inscritas 23", a busca, as primeiras seis com essas três colunas e "Ver todas as 23". Se a planilha também tinha WhatsApp, a coluna WhatsApp aparece; se ninguém tem série registrada, a coluna Série não aparece. Dado uma ação sem inscritas, então vê "Nenhuma inscrita ainda" com "Importar inscritas" e "Adicionar inscrita". |
| RF-F1.15 | O sistema deve permitir que a coordenadora tire uma inscrita da ação, com confirmação, sem apagar o cadastro dela. | Nota no Figma (Reimportar inscritas), D-47 | Coordenadora | Could | **A validar** | Dado que Júlia foi adicionada por engano, quando Kátia a tira da ação, então ela sai da lista de inscritas e o cadastro dela continua. *Falta tela no Figma.* |
| RF-F1.16 | O sistema deve fechar as inscrições de uma ação sozinho no dia do evento. | Fluxograma do Figma ("Inscrições fecham sozinhas no dia do evento"), RN-37, D-47 | Sistema | Should | Confirmado | Dado uma ação com inscrições abertas, quando o dia do evento chega, então as inscrições ficam fechadas e a coordenadora não pode reabri-las (RF-F1.13). |
| RF-F1.17 | O sistema deve avisar, ao adicionar uma inscrita, quando o e-mail dela já está na NISE, citando só as ações do grupo da coordenadora em que ela já participou. | Figma drawer Adicionar inscrita, RN-01, RN-04, D-47 | Coordenadora | Should | Confirmado | Dado que Júlia já participou de "Arduino na escola", ação do grupo de Kátia, quando Kátia digita o e-mail dela, então vê "Já está na NISE. Participou de Arduino na escola. Ela vai ser ligada a esta ação, sem cadastro novo". Dado que Júlia só participou de ações de outro grupo, então vê só "Já está na NISE". |
| RF-F1.12 (RF-01.7) | O sistema deve permitir desfazer uma importação, removendo as inscrições daquele lote. | F1 | Coordenadora | Could | Confirmado | Dada uma importação na ação errada, quando Kátia a desfaz, então as inscrições do lote saem da ação, e os cadastros de quem já existia continuam. |


#### F3 · Presença e funil (C3)

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

> ⚠️⚠️ **EM MUDANÇA FORTE.** A C5 está em revisão, com bastante mudança no Figma. Os RFs abaixo são só a versão essencial. **Não comecem histórias destes itens antes da revisão do Figma.**

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F5.01 | O sistema deve mostrar à coordenadora o que precisa dela agora: calendários a aprovar, presenças a registrar, inscrições a fechar e listas a importar. | Figma K01 Tarefas, Doc vivo §4 | Coordenadora | Must | **A validar** ⚠️ | Dado uma ação concluída sem calendário aprovado, quando Kátia abre a Visão geral, então vê "Aprove o calendário de contatos" com o botão "Aprovar calendário". |
| RF-F5.02 (RF-05.01) | O sistema deve mostrar o funil do grupo (inscritas, presentes, criaram conta, responderam 3 meses, responderam 6 meses, ingressaram), com a porcentagem de cada etapa em relação à anterior. | F5, F3, Figma K06 Funil | Coordenadora | Must | **A validar** ⚠️ | Dado 64 inscritas e 42 presentes, quando Kátia abre o funil, então vê "42 presentes · 66% da etapa anterior". |
| RF-F5.09 (RF-05.02) | O sistema deve mostrar quantas meninas voltaram a outra ação do grupo no período (cada menina conta uma vez). | F5, F2, Figma K06 ("Voltaram em 3 meses") | Coordenadora | Must | **A validar** ⚠️ | Dado que Ana foi a duas ações do grupo no período, quando Kátia abre o painel, então Ana conta uma vez como recorrente. |
| RF-F5.03 (RF-05.03) | O sistema deve mostrar a avaliação média, a quantidade de respostas e a avaliação por ação, com os comentários sem nome. | F5, Figma K06 Avaliações | Coordenadora | Must | **A validar** ⚠️ | Dado 30 avaliações de 42 presentes, quando Kátia abre Avaliações, então vê a média e "30 de 42 presentes". |
| RF-F5.04 (RF-05.03) | O sistema deve mostrar os temas de interesse das meninas com conta e a evolução do interesse declarado nos questionários. | F5, Figma K06 Interesses | Coordenadora | Should | **A validar** ⚠️ | Dado respostas de 3 meses, quando Kátia abre Interesses, então vê a porcentagem por tema. *O "antes e depois" pede uma pergunta de interesse antes da ação, que hoje não existe.* |
| RF-F5.05 (RF-05.04) | O sistema deve mostrar as meninas do grupo que ingressaram na área, com curso, instituição e a origem do registro. | F5, F6, F31, Figma K06 Ingressantes | Coordenadora | Must | **A validar** ⚠️ | Dado 3 ingressos declarados, quando Kátia abre Ingressantes, então vê as 3 com "Ela declarou na NISE". |
| RF-F5.10 | O sistema deve mostrar à coordenadora, na tela Ingressantes, as meninas do grupo dela que têm um indício sem resposta, com o marcador "Possível aprovação · aguardando a menina", sem lista, curso nem instituição. Elas não contam no funil nem como ingressantes, e não há botão de confirmar. O marcador some quando a menina responde ou o indício é apagado (RF-F31.06). | F31, Figma K06 Ingressantes, RN-21, D-48 | Coordenadora | Should | **A validar** | Dado um indício sem resposta para Maria, que é do grupo de Kátia, quando Kátia abre Ingressantes, então vê Maria com "Possível aprovação · aguardando a menina", e o funil não muda. Dado que Maria respondeu "Não sou eu", então o marcador some. *O texto do marcador ainda não está no Figma. O Comitê de Ética revê, depois da disciplina, a coordenadora ver um indício que a menina ainda não confirmou (D-49).* |
| RF-F5.06 (RF-05.05) | O sistema deve permitir filtrar os indicadores por período, ação, tipo e tag. | F5, F17, Figma K06 | Coordenadora | Must | **A validar** ⚠️ | Dado o filtro "Tipo: oficina", quando aplicado, então todos os números consideram só oficinas. |
| RF-F5.07 (RF-05.07) | O sistema deve mostrar a posição do grupo em relação à média da Rede NISE, sem identificar os outros grupos. | F5, Figma K06 Grupo × Rede NISE | Coordenadora | Should | **A validar** ⚠️ | Dado 14 grupos, quando Kátia abre Grupo × Rede, então vê "5º de 14" em presença, e nenhum outro grupo tem nome. |
| RF-F5.08 | O painel não mostra raça/cor nem renda. | D-04 | Sistema | Must | Confirmado | Dado o Dashboard, quando Kátia o abre, então não existe o indicador "Pretas, pardas e indígenas". |

Ficam como Could ou Won't, por estarem fora da versão essencial: "Ideias de outros grupos", "Onde mais perdemos", os temas dos comentários (que pediriam LLM), "Quem alcançamos" e as metas.

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
| RF-S2.01 | O sistema deve permitir criar conta e entrar com e-mail e senha ou com a conta Google. | S2, Figma A02, A15 | Menina, Coordenadora | Must | Confirmado | Dado que Alana toca "Criar conta com o Google", quando autoriza, então vai para "Só mais um passo" (A02b) com nome e e-mail já preenchidos. Dado que Alana já tem conta, quando entra com e-mail e senha ou com o Google (A15), então chega ao filé, ou à tela de termos se ainda não aceitou a versão atual (RN-34). *Para a coordenadora, criar conta exige o convite exclusivo (RN-35). Ela ainda não tem tela de entrar nem de cadastro no Figma.* |
| RF-S2.04 | O sistema deve permitir recuperar o acesso por um link enviado ao e-mail da conta, e criar a nova senha por esse link, digitada duas vezes. Ao salvar, a menina já entra na conta. | Figma A16, A16b | Menina, Coordenadora | Must | Confirmado | Dado que Kátia esqueceu a senha, quando informa o e-mail, então recebe um link que permite criar uma nova senha. Dado o link, quando ela digita a senha duas vezes (mínimo de 8 caracteres, RN-33) e toca "Salvar e entrar", então a senha muda e ela entra na conta. |
| RF-S2.08 | O sistema deve mostrar no perfil da menina o botão "Mudar senha", que leva à tela de criar nova senha. | Figma A10 (Mudar senha), A16b, D-27 | Menina | Should | Confirmado | Dado que Alana entrou com e-mail e senha, quando toca "Mudar senha" no perfil, então vai para a tela "Crie uma nova senha" (A16b). *Redefinir a senha em si é o RF-S2.04. Quem entrou com o Google não vê o botão (RF-S2.10). Kátia ainda não tem tela de perfil.* |
| RF-S2.10 | O sistema deve mostrar, no perfil da menina que entrou com o Google, o cartão da conta (avatar com a inicial do nome, nome, e-mail da conta e o logo do Google) no lugar do botão "Mudar senha". | Figma A10 (Perfil · conta Google), D-29 | Menina | Should | Confirmado | Dado que Alana criou a conta com o Google, quando abre o perfil, então vê o cartão com "A", "Alana Oliveira", "alana@gmail.com" e o logo do Google, e não vê o botão "Mudar senha". *O A10 de e-mail e senha e o A10 de conta Google são duas telas no Figma.* |
| RF-S2.09 | O sistema deve permitir que a menina saia da conta pelo perfil. | Figma A10 (Sair da conta), D-27 | Menina | Must | Confirmado | Dado que Alana está logada, quando toca "Sair da conta", então a sessão acaba e ela vê a tela de boas-vindas. |
| RF-S2.17 | O sistema deve mostrar "Esse link não vale mais" quando um link de nova senha ou de convite pessoal estiver vencido ou, no caso da nova senha, já tiver sido usado, com as opções "Entrar na NISE" e de pedir um novo link pelo e-mail da menina. A nova senha vale 1 hora e uma vez; o convite pessoal, 30 dias. | Figma E07, A16b, nota "Estados da Alana" (30/10), D-31 | Menina, Coordenadora | Must | Confirmado | Dado que Alana já usou o link de nova senha, quando abre o mesmo link de novo, então vê "Esse link não vale mais" e pode pedir um novo link pelo e-mail dela. Dado um convite pessoal de 31 dias atrás, quando ela o abre, então vê a mesma tela e pede um novo link pelo e-mail dela, sem depender da coordenadora. *O Figma ainda diz "Peça um link novo pra quem te convidou": o texto precisa mudar.* |
| RF-S2.22 | O sistema deve confirmar o e-mail de quem cria conta com e-mail e senha, por um link enviado a esse e-mail. O link tem prazo, só funciona uma vez e pode ser pedido de novo. Contas criadas com o Google já nascem confirmadas. | D-33, RF-F2.02 | Menina, Coordenadora | Must | **A validar** | Dado que Alana criou a conta com e-mail e senha, quando abre o link que chegou ao e-mail dela, então o e-mail fica confirmado. Dado que outra pessoa criou uma conta com o e-mail de Alana e Alana depois entra com o Google, quando o Google liga as contas, então a senha da conta não confirmada é apagada, e Alana define uma nova por "Esqueci minha senha". *Falta tela no Figma. A decidir: o que uma conta não confirmada pode fazer, o prazo do link (proposta: 24 horas), se as contas já criadas contam como confirmadas e se a conta da coordenadora criada pelo convite exclusivo (RF-S2.19) já nasce confirmada.* |

#### Acesso dos grupos (S2)

Como o grupo ganha acesso à NISE (RN-35). Sem telas administrativas: a equipe faz isso por script, em `backend/scripts/`.

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-S2.20 | O sistema deve permitir que a equipe NISE gere o convite exclusivo para o e-mail oficial de um grupo, seja de um grupo que ela já conhece (convite direto, por exemplo de Alagoas e do Nordeste) ou de um pedido de acesso aprovado. O grupo é criado junto com o convite. | Conversa da equipe (20/10), RN-35, D-32 | Curadoria | Must | **A validar** | Dado o e-mail oficial das Rendeiras, quando a equipe gera o convite, então o convite é enviado a esse e-mail, o grupo existe, e nenhuma outra pessoa consegue usar o link. |
| RF-S2.21 | O sistema deve permitir que a equipe NISE veja os pedidos de acesso (RF-S2.18) e os aprove ou recuse depois de conferir os dados do grupo, à mão: se as redes sociais existem, se o e-mail é o que o grupo divulga, se houve ações recentes e se quem pediu aparece como liderança. | Conversa da equipe (20/10), D-32 | Curadoria | Should | **A validar** | Dado um pedido com os dados conferidos, quando a equipe o aprova, então gera o convite (RF-S2.20), e o pedido fica registrado como aprovado. Quando o recusa, então nenhum convite é enviado, e o pedido fica registrado como recusado. |

#### F2 · Cadastro único

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F2.01 (RF-02.1) | O sistema deve reconhecer pelo e-mail uma menina já cadastrada quando ela aparecer na lista de outro grupo. | F2 | Sistema | Must | Confirmado | Dado que Ana foi importada pelas Rendeiras, quando outro grupo importa uma lista com o mesmo e-mail, então a nova inscrição é ligada ao mesmo registro, sem duplicar. |
| RF-F2.02 (RF-02.2) | O sistema deve ligar a conta criada pela menina ao registro que veio de uma importação, quando ela usar o mesmo e-mail e ele estiver confirmado (RF-S2.22), inclusive pelo login com Google. | F2, Figma A02, A02b | Menina | Must | Confirmado | Dado que Alana foi importada com alana@gmail.com, quando ela cria conta com o Google usando esse e-mail, então ativa o registro existente. |
| RF-F2.03 (RF-02.3, RF-10.05) | O sistema deve reunir num único registro as participações da menina em ações de todos os grupos. | F2, F10 | Menina | Must | Confirmado | Dado que Ana foi a ações de dois grupos, quando abre o perfil, então vê as duas participações. |
| RF-F2.04 (RF-02.4) | O sistema deve mostrar à coordenadora só as participações em ações do próprio grupo. Participações em outros grupos aparecem só como número. | F2, Doc vivo §7 | Coordenadora | Must | Confirmado | Dado que Ana foi a 1 ação das Rendeiras e 2 de outro grupo, quando Kátia abre o registro dela, então vê só a ação das Rendeiras. |
| RF-F2.05 (RF-02.5) | O sistema deve sinalizar possíveis duplicadas (mesmo nome e mesma data de nascimento com e-mails diferentes) para a equipe NISE revisar. | F2, Doc vivo §13 | Administração | Should | **A validar** | Dados dois registros de "Ana Souza, 12/03/2010" com e-mails diferentes, quando o segundo é criado, então o par aparece na lista de possíveis duplicadas. *O doc vivo diz que o caso da menina de vários eventos ainda está em aberto.* *A lista importada não traz data de nascimento, então esta regra não pega a menina que usou um e-mail na lista e outro na conta (ver a limitação da RN-32).* |
| RF-F2.06 (RF-02.6) | O sistema deve permitir unir dois registros da mesma menina, mantendo o histórico dos dois. | F2 | Administração | Could | **A validar** | Dados dois registros confirmados como a mesma pessoa, quando são unidos, então resta um, com as participações dos dois. |

#### F4 · Envios automáticos

> ⚠️ **EM MUDANÇA.** C4 e M5 estão em execução e sujeitos a ajustes da equipe. Tudo que vem de K05, K08, A11 a A14, A17 e A18 está "a validar".

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F4.01 (RF-01.02, RF-04.02) | O sistema deve enviar o convite pessoal para criar conta por e-mail a todas as inscritas, presentes e ausentes, depois que a coordenadora registra a presença, e a avaliação do evento só às presentes. | F4, D-06, D-34, Figma K04, K11 concluída | Sistema | Must | Confirmado | Dado 23 inscritas, 17 delas presentes e todas com e-mail válido, quando Kátia registra a presença, então as 23 recebem o e-mail com o convite e as 17 presentes recebem também a avaliação. *A revisão completa da F4 vem depois.* |
| RF-F4.02 | O sistema não deve enviar um novo convite a quem já tem conta. A nova participação é ligada ao cadastro dela, e ela recebe só a avaliação desse evento. | D-06, RN-29, Doc vivo §13 | Sistema | Must | **A validar** | Dado que Alana já tem conta e foi a uma ação de outro grupo, quando a presença é registrada, então ela recebe só a avaliação, e o histórico mostra as duas ações. |
| RF-F4.06 (RF-04.03, RF-04.04) | O sistema deve enviar os questionários nas datas aprovadas, por e-mail e aviso no app, para todas as meninas com conta (RF-F7.07, D-15), sem nova ação da coordenadora. | F4, Figma K05e, A04·3 | Sistema | Must | Confirmado | Dado um calendário aprovado, quando chega a data do questionário de 3 meses, então todas as meninas com conta recebem o e-mail e o aviso. |
| RF-F4.07 (RF-04.06) | O sistema deve registrar as respostas ligadas à menina, à ação e à etapa (avaliação, 3 meses, 6 meses). | F4 | Sistema | Must | Confirmado | Dado que Alana responde o questionário de 3 meses, quando envia, então a resposta fica ligada à ação e à etapa "3 meses". |
| RF-F4.08 | O sistema deve ter perguntas fechadas para interesse e ingresso (escala de 1 a 5, sim/ainda não, múltipla escolha) e só uma pergunta aberta opcional. | Figma K05e, A18, A11, pendência da v0.1 (RN-11) | Sistema | Must | **A validar** | Dado o questionário padrão, quando Kátia o revisa, então vê 3 perguntas fechadas e 1 aberta opcional. |

Saiu: WhatsApp (antigo RF-04.05), por custo.

#### F11 · Recomendação e curadoria

A própria equipe monta a curadoria (D-13).

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F11.01 (RF-11.01) | O sistema deve sugerir apenas itens das duas fontes do filé: ações cadastradas pelos grupos (F30) e itens da curadoria da equipe NISE. | F11, Doc vivo §6 | Sistema | Must | Confirmado | Dado que a base tem 50 itens, quando o filé de Ana é montado, então todos os itens sugeridos existem na base, nenhum inventado pela LLM. |
| RF-F11.02 (RF-11.03) | O sistema deve montar as sugestões por regras (temas, escolaridade, cidade e faixa de esforço) quando a LLM não estiver disponível. | F11, Doc vivo §6 ("O filé funciona sem a LLM") | Sistema | Must | Confirmado | Dado que a LLM não respondeu, quando Ana abre o filé, então vê sugestões por regras, sem mensagem de erro. |
| RF-F11.03 (RF-11.02) | O sistema deve enviar à LLM apenas temas, escolaridade, cidade, tags das ações de que a menina participou e as escolhas no filé, nunca nome, e-mail, telefone ou data de nascimento. | F11, LGPD | Sistema | Must | Confirmado | Dado um perfil completo, quando o sistema pede sugestões à LLM, então a requisição não tem nenhum identificador. |
| RF-F11.05 | O sistema deve usar as escolhas da menina ("Não é pra mim" com motivo, "Quero fazer", avaliação e "sugestões parecidas") nas próximas sugestões. | Figma A06·2a, A06·5 | Sistema | Should | Confirmado | Dado que Alana dispensou dois cursos como "Muito difícil", quando novas sugestões são montadas, então itens do mesmo nível ficam por último. |
| RF-F11.07 (RF-11.06) | O sistema deve esconder das sugestões os itens vencidos. | F11 | Sistema | Must | Confirmado | Dado um evento que aconteceu ontem, quando o filé é montado hoje, então ele não aparece. |
| RF-F11.06 (RF-11.05) | O sistema deve permitir que a curadoria cadastre, edite e desative itens, com tipo, faixa de esforço, tags, cidade, link, idade mínima, custo e validade. | F11, Doc vivo §6 | Curadoria | Must | **A validar** | Dado que a curadoria cadastra um curso com a tag "Robótica", quando salva, então o curso pode ser sugerido. *A própria equipe monta a curadoria (D-13). A tela ainda não existe no Figma; a montagem inicial da base entra como task da história do filé.* |

#### F31 · Ingresso por listas oficiais

Pedido de um dos professores e principal argumento de inovação da NISE (D-02): a autodeclaração sozinha os grupos já conseguem fazer com um Google Forms. A F31 tem dois caminhos (D-48):

- **Busca automática (o objetivo):** o sistema consulta sozinho o relatório público do Sisu/UFAL (COPEVE) e cruza os nomes com as contas (RF-F31.02, 31.03, 31.05 a 31.08).
- **Autodeclaração:** a F6, que existe de qualquer jeito e é o que sobra se a busca não ficar pronta.

Não existe importação manual de listas pela curadoria (o antigo Plano B): a equipe não a discutiu e ela exigiria uma tela nova. Outras instituições: a COPEVE tem relatório em página, por formulário. O IFAL publica editais de convocação em PDF por uma API pública, e ler esses PDFs (RF-F31.12) é a primeira prioridade depois da COPEVE, se sobrar tempo e recurso. A UNCISAL também publica PDF e fica fora; para UNEAL, CESMAC e UNIT não achamos lista nominal pública. Se a busca não ficar pronta a tempo, a F31 sai e fica só a autodeclaração. **A F31 segue "a validar"**: a conversa com o Comitê de Ética fica para depois da disciplina (D-49). A confirmação da menina (RF-F31.04) está em 3.1.

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F31.02 (RF-31.04) | O sistema deve considerar só as linhas de cursos-alvo (computação e TI). | F31, RN-25 | Sistema | Must | **A validar** | Dado uma lista com Medicina e Ciência da Computação, quando o cruzamento roda, então só Ciência da Computação é comparada. |
| RF-F31.03 (RF-31.05) | O sistema deve comparar o nome completo normalizado (sem acentos, sem diferença de maiúsculas e espaços extras). Só o nome completo igual gera indício. | F31, RN-20 | Sistema | Must | **A validar** | Dado "MARIA EDUARDA SANTOS" na lista, quando o cruzamento roda, então gera indício para Maria Eduarda Santos. "Maria Santos" não gera. |
| RF-F31.05 (RF-31.08) | O sistema deve descartar a lista ao fim do cruzamento, guardando só os metadados (fonte, chamada, data, link, número de linhas e de indícios). | F31, RN-23 | Sistema | Must | **A validar** | Dado uma lista de 500 linhas e 3 indícios, quando o cruzamento termina, então nenhuma das outras 497 linhas fica no sistema. |
| RF-F31.06 (RF-31.09) | O sistema deve apagar o indício quando a menina responder "não sou eu", ou depois de 30 dias sem resposta, e não deve gerar o mesmo indício de novo nas rodadas seguintes. Para isso guarda só uma marca (a menina e a chamada da lista), sem nenhum dado da lista. | F31, RN-21 | Sistema | Must | **A validar** | Dado um indício sem resposta há 30 dias, quando a rotina diária roda, então ele é apagado. Dado que Maria respondeu "não sou eu", quando a busca roda de novo com a mesma chamada, então ela não recebe o indício outra vez. Uma chamada nova da lista pode gerar um indício novo. |
| RF-F31.07 (RF-31.14) | O sistema deve consultar periodicamente o relatório de acompanhamento do Sisu/UFAL publicado pela COPEVE (formulário por curso e por modalidade de demanda), nos cursos-alvo, comparar as linhas com as contas pela RF-F31.03 e gerar os indícios. As consultas são feitas uma de cada vez, divididas em partes quando a rodada não couber no limite de duração da hospedagem. | F31, D-02, D-48 | Sistema | Must | **A validar** | Dado o relatório da edição configurada, quando a rodada roda, então o sistema consulta os 6 cursos-alvo (006, 007, 026, 027, 073 e 089) em cada modalidade de demanda e gera indícios só pelas regras da RF-F31.03. *O que o relatório devolve ainda não foi conferido: o primeiro passo da história confirma se ele traz o nome completo e a situação "Matrícula Institucional realizada" (RF-F31.04).* |
| RF-F31.08 (RF-31.15) | O sistema deve permitir que a equipe NISE configure o endereço do relatório de cada edição e rode a busca na hora, por um script em `backend/scripts/`, sem tela de curadoria. | F31, CONTRIBUTING §1 | Curadoria | Should | **A validar** | Dado a edição 2026 configurada, quando a equipe roda o script de busca, então a rodada roda e registra a data da última busca. |
| RF-F31.12 | O sistema deve também consultar, pela API pública de documentos do IFAL, os editais de convocação em PDF das seleções Enem/SiSU, extrair os nomes dos convocados nos cursos-alvo do IFAL e passá-los pelo mesmo cruzamento da busca na COPEVE. O PDF é lido em memória e descartado (RNF-F31.01). Convocação sem matrícula conta como aprovação (RN-22). | F31, D-48 | Sistema | Should | **A validar** | Dado um edital de convocação de teste, com nomes fictícios, quando a rodada roda, então só os convocados de cursos-alvo geram indício, e o PDF e as outras linhas não ficam no sistema. *Primeira prioridade depois da busca na COPEVE, se sobrar tempo e recurso. Os cursos-alvo do IFAL ainda precisam ser confirmados: só achamos Sistemas de Informação (Maceió), numa fonte antiga.* |

Saíram para Won't: a leitura de PDF fora do IFAL (antigo RF-31.13), os avisos de prazo de matrícula (RF-31.10) e o histórico da curadoria (RF-31.12). O consentimento separado para a busca (antigos RF-31.01, 31.02) fica nos Termos de uso (D-01) por enquanto, e o Comitê de Ética revê depois da disciplina (D-49).

#### F17 · Administração

| ID | Requisito | Origem | Perfil | Prior. | Status | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| RF-F17.05 (RF-04.6) | O sistema deve permitir que a equipe NISE mantenha a lista de tipos de ação. | F17 | Administração | Won't | Confirmado | — (a lista fica fixa neste semestre) |

---

## 4. Regras de negócio

Políticas que valem para várias telas. Os RFs apontam para elas pelo ID.

| ID | Regra | Origem | RFs afetados |
| --- | --- | --- | --- |
| RN-01 | A liderança do grupo que convidou a menina vê os dados individuais dela (filé, respostas e avaliações) ligados às ações desse grupo. Outros grupos veem só números agregados. | Doc vivo §7, Figma A04·1, D-01 | RF-F2.04, RF-F7.04, RF-F7.11, RF-F5.05 |
| RN-02 | Os questionários de acompanhamento saem 3 e 6 meses depois do evento, nas datas do calendário aprovado pela coordenadora. *A validar (C4).* | F4 | RF-F4.04, RF-F4.06 |
| RN-03 | Menores de 13 anos não criam conta, e os dados preenchidos não são guardados. O aparelho fica bloqueado por 24 horas, com a marca guardada só no aparelho, sem dado pessoal e sem nada no banco. A partir dos 13, a menina aceita os termos sozinha. A idade é calculada na data de hoje, no fuso de Maceió: quem faz 13 anos hoje já pode criar a conta. | D-01, D-23, D-25, Doc vivo §7, Figma A02c | RF-F7.01, RF-F7.02 |
| RN-04 | Quem chegou sozinha aparece para os grupos sempre de forma anonimizada e agregada. Os grupos não sabem o nome dela nem o que ela tem no filé. | Doc vivo §7, Figma A04·1 (NISE) | RF-F7.04, RF-F7.11 |
| RN-06 | Um valor agregado com menos de 5 meninas não é mostrado. Aparece como "dados insuficientes". | Figma K07, K09 | RF-F24.14 |
| RN-07 | Só a coordenadora do grupo exporta dados. A exportação é sempre anonimizada, e cada uma fica registrada. Por padrão, inclui só o próprio grupo; toda a rede é a validar (D-03). | F24, LGPD, D-03 | RF-F24.06, RF-F24.07, RF-F24.13 |
| RN-08 | Não existe exportação com dados identificáveis. | F24, LGPD art. 14 | RF-F24.01 a RF-F24.05 |
| RN-09 | O código da menina no arquivo é aleatório e não pode vir de dado pessoal (hash de e-mail é proibido). | F24 | RF-F24.03 |
| RN-11 | Texto livre nunca é exportado. | F24 | RF-F24.05, RF-F4.08 |
| RN-12 | Quem pediu exclusão sai das exportações seguintes. Arquivos já baixados não podem ser recolhidos. | F7, LGPD art. 18 | RF-F7.09 |
| RN-13 | Todo campo do banco é classificado como identificador direto, quase-identificador, analítico ou texto livre. Campo sem classificação não é exportado. | LGPD art. 46 | RF-F24.02 |
| RN-20 | O nome da menina só é comparado com listas oficiais se isso estiver previsto nos termos ou num consentimento próprio. *O Comitê de Ética revê depois da disciplina (D-49).* | F31, D-02 | RF-F31.03 |
| RN-21 | Um nome encontrado numa lista oficial é só indício. Não conta como aprovação nem ingresso até a menina confirmar. Só a menina vê os detalhes do indício (lista, curso e instituição) e só ela o confirma. A coordenadora do grupo da menina vê apenas que existe um indício, como "possível aprovação", e não o confirma (D-48). Com "Não sou eu", ou sem resposta em 30 dias, o indício é apagado e some também para a coordenadora. | F31, D-48 | RF-F31.04, RF-F31.06, RF-F5.10 |
| RN-22 | Ingresso é a matrícula declarada ou confirmada pela menina. Convocação sem matrícula é aprovação. | F31, F6 | RF-F31.04, RF-F6.03 |
| RN-23 | A lista oficial é usada só para o cruzamento. Linhas de quem não é usuária são descartadas, e modalidade de concorrência, nota e inscrição no ENEM nunca são guardadas. | F31, LGPD art. 11 | RF-F31.05 |
| RN-24 | Só a equipe NISE roda a busca, por script, e ela vê só contagens, nunca quais meninas foram encontradas. | F31, D-48 | RF-F31.08 |
| RN-25 | A busca lê só o relatório da COPEVE (UFAL) e, se sobrar tempo, os editais de convocação do IFAL (RF-F31.12), e só as linhas de cursos-alvo. Outras instituições ficam fora. | F31, D-48 | RF-F31.02, RF-F31.07, RF-F31.12 |
| RN-29 *(nova)* | Cada menina tem um único cadastro, não importa a quantos eventos ela vá nem de quantos grupos participe. Novas participações são ligadas ao cadastro existente pelo e-mail, cada grupo conta a menina uma vez, e ela recebe um único convite para criar conta. *A validar com a equipe: os casos de borda (e-mails diferentes, RF-F2.05).* | D-06, D-21, F2 | RF-F4.01, RF-F4.02, RF-F2.01, RF-F2.03 |
| RN-30 *(nova)* | A menina sempre recebe os e-mails de questionários, de recuperação de acesso e de lembretes de datas importantes, e é avisada disso no cadastro, sem opção de recusar. Oportunidades (incluindo o aviso de que o nome dela apareceu numa lista oficial, RF-F31.11) e o lembrete de evento só são enviados se ela tiver aceitado cada tipo, e ela pode desligar a qualquer momento. | Figma A04·2, A04·3, A10, D-15, D-16 | RF-F7.06 a RF-F7.08, RF-F7.10, RF-F4.06, RF-F4.11a, RF-F4.12 |
| RN-31 *(nova)* | Raça/cor, renda e deficiência não são coletadas nem mostradas. | D-04, seção 6 da v0.1 | RF-F5.08 |
| RN-14 | Cada ação pertence a um único grupo. Só as coordenadoras desse grupo criam, editam, excluem a ação e fecham ou reabrem as inscrições dela. | F30, P8 | RF-F30.01, RF-F30.11, RF-F30.12, RF-F1.10 |
| RN-15 | Uma ação pode ser excluída, com confirmação, até a presença ser registrada; como a importação não cria contas, nada se perde além das inscrições daquela ação. Depois da presença, não pode ser excluída. | F30, nota no Figma (C2), D-12 | RF-F30.12 |
| RN-16 | Só aparecem nas sugestões as ações abertas, com data futura, não canceladas e com inscrições abertas. Ações presenciais aparecem para meninas da mesma cidade; ações online, para todas as meninas. Ações fechadas nunca aparecem. | F30, F10, Figma K02 | RF-F30.13, RF-F1.10 |
| RN-17 | A cidade vem da lista oficial do IBGE; texto livre não é aceito. | F30, F10, F24, Figma A02, A02b | RF-F30.01, RF-F30.05, RF-S2.02 |
| RN-18 | Mudar a data de uma ação reprograma o lembrete de evento ainda não enviado (RF-F4.12). O que já foi enviado não muda. | F30, F4, D-43 | RF-F30.11, RF-F4.12 |
| RN-19 | A inscrição nas ações acontece fora da NISE (Forms, Sympla, Doity, Even3 e outras); a NISE guarda só o link e não envia dados da menina. Eventos dos grupos entram pela F30; a curadoria registra apenas itens externos. | P6, Figma A06·4b | RF-F30.02, RF-F10.13, RF-F11.06 |
| RN-27 *(nova)* | A importação de inscritas nunca cria contas nem envia mensagens. | Figma drawer Importar inscritas | RF-F1.01, RF-F1.09 |
| RN-28 *(nova)* | O filé não tem barra de progresso nem comparação entre meninas. Concluir pinta o quadradinho; avaliar é sempre opcional. | Doc vivo §8 e §11 | RF-F10.07, RF-F10.09 |
| RN-05 | As sugestões usam só itens das duas fontes do filé, e a LLM nunca recebe dados que identifiquem a menina. | F11 | RF-F11.01, RF-F11.03 |
| RN-32 *(nova)* | O convite do grupo é um link único por grupo, o mesmo para todas as ações (por exemplo, num QR code do slide). Ele só abre a tela de convite com o nome do grupo e leva ao cadastro; **não dá acesso a dados**. O vínculo da menina com a ação e o grupo vem do e-mail dela, já confirmado (RF-S2.22), comparado com as listas importadas pelo grupo, na criação da conta e a cada importação nova. Quem se cadastra com um e-mail que está na lista tem como origem esse grupo; quem se cadastra sem o link, ou com um e-mail que não está na lista, tem como origem "chegou sozinha". A origem é fixada no cadastro e define a versão do resumo dos termos (RF-F7.04); quem chegou sozinha e depois vai a uma ação de grupo continua com a origem fixa, e o grupo vê dela só números agregados (RN-01 e RN-04). Além do link do grupo, cada inscrita recebe por e-mail um link pessoal, depois do evento (RF-F4.01). Prazos: link de nova senha, 1 hora e uso único; convite pessoal, 30 dias e sem uso único; link do grupo, sem prazo (a equipe troca o código por script se ele vazar). Link vencido ou inválido leva à tela "Esse link não vale mais" (E07). *Limitação conhecida: escolhemos a opção mais barata de desenvolver. Se a menina se inscreveu na lista com um e-mail e criou a conta com outro, o sistema não a reconhece: ela fica como duas pessoas (o registro da lista, sem conta, e a conta, "chegou sozinha") e perde o vínculo com o grupo. Hoje, a coordenadora pode adicioná-la com o e-mail certo ("Veio sem inscrição?", RF-F3.03) e a equipe pode unir os registros (RF-F2.06), mas a revisão de duplicadas (RF-F2.05) não pega esse caso, porque a lista não traz data de nascimento. A mitigação futura é avisar que o e-mail não foi achado e deixá-la adicionar o outro e-mail, com confirmação. A validar com a equipe no PR.* | D-22, D-31, D-34, Figma A01b, E07 | RF-S2.07, RF-S2.17, RF-F7.04, RF-F2.02, RF-F4.01 |
| RN-33 *(nova)* | A senha tem no mínimo 8 caracteres, no cadastro e na recuperação de acesso, e é guardada só como hash. | D-23 | RF-S2.01, RF-S2.04 |
| RN-34 *(nova)* | Enquanto a menina não aceitar a versão atual dos termos, ela só alcança a tela de termos: o filé e o perfil ficam bloqueados no servidor. | D-23 | RF-F7.02, RF-F7.05, RF-F10.02 |
| RN-35 *(nova)* | A coordenadora só cria conta com um convite exclusivo, enviado ao e-mail oficial do grupo. O convite serve a um e-mail e a um uso, e liga a conta ao grupo. Não existe cadastro aberto de coordenadora, e um pedido de acesso, por si só, não dá acesso. *A validar com a equipe.* | Conversa da equipe (20/10), D-32 | RF-S2.18 a RF-S2.21, RF-S2.01 |
| RN-36 *(nova)* | Quando as inscrições de uma ação fecham, ela deixa de ser sugerida em Descobrir e sai do Ver depois, mas continua no filé de quem já a tinha ("Quero fazer" ou "Inscrita"), para a menina seguir o evento. Quando a coordenadora exclui a ação, ela sai do filé de todas as meninas que a tinham, e cada uma vê a tela E08 ("saiu do ar"). | Figma E08, D-37, D-46 | RF-F10.20, RF-F10.21, RF-F1.10, RF-F30.13 |
| RN-37 *(nova)* | A situação de uma ação é calculada a cada consulta, e vale a primeira regra que se aplica: concluída (a presença foi salva e o dia do evento chegou ou passou); aguardando presença (o dia do evento chegou ou passou e a presença não foi salva); aguardando inscrições (a ação foi salva e não tem inscritas); aguardando evento (tem inscritas e o dia ainda não chegou). O botão de cada situação é: aguardando inscrições, "Importar inscritas"; aguardando evento, "Ver inscritas"; aguardando presença, "Marcar presença"; concluída, "Ver resumo" e "Ver avaliação". Inscrições abertas ou fechadas é uma coisa à parte: ficam fechadas quando a coordenadora as fecha ou quando o dia do evento chega, e fechar não muda a situação, só tira a ação das sugestões das meninas (RN-16, RN-36). | Figma K10 (nota "Status da ação"), D-42 | RF-F30.10, RF-F1.10, RF-F3.05 |
| RN-38 *(nova)* | A faixa de esforço de uma ação de grupo vem das datas: uma ação de um dia é "Rolê com a galera", e uma ação de mais de um dia ("Dura mais de um dia") é "Grande desafio". *A validar com a equipe.* | Figma K02, história #79 | RF-F10.03, RF-F30.03, RF-F30.13 |

---

## 5. Requisitos não funcionais

Cada RNF tem um número, um limite ou um teste. As 6 linhas-modelo vazias da v0.1 foram removidas, e os RNFs da busca automática (robô) saíram com a D-02.

| ID | Categoria | Requisito | Como medir | Prior. | Origem |
| --- | --- | --- | --- | --- | --- |
| RNF-G.01 (RNF-04-06.01) | Compatibilidade | As telas da menina funcionam nas larguras de 360 px e 1366 px, e as da coordenadora em 1366 px (computador), sem perda de campos ou ações. | Percorrer cada fluxo da menina nas duas larguras e cada fluxo da coordenadora em 1366 px. | Must | Doc vivo §3, Figma (coordenadora só no computador), D-40 |
| RNF-G.02 (RNF-04-06.02) | Acessibilidade | Todos os fluxos funcionam só com teclado, com rótulos nos campos, foco visível, alvos de pelo menos 44 px e informações que não dependem só de cor. | Percorrer os fluxos só com teclado e conferir rótulos, foco e alvos. | Must | Figma "Leia primeiro" |
| RNF-G.03 | Segurança | Permissões são verificadas no servidor. Uma coordenadora nunca acessa ações ou meninas de outro grupo, nem por requisição direta. | Chamar as rotas com contas de dois grupos. Todas as tentativas cruzadas são negadas. | Must | RN-14, Doc vivo §7 |
| RNF-F1.01 (RNF-01) | Usabilidade | Uma coordenadora sem treinamento importa uma planilha de inscritas, até o fim da revisão, sem ajuda e no computador. Em teste com 5 coordenadoras, pelo menos 4 conseguem, e a mediana do tempo de quem consegue fica em até 5 minutos. *A validar: o tempo é provisório. Medir uma pessoa experiente e recalibrar.* | Teste de uso, em 1366 px, com 5 coordenadoras: contar quantas terminam sem ajuda e medir o tempo de quem termina. | Must | Doc vivo §4 (esforço mínimo), ISO 9241-11, D-47 |
| RNF-F30.01 (RNF-30.02) | Usabilidade | Uma coordenadora sem treinamento cadastra uma ação, só com os campos obrigatórios, sem ajuda e no computador. Em teste com 5 coordenadoras, pelo menos 4 conseguem, e a mediana do tempo de quem consegue fica em até 5 minutos. *A validar: o tempo é provisório. Medir uma pessoa experiente e recalibrar; o modelo KLM estima cerca de 1 minuto para esses campos.* | Teste de uso, em 1366 px, com 5 coordenadoras: contar quantas terminam sem ajuda e medir o tempo de quem termina. | Must | Figma K02, ISO 9241-11, D-40 |
| RNF-F30.02 (RNF-30.03) | Confiabilidade | Mudar a data ou cancelar uma ação e atualizar o lembrete de evento pendente acontecem na mesma operação. | Simular uma falha no meio e verificar que tudo ou nada foi aplicado. | Must | RN-15, RN-18 |
| RNF-F30.03 (RNF-30.04) | Desempenho | Uma ação aberta nova aparece nas sugestões em até 1 minuto; uma ação com inscrições fechadas ou cancelada some em até 1 minuto. | Medir em ambiente de teste. | Should | RN-16 |
| RNF-F10.01 (RNF-10.01) | Desempenho | O filé carrega em até 3 segundos em 95% dos acessos, numa conexão 4G. | Navegador limitado a 4G, 20 acessos. | Should | Doc vivo §3 (Alana usa o celular) |
| RNF-F10.02 | Desempenho | A tela Descobrir e as sugestões de cada faixa carregam em até 3 segundos em 95% dos acessos, numa conexão 4G. | Navegador limitado a 4G, 20 acessos à tela Descobrir e 20 à lista de sugestões de uma faixa. | Should | RNF-F10.01, Figma A06·1, A06·2, D-24 |
| RNF-F11.01 (RNF-11.01) | Confiabilidade | Se a LLM não responder em até 10 segundos, o filé mostra as sugestões por regras, sem erro. | Simular a LLM fora do ar. | Must | RF-F11.02 |
| RNF-F11.02 (RNF-11.02) | Segurança | As requisições à LLM não contêm identificadores. | Inspecionar as requisições em ambiente de teste com dados fictícios. | Must | RF-F11.03 |
| RNF-G.04 | Custo | A hospedagem e a LLM usam apenas planos gratuitos ou créditos acadêmicos. | Conferir a fatura do mês: R$ 0. | Must | Restrição 2.3 |
| RNF-S2.01 | Segurança | O formulário de pedido de acesso de grupo bloqueia envios automatizados e pede informações suficientes para desencorajar pedidos falsos, usando só serviço gratuito (RNF-G.04). *A validar: a complexidade e o custo ainda não foram avaliados.* | Enviar o formulário por script, sem passar pela verificação: o envio é negado. | Should | RF-S2.18, D-32 |
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
| RNF-F31.02 (RNF-31.02) | Segurança | Só a própria menina vê os detalhes dos indícios dela (lista, curso e instituição). A coordenadora do grupo dela vê só que existe um indício, e a coordenadora de outro grupo e a curadoria não veem nada. | Chamar as rotas de indícios com a conta de curadoria e com a de uma coordenadora de outro grupo: negado. Com a conta da coordenadora do grupo: a resposta traz só o marcador, sem lista, curso nem instituição. | Must | RN-21, RN-24, RF-F5.10 |
| RNF-F31.03 (RNF-31.03) | Confiabilidade | O cruzamento segue a RF-F31.03 sem exceções. | Base de teste com acentos, maiúsculas, espaços e homônimos parciais: 100% conforme a regra. | Must | RF-F31.03 |
| RNF-F31.04 (RNF-31.06) | Confiabilidade | Se o formato do relatório mudar ou a página não responder, a rodada para sem gravar nada, e a equipe NISE recebe um aviso. | Rodar contra uma cópia de teste, com dados fictícios, com uma coluna renomeada e com o servidor fora do ar. | Should | RF-F31.07 |
| RNF-F31.05 (RNF-31.07) | Compatibilidade com a fonte | O robô faz no máximo uma requisição a cada 2 segundos e se identifica com um nome genérico, sem dados de contato pessoais. Uma rodada de 48 consultas (6 cursos, 8 modalidades) leva cerca de 96 segundos e, se passar do limite de duração da hospedagem, é dividida em partes. | Conferir no log o intervalo e o agente, e rodar uma rodada completa dentro do limite da hospedagem. | Should | RF-F31.07 |

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
| Sugerir as tags já usadas pelo grupo enquanto a coordenadora digita (RF-F17.03) | Won't | As tags são os 8 temas da menina, uma lista fechada | D-44 |
| Escolher o alcance de uma ação online: estado ou cidades (RF-F30.04) | Won't | Ação online aparece para todas as meninas | D-45 |
| Generalizar município com menos de 5 meninas na exportação (antigo RF-24.13) | Won't | Adiado, segundo nota no Figma | Figma K09 (nota) |
| Tema escuro | Won't | "Fora do escopo agora" no Figma | Figma |
| Menina com menos de 13 anos ver as oportunidades abertas sem conta (RF-F10.12) | Won't | Removido do protótipo enxuto: o A02c não tem mais botões | Figma Enxuto A02c, D-25 |
| Salvar a ação como rascunho (RF-F30.07) | Won't | Fora por enquanto, decisão da equipe. O Figma ainda tem "Salvar rascunho" e "Continuar cadastro" | D-40 |
| Cadastro de ação em 3 passos no celular (RF-F30.08) | Won't | As telas de celular da coordenadora saíram do protótipo enxuto | Figma Enxuto, D-40 |
| Copiar os campos de uma ação anterior (RF-F30.09) | Won't | Fora por enquanto; saiu do protótipo enxuto | Figma Enxuto, D-40 |
| TCLE do responsável, TALE e autorização separada para os grupos (antigos RF-07.02 a 07.05, 07.08) | Removido | Consentimento segue o Figma | D-01 |
| Leitura de PDF das listas de outras instituições, como a UNCISAL (antigo RF-31.13) | Won't | F31 só com a COPEVE e o IFAL | D-02, D-48 |
| Avisos de prazo de matrícula e histórico da curadoria (antigos RF-31.10, 31.12) | Won't | F31 simplificada | D-02 |
| Importação manual de listas em CSV pela curadoria (antigo Plano B, RF-F31.01) | Won't | Sem tela de curadoria e sem conversa com a equipe | D-48 |
| Comparações entre participantes, não compareceram e chegaram sozinhas, e a escolha entre "Meu grupo" e "Rede NISE" (C6, RF-F16.01 a RF-F16.07) | Won't | C6 cancelada por enquanto, despriorizada pela equipe | D-51 |
| D-49 | 18/11/2026 | Wyvian *(a ratificar no PR)* | Por falta de tempo, a F31 não espera o Comitê de Ética: a busca entra em uso sem essa consulta, e o Comitê de Ética (ou instância semelhante) é consultado depois da disciplina. A RN-20 continua valendo: o nome só é comparado se isso estiver nos Termos de uso ou num consentimento próprio. | RN-20, RF-F31.07, RF-F5.10, D-01 |
| D-50 | 18/11/2026 | Wyvian *(a ratificar no PR)* | O e-mail que avisa do indício na lista oficial só é enviado a quem aceitou receber e-mails de oportunidades (RN-30), e não entra nos e-mails sempre enviados. Quem não aceitou vê o aviso só na agenda e na faixa do filé. | RN-30, RF-F31.11 |
| D-51 | 18/11/2026 | Wyvian *(a ratificar no PR)* | O fluxo C6 (Comparações) foi cancelado por enquanto, despriorizado pela equipe no quadro do GitHub. Os requisitos RF-F16.01 a RF-F16.07 saem das tabelas e ficam como Won't. A RN-04 (quem chegou sozinha aparece só anonimizada e agregada) e a RN-06 (menos de 5 meninas não aparece) continuam, porque valem também fora da C6. Itens que dependiam da comparação (RF-F5.07, RF-F24.08, RNF-F5.01) serão revistos com os fluxos deles (C5 e C7). | RF-F16.01 a RF-F16.07, RN-04, RN-06, RF-F5.07, RF-F24.08, RNF-F5.01 |
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
- Testes de ponta a ponta, que simulam cliques, usam Playwright e cobrem só os caminhos principais de cada épico (uma tarefa "E2E" por épico, D-17). O restante do front-end é coberto por uma passada manual de visual, textos e celular, registrada como checklist no PR.
- Os testes passam no CI do PR, e nenhum teste existente quebrou.
- Não há senhas, chaves de API ou tokens no repositório.

**Dados e privacidade**
- Nenhum dado pessoal (nome, e-mail, telefone, data de nascimento) aparece em logs ou mensagens de erro.
- As permissões são verificadas no servidor (RNF-G.03).
- Os testes usam só dados fictícios.
- Quando o requisito envolve a LLM, só os dados mínimos são enviados (RF-F11.03).

**Interface**
- Funciona em 360 px e 1366 px para a menina, e em 1366 px para a coordenadora (RNF-G.01).
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
| D-01 | 20/10/2026 | Wyvian | O consentimento segue o Figma: bloqueio para menores de 13 e aceite único a partir dos 13. Pendências: escrever os Termos de uso e a Política de privacidade e consultar o Comitê de Ética (ou semelhante). | F7, RN-01, RN-03, RN-04 |
| D-02 | 20/10/2026 | Wyvian | A F31 é essencial (pedido de um professor e principal inovação). A busca automática é o objetivo (Plano A), a importação manual é o Plano B e a autodeclaração é o Plano C. *O Plano B saiu na D-48.* A ordem de construção (B antes de A) e o gatilho (se o Plano B não estiver pronto no fim da Sprint 4, a F31 sai e fica o Plano C) estão confirmados. | F31, F6 |
| D-03 | 20/10/2026 | Wyvian | Exportar os dados de toda a NISE foi levantado na última reunião e será considerado. Entra como Could, a explorar e discutir com a equipe. A exportação do próprio grupo continua Must. | F24, F16, RN-07 |
| D-04 | 20/10/2026 | Wyvian | Raça/cor sai do painel, que ainda está em ajustes. | F5, RN-31 |
| D-05 | 20/10/2026 | Wyvian | Os lembretes (F9) entram como parte da F4. | F4, RN-30 |
| D-06 | 20/10/2026 | Wyvian | O convite vai só depois da presença, por e-mail. Falta analisar a deduplicação da menina que vai a eventos de dois grupos. | F1, F4, RN-29 |
| D-11 | 20/10/2026 | Wyvian | Um convite por menina. Se ela já tem conta, o segundo grupo só liga a participação e envia a avaliação. A equipe ainda valida a deduplicação. | RN-29, RF-F4.02 |
| D-12 | 20/10/2026 | Wyvian | A ação pode ser excluída até a presença, mesmo com inscritas, com modal de confirmação. | RF-F30.12, RN-15 |
| D-13 | 20/10/2026 | Wyvian | A própria equipe monta a curadoria do filé. Isso entra como task da história correspondente. | RF-F11.06 |
| D-14 | 20/10/2026 | Wyvian | A seção 3 é dividida por persona (Menina, Coordenadora, Sistema e curadoria), com cada RF numa só, pela regra "quem age". Não existe "base comum". | Seção 3 |
| D-07 | 20/10/2026 | Wyvian | Os fluxos do Figma viram épicos; cada história é um objetivo da usuária e cita os RFs que cumpre. | Histórias, seção 8 |
| D-08 | 20/10/2026 | Wyvian *(a confirmar)* | Sprints semanais de segunda a sexta: Sprint 0 de 20 a 23/10, Sprints 1 a 5 de funcionalidade, Sprint 6 de estabilização. | Seção 8 |
| D-09 | 20/10/2026 | Wyvian | Testes automatizados no back-end para todo critério de aceite, gerados por agente e conferidos na revisão; testes de tela só nos caminhos principais (D-17). | Seção 9 |
| D-10 | 20/10/2026 | Wyvian | Itens do Figma em revisão entram como estão, marcados "a validar". | Coluna Status |
| D-15 | 03/11/2026 | Wyvian *(a ratificar no PR)* | Todas as meninas recebem os e-mails de questionário, sem opção de recusar. A etapa 3 do cadastro só informa. | RF-F7.07, RF-F7.08, RF-F4.06, RN-30 |
| D-16 | 03/11/2026 | Wyvian *(a ratificar no PR)* | Os lembretes de datas importantes também são sempre enviados, e a menina é avisada numa tela nova, logo depois do aviso de questionários (a desenhar no Figma). | RF-F4.11a, RF-F7.10, RN-30 |
| D-17 | 03/11/2026 | Wyvian *(a ratificar no PR)* | Os testes de ponta a ponta usam Playwright e cobrem só os caminhos principais de cada épico. Substitui o "poucos ou nenhum teste de tela" da D-09. | Seção 9, D-09 |
| D-18 | 03/11/2026 | Wyvian *(a ratificar no PR)* | O login é só com Google e com e-mail e senha. O login com Microsoft sai. | RF-S2.01 |
| D-19 | 03/11/2026 | Wyvian *(a ratificar no PR)* | A pergunta de interesses e escolaridade não tem "Pular por agora", em nenhum fluxo. A tela do Figma precisa ser atualizada. | RF-F10.01 |
| D-20 | 03/11/2026 | Wyvian *(a ratificar no PR)* | A avaliação do evento é adiada com "Agora não" e pode ser aberta de novo pela agenda ("Sua agenda") e pelo link do e-mail. | RF-F4.03b, RF-F4.11b |
| D-21 | 03/11/2026 | Wyvian *(a ratificar no PR)* | Cada menina tem um único cadastro, qualquer que seja o número de eventos e de grupos, e cada grupo a conta uma vez. Os casos de borda seguem a validar. | RN-29, RF-F2.01, RF-F2.03 |
| D-22 | 03/11/2026 | Wyvian *(a ratificar no PR)* | O convite do grupo é um link com código (RN-32), e a tela do convite (A01b) ganha um RF. | RN-32, RF-S2.07 |
| D-23 | 03/11/2026 | Wyvian *(a ratificar no PR)* | Detalhes que as histórias trazem e o doc não tinha entram como RN, RNF ou RF. Detalhe que só afeta uma tela fica nos critérios da história. | Seção 0.1, RN-03, RN-33, RN-34 |
| D-24 | 04/11/2026 | Wyvian *(a ratificar no PR)* | A tela Descobrir e as sugestões também têm limite de tempo de carregamento, como o filé tem na RNF-F10.01. Nova RNF-F10.02. | RNF-F10.02, RNF-F10.01 |
| D-25 | 06/11/2026 | Wyvian *(a ratificar no PR)* | Quem tem menos de 13 anos fica bloqueada por 24 h, com a marca guardada só no aparelho (sem dado pessoal e sem nada no banco). O A02c não tem botões, então "ver oportunidades sem conta" (RF-F10.12) sai para o §7. | RF-F7.01, RN-03, RF-F10.12 |
| D-26 | 06/11/2026 | Wyvian *(a ratificar no PR)* | A D-16 vale sobre o Figma: lembretes de datas importantes e questionários são sempre enviados. O A10 Perfil foi ajustado no Figma: "Lembretes de datas importantes" não tem interruptor e diz "Sempre chegam no seu e-mail". | RF-F7.08, RF-F7.10, RN-30 |
| D-27 | 06/11/2026 | Wyvian *(a ratificar no PR)* | O perfil (A10) ganha RFs para o que mostra e o doc não cobria: cartão "Seu grupo", links dos Termos e da Política, mudar senha e sair da conta. | RF-F7.11, RF-F7.12, RF-S2.08, RF-S2.09 |
| D-28 | 06/11/2026 | Wyvian *(a ratificar no PR)* | A referência de telas passa a ser a página "NISE · Protótipo Enxuto" do Figma (quadro "Fluxos atuais", de 31/10). O que ela removeu e o doc tinha vira Won't no §7, depois de validado caso a caso. Rascunhos e propostas dela são tratados caso a caso. | Seção 3, §7, issue #154 |
| D-29 | 07/11/2026 | Wyvian *(a ratificar no PR)* | Quem entrou com o Google não tem senha na NISE: o perfil não mostra o botão "Mudar senha" e mostra o cartão da conta Google (avatar, nome, e-mail e logo do Google). O botão "Mudar senha" só existe para quem entrou com e-mail e senha e leva à tela A16b. | RF-S2.08, RF-S2.10 |
| D-30 | 07/11/2026 | Wyvian *(a ratificar no PR)* | As telas de estado do Figma (E03 a E07) e as regras da nota "Estados da Alana" (30/10) entram como RFs, embora estejam fora do protótipo navegável (sem links). A E08 (sugestão que saiu do ar) e a V01 (Ver depois vazio) serão analisadas junto com o filé. | RF-S2.12 a RF-S2.16 |
| D-31 | 07/11/2026 | Wyvian *(a ratificar no PR)* | O link de nova senha tem prazo e só funciona uma vez; vencido ou já usado, leva à E07. Para o convite do grupo, a regra fica em aberto até a equipe explorar os detalhes do convite (RN-32). | RF-S2.17, RF-S2.07, RN-32 |
| D-32 | 08/11/2026 | Wyvian *(a ratificar no PR)* | A coordenadora só entra na NISE por convite exclusivo, enviado ao e-mail oficial do grupo. Grupos que a equipe conhece recebem convite direto; grupos desconhecidos pedem acesso por um formulário próprio, avaliado à mão pela equipe. Segue a conversa da equipe de 20/10 (mistura das duas ideias), que ainda precisa da posição do resto da equipe. | RF-S2.18 a RF-S2.21, RN-35, RNF-S2.01 |
| D-33 | 08/11/2026 | Wyvian *(a ratificar no PR)* | O e-mail de quem se cadastra com e-mail e senha precisa ser confirmado, e a conta só se liga ao registro importado quando o e-mail está confirmado. Evita que alguém crie conta com o e-mail de outra pessoa e herde o registro dela. Está na issue #152, que depende de telas novas. | RF-S2.22, RF-F2.02 |
| D-34 | 08/11/2026 | Wyvian *(a ratificar no PR)* | O convite do grupo é um link único por grupo, que só abre o cadastro; o vínculo vem do e-mail confirmado comparado com as listas importadas. Cada inscrita recebe um link pessoal por e-mail, depois do evento: presentes e ausentes, e a avaliação só as presentes (muda a parte da D-06 que limitava o convite às presentes). Prazos: nova senha 1 hora, convite pessoal 30 dias, link do grupo sem prazo. Escolhemos a opção mais barata: quem usa dois e-mails perde o vínculo, e a mitigação fica para depois. | RN-32, RF-S2.07, RF-S2.17, RF-F4.01, D-06 |
| D-35 | 09/11/2026 | Wyvian *(a ratificar no PR)* | O filé ganha RFs para o que o Figma mostra e o doc não tinha: barra inferior, sugestões que acabaram, Ver depois vazio e Seu filé vazio. As histórias já feitas não mudam: cada tela vira uma issue `Change:`. | RF-F10.16 a RF-F10.19 |
| D-36 | 09/11/2026 | Wyvian *(a ratificar no PR)* | O aviso com "Desfazer" aparece nas três escolhas de uma sugestão, inclusive "Não é pra mim" ("foi dispensada"), como na história #106. A nota do Figma dizia que só "Quero fazer" e "Talvez depois" tinham o aviso, então o Figma precisa ganhar esse aviso. | RF-F10.05 |
| D-37 | 09/11/2026 | Wyvian *(a ratificar no PR)* | Quando as inscrições de uma ação fecham, a sugestão sai só de Descobrir, para não sugerir um evento que não aceita mais inscrições, e do Ver depois (Should), porque não dá mais para participar. Ela não sai do filé de quem já a tinha. | RN-36, RF-F10.20, RF-F10.21, RF-F1.10 |
| D-38 | 10/11/2026 | Wyvian *(a ratificar no PR)* | A tela de conclusão de uma atividade não mostra quantas meninas fizeram o curso: a frase "Outras meninas da NISE também fizeram esse curso" do Figma sai, porque o filé não compara meninas (RN-28). | RN-28, RF-F10.09 |
| D-39 | 11/11/2026 | Wyvian *(a ratificar no PR)* | Na inscrição em evento (M6): "Não vou mais" vira "Tirar do filé" e "Desfazer" (volta a "Próximas aventuras"). Evento de fora depois da data pergunta "Você foi?". Evento de grupo da NISE conclui quando a coordenadora marca a presença ou sai do filé se ela faltou. Evento que passou sem a menina ter se inscrito sai do filé. | RF-F10.14, RF-F10.15, RF-F10.23, RF-F10.24, RF-F10.25 |
| D-40 | 13/11/2026 | Wyvian *(a ratificar no PR)* | Na C1, as telas de celular da coordenadora, "Salvar rascunho" e "Copiar de uma ação anterior" ficam fora por enquanto (Won't), e a situação "Rascunho" sai da lista de situações. O RNF-G.01 vale para a menina no celular e para a coordenadora no computador. A regra dos 2 minutos cai e dá lugar a um teste de uso (RNF-F30.01). | RF-F30.07, RF-F30.08, RF-F30.09, RNF-G.01, RNF-F30.01 |
| D-41 | 13/11/2026 | Wyvian *(a ratificar no PR)* | A tag da ação vira sugestão por um mapa fixo tag para tema, mantido pela equipe no repositório (como sugere a história #79). Tag sem mapa só aparece para quem escolheu "Ainda não sei". *Substituída pela D-44.* | RF-F17.06, RF-F17.02 |
| D-42 | 13/11/2026 | Wyvian *(a ratificar no PR)* | A situação de uma ação é calculada, como na nota "Status da ação" do Figma (concluída, aguardando presença, aguardando inscrições, aguardando evento). Inscrições abertas ou fechadas é uma coisa à parte. | RN-37, RF-F30.10 |
| D-43 | 16/11/2026 | Wyvian *(a ratificar no PR)* | Editar uma ação reaproveita o formulário do cadastro, aberto pelo menu "…" da lista, que só tem "Editar" e "Excluir ação". Mudar a data só reprograma o lembrete de evento (RF-F4.12), porque o convite e a avaliação saem depois da presença e os questionários contam da criação da conta. | RF-F30.11, RF-F30.12, RN-18, RNF-F30.02 |
| D-44 | 16/11/2026 | Wyvian *(a ratificar no PR)* | Por enquanto, as tags de uma ação são os 8 temas da tela de interesses da menina, escolhidos numa lista fechada, e a ação é sugerida a quem escolheu o tema. O mapa tag para tema feito à mão dava trabalho demais para a equipe. Tags mais específicas, ligadas aos temas por mapa fixo da equipe ou pela LLM, ficam como desejável (RF-F17.07, Could). Substitui a D-41. | RF-F17.02, RF-F17.03, RF-F17.06, RF-F17.07, D-41 |
| D-45 | 16/11/2026 | Wyvian *(a ratificar no PR)* | Uma ação online não tem cidade nem alcance: aparece para todas as meninas, de qualquer cidade. A coordenadora não escolhe estado nem cidades, e o campo "Pra meninas de onde?" do K02 online sai. | RF-F30.04, RF-F30.13, RN-16 |
| D-46 | 16/11/2026 | Wyvian *(a ratificar no PR)* | Quando a coordenadora exclui uma ação, ela sai do filé das meninas que a tinham, e cada uma vê a tela E08 ("saiu do ar"), porque um evento excluído não acontece mais. Fechar as inscrições continua mantendo a ação no filé (D-37). | RN-36, RF-F30.12, RF-F10.20 |
| D-47 | 16/11/2026 | Wyvian *(a ratificar no PR)* | Na C2: reabrir inscrições entra como Should e só até o dia do evento, quando elas fecham sozinhas; o e-mail é obrigatório na importação (linha sem e-mail válido não entra); "escola" sai da importação e do adicionar inscrita; o aviso "Já está na NISE" do adicionar inscrita é Should e cita só ações do grupo da coordenadora; tirar uma inscrita da ação entra como Could, sem tela; desfazer a importação continua Could; corrigir o e-mail ou escolher "Não importar" na revisão (RF-F1.06) passa a ser Must; a lista de inscritas da K11 mostra só as colunas com dado registrado (RF-F1.14); o resumo no fim da importação (RF-F1.07) passa a descrever o que o Figma mostra, a contagem na revisão, o botão com o número e o chip "Nova"; o nível de escolaridade da inscrita segue as etapas do cadastro da menina; "Excluir ação" fica no menu "…" da lista (K10) e é um botão, ao lado de "Editar ação", no cabeçalho da página da ação (K11), em todas as versões; a importação vira um drawer sobre a ação; o sistema não reconhece formatos de plataforma, só sugere as colunas pelo nome; fechar sozinho no dia do evento é Should; a regra dos 5 minutos vira um teste de uso. | RF-F1.01, RF-F1.02, RF-F1.03, RF-F1.04, RF-F1.06, RF-F1.07, RF-F1.08, RF-F1.09, RF-F1.10, RF-F1.12, RF-F1.13, RF-F1.14, RF-F1.15, RF-F1.16, RF-F1.17, RF-F30.12, RNF-F1.01 |
| D-48 | 18/11/2026 | Wyvian *(a ratificar no PR)* | A F31 deixa de ter três planos. Não existe importação manual de listas em CSV (o antigo Plano B): a equipe não a discutiu e ela exigiria uma tela nova. O único caminho é a busca automática no relatório da COPEVE, que sobe para Must, e a autodeclaração (F6) é o que sobra se a busca não ficar pronta. O IFAL publica editais de convocação em PDF: lê-los entra como Should (RF-F31.12) e é a primeira prioridade depois da COPEVE, se sobrar tempo e recurso. A UNCISAL também publica PDF e fica fora (Won't). A coordenadora do grupo vê que existe um indício (possível aprovação), mas só a menina o confirma (RN-21, RF-F5.10), mesmo que o Figma da M7 diga que a coordenadora também pode confirmar. O aviso "É você na lista?" chega pela agenda, e o e-mail só avisa e leva ao app. | RF-F31.01 a RF-F31.12, RN-21, RN-24, RN-25, RF-F5.10, RNF-F31.02, RNF-F31.04, RNF-F31.05, D-02 |
