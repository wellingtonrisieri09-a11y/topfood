# Emissor de NF-e próprio — como plugar em qualquer site

Este é o emissor de nota fiscal eletrônica que roda **dentro do próprio site**,
falando direto com a SEFAZ com o certificado digital da empresa. Não há
intermediário, não há mensalidade e não há API de terceiro no meio.

Ele foi escrito para servir **várias empresas**: nenhum CNPJ, endereço ou
inscrição estadual está escrito no código. Tudo vem do cadastro de cada site.
Plugar num site novo é copiar os arquivos, pôr o certificado e preencher o
cadastro.

> **A regra que não se quebra:** campo de emitente vazio **trava a emissão**.
> Nunca preencher com o dado de outra empresa "pra facilitar". Um site copiado
> de outro herda o banco inteiro, e uma nota com o CNPJ errado é documento
> fiscal no nome de quem não vendeu — com a razão social saindo certa, que é o
> que faz ninguém perceber.

---

## O que compõe o emissor

| Arquivo | Para que serve |
|---|---|
| `modules/nfe_sefaz.js` | O emissor. Monta o XML no layout 4.00, assina, envia, lê o retorno, grava a nota no pedido e gera o DANFE |
| `modules/danfe_topfood.js` | O DANFE em PDF, com o logo do site e a tipografia ajustada |
| `data_municipios.json` | Os 5.571 códigos IBGE de município (a SEFAZ recusa se o código não bater com a UF) |
| `instalar_nfe.js` | Instala o emissor neste site: pergunta os dados da empresa, grava, zera a numeração e diz o que falta |
| `nfe_emitente.js` | Mostra e preenche quem assina a nota neste site |
| `nfe_numeracao.js` | Numeração das notas e troca de ambiente (teste ↔ produção) |
| `nfe_emitir.js` | Emitir pela linha de comando (prévia, `--enviar`) |
| `nfe_danfe.js` | Gerar o DANFE de uma nota já emitida |
| `nfe_validar_ordem.js` | Confere o XML contra o schema antes de mandar pra SEFAZ |
| `assets/logo-danfe.png` | O logo que sai no quadro do emitente do DANFE |

No servidor, o emissor também aparece no painel: **Pedidos → abrir o pedido →
Emitir NF-e**, e a aba **Notas Fiscais** com o histórico, o PDF e o XML.

## O que cada empresa precisa ter

1. **Certificado digital A1** (`.pfx` ou `.p12`) — o e-CNPJ da empresa. É ele
   que assina. Cartão A3 em token não serve para servidor.
2. **A senha do certificado**, que fica só no `.env`.
3. **Inscrição Estadual** ativa e **CNPJ**.
4. **CFOP e NCM** dos produtos, confirmados com o contador da empresa.
5. Estar habilitada a emitir NF-e na SEFAZ do estado.

O que **não** precisa: conta em provedor, token de API, mensalidade.

---

## Instalar num site novo — o caminho curto

Depois de levar os arquivos (passo 1 abaixo), um comando só faz os passos 3 a 5
e ainda escreve o bilhete do certificado:

```
node /var/www/SEUSITE/instalar_nfe.js
```

Ele pergunta cada dado da empresa, resolve o código IBGE, deixa o ambiente em
teste, zera a numeração e recusa rodar num site que já está em produção. Os
passos abaixo são o mesmo caminho na mão, para quando você quiser controlar
cada etapa.

## Instalar num site novo — passo a passo

### 1. Levar os arquivos

Num clone feito pelo `clonar-forpack.sh`, os arquivos já chegam sozinhos.
Num site novo, copie os arquivos da tabela acima e instale as dependências:

```
npm install nfewizard-io @nfewizard/danfe
```

### 2. Pôr o certificado

```
cp /caminho/do/certificado.pfx /var/www/SEUSITE/data/certificado.pfx
chmod 600 /var/www/SEUSITE/data/certificado.pfx
```

A pasta `data/` é ignorada pelo git e pelo script de clonagem — o certificado
de uma empresa nunca vaza para o site de outra.

### 3. Pôr a senha no `.env`

No `/var/www/SEUSITE/.env`:

```
NFE_CERT_SENHA=a-senha-do-certificado
```

A senha fica **só aí**. Nunca no banco, nunca no código, nunca no painel.

### 4. Preencher quem assina a nota

