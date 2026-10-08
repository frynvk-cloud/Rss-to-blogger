const Parser = require('rss-parser');
const fs = require('fs');

const RSS_FEED_URL = "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en";
const BLOG_ID = "1761503376493247689";
const LAST_LINK_FILE = 'last_link.txt';

// Dados de autenticação vindos dos segredos do GitHub
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

async function obterAccessToken() {
  const url = "https://googleapis.com";
  const resposta = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: "refresh_token"
    })
  });
  
  const dados = await resposta.json();
  if (!dados.access_token) {
    throw new Error("Falha ao renovar o token: " + JSON.stringify(dados));
  }
  return dados.access_token;
}

async function run() {
  try {
    // 1. Ler o Feed RSS
    const parser = new Parser();
    const feed = await parser.parseURL(RSS_FEED_URL);
    if (!feed.items || feed.items.length === 0) {
      console.log("Nenhum item encontrado no feed RSS.");
      return;
    }

    const ultimoItem = feed.items[0];
    const titulo = ultimoItem.title;
    const link = ultimoItem.link;
    const descricao = ultimoItem.content || ultimoItem.snippet || "";

    // 2. Controlar duplicidade localmente no GitHub
    let ultimoLinkPostado = '';
    if (fs.existsSync(LAST_LINK_FILE)) {
      ultimoLinkPostado = fs.readFileSync(LAST_LINK_FILE, 'utf8').trim();
    }

    if (ultimoLinkPostado === link) {
      console.log("A notícia mais recente já foi publicada anteriormente.");
      return;
    }

    // 3. Pegar um Access Token temporário e válido
    const accessToken = await obterAccessToken();

    // 4. Estruturar o post
    const corpoPostHtml = `
      <div>${descricao}</div>
      <br />
      <p><em>Read the full story on Google News: <a href="${link}" target="_blank">Click here</a></em></p>
    `;

    // 5. Enviar para a API do Blogger (CORRIGIDO AQUI)
    const apiUrl = `https://googleapis.com{BLOG_ID}/posts/`;
    
    const respostaBlogger = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: titulo,
        content: corpoPostHtml
      })
    });

    if (respostaBlogger.status === 200 || respostaBlogger.status === 201) {
      console.log(`Sucesso! Post "${titulo}" publicado.`);
      fs.writeFileSync(LAST_LINK_FILE, link, 'utf8');
    } else {
      const erroTexto = await respostaBlogger.text();
      console.error(`Erro na API do Blogger (Status ${respostaBlogger.status}):`, erroTexto);
    }

  } catch (error) {
    console.error("Erro crítico na execução:", error);
    process.exit(1);
  }
}

run();
