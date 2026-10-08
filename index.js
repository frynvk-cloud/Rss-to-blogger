const Parser = require('rss-parser');
const fs = require('fs');

const RSS_FEED_URL = "https://google.com";
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
      client_id: CLIENT_ID || "",
      client_secret: CLIENT_SECRET || "",
      refresh_token: REFRESH_TOKEN || "",
      grant_type: "refresh_token"
    })
  });
  
  // Captura o texto puro para depurar caso o Google rejeite as credenciais
  const textoResposta = await resposta.text();
  
  try {
    const dados = JSON.parse(textoResposta);
    if (!dados.access_token) {
      throw new Error("Resposta do Google sem access_token: " + textoResposta);
    }
    return dados.access_token;
  } catch (e) {
    throw new Error(`O Google rejeitou suas credenciais e retornou um erro. Resposta bruta:\n${textoResposta}`);
  }
}

async function run() {
  try {
    // 1. Baixar o Feed RSS como texto primeiro
    const respostaRss = await fetch(RSS_FEED_URL);
    const textoXml = await respostaRss.text();

    // 2. Analisar o conteúdo XML obtido
    const parser = new Parser();
    const feed = await parser.parseString(textoXml);
    
    if (!feed.items || feed.items.length === 0) {
      console.log("Nenhum item encontrado no feed RSS.");
      return;
    }

    const ultimoItem = feed.items[0];
    const titulo = ultimoItem.title;
    const link = ultimoItem.link;
    const descricao = ultimoItem.content || ultimoItem.snippet || "";

    // 3. Controlar duplicidade localmente no GitHub
    let ultimoLinkPostado = '';
    if (fs.existsSync(LAST_LINK_FILE)) {
      ultimoLinkPostado = fs.readFileSync(LAST_LINK_FILE, 'utf8').trim();
    }

    if (ultimoLinkPostado === link) {
      console.log("A notícia mais recente já foi publicada anteriormente.");
      return;
    }

    // 4. Pegar um Access Token temporário e válido
    const accessToken = await obterAccessToken();

    // 5. Estruturar o post
    const corpoPostHtml = `
      <div>${descricao}</div>
      <br />
      <p><em>Read the full story on Google News: <a href="${link}" target="_blank">Click here</a></em></p>
    `;

    // 6. Enviar para a API do Blogger
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
      console.log(`Sucesso! Post "${titulo}" published.`);
      fs.writeFileSync(LAST_LINK_FILE, link, 'utf8');
    } else {
      const erroTexto = await respostaBlogger.text();
      console.error(`Erro na API do Blogger (Status ${respostaBlogger.status}):`, erroTexto);
    }

  } catch (error) {
    console.error("Erro crítico na execução:", error.message || error);
    process.exit(1);
  }
}

run();
