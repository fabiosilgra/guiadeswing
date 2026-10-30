# Guia de Swing — código do site

Site estático (sem servidor e sem banco de dados) que o GitHub publica de graça.
Você edita **uma planilha Excel**; o site é gerado automaticamente.
Feito a partir do modelo-base do Vou pra Missa.

## Onde fica cada coisa

| Arquivo | Para que serve |
|---|---|
| `dados/guia-de-swing.xlsx` | **A planilha.** Abas `Leia-me`, `Locais`, `Horarios`, `Destaques` e `Listas` |
| `dados/regioes.json` | Estados, regiões e o menu de regiões |
| `dados/banners.json` | Anunciantes (imagem + link por posição) |
| `dados/config.json` | Nome, WhatsApp, e-mail, domínio e a chave **lancado** |
| `assets/` | Visual (`style.css`), comportamento (`app.js`), logo e ícones |

## Cadastrar um lugar

1. Abra `dados/guia-de-swing.xlsx`, aba **Locais**, e preencha a primeira linha vazia.
2. Colunas com título **vermelho** são obrigatórias; as **cinzas** são opcionais. Passe o mouse sobre o título para ver a dica.
3. Use as setinhas (listas) em `tipo`, `uf`, `regiao` e `publicar`.
4. Na aba **Horarios**, crie uma linha por horário, com o mesmo `id` do lugar em `id_local`:
   - `tipo`: `funcionamento` (alimenta o "Funciona hoje"), `festa` (nome da festa em `obs`) ou `atendimento`
   - `dias`: `sex-sab`, `dom`, `qua,sex`, `todos`
   - `hora`: `22:00-05:00` (pode virar a madrugada) ou só `22:00`
5. Troque `publicar` para **SIM**, salve e envie o arquivo ao GitHub. O site atualiza em 1 a 2 minutos.

O gerador avisa, em português, se algo estiver errado (região inexistente, dia ilegível, id repetido, casa sem autorização). Veja os avisos na aba **Actions** do GitHub.

As linhas com `exemplo = SIM` são de teste, **com nomes fictícios**. Apague-as (ou troque `publicar` para NÃO) antes de lançar.

## Texto, Google (SEO), fotos e selos

- **`sobre`**: 2 a 3 parágrafos sobre a casa (Alt+Enter pula linha na célula). É o que mais ajuda no Google.
- **`descricao_seo`** (opcional): frase de até 155 letras que aparece no resultado do Google. Se vazia, o site monta uma sozinho (tipo, bairro, cidade).
- **`palavras_chave`** (opcional): ajudam a busca interna do site. O Google ignora esse campo, então o texto de `sobre` é que conta.
- **Fotos**: só fachada e ambiente vazio. **Nunca pessoas, nunca imagem explícita.** Reduza para ~1200 px de largura e até ~300 KB, envie para `assets/fotos/<id>/` e liste os caminhos em `fotos`, separados por `;`. Peça autorização à casa e a quem fotografou.
- **`confirmado_em`**: data da última confirmação. Selo verde (recente), amarelo (mais de 120 dias) ou cinza ("a confirmar").
- **`autorizado`**: SIM quando a casa autorizou a divulgação. O gerador avisa se faltar.

## "Funciona hoje"

Os horários da semana ficam gravados no site e o navegador calcula na hora, no fuso de São Paulo:
- dentro do horário → **Aberto agora · até 05h** (considera casas que fecham de madrugada)
- abre ainda hoje → **Funciona hoje · abre às 22h**
- senão → **Amanhã · 22h** ou **Próxima: sex · 22h**

Só entram nesse cálculo os horários do tipo `funcionamento`. Feriados e datas especiais não são tratados.

## Aviso +18

Na primeira visita aparece uma tela pedindo confirmação de maioridade; a resposta fica salva só no aparelho. É um aviso, não uma verificação de idade. As páginas também levam a marcação de conteúdo adulto (`rating`/RTA), que ajuda filtros parentais.

## Destaques (carrossel)