```
node /var/www/SEUSITE/nfe_emitente.js --cnpj=00000000000000 \
  --nome="Razao Social Ltda" --fantasia="Nome Fantasia" \
  --ie=000000000000 --logradouro="Rua Exemplo" --numero=100 \
  --bairro=Centro --municipio="Santo Andre" --uf=SP \
  --cep=09120410 --fone=11999999999
```

O código IBGE do município ele resolve sozinho a partir da cidade e da UF.

Rode `node nfe_emitente.js` sem argumentos e confira: **nenhum campo pode
aparecer marcado como "VEM DO CÓDIGO"**, e a última linha tem que dizer
"Falta pra emitir: nada — está pronto".

### 5. Zerar a numeração e começar em teste

Num site copiado de outro, o banco vem com as notas e os contadores da empresa
de origem. Isso precisa ser zerado, senão a primeira nota nasce com número
errado:

```
node /var/www/SEUSITE/nfe_numeracao.js --ambiente=homologacao --producao=0
```

Depois `node nfe_numeracao.js` e confira que **próximo número · produção: 1**.
Se aparecerem notas de outra empresa na lista, limpe os pedidos herdados no
painel — eles contam para a numeração (e são dados de clientes de outra
empresa, que não deveriam estar ali de qualquer forma).

### 6. Testar em homologação

Emita uma nota de um pedido real pelo painel, ou pela linha de comando:

```
node /var/www/SEUSITE/nfe_emitir.js --pedido=ID-DO-PEDIDO --enviar
```

Em homologação a SEFAZ exige que o nome do destinatário seja uma frase fixa de
aviso — isso é regra dela, não defeito. Confira o resto: CNPJ do emitente,
endereço, valores, CFOP, NCM.

### 7. Virar para produção

```
node /var/www/SEUSITE/nfe_numeracao.js --ambiente=producao --confirmo
pm2 restart SEUSITE
node /var/www/SEUSITE/nfe_numeracao.js
```

O restart é obrigatório: o certificado fica carregado em memória e o site
continuaria emitindo em teste. Confirme que a saída diz `producao`.

Emita **uma** nota real, confira o DANFE inteiro, e só então siga.

### 8. Trocar o logo do DANFE

Substitua `assets/logo-danfe.png` pelo logo da empresa. Sem esse arquivo o
DANFE sai sem logo — funciona igual, só fica sem a marca.

---

## Checklist antes da primeira nota real

- [ ] `nfe_emitente.js` mostra o CNPJ **desta** empresa e nenhum "VEM DO CÓDIGO"
- [ ] Certificado encontrado e senha preenchida
- [ ] Certificado dentro da validade
- [ ] CFOP e NCM confirmados com o contador **desta** empresa
- [ ] `nfe_numeracao.js` mostra o próximo número correto
- [ ] Ambiente em `producao` e o site reiniciado depois disso
- [ ] Uma nota de teste emitida em homologação e conferida
- [ ] Logo do DANFE trocado

## Armadilhas que já morderam

**Site copiado de outro.** O banco vem inteiro: emitente, inscrição estadual,
ambiente e contador de numeração da empresa de origem. O `nfe_emitente.js` e o
`nfe_numeracao.js` existem para mostrar isso antes de virar problema.

**O script de clonagem reescreve o código.** Ele roda `sed` trocando o nome da
empresa em todos os arquivos, inclusive `.js`. Por isso nenhuma mensagem do
emissor cita nome de empresa: chegaria invertida no clone. Confira sempre pelo
**CNPJ**, que é número e não é reescrito.

**Numeração.** Homologação e produção são independentes na SEFAZ. Nota de teste
não pode entrar na conta da produção, senão a primeira nota real nasce centenas
de números à frente e o fisco cobra a justificativa do buraco.

**Pedido sem CPF/CNPJ ou sem endereço.** Em produção a emissão é barrada — é
proposital. Pedidos importados de marketplace costumam chegar assim; o painel
pergunta o documento na hora de emitir.

**Reiniciar depois de mudar o ambiente.** O certificado e a configuração ficam
em memória. Sem `pm2 restart`, a troca não vale no painel.

## Onde ficam os arquivos das notas

| | |
|---|---|
| XML autorizado | `data/nfe/autorizacao/` |
| DANFE em PDF | `data/nfe/danfe/` |
| Retorno da SEFAZ | `data/nfe/retorno/` |
| Cópia no backup diário | `data/backups/fiscal/` |

O **XML** é o documento fiscal; o DANFE é só a representação impressa dele.
Guardar o XML autorizado por 5 anos é obrigação legal — por isso ele entra no
backup diário junto com o banco.