Na página de cada estado há um carrossel de **até 10 destaques** (baladas, festas, eventos). Eles ficam na aba **Destaques** da planilha:
- `titulo` e `legenda`: nome e uma linha de apoio (ex.: "Sexta · 23h · Pinheiros"); `selo`: etiqueta no canto (Festa, Evento, Balada...)
- `imagem`: arte ou foto horizontal (~800 × 450 px, até 600 KB, sem pessoas), enviada para `assets/destaques/`
- `id_local`: se o destaque é de uma casa cadastrada, o clique abre a página dela; senão, use `link`
- `uf`: o estado onde aparece. Nas páginas de região e de tipo aparecem só os destaques daquela região/tipo.

Sem imagem, o site usa a 1ª foto da casa, depois o logo dela, depois as iniciais do nome.

## Logo (foto de perfil) de cada casa

Na coluna `logo` da aba Locais, coloque o caminho da imagem que a casa enviar (quadrada, ~400 × 400 px, até 200 KB), por exemplo `assets/logos/gds-sp-001.png`. Ela aparece no cartão da lista e na página da casa. **Sem logo, o site mostra as iniciais do nome; o logo do Guia de Swing nunca aparece no lugar.**

## Banners

Tamanhos: **topo 1375 × 280**, **laterais (2, um abaixo do outro) 420 × 551**, **rodapé (3, lado a lado) 436 × 326**. Coloque a imagem em `assets/banners/` e preencha `img`, `link` e `alt` em `dados/banners.json`. Sem imagem, o site mostra "Anuncie aqui". Anúncios vendidos por você, sem AdSense.

**Topo fixo ou carrossel:** em `topo`, a lista `itens` aceita quantas imagens você quiser. Com **uma**, o banner é fixo. Com **duas ou mais**, vira carrossel com troca suave (fade); `intervalo` é o tempo em segundos entre as trocas. O carrossel pausa quando o mouse está em cima e não troca sozinho para quem usa "reduzir movimento".

## Publicar no GitHub (uma vez)

1. Crie o repositório `guiadeswing` (público) e envie **todos** os arquivos desta pasta, inclusive `.github`.
   Se o envio pelo navegador não levar a pasta `.github`, crie manualmente: *Add file → Create new file*, nome `.github/workflows/publicar.yml`, e cole o conteúdo do arquivo de mesmo nome.
2. Em **Settings → Pages**, em *Source*, escolha **GitHub Actions**.
3. Aba **Actions**: aguarde o fluxo "Publicar site" ficar verde. O endereço aparece em Settings → Pages.

## Endereço do site

**Por enquanto** o site fica no endereço grátis do GitHub: `https://fabiosilgra.github.io/guiadeswing/`. Em `dados/config.json` isso está assim:
`"siteUrl": "https://fabiosilgra.github.io/guiadeswing"`, `"basePath": "/guiadeswing"` e `"usarDominioProprio": false`.

### Quando for ligar o domínio www.guiadeswing.com.br (versão final)
1. Em `dados/config.json`, troque para: `"siteUrl": "https://www.guiadeswing.com.br"`, `"basePath": ""` e `"usarDominioProprio": true`.
2. Em Settings → Pages → *Custom domain*, informe `www.guiadeswing.com.br`.
3. No painel do seu domínio (registro.br ou onde ele estiver), crie um registro **CNAME** de `www` apontando para `fabiosilgra.github.io`.
4. Para `guiadeswing.com.br` (sem www) abrir também, crie quatro registros **A** apontando para `185.199.108.153`, `185.199.109.153`, `185.199.110.153` e `185.199.111.153`.
5. Marque *Enforce HTTPS* quando o GitHub liberar.

## Antes de lançar para o público

- [ ] Trocar WhatsApp e e-mail em `config.json` (e o Instagram, se houver)
- [ ] Substituir os dados de exemplo pelos reais (e tirar `exemplo = SIM`)
- [ ] Conferir `autorizado = SIM` e `confirmado_em` em todas as casas
- [ ] Mudar `"lancado": true` (libera o Google e remove a faixa "Versão de testes")
- [ ] Revisar os textos de Privacidade e Sobre
- [ ] Rever as regras de conteúdo do GitHub Pages para conteúdo adulto; manter o site sem imagens explícitas

## Conferir no computador

`node build.mjs --preview` gera `dist-preview/`; abra `dist-preview/index.html` no navegador. `node tests/horarios.test.mjs` roda os testes.
